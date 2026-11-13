/**
 * O fio com a Instagram API (login do Instagram) — host, versão e as poucas
 * chamadas que o canal Instagram direto faz.
 *
 * O host mora AQUI, dentro da fronteira do canal (mesma razão de
 * `../meta/graph-base.ts`); a versão mora em `lib/graph-version.ts`, que é o
 * lugar único de versão de plataforma da Meta.
 *
 * O token vai no header `Authorization`, nunca na query (CLAUDE.md: credencial
 * em query string vaza em log). A única exceção é a renovação, cujo endpoint só
 * aceita o token como parâmetro — e ela roda servidor a servidor, sem proxy.
 */
import { z } from "zod";

import { instagramGraphVersion } from "@/lib/graph-version";

const HOST = "https://graph.instagram.com";

export class InstagramApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** `error.code` da plataforma, quando veio. */
    readonly code: number | null,
  ) {
    super(message);
    this.name = "InstagramApiError";
  }
}

const erroDaPlataforma = z.object({
  error: z.object({ message: z.string().optional(), code: z.number().optional() }).passthrough(),
});

async function chamar(
  token: string,
  caminho: string,
  init: { method?: "GET" | "POST"; body?: unknown } = {},
): Promise<unknown> {
  const resposta = await fetch(`${HOST}/${instagramGraphVersion()}/${caminho}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  const corpo: unknown = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    const erro = erroDaPlataforma.safeParse(corpo);
    throw new InstagramApiError(
      erro.success && erro.data.error.message
        ? erro.data.error.message
        : `Instagram respondeu HTTP ${resposta.status}`,
      resposta.status,
      erro.success ? (erro.data.error.code ?? null) : null,
    );
  }
  return corpo;
}

/** A conta dona do token. É a validação do token antes de gravar qualquer coisa. */
export async function contaDoToken(token: string): Promise<{ userId: string; username: string | null }> {
  const r = z
    .object({ user_id: z.union([z.string(), z.number()]), username: z.string().nullish() })
    .parse(await chamar(token, "me?fields=user_id,username"));
  return { userId: String(r.user_id), username: r.username ?? null };
}

/**
 * Renova o token de longa duração (precisa ter ≥ 24 h). Devolve o token novo e
 * quando ele vence. O endpoint não é versionado e só aceita o token na query.
 */
export async function renovarTokenDeLongaDuracao(
  token: string,
): Promise<{ token: string; expiraEm: string }> {
  const q = new URLSearchParams({ grant_type: "ig_refresh_token", access_token: token });
  const resposta = await fetch(`${HOST}/refresh_access_token?${q}`, {
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  const corpo: unknown = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    const erro = erroDaPlataforma.safeParse(corpo);
    throw new InstagramApiError(
      erro.success && erro.data.error.message ? erro.data.error.message : `HTTP ${resposta.status}`,
      resposta.status,
      erro.success ? (erro.data.error.code ?? null) : null,
    );
  }
  const r = z.object({ access_token: z.string().min(20), expires_in: z.number() }).parse(corpo);
  return { token: r.access_token, expiraEm: new Date(Date.now() + r.expires_in * 1000).toISOString() };
}

/** Nome e @ de quem escreveu. Melhor esforço: quem chama engole a falha. */
export async function perfilDoRemetente(
  token: string,
  igsid: string,
): Promise<{ name: string | null; username: string | null }> {
  const r = z
    .object({ name: z.string().nullish(), username: z.string().nullish() })
    .parse(await chamar(token, `${encodeURIComponent(igsid)}?fields=name,username`));
  return { name: r.name ?? null, username: r.username ?? null };
}

/** Link público do post/anúncio comentado. Melhor esforço. */
export async function linkDaPublicacao(token: string, mediaId: string): Promise<string | null> {
  const r = z
    .object({ permalink: z.string().nullish() })
    .parse(await chamar(token, `${encodeURIComponent(mediaId)}?fields=permalink`));
  return r.permalink ?? null;
}

/**
 * Envia pela conta `contaId`. O destinatário é o IGSID da conversa ou, na
 * resposta privada a um comentário, o id do comentário.
 */
export async function enviarMensagem(
  token: string,
  contaId: string,
  destino: { id: string } | { comment_id: string },
  mensagem: { text: string } | { attachment: { type: string; payload: { url: string } } },
): Promise<string> {
  const r = z
    .object({ message_id: z.string().min(1) })
    .parse(
      await chamar(token, `${encodeURIComponent(contaId)}/messages`, {
        method: "POST",
        body: { recipient: destino, message: mensagem },
      }),
    );
  return r.message_id;
}
