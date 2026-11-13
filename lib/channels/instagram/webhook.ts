/**
 * Leitura do webhook da Instagram API (login do Instagram) — PURA.
 *
 * Nada aqui toca banco, rede ou relógio: decide só o que o payload diz, no
 * formato que a ingestão social já grava (`SocialMessage`). É isso que deixa a
 * ingestão (`../zernio/ingest.ts`, ramo `socialMessage`) ser REUSADA inteira —
 * contato por identidade social, conversa por thread, idempotência por
 * `external_id`, nascimento do lead e despacho do agente — sem uma segunda cópia.
 *
 * O que vira mensagem:
 *   - DM recebida (`entry.messaging[].message`) → entrada;
 *   - eco (`is_echo`, ou remetente = a própria conta) → SAÍDA: o que a empresa
 *     mandou por fora do CRM. A ingestão grava sem acordar IA nem abrir lead;
 *   - comentário em post/anúncio (`entry.changes[]`, `field: "comments"`) de
 *     OUTRA pessoa → entrada na conversa de quem comentou, com id próprio
 *     (`comment:<id>`), para que reentrega não duplique e o mesmo funil crie o card.
 *
 * O que é ignorado sem erro: entrada de outra conta (`entry.id`), comentário da
 * própria conta, leitura/reação/postback, mensagem apagada ou sem conteúdo.
 */
import { z } from "zod";

import { socialMessageId } from "../social/catalog";
import type { SocialMessage } from "../social/parser";

export { verifyMetaSignature as verificarAssinaturaDoInstagram } from "../meta/webhook";
export { verificationChallenge as desafioDoInstagram } from "../meta/webhook";

const PREFIXO_COMENTARIO = "comment:";

const anexoSchema = z.looseObject({
  type: z.string(),
  payload: z.looseObject({ url: z.string().nullish() }).nullish(),
});
const messagingSchema = z.looseObject({
  sender: z.looseObject({ id: z.string().min(1) }),
  recipient: z.looseObject({ id: z.string().min(1) }),
  timestamp: z.number().nullish(),
  message: z
    .looseObject({
      mid: z.string().min(1),
      text: z.string().nullish(),
      attachments: z.array(anexoSchema).nullish(),
      is_echo: z.boolean().nullish(),
      is_deleted: z.boolean().nullish(),
      is_unsupported: z.boolean().nullish(),
    })
    .nullish(),
});
const comentarioSchema = z.looseObject({
  id: z.string().min(1),
  text: z.string().nullish(),
  from: z.looseObject({ id: z.string().min(1), username: z.string().nullish() }),
  media: z.looseObject({ id: z.string().min(1), media_product_type: z.string().nullish() }).nullish(),
});
const envelopeSchema = z.looseObject({
  object: z.string(),
  entry: z.array(
    z.looseObject({
      id: z.string().min(1),
      time: z.number().nullish(),
      messaging: z.array(z.unknown()).nullish(),
      changes: z.array(z.looseObject({ field: z.string(), value: z.unknown() })).nullish(),
    }),
  ),
});

/** Um evento lido. `comentario` só existe quando a mensagem nasceu de um comentário. */
export interface EventoDoInstagram {
  mensagem: SocialMessage;
  comentario?: { texto: string; mediaId: string | null; anuncio: boolean };
}

export type LeituraDoInstagram =
  | { ok: true; eventos: EventoDoInstagram[] }
  | { ok: false; motivo: "json_invalido" | "contrato_violado" };

/** O webhook manda ms no `messaging` e segundos em `entry.time` — aceita os dois. */
function emIso(n: number | null | undefined): string | null {
  if (!n) return null;
  return new Date(n < 1e12 ? n * 1000 : n).toISOString();
}

/** `image`/`video`/`audio` como o vocabulário de anexo da ingestão; o resto passa cru. */
function tipoDoAnexo(tipo: string): string {
  if (tipo === "ig_reel" || tipo === "reel") return "video";
  return tipo;
}

function mensagemBase(
  conta: string,
  participante: string,
  externalId: string,
  direcao: "inbound" | "outbound",
): SocialMessage {
  return {
    platform: "instagram",
    participantId: participante,
    accountId: conta,
    // A thread do Instagram É o participante: um IGSID, uma conversa. É o que o
    // adapter usa de destinatário ao responder.
    conversationId: participante,
    externalId,
    direction: direcao,
    kind: "message",
    text: null,
    sentAt: null,
    attachments: [],
    referral: null,
    identity: { phone: null, bsuid: null, anchor: null, username: null, displayName: null },
  };
}

function lerMensagem(conta: string, bruto: unknown): EventoDoInstagram | null {
  const lido = messagingSchema.safeParse(bruto);
  if (!lido.success || !lido.data.message) return null;
  const { sender, recipient, message, timestamp } = lido.data;
  if (message.is_deleted || message.is_unsupported) return null;
  const eco = message.is_echo === true || sender.id === conta;
  // O evento tem de envolver ESTA conta dos dois lados possíveis.
  if (eco ? sender.id !== conta : recipient.id !== conta) return null;
  const participante = eco ? recipient.id : sender.id;
  if (participante === conta) return null;

  const anexos = (message.attachments ?? []).flatMap((a) =>
    a.payload?.url ? [{ type: tipoDoAnexo(a.type), url: a.payload.url }] : [],
  );
  const texto = message.text?.trim() ? message.text : null;
  if (!texto && anexos.length === 0) return null;

  const m = mensagemBase(conta, participante, socialMessageId(conta, message.mid), eco ? "outbound" : "inbound");
  return { mensagem: { ...m, text: texto, sentAt: emIso(timestamp), attachments: anexos } };
}

function lerComentario(conta: string, valor: unknown, quando: number | null | undefined): EventoDoInstagram | null {
  const lido = comentarioSchema.safeParse(valor);
  if (!lido.success) return null;
  const c = lido.data;
  // Resposta da própria conta no post não é lead — é a empresa falando.
  if (c.from.id === conta) return null;
  const m = mensagemBase(conta, c.from.id, socialMessageId(conta, `${PREFIXO_COMENTARIO}${c.id}`), "inbound");
  const comentario = {
    texto: c.text ?? "",
    mediaId: c.media?.id ?? null,
    anuncio: c.media?.media_product_type === "AD",
  };
  return {
    mensagem: {
      ...m,
      text: textoDoComentario(comentario, null),
      sentAt: emIso(quando),
      identity: { ...m.identity, username: c.from.username ?? null },
    },
    comentario,
  };
}

/** O corpo que a conversa mostra para um comentário — com o link, quando houver. */
export function textoDoComentario(
  comentario: { texto: string; anuncio: boolean },
  link: string | null,
): string {
  const onde = comentario.anuncio ? "no anúncio" : "no post";
  const corpo = `💬 Comentou ${onde}: ${comentario.texto}`.trimEnd();
  return link ? `${corpo}\n${link}` : corpo;
}

/**
 * O id do comentário de origem, quando a mensagem citada nasceu de um comentário.
 * É o que permite a resposta PRIVADA (`recipient.comment_id`).
 */
export function comentarioDoExternalId(externalId: string | null | undefined): string | null {
  if (!externalId) return null;
  const i = externalId.indexOf(`:${PREFIXO_COMENTARIO}`);
  if (!externalId.startsWith("social:") || i < 0) return null;
  const id = externalId.slice(i + 1 + PREFIXO_COMENTARIO.length);
  return id || null;
}

/** Lê o corpo cru do webhook, só com o que é da conta `conta`. */
export function lerWebhookDoInstagram(rawBody: string, conta: string): LeituraDoInstagram {
  let bruto: unknown;
  try {
    bruto = JSON.parse(rawBody);
  } catch {
    return { ok: false, motivo: "json_invalido" };
  }
  const lido = envelopeSchema.safeParse(bruto);
  if (!lido.success) return { ok: false, motivo: "contrato_violado" };
  if (lido.data.object !== "instagram") return { ok: true, eventos: [] };

  const eventos: EventoDoInstagram[] = [];
  for (const entrada of lido.data.entry) {
    if (entrada.id !== conta) continue;
    for (const item of entrada.messaging ?? []) {
      const e = lerMensagem(conta, item);
      if (e) eventos.push(e);
    }
    for (const mudanca of entrada.changes ?? []) {
      if (mudanca.field !== "comments") continue;
      const e = lerComentario(conta, mudanca.value, entrada.time);
      if (e) eventos.push(e);
    }
  }
  return { ok: true, eventos };
}
