/**
 * GET /api/v1/painel-gerente?periodo=hoje|semana|mes — os números do painel do
 * gerente (TurboCRM): por vendedor e da loja.
 *
 * Só gestor (`manager`+). A soma é a função `fn_turbocrm_painel_gerente`
 * (migrations 9903/9904), via `lib/turbocrm/painel.ts`, com a empresa da
 * SESSÃO. Follow-ups são sempre de HOJE e as metas sempre do MÊS, qualquer que
 * seja o período — é como o gerente pensa ("o que falta hoje", "como vamos no
 * mês").
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { fusoDaEmpresa, numerosDoPainel } from "@/lib/turbocrm/painel";
import type { Periodo } from "@/lib/turbocrm/periodos";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "painel_gerente" });
  if (!authz.ok) return authz.response;

  const pedido = new URL(req.url).searchParams.get("periodo");
  const periodo: Periodo = pedido === "hoje" || pedido === "semana" ? pedido : "mes";
  const r = await numerosDoPainel(authz.org.orgId, periodo, fusoDaEmpresa(authz.org.timezone));
  if (!r.ok) return fail("internal_error", "Não consegui montar o painel.", 500, { requestId });
  return ok(r.numeros, { requestId });
}
