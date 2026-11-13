/**
 * GET  /api/v1/channels/instagram — estado da conexão direta com o Instagram e o
 *      que colar no app da Meta (URL de callback, verify token, campos).
 * POST /api/v1/channels/instagram — valida o token no Instagram (GET /me) e SÓ
 *      ENTÃO grava token e App Secret, cifrados. Token inválido não grava nada.
 *
 * Nenhum segredo volta ao cliente: o GET diz que o token EXISTE e quando vence,
 * nunca qual é. O verify token não é segredo de envio — é o valor que o admin
 * precisa colar na Meta, e só serve para o handshake desta sessão.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { mfaEmDivida } from "@/lib/auth/server";
import {
  ConexaoInstagramError,
  conectarInstagram,
  lerConexaoDoInstagram,
} from "@/lib/channels/instagram/conexao";
import { traduzirLimiteDoPlano } from "@/lib/cobranca/limites";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { basePublicaDoWebhookMeta } from "@/lib/webhooks/url-publica";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const headers = { "Cache-Control": "no-store" };

const conectarSchema = z
  .object({
    token: z.string().trim().min(20).max(2000),
    app_secret: z.string().trim().min(16).max(200),
  })
  .strict();

/** Os campos a assinar no produto Instagram › Webhooks do app da Meta. */
const CAMPOS_DO_WEBHOOK = ["messages", "comments"];

export async function GET(req: NextRequest) {
  const requestId = randomUUID();
  const auth = await requireRole("admin", { requestId, resource: "instagram_connection" });
  if (!auth.ok) return auth.response;
  const conexao = await lerConexaoDoInstagram(createAdminClient(), auth.org.orgId);
  return ok(
    {
      connected: Boolean(conexao),
      channel_session_id: conexao?.id ?? null,
      account_id: conexao?.contaId ?? null,
      username: conexao?.username ?? null,
      display_name: conexao?.displayName ?? null,
      status: conexao?.status ?? null,
      has_token: conexao?.temToken ?? false,
      token_expires_at: conexao?.tokenExpiraEm ?? null,
      webhook: conexao
        ? {
            callback_url: `${basePublicaDoWebhookMeta(req)}/api/v1/webhooks/channel/${conexao.webhookPathToken}`,
            verify_token: conexao.verifyToken,
            fields: CAMPOS_DO_WEBHOOK,
          }
        : null,
    },
    { requestId, headers },
  );
}

export async function POST(req: NextRequest) {
  const support = await requireSupportWrite();
  if (support) return support;
  const requestId = randomUUID();
  const auth = await requireRole("admin", { requestId, resource: "instagram_connection" });
  if (!auth.ok) return auth.response;
  const t = (texto: string) => traduzir(texto, auth.user.idioma);
  if (await mfaEmDivida())
    return fail("mfa_required", t("Confirme a verificação em duas etapas."), 403, { requestId, headers });

  const parsed = conectarSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return fail("validation_error", t("Informe o token de acesso e o App Secret do Instagram."), 400, {
      requestId,
      headers,
    });
  const limite = await checkRateLimit(`instagram-connect:${auth.org.orgId}`, 10, 60);
  if (!limite.allowed)
    return fail("rate_limited", t("Aguarde um minuto antes de tentar novamente."), 429, {
      requestId,
      headers: { ...headers, "Retry-After": "60" },
    });

  try {
    const r = await conectarInstagram(createAdminClient(), {
      organizationId: auth.org.orgId,
      userId: auth.user.id,
      requestId,
      token: parsed.data.token,
      appSecret: parsed.data.app_secret,
    });
    void audit({
      action: "channel.connected",
      organizationId: auth.org.orgId,
      actorUserId: auth.user.id,
      resourceType: "channel_session",
      resourceId: r.id,
      requestId,
      metadata: { canal: "instagram", porta: "direta", account_id: r.contaId },
    });
    return ok({ connected: true, account_id: r.contaId, username: r.username }, { requestId, headers });
  } catch (erro) {
    if (erro instanceof ConexaoInstagramError)
      return fail("invalid_request", t(erro.message), erro.status, { requestId, headers });
    // Índice único da 9905: uma conta do Instagram, um canal ativo na instalação.
    if ((erro as { code?: string } | null)?.code === "23505")
      return fail("conflict", t("Esta conta do Instagram já está conectada em outra organização."), 409, {
        requestId,
        headers,
      });
    const plano = traduzirLimiteDoPlano(erro, auth.user.idioma);
    if (plano) return fail(plano.code, plano.message, 409, { requestId, headers, details: plano.details });
    logger.error("[instagram] conexão não gravada", {
      request_id: requestId,
      detalhe: erro instanceof Error ? erro.message : String(erro),
    });
    return fail("internal_error", t("Não foi possível gravar a conexão. Tente novamente."), 500, {
      requestId,
      headers,
    });
  }
}
