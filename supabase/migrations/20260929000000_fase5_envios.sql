-- Fase 5 — Aprovação e fila de envio (idempotente)
-- Ações do operador em funções atômicas: aprovar, descartar, registrar envio (com limite diário) e pular.

alter table mensagens add column if not exists motivo_pulo text;
create index if not exists mensagens_fila_idx on mensagens (status, agendada_para);
create index if not exists mensagens_enviada_em_idx on mensagens (enviada_em) where status = 'enviada';

-- Evento de envio de mensagem (registrado quando o operador abre o WhatsApp)
alter table eventos drop constraint if exists eventos_tipo_check;
alter table eventos add constraint eventos_tipo_check
  check (tipo in ('visita','clique_whatsapp','clique_quero','optout','mensagem_enviada'));

-- Data de hoje e início do dia no fuso de São Paulo
create or replace function hoje_sp() returns date
language sql stable as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

create or replace function inicio_dia_sp() returns timestamptz
language sql stable as $$ select (hoje_sp()::timestamp at time zone 'America/Sao_Paulo') $$;

-- Mensagens criadas sem data entram na fila do dia de São Paulo (e não do dia em UTC)
alter table mensagens alter column agendada_para set default hoje_sp();

-- Envios de hoje / limite
create or replace function resumo_envios() returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'enviados_hoje', (select count(*) from mensagens where status = 'enviada' and enviada_em >= inicio_dia_sp()),
    'limite', (select limite_envios_dia from configuracoes where id = 1),
    'hoje', hoje_sp());
$$;

-- Aprovar prévia: publica o site, cria/atualiza a mensagem de primeiro contato e marca o lead como aprovado
create or replace function aprovar_previa(p_lead_id uuid, p_texto text) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_lead leads%rowtype;
  v_site_id uuid;
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
    do update set texto = excluded.texto where mensagens.status = 'pendente';

  update leads set status_funil = 'aprovado', atualizado_em = now() where id = p_lead_id;
  return jsonb_build_object('ok', true, 'site_id', v_site_id);
end $$;

-- Descartar lead (com motivo): tira a prévia do ar e cancela mensagens pendentes
create or replace function descartar_lead(p_lead_id uuid, p_motivo text) returns jsonb
language plpgsql security invoker set search_path = public as $$
begin
  update leads set status_funil = 'descartado', motivo_descarte = coalesce(nullif(btrim(p_motivo), ''), 'manual'),
    atualizado_em = now()
  where id = p_lead_id and status_funil <> 'nao_contatar';
  if not found then raise exception 'Lead não encontrado ou bloqueado'; end if;
  update sites set publicado = false where lead_id = p_lead_id;
  update mensagens set status = 'pulada', motivo_pulo = 'lead descartado' where lead_id = p_lead_id and status = 'pendente';
  return jsonb_build_object('ok', true);
end $$;

-- Registrar envio: respeita o limite diário (com trava), salva o texto final e avança o funil
create or replace function registrar_envio(p_mensagem_id uuid, p_texto text) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_msg mensagens%rowtype;
  v_lead leads%rowtype;
  v_limite int;
  v_enviados int;
begin
  perform pg_advisory_xact_lock(hashtext('sp_registrar_envio'));

  select * into v_msg from mensagens where id = p_mensagem_id for update;
  if not found then raise exception 'Mensagem não encontrada'; end if;
  if v_msg.status <> 'pendente' then raise exception 'Esta mensagem já foi %', v_msg.status; end if;

  select * into v_lead from leads where id = v_msg.lead_id for update;
  if v_lead.status_funil in ('nao_contatar', 'descartado', 'perdido')
     or exists (select 1 from bloqueios where place_id = v_lead.place_id) then
    raise exception 'Este lead não pode mais ser contatado (%)', v_lead.status_funil;
  end if;

  select limite_envios_dia into v_limite from configuracoes where id = 1;
  select count(*) into v_enviados from mensagens where status = 'enviada' and enviada_em >= inicio_dia_sp();
  if v_enviados >= coalesce(v_limite, 0) then
    raise exception 'LIMITE_ENVIOS: limite diário de % envios atingido', v_limite;
  end if;

  update mensagens set status = 'enviada', enviada_em = now(),
    texto = coalesce(nullif(btrim(p_texto), ''), texto)
  where id = p_mensagem_id;

  if v_msg.tipo = 'primeiro_contato' and v_lead.status_funil in ('aprovado', 'previa_gerada') then
    update leads set status_funil = 'enviado', atualizado_em = now() where id = v_lead.id;
  end if;

  insert into eventos (lead_id, site_id, tipo)
    values (v_lead.id, (select id from sites where lead_id = v_lead.id), 'mensagem_enviada');

  return jsonb_build_object('ok', true, 'enviados_hoje', v_enviados + 1, 'limite', v_limite);
end $$;

-- Pular mensagem (motivo opcional)
create or replace function pular_mensagem(p_mensagem_id uuid, p_motivo text default null) returns jsonb
language plpgsql security invoker set search_path = public as $$
begin
  update mensagens set status = 'pulada', motivo_pulo = nullif(btrim(coalesce(p_motivo, '')), '')
  where id = p_mensagem_id and status = 'pendente';
  if not found then raise exception 'Mensagem não encontrada ou já processada'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- Só usuários logados executam as ações
do $$
declare f text;
begin
  foreach f in array array['resumo_envios()', 'aprovar_previa(uuid, text)', 'descartar_lead(uuid, text)',
                           'registrar_envio(uuid, text)', 'pular_mensagem(uuid, text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
