/**
 * PATCH/DELETE /api/v1/feed/[postId] — fixar e apagar um post do feed (TurboCRM).
 *
 * Apagar: o autor apaga o seu; gestor (`manager`+) apaga qualquer um. É lógico
 * (`deleted_at`) — o post some do feed e os arquivos ficam até a limpeza.
 * Fixar no topo: só gestor.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { ROLE_RANK } from "@/lib/auth/types";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { postDaEmpresa } from "@/lib/turbocrm/feed";

export const dynamic = "force-dynamic";

interface RouteCtx {
  params: Promise<{ postId: string }>;
}

const PatchSchema = z.object({ pinned: z.boolean() }).strict();

export async function PATCH(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "feed" });
  if (!authz.ok) return authz.response;
  const { postId } = await ctx.params;

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", "Não entendi o que mudar.", 422, { requestId });

  const post = await postDaEmpresa(await createClient(), authz.org.orgId, postId);
  if (!post) return fail("not_found", "Publicação não encontrada.", 404, { requestId });

  const { error } = await createAdminClient()
    .from("turbocrm_feed_posts")
    .update({ pinned: parsed.data.pinned, updated_at: new Date().toISOString() })
    .eq("id", postId)
    .eq("organization_id", authz.org.orgId);
  if (error) return fail("internal_error", "Não consegui fixar.", 500, { requestId });

  void audit({
    action: "feed.post_pinned",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "turbocrm_feed_post",
    resourceId: postId,
    metadata: { pinned: parsed.data.pinned },
    requestId,
  });
  return ok({ id: postId, pinned: parsed.data.pinned }, { requestId });
}

export async function DELETE(_req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "feed" });
  if (!authz.ok) return authz.response;
  const { postId } = await ctx.params;

  const post = await postDaEmpresa(await createClient(), authz.org.orgId, postId);
  if (!post) return fail("not_found", "Publicação não encontrada.", 404, { requestId });

  const gestor = ROLE_RANK[authz.org.role] >= ROLE_RANK.manager;
  if (post.author_user_id !== authz.user.id && !gestor) {
    return fail("forbidden", "Só quem publicou (ou um gestor) pode apagar.", 403, { requestId });
  }

  const { error } = await createAdminClient()
    .from("turbocrm_feed_posts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", postId)
    .eq("organization_id", authz.org.orgId);
  if (error) return fail("internal_error", "Não consegui apagar.", 500, { requestId });

  void audit({
    action: "feed.post_deleted",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "turbocrm_feed_post",
    resourceId: postId,
    metadata: { do_proprio_autor: post.author_user_id === authz.user.id },
    requestId,
  });
  return ok({ id: postId }, { requestId });
}
