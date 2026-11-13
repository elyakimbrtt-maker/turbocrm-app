import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  comentarioDoExternalId,
  desafioDoInstagram,
  lerWebhookDoInstagram,
  textoDoComentario,
  verificarAssinaturaDoInstagram,
} from "./webhook";

const CONTA = "17841400000000001";
const CLIENTE = "998877665544";

function dm(message: Record<string, unknown>, sender = CLIENTE, recipient = CONTA, entryId = CONTA) {
  return JSON.stringify({
    object: "instagram",
    entry: [{ id: entryId, time: 1762950000, messaging: [{ sender: { id: sender }, recipient: { id: recipient }, timestamp: 1762950000123, message }] }],
  });
}

function comentario(value: Record<string, unknown>, entryId = CONTA) {
  return JSON.stringify({
    object: "instagram",
    entry: [{ id: entryId, time: 1762950000, changes: [{ field: "comments", value }] }],
  });
}

function eventos(raw: string) {
  const r = lerWebhookDoInstagram(raw, CONTA);
  if (!r.ok) throw new Error(`leitura recusada: ${r.motivo}`);
  return r.eventos;
}

describe("lerWebhookDoInstagram — direct", () => {
  it("DM recebida vira entrada na thread do remetente", () => {
    const [e] = eventos(dm({ mid: "m_1", text: "Tem a Biz 125 à vista?" }));
    expect(e!.mensagem).toMatchObject({
      platform: "instagram",
      direction: "inbound",
      kind: "message",
      participantId: CLIENTE,
      conversationId: CLIENTE,
      accountId: CONTA,
      externalId: `social:${CONTA}:m_1`,
      text: "Tem a Biz 125 à vista?",
      sentAt: new Date(1762950000123).toISOString(),
    });
    expect(e!.comentario).toBeUndefined();
  });

  it("eco (is_echo) vira SAÍDA na thread do destinatário — nunca entrada", () => {
    const [e] = eventos(dm({ mid: "m_2", text: "Temos sim!", is_echo: true }, CONTA, CLIENTE));
    expect(e!.mensagem.direction).toBe("outbound");
    expect(e!.mensagem.participantId).toBe(CLIENTE);
  });

  it("remetente = a própria conta também é eco, mesmo sem a flag", () => {
    const [e] = eventos(dm({ mid: "m_3", text: "oi" }, CONTA, CLIENTE));
    expect(e!.mensagem.direction).toBe("outbound");
  });

  it("anexo com URL entra; reel vira vídeo; anexo sem URL é descartado", () => {
    const [e] = eventos(
      dm({
        mid: "m_4",
        attachments: [
          { type: "image", payload: { url: "https://lookaside.fbsbx.com/a.jpg" } },
          { type: "ig_reel", payload: { url: "https://lookaside.fbsbx.com/r.mp4" } },
          { type: "share", payload: {} },
        ],
      }),
    );
    expect(e!.mensagem.text).toBeNull();
    expect(e!.mensagem.attachments).toEqual([
      { type: "image", url: "https://lookaside.fbsbx.com/a.jpg" },
      { type: "video", url: "https://lookaside.fbsbx.com/r.mp4" },
    ]);
  });

  it("mensagem apagada, sem conteúdo, ou evento sem `message` (leitura/reação) é ignorado", () => {
    expect(eventos(dm({ mid: "m_5", is_deleted: true }))).toEqual([]);
    expect(eventos(dm({ mid: "m_6" }))).toEqual([]);
    const leitura = JSON.stringify({
      object: "instagram",
      entry: [{ id: CONTA, messaging: [{ sender: { id: CLIENTE }, recipient: { id: CONTA }, read: { mid: "m_1" } }] }],
    });
    expect(eventos(leitura)).toEqual([]);
  });

  it("entrada de OUTRA conta é ignorada inteira", () => {
    expect(eventos(dm({ mid: "m_7", text: "oi" }, CLIENTE, "outra", "outra"))).toEqual([]);
  });

  it("evento que não envolve a conta do lado certo é ignorado", () => {
    expect(eventos(dm({ mid: "m_8", text: "oi" }, CLIENTE, "outra"))).toEqual([]);
  });

  it("corpo que não é JSON e envelope fora do contrato são recusados com motivos distintos", () => {
    expect(lerWebhookDoInstagram("{", CONTA)).toEqual({ ok: false, motivo: "json_invalido" });
    expect(lerWebhookDoInstagram(JSON.stringify({ object: "instagram", entry: 3 }), CONTA)).toEqual({
      ok: false,
      motivo: "contrato_violado",
    });
  });

  it("objeto que não é do Instagram responde vazio, sem erro", () => {
    expect(eventos(JSON.stringify({ object: "page", entry: [] }))).toEqual([]);
  });
});

describe("lerWebhookDoInstagram — comentários", () => {
  const valor = {
    id: "1790000000000001",
    text: "Quanto tá a Pop 110i?",
    from: { id: CLIENTE, username: "joao.moto" },
    media: { id: "1800000000000009", media_product_type: "FEED" },
  };

  it("comentário de outra pessoa vira ENTRADA na conversa de quem comentou", () => {
    const [e] = eventos(comentario(valor));
    expect(e!.mensagem).toMatchObject({
      direction: "inbound",
      kind: "message",
      participantId: CLIENTE,
      conversationId: CLIENTE,
      externalId: `social:${CONTA}:comment:1790000000000001`,
      text: "💬 Comentou no post: Quanto tá a Pop 110i?",
      sentAt: new Date(1762950000 * 1000).toISOString(),
    });
    expect(e!.mensagem.identity.username).toBe("joao.moto");
    expect(e!.comentario).toEqual({ texto: "Quanto tá a Pop 110i?", mediaId: "1800000000000009", anuncio: false });
  });

  it("idempotente: a mesma entrega duas vezes dá o MESMO external_id (o banco recusa a segunda)", () => {
    const a = eventos(comentario(valor))[0]!.mensagem.externalId;
    const b = eventos(comentario(valor))[0]!.mensagem.externalId;
    expect(a).toBe(b);
    // E não colide com uma DM de mesmo id numérico.
    expect(a).not.toBe(eventos(dm({ mid: valor.id, text: "x" }))[0]!.mensagem.externalId);
  });

  it("dois comentários da mesma pessoa caem na MESMA conversa (um contato, um lead aberto)", () => {
    const um = eventos(comentario(valor))[0]!.mensagem;
    const outro = eventos(comentario({ ...valor, id: "1790000000000002", text: "e a Biz?" }))[0]!.mensagem;
    expect(outro.conversationId).toBe(um.conversationId);
    expect(outro.participantId).toBe(um.participantId);
    expect(outro.externalId).not.toBe(um.externalId);
  });

  it("comentário em anúncio diz 'no anúncio'", () => {
    const [e] = eventos(comentario({ ...valor, media: { id: "1", media_product_type: "AD" } }));
    expect(e!.mensagem.text).toBe("💬 Comentou no anúncio: Quanto tá a Pop 110i?");
  });

  it("comentário da PRÓPRIA conta é ignorado", () => {
    expect(eventos(comentario({ ...valor, from: { id: CONTA, username: "motoline" } }))).toEqual([]);
  });

  it("comentário numa entrada de outra conta é ignorado", () => {
    expect(eventos(comentario(valor, "outra"))).toEqual([]);
  });

  it("outros campos de `changes` são ignorados", () => {
    const raw = JSON.stringify({ object: "instagram", entry: [{ id: CONTA, changes: [{ field: "mentions", value: valor }] }] });
    expect(eventos(raw)).toEqual([]);
  });

  it("o link do post entra numa linha própria quando a API o devolve", () => {
    expect(textoDoComentario({ texto: "oi", anuncio: false }, "https://www.instagram.com/p/abc/")).toBe(
      "💬 Comentou no post: oi\nhttps://www.instagram.com/p/abc/",
    );
  });

  it("o id do comentário volta do external_id (é o destino da resposta privada)", () => {
    const externalId = eventos(comentario(valor))[0]!.mensagem.externalId;
    expect(comentarioDoExternalId(externalId)).toBe("1790000000000001");
    expect(comentarioDoExternalId(`social:${CONTA}:m_1`)).toBeNull();
    expect(comentarioDoExternalId(null)).toBeNull();
  });
});

describe("assinatura e handshake", () => {
  const segredo = "0123456789abcdef0123456789abcdef";
  const corpo = dm({ mid: "m_1", text: "oi" });
  const assinar = (raw: string, s = segredo) => `sha256=${createHmac("sha256", s).update(raw, "utf8").digest("hex")}`;

  it("aceita o HMAC SHA-256 do corpo cru com o App Secret", () => {
    expect(verificarAssinaturaDoInstagram(corpo, assinar(corpo), segredo)).toBe(true);
  });

  it("recusa segredo errado, corpo alterado, header ausente ou malformado", () => {
    expect(verificarAssinaturaDoInstagram(corpo, assinar(corpo, "outro-segredo-qualquer"), segredo)).toBe(false);
    expect(verificarAssinaturaDoInstagram(`${corpo} `, assinar(corpo), segredo)).toBe(false);
    expect(verificarAssinaturaDoInstagram(corpo, null, segredo)).toBe(false);
    expect(verificarAssinaturaDoInstagram(corpo, "sha1=abc", segredo)).toBe(false);
    expect(verificarAssinaturaDoInstagram(corpo, "sha256=abc", segredo)).toBe(false);
  });

  it("handshake devolve o challenge só com mode=subscribe e o verify token da sessão", () => {
    const p = (q: Record<string, string>) => new URLSearchParams(q);
    const ok = { "hub.mode": "subscribe", "hub.verify_token": "vt-da-sessao", "hub.challenge": "123456" };
    expect(desafioDoInstagram(p(ok), "vt-da-sessao")).toBe("123456");
    expect(desafioDoInstagram(p({ ...ok, "hub.verify_token": "errado" }), "vt-da-sessao")).toBeNull();
    expect(desafioDoInstagram(p({ ...ok, "hub.mode": "unsubscribe" }), "vt-da-sessao")).toBeNull();
    expect(desafioDoInstagram(p(ok), "")).toBeNull();
  });
});
