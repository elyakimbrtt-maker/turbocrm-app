-- manifest: TurboCRM — lead em "Novo lead" respondido pela loja (vendedor ou IA) passa sozinho para "Primeiro contato"; desligável por funil em settings.avancar_ao_responder
--
-- O vendedor não deveria precisar arrastar o card só para dizer que já
-- respondeu: a mensagem de saída É a prova. A regra é estreita de propósito:
--
--   * só move de quem está na etapa marcada como `agent_stage_hint = 'new'` para
--     a etapa do MESMO funil marcada como `'contacted'` — os mesmos passos que a
--     tela Configurações › Funis já deixa mapear. Funil sem os dois passos
--     mapeados: nada acontece;
--   * só a fala de quem atende conta (vendedor pelo CRM, pelo celular ou pela
--     IA). Campanha, automação, reação e histórico importado não movem nada;
--   * só negócio ABERTO do contato; nunca move para trás;
--   * o funil desliga com `crm_pipelines.settings.avancar_ao_responder = false`.
--
-- Não faz HTTP: só um UPDATE em `crm_leads`, e quem reage à troca de etapa
-- (automação, linha do tempo) é o `trg_emit_event_on_lead_change` de sempre.

create or replace function public.fn_turbocrm_avanca_ao_responder()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  r record;
  v_destino uuid;
  v_posicao numeric;
begin
  if new.contact_id is null then
    return new;
  end if;

  for r in
    select l.id, l.pipeline_id
      from public.crm_leads l
      join public.crm_stages s on s.id = l.stage_id
      join public.crm_pipelines p on p.id = l.pipeline_id
     where l.organization_id = new.organization_id
       and l.contact_id = new.contact_id
       and l.status = 'open'
       and s.agent_stage_hint = 'new'
       and coalesce((p.settings ->> 'avancar_ao_responder')::boolean, true)
  loop
    select s2.id
      into v_destino
      from public.crm_stages s2
     where s2.organization_id = new.organization_id
       and s2.pipeline_id = r.pipeline_id
       and s2.agent_stage_hint = 'contacted'
       and not s2.is_archived
     limit 1;

    if v_destino is null then
      continue;
    end if;

    -- Entra no TOPO da etapa nova, a mesma regra de quem chega por "Mover para…".
    select coalesce(min(x.position_in_stage), 2000) - 1000
      into v_posicao
      from public.crm_leads x
     where x.stage_id = v_destino;

    update public.crm_leads
       set stage_id = v_destino,
           position_in_stage = v_posicao
     where id = r.id
       and organization_id = new.organization_id;
  end loop;

  return new;
end$fn$;

comment on function public.fn_turbocrm_avanca_ao_responder() is
  'TurboCRM: mensagem de saída de quem atende (user/crm/external_device/ai) move o negócio aberto do contato da etapa com passo "new" para a etapa com passo "contacted" do mesmo funil. Desliga por funil com settings.avancar_ao_responder = false.';

revoke execute on function public.fn_turbocrm_avanca_ao_responder() from public, anon, authenticated;
grant execute on function public.fn_turbocrm_avanca_ao_responder() to service_role;

drop trigger if exists trg_turbocrm_avanca_ao_responder on public.messages;
create trigger trg_turbocrm_avanca_ao_responder
  after insert on public.messages
  for each row
  when (new.direction = 'outbound'
        and new.sent_via in ('user', 'crm', 'external_device', 'ai')
        and new.type not in ('reaction', 'system')
        and coalesce(new.metadata ->> 'historico_importado', '') <> 'true')
  execute function public.fn_turbocrm_avanca_ao_responder();
