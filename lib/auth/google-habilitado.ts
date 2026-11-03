import { env } from "@/lib/env";
import { urlDoSupabaseNoServidor } from "@/lib/supabase/url-do-servidor";

/**
 * TurboCRM: a tela de acesso só mostra "Entrar com Google" quando o provedor
 * está ligado no GoTrue — sem isso o botão existe só para devolver erro.
 *
 * Lê o mesmo `GET /auth/v1/settings` público de `lerConfigPublicaDoGoTrue`.
 * NUNCA LANÇA: devolve `null` quando não deu para perguntar, e quem chama trata
 * `null` como "mostra o botão", que é o comportamento de antes.
 */
export async function googleHabilitado(): Promise<boolean | null> {
  try {
    const base = urlDoSupabaseNoServidor(
      env.SUPABASE_SERVER_URL,
      env.NEXT_PUBLIC_SUPABASE_URL,
    ).replace(/\/+$/, "");
    const resposta = await fetch(`${base}/auth/v1/settings`, {
      headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
      cache: "no-store",
    });
    if (!resposta.ok) return null;
    const corpo = (await resposta.json()) as { external?: { google?: unknown } };
    const google = corpo.external?.google;
    return typeof google === "boolean" ? google : null;
  } catch {
    return null;
  }
}
