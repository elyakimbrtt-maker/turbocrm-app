/**
 * GET /api/v1/feed/anexos/[anexoId] — redireciona para o arquivo do feed por um
 * link assinado de vida curta (bucket privado `internal-media`).
 *
 * Uma hora de vida, e não 60 s como nos anexos do negócio: o `<video>` pede o
 * arquivo em pedaços (Range) enquanto toca, e um link que expira no meio do
 * vídeo trava a reprodução.
 */
import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { BUCKET_DO_FEED, caminhoEhDoFeed } from "@/lib/turbocrm/feed";

export const dynamic = "force-dynamic";

interface RouteCtx {
  params: Promise<{ anexoId: string }>;
}

export async function GET(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "feed" });
  if (!authz.ok) return authz.response;
  const { anexoId } = await ctx.params;
  const orgId = authz.org.orgId;

  const { data: anexo } = await (await createClient())
    .from("turbocrm_feed_attachments")
    .select("storage_path, file_name, post_id")
    .eq("id", anexoId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!anexo) return fail("not_found", "Arquivo não encontrado.", 404, { requestId });
  if (!caminhoEhDoFeed(anexo.storage_path, orgId)) {
    logger.warn("[feed] caminho fora do feed da empresa; link não assinado", { anexoId, requestId });
    return fail("not_found", "Arquivo não encontrado.", 404, { requestId });
  }

  const baixar = new URL(req.url).searchParams.get("baixar") === "1";
  const { data: assinado, error } = await createAdminClient()
    .storage.from(BUCKET_DO_FEED)
    .createSignedUrl(anexo.storage_path, 3600, baixar ? { download: anexo.file_name } : undefined);
  if (error || !assinado?.signedUrl) {
    return fail("internal_error", "Não consegui abrir o arquivo.", 500, { requestId });
  }

  const res = NextResponse.redirect(assinado.signedUrl, 302);
  res.headers.set("X-Request-Id", requestId);
  res.headers.set("Cache-Control", "private, max-age=600");
  return res;
}
