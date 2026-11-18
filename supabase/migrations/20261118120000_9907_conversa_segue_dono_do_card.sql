-- manifest: TurboCRM — a conversa segue o dono do card: quando o gerente troca o responsável de um negócio aberto (de uma pessoa para outra), as conversas abertas do contato que estavam com o responsável ANTERIOR passam para o novo pela mesma porta da transferência (`fn_conversation_assign`, reason 'transfer'). Conversa de terceiro e conversa que a IA atende não mudam. Par da 9906 (o card segue o dono da conversa); as duas não entram em laço porque a 9906 só mexe em card SEM dono.

create or replace function public.fn_conversa_segue_dono_do_card()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversa uuid;
begin
  -- Só troca de PESSOA para PESSOA: card ganhando o primeiro dono é a 9906 / o rodízio.
  if old.owner_user_id is null or new.owner_user_id is null
     or new.owner_user_id is not distinct from old.owner_user_id
     or new.contact_id is null or new.status <> 'open' then
    return new;
  end if;
  for v_conversa in
    select c.id
      from public.conversations c
     where c.organization_id = new.organization_id
       and c.contact_id = new.contact_id
       and c.assigned_to_user_id = old.owner_user_id
       and c.status in ('open', 'pending', 'claimed', 'ai_handling')
       and public.comando_da_conversa(c) <> 'automatico'
     order by c.id
  loop
    perform public.fn_conversation_assign(new.organization_id, v_conversa, new.owner_user_id, 'transfer');
  end loop;
  return new;
end;
$$;

revoke execute on function public.fn_conversa_segue_dono_do_card() from public, anon, authenticated;

drop trigger if exists trg_conversa_segue_dono_do_card on public.crm_leads;
create trigger trg_conversa_segue_dono_do_card
  after update of owner_user_id on public.crm_leads
  for each row execute function public.fn_conversa_segue_dono_do_card();

notify pgrst, 'reload schema';
