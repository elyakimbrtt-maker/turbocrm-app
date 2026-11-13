import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("./conexao", () => ({ tokenDoInstagram: vi.fn(async () => "IGAA-token") }));

import { instagramAdapter } from "./adapter";

const CONTA = "17841400000000001";
const base = { organizationId: "org-1", sessionRef: CONTA, to: "provider-thread", kind: "text" as const };

describe("instagramAdapter.send", () => {
  const corpos: unknown[] = [];
  beforeEach(() => {
    corpos.length = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        corpos.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({ recipient_id: "x", message_id: "mid_9" }), { status: 200 });
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("DM comum vai para o IGSID da thread, e o id volta no formato da ingestão", async () => {
    const r = await instagramAdapter.send({ ...base, body: "Oi!", providerConversationId: "998877" });
    expect(corpos[0]).toEqual({ recipient: { id: "998877" }, message: { text: "Oi!" } });
    expect(r.externalId).toBe(`social:${CONTA}:mid_9`);
  });

  it("responder CITANDO um comentário vira resposta privada (recipient.comment_id)", async () => {
    await instagramAdapter.send({
      ...base,
      body: "Te chamei no direct!",
      providerConversationId: "998877",
      replyToExternalId: `social:${CONTA}:comment:1790000000000001`,
    });
    expect(corpos[0]).toEqual({
      recipient: { comment_id: "1790000000000001" },
      message: { text: "Te chamei no direct!" },
    });
  });

  it("sem thread e sem comentário citado, recusa dizendo o porquê", async () => {
    await expect(instagramAdapter.send({ ...base, body: "x" })).rejects.toThrow(/Aguarde uma mensagem/);
    expect(corpos).toHaveLength(0);
  });

  it("erro da plataforma sobe com a mensagem dela", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: { message: "outside of allowed window", code: 10 } }), { status: 400 })),
    );
    await expect(
      instagramAdapter.send({ ...base, body: "x", providerConversationId: "998877" }),
    ).rejects.toThrow("outside of allowed window");
  });
});
