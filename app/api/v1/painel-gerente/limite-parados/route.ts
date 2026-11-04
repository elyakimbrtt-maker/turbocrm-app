/**
 * PUT /api/v1/painel-gerente/limite-parados `{ limite }` — a partir de quantos
 * leads parados (sem atividade há 48 h) o painel do gerente destaca o
 * atendente e o Início avisa o próprio atendente. Vale para a empresa toda.
 *
 * Só gestor. Grava em `organizations.settings` da empresa da SESSÃO.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CHAVE_DO_LIMITE_DE_PARADOS,
  LIMITE_MAX_DE_PARADOS,
  LIMITE_MIN_DE_PARADOS,
} from "@/lib/turbocrm/alerta-parados";

export const dynamic = "force-dynamic";

const Corpo = z
  .object({ limite: z.number().int().min(LIMITE_MIN_DE_PARADOS).max(LIMITE_MAX_DE_PARADOS) })
  .strict();

export async function PUT(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "painel_gerente" });
  if (!authz.ok) return authz.response;
  const orgId = authz.org.orgId;

  const parsed = Corpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail(
      "validation_failed",
      `Informe um número de ${LIMITE_MIN_DE_PARADOS} a ${LIMITE_MAX_DE_PARADOS}.`,
      422,
      { requestId },
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin.from("organizations").select("settings").eq("id", orgId).maybeSingle();
  if (error || !data) return fail("internal_error", "Não consegui ler a configuração.", 500, { requestId });
  const settings = {
    ...((data.settings as Record<string, unknown> | null) ?? {}),
    [CHAVE_DO_LIMITE_DE_PARADOS]: parsed.data.limite,
  };
  const { error: erroUp } = await admin.from("organizations").update({ settings }).eq("id", orgId);
  if (erroUp) return fail("internal_error", "Não consegui salvar.", 500, { requestId });

  void audit({
    action: "painel.limite_parados_definido",
    actorUserId: authz.user.id,
    organizationId: orgId,
    resourceType: "organization",
    resourceId: orgId,
    metadata: { limite: parsed.data.limite },
    requestId,
  });
  return ok({ limite: parsed.data.limite }, { requestId });
}
