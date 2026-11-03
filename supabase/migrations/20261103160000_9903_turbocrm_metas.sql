-- manifest: TurboCRM — metas mensais por vendedor e da loja (quantidade de vendas e valor), lidas pelo painel do gerente
--
-- `crm_metas` (do produto) só guarda a meta da EMPRESA e só em quantidade.
-- O gerente da loja precisa de meta POR VENDEDOR, e em valor também. Uma linha
-- por (empresa, mês, vendedor); `user_id` nulo é a meta da loja.
--
-- Leitura: membros da empresa (RLS). Escrita: só pela rota do painel
-- (`/api/v1/painel-gerente/metas`), que exige gestor e grava com o cliente de
-- serviço filtrando a empresa da sessão.

create table if not exists public.turbocrm_metas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  periodo date not null check (extract(day from periodo) = 1),
  user_id uuid references auth.users(id) on delete cascade,
  alvo_vendas integer check (alvo_vendas is null or alvo_vendas between 0 and 100000),
  alvo_valor_cents bigint check (alvo_valor_cents is null or alvo_valor_cents >= 0),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Uma meta por vendedor por mês, e uma da loja (user_id nulo) por mês.
create unique index if not exists uniq_turbocrm_metas_vendedor
  on public.turbocrm_metas (organization_id, periodo, user_id)
  where user_id is not null;
create unique index if not exists uniq_turbocrm_metas_loja
  on public.turbocrm_metas (organization_id, periodo)
  where user_id is null;

alter table public.turbocrm_metas enable row level security;
drop policy if exists "turbocrm_metas_select" on public.turbocrm_metas;
create policy "turbocrm_metas_select" on public.turbocrm_metas
  for select using (organization_id in (select public.fn_user_org_ids()));

revoke insert, update, delete, truncate on public.turbocrm_metas from anon, authenticated;
revoke all on public.turbocrm_metas from anon;

-- ---- os números do painel, numa consulta só ----
-- `security definer` + só `service_role`: quem chama é a rota do painel, que
-- já conferiu o papel (gestor) e passa a empresa da SESSÃO — nunca do pedido.
create or replace function public.fn_turbocrm_painel_gerente(
  p_org uuid,
  p_de timestamptz,
  p_ate timestamptz,
  p_dia_de timestamptz,
  p_dia_ate timestamptz,
  p_mes date,
  p_mes_de timestamptz,
  p_mes_ate timestamptz,
  p_tz text
)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  with membros as (
    select uo.user_id
      from public.user_organizations uo
     where uo.organization_id = p_org
       and uo.revoked_at is null
       and uo.role <> 'viewer'
  ),
  msgs as (
    select m.sent_by_user_id as uid,
           count(*) as mensagens,
           count(distinct m.conversation_id) as atendimentos
      from public.messages m
     where m.organization_id = p_org
       and m.direction = 'outbound'
       and m.sent_by_user_id is not null
       and m.created_at >= p_de and m.created_at < p_ate
     group by 1
  ),
  leads_novos as (
    select l.owner_user_id as uid, count(*) as n
      from public.crm_leads l
     where l.organization_id = p_org
       and l.created_at >= p_de and l.created_at < p_ate
       and l.owner_user_id is not null
     group by 1
  ),
  fechados as (
    select l.owner_user_id as uid,
           count(*) filter (where l.status = 'won') as vendas,
           coalesce(sum(l.value_cents) filter (where l.status = 'won'), 0) as valor,
           count(*) filter (where l.status = 'lost') as perdidos
      from public.crm_leads l
     where l.organization_id = p_org
       and l.closed_at >= p_de and l.closed_at < p_ate
       and l.owner_user_id is not null
     group by 1
  ),
  abertos as (
    select l.owner_user_id as uid,
           count(*) as n,
           coalesce(sum(l.value_cents), 0) as valor,
           count(*) filter (where coalesce(l.last_activity_at, l.created_at) < now() - interval '48 hours') as parados
      from public.crm_leads l
     where l.organization_id = p_org
       and l.status = 'open'
       and l.owner_user_id is not null
     group by 1
  ),
  tarefas as (
    select t.assigned_to as uid,
           count(*) filter (where t.status in ('pending', 'in_progress') and t.due_date >= p_dia_de and t.due_date < p_dia_ate) as hoje,
           count(*) filter (where t.status in ('pending', 'in_progress') and t.due_date < p_dia_de) as atrasadas,
           count(*) filter (where t.status = 'done' and t.updated_at >= p_dia_de and t.updated_at < p_dia_ate) as feitas_hoje
      from public.crm_tasks t
     where t.organization_id = p_org
       and t.assigned_to is not null
     group by 1
  ),
  carteira as (
    select c.carteira_user_id as uid, count(*) as n
      from public.contacts c
     where c.organization_id = p_org
       and c.carteira_user_id is not null
       and c.is_merged_into is null
       and not c.is_anonymized
     group by 1
  ),
  vendas_mes as (
    select l.owner_user_id as uid, count(*) as vendas, coalesce(sum(l.value_cents), 0) as valor
      from public.crm_leads l
     where l.organization_id = p_org
       and l.status = 'won'
       and l.closed_at >= p_mes_de and l.closed_at < p_mes_ate
     group by 1
  ),
  metas as (
    select user_id as uid, alvo_vendas, alvo_valor_cents
      from public.turbocrm_metas
     where organization_id = p_org and periodo = p_mes
  )
  select jsonb_build_object(
    'vendedores', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', mb.user_id,
        'atendimentos', coalesce(ms.atendimentos, 0),
        'mensagens', coalesce(ms.mensagens, 0),
        'leads_recebidos', coalesce(ln.n, 0),
        'vendas', coalesce(f.vendas, 0),
        'valor_cents', coalesce(f.valor, 0),
        'perdidos', coalesce(f.perdidos, 0),
        'leads_abertos', coalesce(a.n, 0),
        'valor_aberto_cents', coalesce(a.valor, 0),
        'leads_parados', coalesce(a.parados, 0),
        'followups_hoje', coalesce(t.hoje, 0),
        'followups_atrasados', coalesce(t.atrasadas, 0),
        'followups_feitos_hoje', coalesce(t.feitas_hoje, 0),
        'carteira', coalesce(ca.n, 0),
        'vendas_mes', coalesce(vm.vendas, 0),
        'valor_mes_cents', coalesce(vm.valor, 0),
        'meta_vendas', me.alvo_vendas,
        'meta_valor_cents', me.alvo_valor_cents
      ))
        from membros mb
        left join msgs ms on ms.uid = mb.user_id
        left join leads_novos ln on ln.uid = mb.user_id
        left join fechados f on f.uid = mb.user_id
        left join abertos a on a.uid = mb.user_id
        left join tarefas t on t.uid = mb.user_id
        left join carteira ca on ca.uid = mb.user_id
        left join vendas_mes vm on vm.uid = mb.user_id
        left join metas me on me.uid = mb.user_id
    ), '[]'::jsonb),
    'loja', jsonb_build_object(
      'meta_vendas', (select alvo_vendas from metas where uid is null),
      'meta_valor_cents', (select alvo_valor_cents from metas where uid is null),
      'vendas_mes', coalesce((select sum(vendas) from vendas_mes), 0),
      'valor_mes_cents', coalesce((select sum(valor) from vendas_mes), 0),
      'leads_sem_dono', (select count(*) from public.crm_leads l
                          where l.organization_id = p_org and l.status = 'open' and l.owner_user_id is null)
    ),
    'serie', coalesce((
      select jsonb_agg(jsonb_build_object('dia', d.dia, 'vendas', d.vendas, 'valor_cents', d.valor) order by d.dia)
        from (
          select (l.closed_at at time zone p_tz)::date as dia, count(*) as vendas, coalesce(sum(l.value_cents), 0) as valor
            from public.crm_leads l
           where l.organization_id = p_org
             and l.status = 'won'
             and l.closed_at >= p_mes_de and l.closed_at < p_mes_ate
           group by 1
        ) d
    ), '[]'::jsonb)
  );
$fn$;

revoke execute on function public.fn_turbocrm_painel_gerente(uuid, timestamptz, timestamptz, timestamptz, timestamptz, date, timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function public.fn_turbocrm_painel_gerente(uuid, timestamptz, timestamptz, timestamptz, timestamptz, date, timestamptz, timestamptz, text) to service_role;
