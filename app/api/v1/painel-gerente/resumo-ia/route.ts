/**
 * POST /api/v1/painel-gerente/resumo-ia `{ periodo }` — um resumo do período
 * escrito pelo Gemini, para o gerente apresentar à equipe.
 *
 * O que sai para o Google: só números AGREGADOS do painel e o PRIMEIRO nome de
 * cada atendente. Nenhum nome, telefone ou conversa de cliente. Só gestor.
 * Chave em `GEMINI_API_KEY`; sem ela, 503 com o que fazer.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { logger } from "@/lib/logger";
import { fusoDaEmpresa, numerosDoPainel } from "@/lib/turbocrm/painel";
import { periodoDoPedido } from "@/lib/turbocrm/periodos";

export const dynamic = "force-dynamic";

/**
 * Em ordem de preferência. O Google aposenta modelos para contas novas (o
 * `gemini-2.5-flash` deixou de existir para elas em nov/2026) e os principais
 * ficam sobrecarregados em horário de pico (503): o resumo tenta o próximo da
 * lista em vez de falhar. `*-latest` acompanha a versão atual sem deploy.
 * Sobrescrevível por `GEMINI_MODELOS` (separados por vírgula).
 */
const MODELOS_PADRAO = ["gemini-flash-latest", "gemini-3.5-flash", "gemini-flash-lite-latest"];
/** Estes status querem dizer "tente outro modelo"; chave errada (400/403) não. */
const TENTAR_OUTRO = new Set([404, 429, 500, 502, 503, 504]);
const Corpo = z
  .object({
    periodo: z.enum(["hoje", "semana", "mes", "personalizado"]),
    de: z.string().optional(),
    ate: z.string().optional(),
  })
  .strict();

const reais = (c: number | null | undefined) =>
  ((c ?? 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export async function POST(req: NextRequest): Promise<Response> {
  // Chama um serviço externo em nome da empresa: o suporte temporário não dispara.
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "painel_gerente" });
  if (!authz.ok) return authz.response;

  const chave = (process.env.GEMINI_API_KEY ?? "").trim();
  if (!chave) {
    return fail(
      "not_configured",
      "O resumo com IA ainda não foi ligado nesta instalação: falta a chave do Gemini no servidor.",
      503,
      { requestId },
    );
  }

  const parsed = Corpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", "Período inválido.", 422, { requestId });
  const { periodo } = parsed.data;
  const fuso = fusoDaEmpresa(authz.org.timezone);
  const p = periodoDoPedido(parsed.data, fuso);
  if (!p) return fail("validation_failed", "Escolha um intervalo válido, de até um ano.", 422, { requestId });

  const r = await numerosDoPainel(authz.org.orgId, periodo, fuso, p.janelas);
  if (!r.ok) return fail("internal_error", "Não consegui ler os números do painel.", 500, { requestId });
  const n = r.numeros;

  const nomeDoPeriodo =
    periodo === "hoje"
      ? "hoje"
      : periodo === "semana"
        ? "nesta semana"
        : periodo === "personalizado" && p.intervalo
          ? `de ${p.intervalo.de.split("-").reverse().join("/")} a ${p.intervalo.ate.split("-").reverse().join("/")}`
          : "neste mês";
  const linhas = n.vendedores.map((v) => {
    const primeiro = v.pessoa.nome.trim().split(/\s+/)[0] || "Atendente";
    const fechados = Number(v.vendas ?? 0) + Number(v.perdidos ?? 0);
    const conv = fechados ? `${Math.round((Number(v.vendas ?? 0) / fechados) * 100)}%` : "sem fechamentos";
    return `- ${primeiro}: ${v.atendimentos} atendimentos, ${v.leads_recebidos} leads recebidos, ${v.vendas} vendas (${reais(v.valor_cents)}), ${v.perdidos} perdidos, conversão ${conv}, ${v.leads_abertos} negócios em aberto (${v.leads_parados} parados há +48h), follow-ups hoje ${v.followups_hoje} e atrasados ${v.followups_atrasados}, vendas no mês ${v.vendas_mes}${v.meta_vendas ? ` de meta ${v.meta_vendas}` : ""}.`;
  });

  const prompt = [
    "Você é o assistente comercial de uma concessionária de motos. Escreva, em português do Brasil, um resumo curto",
    "para o gerente apresentar à equipe de vendas numa reunião rápida. Tom motivador, direto e respeitoso.",
    "Formato: 1) uma frase de abertura com o resultado da loja; 2) três destaques positivos; 3) três pontos de atenção",
    "com uma ação prática para cada; 4) uma frase de fechamento. Use só os números abaixo; não invente dados.",
    "Não exponha ninguém de forma negativa pelo nome: aponte pontos de atenção como tarefas da equipe.",
    "",
    `Período: ${nomeDoPeriodo}.`,
    `Loja no mês: ${n.loja.vendas_mes} vendas${n.loja.meta_vendas ? ` de meta ${n.loja.meta_vendas}` : ""}, ${reais(n.loja.valor_mes_cents)} vendidos${n.loja.meta_valor_cents ? ` de meta ${reais(n.loja.meta_valor_cents)}` : ""}. Leads sem responsável: ${n.loja.leads_sem_dono}.`,
    "Atendentes:",
    ...(linhas.length ? linhas : ["- (nenhum atendente cadastrado ainda)"]),
  ].join("\n");

  const modelos = (process.env.GEMINI_MODELOS ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  let texto = "";
  let modelo = "";
  let ultimoStatus = 0;
  for (const candidato of modelos.length ? modelos : MODELOS_PADRAO) {
    try {
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${candidato}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": chave },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          // Folga para os modelos que "pensam" antes de escrever: com teto
          // baixo eles gastam tudo pensando e devolvem texto vazio.
          generationConfig: { temperature: 0.6, maxOutputTokens: 4096 },
        }),
        signal: AbortSignal.timeout(30_000),
      });
      const json = (await resp.json().catch(() => ({}))) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
        error?: { message?: string; status?: string };
      };
      ultimoStatus = resp.status;
      if (!resp.ok) {
        logger.warn("[painel/resumo-ia] o Gemini recusou", { modelo: candidato, status: resp.status, motivo: json.error?.status, requestId });
        if (TENTAR_OUTRO.has(resp.status)) continue;
        return fail("upstream_unavailable", "O Gemini recusou a chave configurada. Confira a chave no servidor.", 502, { requestId });
      }
      texto = (json.candidates?.[0]?.content?.parts ?? [])
        .filter((p) => !p.thought)
        .map((p) => p.text ?? "")
        .join("")
        .trim();
      if (texto) {
        modelo = candidato;
        break;
      }
    } catch {
      ultimoStatus = 504;
    }
  }
  if (!texto) {
    const msg =
      ultimoStatus === 429
        ? "A cota gratuita do Gemini acabou por agora. Tente de novo em alguns minutos."
        : "O Gemini está sobrecarregado agora. Tente de novo em instantes.";
    return fail("upstream_unavailable", msg, 502, { requestId });
  }

  void audit({
    action: "painel.resumo_ia",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "painel_gerente",
    resourceId: authz.org.orgId,
    metadata: { periodo, modelo, atendentes: n.vendedores.length },
    requestId,
  });
  return ok({ texto, modelo }, { requestId });
}
