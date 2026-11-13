-- manifest: TurboCRM — canal Instagram direto (Instagram API com login do Instagram, sem intermediário): provider 'instagram_direto' nos CHECKs de channel_sessions + coluna instagram_account_id (sessionRef) com índice único entre canais ativos
--
-- O que NÃO ganha coluna, e por quê (DIRC):
--   - o token de longa duração da conta vai em `meta_token_encrypted` (é um
--     token da Meta, cifrado pelas mesmas RPCs dos outros canais);
--   - o App Secret do Instagram, que assina o webhook, vai em
--     `webhook_secret_encrypted` — é exatamente o papel dessa coluna;
--   - verify token do handshake, @usuário e validade do token vão em `metadata`.
-- Só o identificador da conta precisa de coluna: é ele que o CHECK de
-- referência exige não-nulo, e é por ele que a trava de unicidade funciona.
--
-- Idempotente. Toda linha existente tem um provider antigo e já satisfaz o seu
-- ramo do CHECK; a coluna nasce nula — nada a deduplicar antes das constraints.
alter table public.channel_sessions
  add column if not exists instagram_account_id text;

alter table public.channel_sessions
  drop constraint if exists channel_sessions_provider_check;
alter table public.channel_sessions
  add constraint channel_sessions_provider_check
  check (provider = any (array['waha'::text, 'meta_cloud'::text, 'zernio'::text, 'wacalls'::text, 'zernio_social'::text, 'datafy'::text, 'instagram_direto'::text]));

alter table public.channel_sessions
  drop constraint if exists channel_sessions_provider_ref_check;
alter table public.channel_sessions
  add constraint channel_sessions_provider_ref_check check (
    (provider = 'waha'       and waha_session_name    is not null) or
    (provider = 'meta_cloud' and meta_phone_number_id is not null) or
    (provider in ('zernio', 'zernio_social') and zernio_account_id is not null) or
    (provider = 'wacalls'    and wacalls_session_id    is not null) or
    (provider = 'datafy'     and datafy_phone_number_id is not null) or
    (provider = 'instagram_direto' and instagram_account_id is not null)
  );

-- Uma conta do Instagram, um canal ativo na instalação (mesma régua da 0165).
-- A coluna é nova, então não há duplicata a resolver antes do índice.
create unique index if not exists channel_sessions_instagram_account_id_ativo_unique
  on public.channel_sessions (instagram_account_id)
  where archived_at is null and instagram_account_id is not null;

comment on column public.channel_sessions.instagram_account_id is
  'Id da conta profissional do Instagram (user_id do GET /me da Instagram API). É o sessionRef do canal instagram_direto e o entry.id que o webhook precisa trazer. Espelhado em lib/channels/session-ref.ts.';

notify pgrst, 'reload schema';
