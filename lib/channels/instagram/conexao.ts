/**
 * A conexão do canal Instagram direto, em `channel_sessions` — ler, conectar,
 * achar a credencial e renovar o token.
 *
 * Onde mora cada coisa (migration 9905, DIRC):
 *   - `instagram_account_id` — o `user_id` da conta profissional (sessionRef);
 *   - `meta_token_encrypted` — o token de longa duração (60 dias);
 *   - `webhook_secret_encrypted` — o App Secret do Instagram, que assina o webhook;
 *   - `metadata.instagram` — @usuário, verify token do handshake e validade do token.
 * Cifra e decifra pelas MESMAS RPCs dos outros canais (`lib/webhooks/secrets.ts`).
 *
 * Toda leitura filtra `organization_id` à mão: o client é service role.
 */
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { metadataInicialDoCanal } from "@/lib/ai/elegibilidade/pre-go-live";
import { decryptWebhookSecret, encryptWebhookSecret } from "@/lib/webhooks/secrets";

import { CHANNEL_PROVIDER_INSTAGRAM } from "../capabilities";
import { reactivateChannelSession } from "../reactivate";
import { registrarAviso } from "../zernio/avisos";
import { contaDoToken, InstagramApiError, renovarTokenDeLongaDuracao } from "./api";

/** O que o Instagram diz sobre si, em `metadata.instagram`. Nada aqui é segredo de envio. */
export interface MetadadosDoInstagram {
  username: string | null;
  /** Conferido no GET de verificação do webhook. É mostrado ao admin para colar na Meta. */
  verify_token: string;
  token_expira_em: string | null;
  token_renovado_em: string | null;
}

/** O token de longa duração vale 60 dias a partir da emissão. */
const VALIDADE_DO_TOKEN_MS = 60 * 24 * 60 * 60 * 1000;

export class ConexaoInstagramError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ConexaoInstagramError";
  }
}

function metadadosDe(metadata: unknown): MetadadosDoInstagram | null {
  const m = (metadata as Record<string, unknown> | null)?.instagram;
  return m && typeof m === "object" ? (m as MetadadosDoInstagram) : null;
}

/** A conexão ativa desta organização, sem nenhum segredo. */
export async function lerConexaoDoInstagram(admin: SupabaseClient, organizationId: string) {
  const { data, error } = await admin
    .from("channel_sessions")
    .select("id, instagram_account_id, display_name, status, webhook_path_token, metadata, meta_token_encrypted")
    .eq("organization_id", organizationId)
    .eq("provider", CHANNEL_PROVIDER_INSTAGRAM)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw new Error("instagram_session_lookup_failed");
  if (!data) return null;
  const meta = metadadosDe(data.metadata);
  return {
    id: data.id as string,
    contaId: data.instagram_account_id as string,
    username: meta?.username ?? null,
    displayName: (data.display_name as string | null) ?? null,
    status: (data.status as string | null) ?? null,
    webhookPathToken: data.webhook_path_token as string,
    verifyToken: meta?.verify_token ?? null,
    tokenExpiraEm: meta?.token_expira_em ?? null,
    temToken: Boolean(data.meta_token_encrypted),
  };
}

/**
 * Valida o token na Instagram API e SÓ ENTÃO grava. Token que não abre `/me`
 * não grava nada — nem o App Secret.
 *
 * Reconectar por cima de um canal excluído o ressuscita (mesma regra do canal
 * oficial, `../reactivate.ts`), mantendo o verify token já colado na Meta.
 */
export async function conectarInstagram(
  admin: SupabaseClient,
  input: {
    organizationId: string;
    userId: string;
    requestId: string;
    token: string;
    appSecret: string;
  },
): Promise<{ id: string; contaId: string; username: string | null }> {
  let conta: Awaited<ReturnType<typeof contaDoToken>>;
  try {
    conta = await contaDoToken(input.token);
  } catch (erro) {
    throw new ConexaoInstagramError(
      erro instanceof InstagramApiError
        ? `O Instagram recusou o token: ${erro.message}`
        : "Não foi possível falar com o Instagram para validar o token.",
      422,
    );
  }

  const tokenCifrado = await encryptWebhookSecret(admin, input.token);
  const segredoCifrado = await encryptWebhookSecret(admin, input.appSecret);
  if (!tokenCifrado || !segredoCifrado) {
    throw new ConexaoInstagramError("Cifra indisponível nesta instalação — nada foi gravado.", 422);
  }

  // Sem filtro de `archived_at`: o canal excluído é exatamente o que reconectar ressuscita.
  const { data: existente, error: erroDeLeitura } = await admin
    .from("channel_sessions")
    .select("id, archived_at, metadata, display_name")
    .eq("organization_id", input.organizationId)
    .eq("provider", CHANNEL_PROVIDER_INSTAGRAM)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (erroDeLeitura) throw new Error("instagram_session_lookup_failed");

  const anterior = metadadosDe(existente?.metadata);
  const agora = new Date();
  const instagram: MetadadosDoInstagram = {
    username: conta.username,
    verify_token: anterior?.verify_token ?? randomBytes(24).toString("hex"),
    token_expira_em: new Date(agora.getTime() + VALIDADE_DO_TOKEN_MS).toISOString(),
    token_renovado_em: agora.toISOString(),
  };
  const linha = {
    instagram_account_id: conta.userId,
    meta_token_encrypted: tokenCifrado,
    webhook_secret_encrypted: segredoCifrado,
    status: "WORKING",
    display_name:
      (existente?.display_name as string | null) || (conta.username ? `@${conta.username}` : "Instagram"),
  };

  if (existente) {
    const { error } = await reactivateChannelSession(
      admin,
      {
        organizationId: input.organizationId,
        channelSessionId: existente.id as string,
        archivedAt: (existente.archived_at as string | null) ?? null,
      },
      { ...linha, metadata: { ...((existente.metadata as object) ?? {}), instagram } },
      { userId: input.userId, requestId: input.requestId, metadata: { provider: CHANNEL_PROVIDER_INSTAGRAM } },
    );
    if (error) throw error;
    return { id: existente.id as string, contaId: conta.userId, username: conta.username };
  }

  const { data, error } = await admin
    .from("channel_sessions")
    .insert({
      organization_id: input.organizationId,
      provider: CHANNEL_PROVIDER_INSTAGRAM,
      ...linha,
      metadata: { ...metadataInicialDoCanal(), instagram },
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id as string, contaId: conta.userId, username: conta.username };
}

/** O token decifrado da conta `contaId` nesta organização, ou `null`. */
export async function tokenDoInstagram(
  admin: SupabaseClient,
  organizationId: string,
  contaId: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from("channel_sessions")
    .select("meta_token_encrypted")
    .eq("organization_id", organizationId)
    .eq("provider", CHANNEL_PROVIDER_INSTAGRAM)
    .eq("instagram_account_id", contaId)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw new Error("instagram_session_lookup_failed");
  if (!data?.meta_token_encrypted) return null;
  return decryptWebhookSecret(admin, data.meta_token_encrypted as unknown as string);
}

/** O que o webhook desta sessão precisa saber: a conta e o verify token. */
export async function sessaoDoWebhookDoInstagram(
  admin: SupabaseClient,
  organizationId: string,
  sessionId: string,
): Promise<{ contaId: string; verifyToken: string | null } | null> {
  const { data, error } = await admin
    .from("channel_sessions")
    .select("instagram_account_id, metadata")
    .eq("organization_id", organizationId)
    .eq("id", sessionId)
    .eq("provider", CHANNEL_PROVIDER_INSTAGRAM)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw new Error("instagram_session_lookup_failed");
  if (!data?.instagram_account_id) return null;
  return {
    contaId: data.instagram_account_id as string,
    verifyToken: metadadosDe(data.metadata)?.verify_token ?? null,
  };
}

/** Renova quando faltar menos que isto para vencer (o token vale 60 dias). */
export const JANELA_DE_RENOVACAO_DO_INSTAGRAM_MS = 20 * 24 * 60 * 60 * 1000;
/** Teto por rodada — a rodada é diária e cada conta é uma chamada. */
const TETO_POR_RODADA = 50;

export interface RenovacaoDoInstagram {
  examinadas: number;
  renovadas: number;
  falhas: number;
}

/**
 * Renova os tokens que vencem nos próximos 20 dias. Cada conta é tratada
 * sozinha: falha numa não impede as outras. A falha abre aviso na Central (sem
 * token o canal recebe mas não responde), sem repetir o que já está aberto. Não
 * audita — quem audita é a rota, e só quando houve efeito.
 */
export async function renovarTokensDoInstagram(
  admin: SupabaseClient,
  agora: Date,
): Promise<RenovacaoDoInstagram> {
  const resumo: RenovacaoDoInstagram = { examinadas: 0, renovadas: 0, falhas: 0 };
  // Sem filtro de organização de propósito: é a varredura da instalação, e cada
  // escrita abaixo volta a amarrar `organization_id` + `id`.
  const { data, error } = await admin
    .from("channel_sessions")
    .select("id, organization_id, metadata, meta_token_encrypted")
    .eq("provider", CHANNEL_PROVIDER_INSTAGRAM)
    .is("archived_at", null)
    // shortcut: o teto vem antes do filtro de validade (que mora no jsonb); com mais
    // de 50 contas na instalação, ordenar/filtrar pela validade no banco.
    .limit(TETO_POR_RODADA);
  if (error) throw new Error("instagram_session_lookup_failed");

  for (const linha of data ?? []) {
    const meta = metadadosDe(linha.metadata);
    const vence = meta?.token_expira_em ? Date.parse(meta.token_expira_em) : 0;
    if (vence - agora.getTime() > JANELA_DE_RENOVACAO_DO_INSTAGRAM_MS) continue;
    resumo.examinadas += 1;
    const falhar = async (motivo: string) => {
      resumo.falhas += 1;
      await registrarAviso(admin, linha.organization_id as string, {
        kind: "channel_number_alert",
        severity: "warn",
        title: "Instagram: não foi possível renovar o token de acesso",
        body:
          `O token vence em poucos dias e a renovação automática falhou (${motivo}). ` +
          "Gere um novo token no app da Meta e reconecte em Conexões › Redes sociais › Instagram — conexão direta.",
      });
    };

    const token = linha.meta_token_encrypted
      ? await decryptWebhookSecret(admin, linha.meta_token_encrypted as unknown as string)
      : null;
    if (!token) {
      await falhar("token indisponível para renovar");
      continue;
    }
    try {
      const novo = await renovarTokenDeLongaDuracao(token);
      const cifrado = await encryptWebhookSecret(admin, novo.token);
      if (!cifrado) {
        await falhar("cifra indisponível");
        continue;
      }
      const { error: erroAoGravar } = await admin
        .from("channel_sessions")
        .update({
          meta_token_encrypted: cifrado,
          metadata: {
            ...((linha.metadata as object) ?? {}),
            instagram: { ...meta, token_expira_em: novo.expiraEm, token_renovado_em: agora.toISOString() },
          },
        })
        .eq("organization_id", linha.organization_id as string)
        .eq("id", linha.id as string);
      if (erroAoGravar) await falhar("falha ao gravar o token renovado");
      else resumo.renovadas += 1;
    } catch (erro) {
      await falhar(erro instanceof Error ? erro.message : "renovação recusada");
    }
  }
  return resumo;
}
