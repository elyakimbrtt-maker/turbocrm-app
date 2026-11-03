-- manifest: TurboCRM — feed interno da empresa (posts com texto, imagem, vídeo e documento; curtidas; comentários) e post automático de comemoração quando uma venda é ganha
--
-- A rede social interna da equipe. Leitura é de qualquer membro da empresa
-- (RLS por `fn_user_org_ids()`); a ESCRITA passa só pelas rotas de
-- `app/api/v1/feed/**`, que conferem papel e empresa no servidor e gravam com o
-- cliente de serviço — por isso não há policy de insert/update/delete aqui.
-- Apagar é lógico (`deleted_at`): o post some do feed e o histórico fica.
--
-- Os arquivos moram no bucket privado `internal-media`, sob
-- `<org>/feed/<post>/...`, e só saem por link assinado de vida curta.
--
-- A comemoração da venda é um INSERT, nunca HTTP: o gatilho em `crm_leads`
-- escreve um post `kind = 'venda'` quando o negócio passa a `won`.

create table if not exists public.turbocrm_feed_posts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  author_user_id uuid references auth.users(id) on delete set null,
  kind text not null default 'post' check (kind in ('post', 'venda')),
  body text not null default '' check (char_length(body) <= 5000),
  lead_id uuid references public.crm_leads(id) on delete set null,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_turbocrm_feed_posts_org_created
  on public.turbocrm_feed_posts (organization_id, created_at desc)
  where deleted_at is null;
-- Uma comemoração por venda: reabrir e ganhar de novo não duplica o post.
create unique index if not exists uniq_turbocrm_feed_venda_por_lead
  on public.turbocrm_feed_posts (lead_id)
  where kind = 'venda' and deleted_at is null;

create table if not exists public.turbocrm_feed_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  post_id uuid not null references public.turbocrm_feed_posts(id) on delete cascade,
  kind text not null check (kind in ('image', 'video', 'document')),
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  file_size bigint not null,
  position smallint not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_turbocrm_feed_attachments_post
  on public.turbocrm_feed_attachments (post_id, position);

create table if not exists public.turbocrm_feed_reactions (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  post_id uuid not null references public.turbocrm_feed_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.turbocrm_feed_comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  post_id uuid not null references public.turbocrm_feed_posts(id) on delete cascade,
  author_user_id uuid references auth.users(id) on delete set null,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_turbocrm_feed_comments_post
  on public.turbocrm_feed_comments (post_id, created_at);

alter table public.turbocrm_feed_posts enable row level security;
alter table public.turbocrm_feed_attachments enable row level security;
alter table public.turbocrm_feed_reactions enable row level security;
alter table public.turbocrm_feed_comments enable row level security;

drop policy if exists "turbocrm_feed_posts_select" on public.turbocrm_feed_posts;
create policy "turbocrm_feed_posts_select" on public.turbocrm_feed_posts
  for select using (organization_id in (select public.fn_user_org_ids()));
drop policy if exists "turbocrm_feed_attachments_select" on public.turbocrm_feed_attachments;
create policy "turbocrm_feed_attachments_select" on public.turbocrm_feed_attachments
  for select using (organization_id in (select public.fn_user_org_ids()));
drop policy if exists "turbocrm_feed_reactions_select" on public.turbocrm_feed_reactions;
create policy "turbocrm_feed_reactions_select" on public.turbocrm_feed_reactions
  for select using (organization_id in (select public.fn_user_org_ids()));
drop policy if exists "turbocrm_feed_comments_select" on public.turbocrm_feed_comments;
create policy "turbocrm_feed_comments_select" on public.turbocrm_feed_comments
  for select using (organization_id in (select public.fn_user_org_ids()));

revoke insert, update, delete, truncate on public.turbocrm_feed_posts from anon, authenticated;
revoke insert, update, delete, truncate on public.turbocrm_feed_attachments from anon, authenticated;
revoke insert, update, delete, truncate on public.turbocrm_feed_reactions from anon, authenticated;
revoke insert, update, delete, truncate on public.turbocrm_feed_comments from anon, authenticated;
revoke all on public.turbocrm_feed_posts from anon;
revoke all on public.turbocrm_feed_attachments from anon;
revoke all on public.turbocrm_feed_reactions from anon;
revoke all on public.turbocrm_feed_comments from anon;

-- ---- comemoração automática da venda ----
create or replace function public.fn_turbocrm_feed_comemora_venda()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
begin
  if new.status = 'won' and old.status is distinct from 'won' then
    insert into public.turbocrm_feed_posts (organization_id, author_user_id, kind, body, lead_id)
    values (new.organization_id, new.owner_user_id, 'venda', new.title, new.id)
    on conflict do nothing;
  end if;
  return new;
end$fn$;

revoke execute on function public.fn_turbocrm_feed_comemora_venda() from public, anon, authenticated;
grant execute on function public.fn_turbocrm_feed_comemora_venda() to service_role;

drop trigger if exists trg_turbocrm_feed_comemora_venda on public.crm_leads;
create trigger trg_turbocrm_feed_comemora_venda
  after update of status on public.crm_leads
  for each row
  when (new.status = 'won' and old.status is distinct from 'won')
  execute function public.fn_turbocrm_feed_comemora_venda();
