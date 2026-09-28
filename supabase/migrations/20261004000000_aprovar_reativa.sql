-- Aprovar de novo uma prévia cuja mensagem tinha sido pulada: a mensagem volta para a fila de Envios.
-- (Antes, a mensagem continuava "pulada" e o lead ficava "aprovado" sem aparecer em Envios.)
-- Mensagens já enviadas nunca são reenviadas.
create or replace function aprovar_previa(p_lead_id uuid, p_texto text) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_lead leads%rowtype;
  v_site_id uuid;
  v_status text;
begin
  if coalesce(btrim(p_texto), '') = '' then raise exception 'Texto da mensagem vazio'; end if;

  select * into v_lead from leads where id = p_lead_id for update;
  if not found then raise exception 'Lead não encontrado'; end if;
  if v_lead.status_funil = 'nao_contatar' or exists (select 1 from bloqueios where place_id = v_lead.place_id) then
    raise exception 'Este lead pediu para não ser contatado';
  end if;
  if v_lead.status_funil not in ('previa_gerada', 'aprovado') then
    raise exception 'Só é possível aprovar leads com prévia gerada (status atual: %)', v_lead.status_funil;
  end if;

  update sites set publicado = true, publicado_em = coalesce(publicado_em, now())
    where lead_id = p_lead_id returning id into v_site_id;
  if v_site_id is null then raise exception 'Este lead ainda não tem prévia'; end if;

  insert into mensagens (lead_id, tipo, texto, agendada_para)
    values (p_lead_id, 'primeiro_contato', btrim(p_texto), hoje_sp())
  on conflict (lead_id) where tipo = 'primeiro_contato'
    do update set texto = excluded.texto,
                  status = 'pendente',
                  motivo_pulo = null,
                  agendada_para = least(mensagens.agendada_para, excluded.agendada_para)
    where mensagens.status <> 'enviada';

  select status into v_status from mensagens where lead_id = p_lead_id and tipo = 'primeiro_contato';

  update leads set status_funil = 'aprovado', atualizado_em = now() where id = p_lead_id;
  return jsonb_build_object('ok', true, 'site_id', v_site_id, 'mensagem', v_status);
end $$;
