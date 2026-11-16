-- manifest: TurboCRM — o card segue o dono da conversa: quando a conversa ganha dono (Iniciar conversa, Assumir, responder, rodízio, transferência), os negócios ABERTOS e SEM dono do mesmo contato passam para ele; negócio com dono (pessoa ou IA) não muda. Backfill dos abertos sem dono cujo contato já tem conversa aberta com dono.

create or replace function public.fn_card_segue_dono_da_conversa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.assigned_to_user_id is null or new.contact_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.assigned_to_user_id is not distinct from old.assigned_to_user_id then
    return new;
  end if;
  -- Só negócio aberto e sem dono: ninguém perde card por causa de uma conversa.
  update public.crm_leads
     set owner_user_id = new.assigned_to_user_id,
         owner_kind = 'user',
         assigned_at = coalesce(assigned_at, now())
   where organization_id = new.organization_id
     and contact_id = new.contact_id
     and status = 'open'
     and owner_user_id is null
     and owner_agent_id is null;
  return new;
end;
$$;

revoke execute on function public.fn_card_segue_dono_da_conversa() from public, anon, authenticated;

drop trigger if exists trg_card_segue_dono_da_conversa on public.conversations;
create trigger trg_card_segue_dono_da_conversa
  after insert or update of assigned_to_user_id on public.conversations
  for each row execute function public.fn_card_segue_dono_da_conversa();

-- Backfill: o card aberto sem dono fica com quem está com a conversa aberta mais recente do contato.
update public.crm_leads l
   set owner_user_id = c.assigned_to_user_id,
       owner_kind = 'user',
       assigned_at = coalesce(l.assigned_at, now())
  from (
    select distinct on (organization_id, contact_id) organization_id, contact_id, assigned_to_user_id
      from public.conversations
     where assigned_to_user_id is not null
       and contact_id is not null
       and status in ('open', 'pending', 'claimed', 'ai_handling')
     order by organization_id, contact_id, updated_at desc
  ) c
 where l.organization_id = c.organization_id
   and l.contact_id = c.contact_id
   and l.status = 'open'
   and l.owner_user_id is null
   and l.owner_agent_id is null;

notify pgrst, 'reload schema';
