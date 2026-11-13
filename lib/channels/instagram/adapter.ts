/**
 * Adapter do canal Instagram direto (Instagram API com login do Instagram).
 *
 * Endereço: a thread do Instagram é o IGSID de quem escreveu, gravado pela
 * ingestão em `conversations.provider_conversation_id` — igual ao Instagram
 * intermediado. Não há telefone nem grupo.
 *
 * RESPOSTA PRIVADA A COMENTÁRIO: quando o atendente responde CITANDO a mensagem
 * que nasceu de um comentário ("💬 Comentou no post…"), o envio vai com
 * `recipient.comment_id` — a única forma de a Meta deixar a empresa escrever no
 * direct de quem só comentou (uma vez, até 7 dias depois). Sem citação, vai como
 * DM comum, que a Meta só aceita dentro das 24 h de uma mensagem DO CLIENTE.
 */
import { assertDestinoResolvidoSeguro } from "@/lib/automation/outbound-ip";
import { assertSafeOutboundUrl } from "@/lib/automation/outbound-url";
import { createAdminClient } from "@/lib/supabase/admin";

import { CHANNEL_PROVIDER_INSTAGRAM } from "../capabilities";
import { socialMessageId } from "../social/catalog";
import { baixarMidiaComLimite } from "../social/adapter";
import type { ChannelAdapter } from "../types";
import { contaDoToken, enviarMensagem, InstagramApiError } from "./api";
import { tokenDoInstagram } from "./conexao";
import { comentarioDoExternalId } from "./webhook";

const TIPOS_DE_MIDIA = new Set(["image", "video", "audio"]);

export const instagramAdapter: ChannelAdapter = {
  provider: CHANNEL_PROVIDER_INSTAGRAM,
  codes: {
    notConfigured: "instagram_not_configured",
    sendFailed: "instagram_send_failed",
    unknownError: "instagram_error",
  },
  resolveRecipient: (input) => (input.isGroup ? null : "provider-thread"),
  // Sempre `true`: quem desiste é `send`, com o motivo (ver `../social/adaptador-da-porta.ts`).
  isConfigured: () => true,

  async send(envelope) {
    const comentario = comentarioDoExternalId(envelope.replyToExternalId);
    if (!comentario && !envelope.providerConversationId)
      throw new Error("Aguarde uma mensagem do cliente para responder no Instagram.");
    if (envelope.kind !== "text" && !TIPOS_DE_MIDIA.has(envelope.kind))
      throw new Error("Este tipo de mensagem ainda não é suportado no Instagram.");
    if (comentario && envelope.kind !== "text")
      throw new Error("A resposta privada a um comentário só aceita texto.");
    const token = await tokenDoInstagram(createAdminClient(), envelope.organizationId, envelope.sessionRef);
    if (!token) throw new Error("Reconecte o Instagram em Conexões › Redes sociais.");
    await envelope.beforeSend?.();

    const destino = comentario ? { comment_id: comentario } : { id: envelope.providerConversationId! };
    let id: string;
    if (envelope.media) {
      id = await enviarMensagem(token, envelope.sessionRef, destino, {
        attachment: { type: envelope.kind, payload: { url: envelope.media.url } },
      });
      // O Instagram não tem legenda em anexo: o texto sai logo depois, como mensagem.
      if (envelope.media.caption) {
        await enviarMensagem(token, envelope.sessionRef, destino, { text: envelope.media.caption });
      }
    } else {
      id = await enviarMensagem(token, envelope.sessionRef, destino, { text: envelope.body ?? "" });
    }
    // Mesmo formato da ingestão: o eco do próprio envio volta como duplicata, não como linha nova.
    return { externalId: socialMessageId(envelope.sessionRef, id) };
  },

  async checkHealth(input) {
    const token = await tokenDoInstagram(createAdminClient(), input.organizationId, input.sessionRef);
    if (!token) return { reachable: true, status: "FAILED", detail: "credencial_indisponivel" };
    try {
      await contaDoToken(token);
      return { reachable: true, status: "WORKING", detail: null };
    } catch (erro) {
      return erro instanceof InstagramApiError
        ? { reachable: true, status: "FAILED", detail: "token_recusado" }
        : { reachable: false, status: null, detail: "provedor_indisponivel" };
    }
  },

  // A mídia do Instagram vem de CDN público assinado: não leva credencial nenhuma.
  async fetchInboundMedia(input) {
    const url = new URL(input.url);
    assertSafeOutboundUrl(url.toString());
    await assertDestinoResolvidoSeguro(url.hostname);
    return baixarMidiaComLimite(url, {}, input.hintMime);
  },
};
