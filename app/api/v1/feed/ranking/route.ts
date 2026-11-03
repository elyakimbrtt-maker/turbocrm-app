/**
 * GET/PATCH /api/v1/feed/ranking — o ranking de vendas do mês (TurboCRM).
 *
 * GET: quem vendeu mais no mês (`?mes=AAAA-MM`, padrão o atual), contando os
 * negócios GANHOS com `closed_at` no mês, por responsável. Todo membro que
 * atende (papel `agent`) aparece, mesmo com zero — ranking que esconde quem não vendeu não
 * motiva quem está começando. Também diz se o ranking está ligado.
 * PATCH `{ ativo }`: gestor (`manager`+) liga ou desliga para a empresa. Com
 * ele desligado, o GET responde `ativo: false` e nenhuma linha — a decisão dos
 * gestores vale para todo mundo, inclusive para quem chama a API direto.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { ROLE_RANK } from "@/lib/auth/types";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { janelaDoMes, mesLocal } from "@/lib/metas/periodo";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { CHAVE_DO_RANKING, pessoasPorId } from "@/lib/turbocrm/feed";

export const dynamic = "force-dynamic";

async function rankingAtivo(orgId: string): Promise<boolean> {
  const { data } = await (await createClient())
    .from("organizations")
    .select("settings")
    .eq("id", orgId)
    .maybeSingle();
  const v = (data?.settings as Record<string, unknown> | null)?.[CHAVE_DO_RANKING];
  // Ausente = ligado: é o estado com que a empresa nasce.
  return v !== false;
}

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "feed" });
  if (!authz.ok) return authz.response;
  const orgId = authz.org.orgId;
  const podeAlterar = ROLE_RANK[authz.org.role] >= ROLE_RANK.manager;

  const ativo = await rankingAtivo(orgId);
  const pedido = new URL(req.url).searchParams.get("mes");
  const mes = pedido && /^\d{4}-\d{2}$/.test(pedido) ? pedido : mesLocal();
  if (!ativo) return ok({ ativo, pode_alterar: podeAlterar, mes, linhas: [] }, { requestId });

  const { from, to } = janelaDoMes(mes);
  const admin = createAdminClient();
  const [membros, ganhos] = await Promise.all([
    admin
      .from("user_organizations")
      .select("user_id, role")
      .eq("organization_id", orgId)
      .is("revoked_at", null)
      // Só quem vende: gerente e administrador não disputam o ranking.
      .eq("role", "agent"),
    admin
      .from("crm_leads")
      .select("owner_user_id, value_cents")
      .eq("organization_id", orgId)
      .eq("status", "won")
      .gte("closed_at", from)
      .lt("closed_at", to)
      .not("owner_user_id", "is", null),
  ]);
  if (membros.error || ganhos.error) {
    return fail("internal_error", "Não consegui montar o ranking.", 500, { requestId });
  }

  const placar = new Map<string, { vendas: number; valor_cents: number }>();
  for (const m of (membros.data ?? []) as Array<{ user_id: string }>) {
    placar.set(m.user_id, { vendas: 0, valor_cents: 0 });
  }
  for (const g of (ganhos.data ?? []) as Array<{ owner_user_id: string; value_cents: number | null }>) {
    // Venda de quem não é atendente (gerente, admin) não entra no placar.
    const atual = placar.get(g.owner_user_id);
    if (!atual) continue;
    atual.vendas += 1;
    atual.valor_cents += Number(g.value_cents ?? 0);
    placar.set(g.owner_user_id, atual);
  }

  const pessoas = await pessoasPorId(placar.keys());
  const linhas = [...placar.entries()]
    .map(([user_id, p]) => ({ ...p, pessoa: pessoas.get(user_id) ?? { user_id, nome: "Alguém da equipe", avatar_url: null } }))
    .sort((a, b) => b.vendas - a.vendas || b.valor_cents - a.valor_cents || a.pessoa.nome.localeCompare(b.pessoa.nome))
    .map((l, i) => ({ posicao: i + 1, ...l }));

  return ok({ ativo, pode_alterar: podeAlterar, mes, linhas }, { requestId });
}

const PatchSchema = z.object({ ativo: z.boolean() }).strict();

export async function PATCH(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "feed" });
  if (!authz.ok) return authz.response;
  const orgId = authz.org.orgId;

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", "Diga se o ranking fica ligado ou desligado.", 422, { requestId });

  const admin = createAdminClient();
  const { data, error } = await admin.from("organizations").select("settings").eq("id", orgId).maybeSingle();
  if (error || !data) return fail("internal_error", "Não consegui ler a configuração.", 500, { requestId });
  const settings = { ...((data.settings as Record<string, unknown> | null) ?? {}), [CHAVE_DO_RANKING]: parsed.data.ativo };
  const { error: erroUp } = await admin.from("organizations").update({ settings }).eq("id", orgId);
  if (erroUp) return fail("internal_error", "Não consegui salvar.", 500, { requestId });

  void audit({
    action: "feed.ranking_toggled",
    actorUserId: authz.user.id,
    organizationId: orgId,
    resourceType: "organization",
    resourceId: orgId,
    metadata: { ativo: parsed.data.ativo },
    requestId,
  });
  return ok({ ativo: parsed.data.ativo }, { requestId });
}
