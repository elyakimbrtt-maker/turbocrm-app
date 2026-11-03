"use client";

/**
 * TurboCRM — os dados da página Início: feed e ranking.
 */
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";

export interface PessoaDoFeed {
  user_id: string;
  nome: string;
  avatar_url: string | null;
}

export interface AnexoDoFeed {
  id: string;
  kind: "image" | "video" | "document";
  nome: string;
  mime: string;
  tamanho: number;
  url: string;
}

export interface PostDoFeed {
  id: string;
  kind: "post" | "venda";
  body: string;
  pinned: boolean;
  created_at: string;
  autor: PessoaDoFeed | null;
  meu: boolean;
  venda: { value_cents: number | null; currency: string } | null;
  anexos: AnexoDoFeed[];
  curtidas: number;
  curti: boolean;
  comentarios: number;
}

export interface ComentarioDoFeed {
  id: string;
  body: string;
  created_at: string;
  autor: PessoaDoFeed | null;
}

export interface LinhaDoRanking {
  posicao: number;
  vendas: number;
  valor_cents: number;
  pessoa: PessoaDoFeed;
}

export interface Ranking {
  ativo: boolean;
  pode_alterar: boolean;
  mes: string;
  linhas: LinhaDoRanking[];
}

const CHAVE_DO_FEED = ["turbocrm", "feed"] as const;
const CHAVE_DO_RANKING = ["turbocrm", "ranking"] as const;

interface PaginaDoFeed {
  data: PostDoFeed[];
  meta?: { has_more?: boolean; cursor?: string | null };
}

export function useFeed() {
  return useInfiniteQuery({
    queryKey: CHAVE_DO_FEED,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const qs = pageParam ? `?antes=${encodeURIComponent(pageParam)}` : "";
      return apiClient.get<PaginaDoFeed>(`/api/v1/feed${qs}`);
    },
    getNextPageParam: (ultima) => (ultima.meta?.has_more ? (ultima.meta.cursor ?? null) : null),
    // O feed é a primeira coisa que a equipe vê: volta a buscar a cada minuto
    // e ao voltar para a aba, para a venda do colega aparecer sem recarregar.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

/** Publicar — multipart (texto + arquivos), por isso `fetch` e não `apiClient`. */
export function usePublicar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ texto, arquivos }: { texto: string; arquivos: File[] }) => {
      const form = new FormData();
      form.set("body", texto);
      for (const a of arquivos) form.append("files", a);
      const res = await fetch("/api/v1/feed", { method: "POST", body: form });
      const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!res.ok) throw new Error(json.error?.message ?? "Não consegui publicar.");
      return json;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE_DO_FEED }),
  });
}

function trocarPost(
  qc: ReturnType<typeof useQueryClient>,
  postId: string,
  mudar: (p: PostDoFeed) => PostDoFeed,
) {
  qc.setQueryData<{ pages: PaginaDoFeed[]; pageParams: unknown[] }>(CHAVE_DO_FEED, (atual) =>
    atual
      ? {
          ...atual,
          pages: atual.pages.map((pg) => ({ ...pg, data: pg.data.map((p) => (p.id === postId ? mudar(p) : p)) })),
        }
      : atual,
  );
}

export function useCurtir() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) =>
      apiClient.post<{ data: { curti: boolean; curtidas: number } }>(`/api/v1/feed/${postId}/curtir`, {}),
    // Otimista: o coração enche na hora do toque.
    onMutate: (postId) => {
      trocarPost(qc, postId, (p) => ({ ...p, curti: !p.curti, curtidas: p.curtidas + (p.curti ? -1 : 1) }));
    },
    onSuccess: (res, postId) => {
      trocarPost(qc, postId, (p) => ({ ...p, curti: res.data.curti, curtidas: res.data.curtidas }));
    },
    onError: (err) => {
      showApiError(err);
      qc.invalidateQueries({ queryKey: CHAVE_DO_FEED });
    },
  });
}

export function useApagarPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) => apiClient.delete(`/api/v1/feed/${postId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE_DO_FEED }),
    onError: showApiError,
  });
}

export function useFixarPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, pinned }: { postId: string; pinned: boolean }) =>
      apiClient.patch(`/api/v1/feed/${postId}`, { pinned }),
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE_DO_FEED }),
    onError: showApiError,
  });
}

export function useComentarios(postId: string, aberto: boolean) {
  return useQuery({
    queryKey: ["turbocrm", "feed", "comentarios", postId],
    enabled: aberto,
    queryFn: async () => (await apiClient.get<{ data: ComentarioDoFeed[] }>(`/api/v1/feed/${postId}/comentarios`)).data,
  });
}

export function useComentar(postId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => apiClient.post(`/api/v1/feed/${postId}/comentarios`, { body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["turbocrm", "feed", "comentarios", postId] });
      trocarPost(qc, postId, (p) => ({ ...p, comentarios: p.comentarios + 1 }));
    },
    onError: showApiError,
  });
}

export function useRanking() {
  return useQuery({
    queryKey: CHAVE_DO_RANKING,
    queryFn: async () => (await apiClient.get<{ data: Ranking }>("/api/v1/feed/ranking")).data,
    refetchInterval: 120_000,
  });
}

export function useLigarRanking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ativo: boolean) => apiClient.patch("/api/v1/feed/ranking", { ativo }),
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE_DO_RANKING }),
    onError: showApiError,
  });
}
