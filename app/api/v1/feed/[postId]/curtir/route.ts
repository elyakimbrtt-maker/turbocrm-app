/**
 * POST /api/v1/feed/[postId]/curtir — curte ou descurte (alterna) um post.
 *
 * Curtida não audita: é gesto social, não mutação de negócio, e auditar cada
 * toque encheria a trilha da empresa de ruído (mesma régua do cron vazio).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { postDaEmpresa } from "@/lib/turbocrm/feed";

export const dynamic = "force-dynamic";

interface RouteCtx {
  params: Promise<{ postId: string }>;
}

export async function POST(_req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "feed" });
  if (!authz.ok) return authz.response;
  const { postId } = await ctx.params;
  const orgId = authz.org.orgId;

  const post = await postDaEmpresa(await createClient(), orgId, postId);
  if (!post) return fail("not_found", "Publicação não encontrada.", 404, { requestId });

  const admin = createAdminClient();
  const { data: apagadas } = await admin
    .from("turbocrm_feed_reactions")
    .delete()
    .eq("post_id", postId)
    .eq("user_id", authz.user.id)
    .eq("organization_id", orgId)
    .select("post_id");

  let curti = false;
  if (!apagadas || apagadas.length === 0) {
    const { error } = await admin
      .from("turbocrm_feed_reactions")
      .insert({ organization_id: orgId, post_id: postId, user_id: authz.user.id });
    // 23505 = já curtido por um clique duplo: o estado final é "curtido" mesmo.
    if (error && (error as { code?: string }).code !== "23505") {
      return fail("internal_error", "Não consegui curtir.", 500, { requestId });
    }
    curti = true;
  }

  const { count } = await admin
    .from("turbocrm_feed_reactions")
    .select("post_id", { count: "exact", head: true })
    .eq("post_id", postId)
    .eq("organization_id", orgId);

  return ok({ curti, curtidas: count ?? 0 }, { requestId });
}
