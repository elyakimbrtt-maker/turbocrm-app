/**
 * TurboCRM — regras do feed interno da equipe (servidor).
 *
 * As tabelas são `turbocrm_feed_*` (migration 9902). A leitura passa pela RLS
 * de quem está logado; a escrita só pelas rotas de `app/api/v1/feed/**`, que
 * conferem papel e empresa e gravam com o cliente de serviço — sempre com
 * `organization_id` vindo da sessão, nunca do corpo do pedido.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";

/** O mesmo bucket privado dos anexos internos; o feed mora em `<org>/feed/`. */
export const BUCKET_DO_FEED = "internal-media";

/** Vídeo pesa: 50 MB é o teto do bucket. Imagem e documento bem menos. */
export const LIMITE_POR_TIPO = {
  image: 10 * 1024 * 1024,
  video: 50 * 1024 * 1024,
  document: 20 * 1024 * 1024,
} as const;

export const MAX_ARQUIVOS_POR_POST = 6;
export const MAX_TEXTO_DO_POST = 5000;
export const MAX_TEXTO_DO_COMENTARIO = 2000;

export type TipoDeAnexo = keyof typeof LIMITE_POR_TIPO;

const DOCUMENTOS = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
]);

/** O tipo do anexo pelo MIME — `null` recusa o arquivo. */
export function tipoDoAnexo(mime: string): TipoDeAnexo | null {
  const m = mime.toLowerCase();
  if (["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"].includes(m)) return "image";
  if (["video/mp4", "video/webm", "video/quicktime"].includes(m)) return "video";
  if (DOCUMENTOS.has(m)) return "document";
  return null;
}

export function nomeSeguro(nome: string): string {
  return nome.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "arquivo";
}

/** O caminho de um anexo só é assinado se estiver dentro da pasta do feed da empresa. */
export function caminhoEhDoFeed(caminho: string, orgId: string): boolean {
  return caminho.startsWith(`${orgId}/feed/`) && !caminho.includes("..");
}

export interface Pessoa {
  user_id: string;
  nome: string;
  avatar_url: string | null;
}

/**
 * Nome e foto de cada autor. Vêm do `user_metadata` do Auth, como na lista de
 * responsáveis (`/api/v1/team/assignable`) — o produto não tem tabela de perfil.
 */
export async function pessoasPorId(ids: Iterable<string>): Promise<Map<string, Pessoa>> {
  const unicos = [...new Set([...ids].filter(Boolean))];
  const mapa = new Map<string, Pessoa>();
  if (unicos.length === 0) return mapa;
  const admin = createAdminClient();
  await Promise.all(
    unicos.map(async (id) => {
      const { data } = await admin.auth.admin.getUserById(id);
      const meta = (data?.user?.user_metadata ?? {}) as Record<string, unknown>;
      const nome =
        (typeof meta.full_name === "string" && meta.full_name.trim()) ||
        data?.user?.email?.split("@")[0] ||
        "Alguém da equipe";
      mapa.set(id, {
        user_id: id,
        nome,
        avatar_url: typeof meta.avatar_url === "string" ? meta.avatar_url : null,
      });
    }),
  );
  return mapa;
}

/** O post existe, é desta empresa e não foi apagado? */
export async function postDaEmpresa(
  db: SupabaseClient,
  orgId: string,
  postId: string,
): Promise<{ id: string; author_user_id: string | null } | null> {
  const { data } = await db
    .from("turbocrm_feed_posts")
    .select("id, author_user_id")
    .eq("id", postId)
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .maybeSingle();
  return (data as { id: string; author_user_id: string | null } | null) ?? null;
}

/** Chave do liga/desliga do ranking em `organizations.settings`. */
export const CHAVE_DO_RANKING = "turbocrm_ranking_ativo";
