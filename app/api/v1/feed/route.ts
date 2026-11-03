/**
 * GET/POST /api/v1/feed — o feed interno da equipe (TurboCRM).
 *
 * GET: os posts da empresa, mais novos primeiro, com anexos, curtidas,
 * contagem de comentários e o autor. Paginação por `?antes=<created_at>`.
 * POST: multipart com `body` (texto) e até 6 `files` (imagem, vídeo ou
 * documento). Qualquer membro que atende (`agent`+) publica.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  BUCKET_DO_FEED,
  LIMITE_POR_TIPO,
  MAX_ARQUIVOS_POR_POST,
  MAX_TEXTO_DO_POST,
  nomeSeguro,
  pessoasPorId,
  tipoDoAnexo,
} from "@/lib/turbocrm/feed";

export const dynamic = "force-dynamic";

const POR_PAGINA = 15;

interface LinhaDoPost {
  id: string;
  author_user_id: string | null;
  kind: "post" | "venda";
  body: string;
  lead_id: string | null;
  pinned: boolean;
  created_at: string;
}

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "feed" });
  if (!authz.ok) return authz.response;
  const orgId = authz.org.orgId;
  const antes = new URL(req.url).searchParams.get("antes");

  const db = await createClient();
  let consulta = db
    .from("turbocrm_feed_posts")
    .select("id, author_user_id, kind, body, lead_id, pinned, created_at")
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(POR_PAGINA + 1);
  if (antes && !Number.isNaN(Date.parse(antes))) consulta = consulta.lt("created_at", antes);

  const { data, error } = await consulta;
  if (error) {
    logger.error("[feed] erro ao listar", { detalhe: error.message, requestId });
    return fail("internal_error", "Não consegui carregar o feed.", 500, { requestId });
  }
  const linhas = (data ?? []) as LinhaDoPost[];
  const temMais = linhas.length > POR_PAGINA;
  const posts = linhas.slice(0, POR_PAGINA);
  const ids = posts.map((p) => p.id);

  // Fixados vão para o topo só na primeira página.
  let fixados: LinhaDoPost[] = [];
  if (!antes) {
    const { data: f } = await db
      .from("turbocrm_feed_posts")
      .select("id, author_user_id, kind, body, lead_id, pinned, created_at")
      .eq("organization_id", orgId)
      .eq("pinned", true)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(5);
    fixados = ((f ?? []) as LinhaDoPost[]).filter((p) => !ids.includes(p.id));
  }
  const todos = [...fixados, ...posts];
  const todosIds = todos.map((p) => p.id);

  const [anexos, curtidas, comentarios, leads] = await Promise.all([
    todosIds.length
      ? db
          .from("turbocrm_feed_attachments")
          .select("id, post_id, kind, file_name, mime_type, file_size, position")
          .eq("organization_id", orgId)
          .in("post_id", todosIds)
          .order("position")
      : Promise.resolve({ data: [] }),
    todosIds.length
      ? db.from("turbocrm_feed_reactions").select("post_id, user_id").eq("organization_id", orgId).in("post_id", todosIds)
      : Promise.resolve({ data: [] }),
    todosIds.length
      ? db
          .from("turbocrm_feed_comments")
          .select("post_id")
          .eq("organization_id", orgId)
          .in("post_id", todosIds)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] }),
    // O valor da venda comemorada sai do próprio negócio, não de uma cópia.
    todos.some((p) => p.lead_id)
      ? db
          .from("crm_leads")
          .select("id, value_cents, currency")
          .eq("organization_id", orgId)
          .in("id", todos.filter((p) => p.lead_id).map((p) => p.lead_id as string))
      : Promise.resolve({ data: [] }),
  ]);

  const pessoas = await pessoasPorId(todos.map((p) => p.author_user_id ?? ""));
  const eu = authz.user.id;
  const listaAnexos = (anexos.data ?? []) as Array<{
    id: string;
    post_id: string;
    kind: string;
    file_name: string;
    mime_type: string;
    file_size: number;
  }>;
  const listaCurtidas = (curtidas.data ?? []) as Array<{ post_id: string; user_id: string }>;
  const listaComentarios = (comentarios.data ?? []) as Array<{ post_id: string }>;
  const valorDoLead = new Map(
    ((leads.data ?? []) as Array<{ id: string; value_cents: number | null; currency: string | null }>).map((l) => [
      l.id,
      l,
    ]),
  );

  const corpo = todos.map((p) => ({
    id: p.id,
    kind: p.kind,
    body: p.body,
    pinned: p.pinned,
    created_at: p.created_at,
    autor: p.author_user_id ? (pessoas.get(p.author_user_id) ?? null) : null,
    meu: p.author_user_id === eu,
    venda:
      p.kind === "venda" && p.lead_id
        ? {
            value_cents: valorDoLead.get(p.lead_id)?.value_cents ?? null,
            currency: valorDoLead.get(p.lead_id)?.currency ?? "BRL",
          }
        : null,
    anexos: listaAnexos
      .filter((a) => a.post_id === p.id)
      .map((a) => ({
        id: a.id,
        kind: a.kind,
        nome: a.file_name,
        mime: a.mime_type,
        tamanho: Number(a.file_size),
        url: `/api/v1/feed/anexos/${a.id}`,
      })),
    curtidas: listaCurtidas.filter((c) => c.post_id === p.id).length,
    curti: listaCurtidas.some((c) => c.post_id === p.id && c.user_id === eu),
    comentarios: listaComentarios.filter((c) => c.post_id === p.id).length,
  }));

  return ok(corpo, {
    requestId,
    meta: { has_more: temMais, cursor: temMais ? (posts.at(-1)?.created_at ?? null) : null },
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "feed" });
  if (!authz.ok) return authz.response;
  const orgId = authz.org.orgId;

  const form = await req.formData().catch(() => null);
  if (!form) return fail("validation_failed", "Não entendi o envio.", 400, { requestId });

  const texto = String(form.get("body") ?? "").trim();
  const arquivos = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);

  if (!texto && arquivos.length === 0) {
    return fail("validation_failed", "Escreva algo ou anexe um arquivo.", 422, { requestId });
  }
  if (texto.length > MAX_TEXTO_DO_POST) {
    return fail("validation_failed", `O texto passa de ${MAX_TEXTO_DO_POST} caracteres.`, 422, { requestId });
  }
  if (arquivos.length > MAX_ARQUIVOS_POR_POST) {
    return fail("validation_failed", `Até ${MAX_ARQUIVOS_POR_POST} arquivos por publicação.`, 422, { requestId });
  }
  for (const a of arquivos) {
    const tipo = tipoDoAnexo(a.type);
    if (!tipo) {
      return fail("unsupported_media_type", `"${a.name}" não é imagem, vídeo (MP4/WebM/MOV) nem documento aceito.`, 415, {
        requestId,
      });
    }
    if (a.size > LIMITE_POR_TIPO[tipo]) {
      const mb = Math.round(LIMITE_POR_TIPO[tipo] / 1024 / 1024);
      return fail("payload_too_large", `"${a.name}" passa de ${mb} MB.`, 413, { requestId });
    }
  }

  const admin = createAdminClient();
  const postId = randomUUID();
  const { error: erroDoPost } = await admin.from("turbocrm_feed_posts").insert({
    id: postId,
    organization_id: orgId,
    author_user_id: authz.user.id,
    kind: "post",
    body: texto,
  });
  if (erroDoPost) {
    logger.error("[feed] insert do post falhou", { detalhe: erroDoPost.message, requestId });
    return fail("internal_error", "Não consegui publicar.", 500, { requestId });
  }

  const enviados: string[] = [];
  try {
    for (const [i, a] of arquivos.entries()) {
      const tipo = tipoDoAnexo(a.type)!;
      const anexoId = randomUUID();
      const caminho = `${orgId}/feed/${postId}/${anexoId}-${nomeSeguro(a.name)}`;
      const bytes = new Uint8Array(await a.arrayBuffer());
      const { error: erroUp } = await admin.storage
        .from(BUCKET_DO_FEED)
        .upload(caminho, bytes, { contentType: a.type, upsert: false });
      if (erroUp) throw new Error(erroUp.message);
      enviados.push(caminho);
      const { error: erroAnexo } = await admin.from("turbocrm_feed_attachments").insert({
        id: anexoId,
        organization_id: orgId,
        post_id: postId,
        kind: tipo,
        storage_path: caminho,
        file_name: a.name.slice(0, 200),
        mime_type: a.type,
        file_size: a.size,
        position: i,
      });
      if (erroAnexo) throw new Error(erroAnexo.message);
    }
  } catch (err) {
    // Tudo ou nada: post pela metade (sem a foto que a pessoa escolheu) é pior
    // que pedir para enviar de novo.
    logger.error("[feed] anexo falhou", { detalhe: err instanceof Error ? err.message : String(err), requestId });
    if (enviados.length) await admin.storage.from(BUCKET_DO_FEED).remove(enviados).catch(() => null);
    await admin.from("turbocrm_feed_posts").delete().eq("id", postId).eq("organization_id", orgId);
    return fail("internal_error", "Não consegui salvar os arquivos. Tente de novo.", 500, { requestId });
  }

  void audit({
    action: "feed.post_created",
    actorUserId: authz.user.id,
    organizationId: orgId,
    resourceType: "turbocrm_feed_post",
    resourceId: postId,
    metadata: { anexos: arquivos.length, caracteres: texto.length },
    requestId,
  });

  return ok({ id: postId }, { requestId });
}
