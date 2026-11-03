/**
 * GET/POST /api/v1/feed/[postId]/comentarios — os comentários de um post.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { MAX_TEXTO_DO_COMENTARIO, pessoasPorId, postDaEmpresa } from "@/lib/turbocrm/feed";

export const dynamic = "force-dynamic";

interface RouteCtx {
  params: Promise<{ postId: string }>;
}

const PostSchema = z.object({ body: z.string().trim().min(1).max(MAX_TEXTO_DO_COMENTARIO) }).strict();

export async function GET(_req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "feed" });
  if (!authz.ok) return authz.response;
  const { postId } = await ctx.params;

  const db = await createClient();
  const { data, error } = await db
    .from("turbocrm_feed_comments")
    .select("id, author_user_id, body, created_at")
    .eq("organization_id", authz.org.orgId)
    .eq("post_id", postId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) return fail("internal_error", "Não consegui carregar os comentários.", 500, { requestId });

  const linhas = (data ?? []) as Array<{ id: string; author_user_id: string | null; body: string; created_at: string }>;
  const pessoas = await pessoasPorId(linhas.map((c) => c.author_user_id ?? ""));
  return ok(
    linhas.map((c) => ({
      id: c.id,
      body: c.body,
      created_at: c.created_at,
      autor: c.author_user_id ? (pessoas.get(c.author_user_id) ?? null) : null,
    })),
    { requestId },
  );
}

export async function POST(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "feed" });
  if (!authz.ok) return authz.response;
  const { postId } = await ctx.params;

  const parsed = PostSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", `O comentário precisa ter de 1 a ${MAX_TEXTO_DO_COMENTARIO} caracteres.`, 422, {
      requestId,
    });
  }

  const post = await postDaEmpresa(await createClient(), authz.org.orgId, postId);
  if (!post) return fail("not_found", "Publicação não encontrada.", 404, { requestId });

  const { data, error } = await createAdminClient()
    .from("turbocrm_feed_comments")
    .insert({
      organization_id: authz.org.orgId,
      post_id: postId,
      author_user_id: authz.user.id,
      body: parsed.data.body,
    })
    .select("id, created_at")
    .single();
  if (error || !data) return fail("internal_error", "Não consegui comentar.", 500, { requestId });

  return ok({ id: data.id, created_at: data.created_at }, { requestId });
}
