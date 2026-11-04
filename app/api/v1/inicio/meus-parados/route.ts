/**
 * GET /api/v1/inicio/meus-parados — quantos negócios EM ABERTO do próprio
 * usuário estão parados (sem atividade há 48 h, a régua do painel do gerente)
 * e a partir de quantos a empresa quer o aviso. Alimenta o aviso do Início:
 * o atendente vê antes de o gestor precisar cobrar.
 *
 * Qualquer membro; conta só os negócios cujo responsável é quem chama, na
 * empresa da SESSÃO.
 */
import { randomUUID } from "node:crypto";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { corteDeParado } from "@/lib/turbocrm/alerta-parados";
import { alertaDaEmpresa } from "@/lib/turbocrm/painel";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "inicio" });
  if (!authz.ok) return authz.response;

  const corte = corteDeParado();
  const [contagem, alerta] = await Promise.all([
    createAdminClient()
      .from("crm_leads")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", authz.org.orgId)
      .eq("owner_user_id", authz.user.id)
      .eq("status", "open")
      .or(`last_activity_at.lt.${corte},and(last_activity_at.is.null,created_at.lt.${corte})`),
    alertaDaEmpresa(authz.org.orgId),
  ]);
  if (contagem.error) return fail("internal_error", "Não consegui contar os negócios parados.", 500, { requestId });

  return ok(
    { parados: contagem.count ?? 0, limite: alerta.limite, funil_id: alerta.funil_id, user_id: authz.user.id },
    { requestId },
  );
}
