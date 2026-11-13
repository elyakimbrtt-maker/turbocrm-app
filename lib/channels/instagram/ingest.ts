/**
 * Ingestão do canal Instagram direto: eventos já lidos (`./webhook.ts`) →
 * contato, conversa, mensagem, lead.
 *
 * Não há ingestão própria: cada evento vira um `SocialMessage` e entra pela
 * ingestão social que já existe (`ingestZernioInbound` com `socialMessage`), a
 * mesma do Instagram intermediado. Ela não depende de coluna do intermediário
 * nesse ramo — usa `channel_session_id`, `contacts.social_identity`,
 * `conversations.provider_conversation_id` e `messages.external_id` —, e é ela
 * que chama `aplicarEfeitosPosEntrada`: opt-out, card em NOVO LEAD (origem
 * "instagram", recusado quando o contato já tem negócio aberto) e despacho do agente.
 *
 * O que este arquivo acrescenta é só o que o webhook do Instagram NÃO traz e a
 * API dá: o nome de quem escreveu (DM chega só com o IGSID) e o link do post
 * comentado. Os dois são melhor esforço — falha da API não segura a mensagem.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";

import { ingestZernioInbound } from "../zernio/ingest";
import { linkDaPublicacao, perfilDoRemetente } from "./api";
import { tokenDoInstagram } from "./conexao";
import { textoDoComentario, type EventoDoInstagram } from "./webhook";

async function contatoJaExiste(
  admin: SupabaseClient,
  organizationId: string,
  identidade: string,
): Promise<boolean> {
  const { data } = await admin
    .from("contacts")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("social_identity", identidade)
    .is("is_merged_into", null)
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}

async function melhorEsforco<T>(o: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (erro) {
    logger.warn(`[instagram] ${o} indisponível`, { detalhe: erro instanceof Error ? erro.message : String(erro) });
    return null;
  }
}

export async function ingerirEventosDoInstagram(
  admin: SupabaseClient,
  input: { organizationId: string; channelSessionId: string; contaId: string; eventos: EventoDoInstagram[] },
): Promise<string[]> {
  const desfechos: string[] = [];
  let token: string | null | undefined;
  const pegarToken = async () => {
    if (token === undefined) {
      token = await melhorEsforco("token", () => tokenDoInstagram(admin, input.organizationId, input.contaId));
    }
    return token;
  };

  for (const evento of input.eventos) {
    const msg = { ...evento.mensagem, identity: { ...evento.mensagem.identity } };

    if (evento.comentario?.mediaId) {
      const t = await pegarToken();
      const mediaId = evento.comentario.mediaId;
      const link = t ? await melhorEsforco("link do post", () => linkDaPublicacao(t, mediaId)) : null;
      if (link) msg.text = textoDoComentario(evento.comentario, link);
    }

    // O nome só importa para batizar contato NOVO — buscar a cada mensagem gastaria a cota da API.
    if (msg.direction === "inbound" && !msg.identity.displayName) {
      const identidade = `instagram:${input.contaId}:${msg.participantId}`;
      if (!(await contatoJaExiste(admin, input.organizationId, identidade))) {
        const t = await pegarToken();
        const perfil = t ? await melhorEsforco("perfil", () => perfilDoRemetente(t, msg.participantId)) : null;
        msg.identity.username ??= perfil?.username ?? null;
        msg.identity.displayName =
          perfil?.name ?? (msg.identity.username ? `@${msg.identity.username}` : null);
      }
    }

    const r = await ingestZernioInbound(admin, {
      organizationId: input.organizationId,
      channelSessionId: input.channelSessionId,
      payload: null,
      socialMessage: msg,
    });
    desfechos.push(r.reason ? `${r.status}:${r.reason}` : r.status);
  }
  return desfechos;
}
