/**
 * GET /api/v1/painel-gerente?periodo=hoje|semana|mes — os números do painel do
 * gerente (TurboCRM): por vendedor e da loja.
 *
 * Só gestor (`manager`+). A soma é a função `fn_turbocrm_painel_gerente`
 * (migration 9903), chamada com o cliente de serviço e a empresa da SESSÃO.
 * Follow-ups são sempre de HOJE e as metas sempre do MÊS, qualquer que seja o
 * período escolhido — é como o gerente pensa ("o que falta hoje", "como vamos
 * no mês").
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { FUSO_PADRAO, fusoValido } from "@/lib/tempo/fusos";
import { pessoasPorId } from "@/lib/turbocrm/feed";
import { janelas, type Periodo } from "@/lib/turbocrm/periodos";

export const dynamic = "force-dynamic";

interface LinhaDoVendedor {
  user_id: string;
  [k: string]: unknown;
}

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "painel_gerente" });
  if (!authz.ok) return authz.response;
  const orgId = authz.org.orgId;

  const pedido = new URL(req.url).searchParams.get("periodo");
  const periodo: Periodo = pedido === "hoje" || pedido === "semana" ? pedido : "mes";
  const fuso = authz.org.timezone && fusoValido(authz.org.timezone) ? authz.org.timezone : FUSO_PADRAO;
  const j = janelas(periodo, fuso);

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("fn_turbocrm_painel_gerente", {
    p_org: orgId,
    p_de: j.de.toISOString(),
    p_ate: j.ate.toISOString(),
    p_dia_de: j.diaDe.toISOString(),
    p_dia_ate: j.diaAte.toISOString(),
    p_mes: j.mes,
    p_mes_de: j.mesDe.toISOString(),
    p_mes_ate: j.mesAte.toISOString(),
    p_tz: fuso,
  });
  if (error || !data) {
    return fail("internal_error", "Não consegui montar o painel.", 500, { requestId });
  }

  const corpo = data as { vendedores: LinhaDoVendedor[]; loja: Record<string, unknown>; serie: unknown[] };
  const pessoas = await pessoasPorId(corpo.vendedores.map((v) => v.user_id));
  const vendedores = corpo.vendedores.map((v) => ({
    ...v,
    pessoa: pessoas.get(v.user_id) ?? { user_id: v.user_id, nome: "Alguém da equipe", avatar_url: null },
  }));

  return ok(
    { periodo, fuso, mes: j.mes, de: j.de.toISOString(), ate: j.ate.toISOString(), loja: corpo.loja, serie: corpo.serie, vendedores },
    { requestId },
  );
}
