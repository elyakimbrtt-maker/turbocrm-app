// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * O `proxy.ts` roda antes de TODA requisição e validava o token no GoTrue toda
 * vez — o grosso do `/auth/v1/user` no Supabase. Agora ele lê a MESMA entrada de
 * sessão do `loadAuthUser` (`getUserDaSessao`): mesma sessão na janela, uma ida
 * só; sem cookie reconhecível, ou depois de invalidar, volta ao `getUser()`.
 */
const estado = { getUsers: 0 };

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => {
        estado.getUsers += 1;
        return { data: { user: { id: "u-1" } }, error: null };
      },
    },
  }),
}));

const { proxy } = await import("@/proxy");
const { esquecerTudo, invalidarUsuario } = await import("@/lib/auth/cache-curto");

function cookieDeSessao(): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = `${b64({ alg: "HS256" })}.${b64({ sub: "u-1", exp })}.assinatura`;
  return `sb-deskcomm-auth=base64-${b64({ access_token: token, expires_at: exp })}`;
}

const pedir = (cookie?: string) =>
  proxy(
    new NextRequest("https://crm.exemplo/api/v1/conversations", {
      headers: cookie ? { cookie } : {},
    }),
  );

beforeEach(() => {
  esquecerTudo();
  estado.getUsers = 0;
});

describe("proxy: getUser da mesma sessão é reaproveitado", () => {
  it("duas requisições da mesma sessão validam o token UMA vez", async () => {
    const cookie = cookieDeSessao();
    expect((await pedir(cookie)).status).toBe(200);
    expect((await pedir(cookie)).status).toBe(200);
    expect(estado.getUsers).toBe(1);
  });

  it("sem cookie de sessão, cada requisição vai ao getUser", async () => {
    await pedir();
    await pedir();
    expect(estado.getUsers).toBe(2);
  });

  it("invalidar o usuário derruba a entrada do proxy na hora", async () => {
    const cookie = cookieDeSessao();
    await pedir(cookie);
    invalidarUsuario("u-1");
    await pedir(cookie);
    expect(estado.getUsers).toBe(2);
  });
});
