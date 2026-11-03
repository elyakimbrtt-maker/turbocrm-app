/**
 * PUT /api/v1/painel-gerente/metas — define a meta do MÊS ATUAL de um vendedor
 * (`user_id`) ou da loja (`user_id: null`): quantidade de vendas e/ou valor.
 *
 * Só gestor. O vendedor precisa ser membro ativo da empresa da sessão — um id
 * de outra empresa vindo no corpo é recusado, nunca gravado.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { FUSO_PADRAO, fusoValido } from "@/lib/tempo/fusos";
import { janelas } from "@/lib/turbocrm/periodos";

export const dynamic = "force-dynamic";

const Corpo = z
  .object({
    user_id: z.string().uuid().nullable(),
    alvo_vendas: z.number().int().min(0).max(100000).nullable(),
    alvo_valor_cents: z.number().int().min(0).max(1e13).nullable(),
  })
  .strict();

export async function PUT(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "painel_gerente" });
  if (!authz.ok) return authz.response;
  const orgId = authz.org.orgId;

  const parsed = Corpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", "Confira os números da meta.", 422, { requestId });
  const { user_id, alvo_vendas, alvo_valor_cents } = parsed.data;

  const admin = createAdminClient();
  if (user_id) {
    const { data: membro } = await admin
      .from("user_organizations")
      .select("user_id")
      .eq("organization_id", orgId)
      .eq("user_id", user_id)
      .is("revoked_at", null)
      .maybeSingle();
    if (!membro) return fail("not_found", "Essa pessoa não faz parte da equipe.", 404, { requestId });
  }

  const fuso = authz.org.timezone && fusoValido(authz.org.timezone) ? authz.org.timezone : FUSO_PADRAO;
  const periodo = janelas("mes", fuso).mes;

  // Upsert à mão: os índices únicos são parciais (vendedor × loja), e o
  // `onConflict` do PostgREST não aponta para índice parcial.
  let busca = admin.from("turbocrm_metas").select("id").eq("organization_id", orgId).eq("periodo", periodo);
  busca = user_id ? busca.eq("user_id", user_id) : busca.is("user_id", null);
  const { data: existente } = await busca.maybeSingle();

  const linha = {
    alvo_vendas,
    alvo_valor_cents,
    updated_by: authz.user.id,
    updated_at: new Date().toISOString(),
  };
  const { error } = existente
    ? await admin.from("turbocrm_metas").update(linha).eq("id", existente.id).eq("organization_id", orgId)
    : await admin.from("turbocrm_metas").insert({ ...linha, organization_id: orgId, periodo, user_id });
  if (error) return fail("internal_error", "Não consegui salvar a meta.", 500, { requestId });

  void audit({
    action: "painel.meta_definida",
    actorUserId: authz.user.id,
    organizationId: orgId,
    resourceType: "turbocrm_meta",
    resourceId: user_id ?? orgId,
    metadata: { periodo, da_loja: user_id === null, alvo_vendas, alvo_valor_cents },
    requestId,
  });
  return ok({ periodo, user_id, alvo_vendas, alvo_valor_cents }, { requestId });
}
