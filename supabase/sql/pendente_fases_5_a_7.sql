-- SpeedProspect — tudo o que vem depois da Fase 4, num arquivo só (Fases 5, 6 e 7 + avaliações e logo).
-- Pode rodar mais de uma vez. Gerado a partir de supabase/migrations/ (a fonte oficial continua lá).

-- ===== 20260928000000_previa_avaliacoes =====
create or replace function get_site_publico(p_slug text, p_token text default null) returns jsonb
language sql security definer stable set search_path = public as $$
  select jsonb_build_object(
    'site_id', s.id, 'slug', s.slug, 'template', s.template, 'conteudo', s.conteudo,
    'versao', s.versao, 'publicado', s.publicado, 'token_optout', s.token_optout,
    'fotos', coalesce((select jsonb_agg(jsonb_build_object('name', f->>'name', 'atribuicao', f->>'atribuicao', 'atribuicao_uri', f->>'atribuicao_uri'))
      from jsonb_array_elements(l.fotos) f), '[]'::jsonb),
    'avaliacoes', coalesce((select jsonb_agg(jsonb_build_object('autor', a->>'autor', 'nota', (a->>'nota')::numeric, 'texto', a->>'texto', 'data', a->>'data'))
      from jsonb_array_elements(l.avaliacoes) a
      where coalesce((a->>'nota')::numeric, 0) >= 4 and length(coalesce(a->>'texto', '')) >= 15), '[]'::jsonb),
    'negocio_nome', c.negocio_nome, 'negocio_whatsapp', c.negocio_whatsapp)
  from sites s join leads l on l.id = s.lead_id cross join configuracoes c
  where s.slug = p_slug and c.id = 1 and l.status_funil <> 'nao_contatar'
    and (s.publicado = true or (p_token is not null and s.token_acesso = p_token));
$$;
revoke all on function get_site_publico(text, text) from public;
grant execute on function get_site_publico(text, text) to anon, authenticated;

-- ===== 20260929000000_fase5_envios =====

alter table mensagens add column if not exists motivo_pulo text;
create index if not exists mensagens_fila_idx on mensagens (status, agendada_para);
create index if not exists mensagens_enviada_em_idx on mensagens (enviada_em) where status = 'enviada';

alter table eventos drop constraint if exists eventos_tipo_check;
alter table eventos add constraint eventos_tipo_check
  check (tipo in ('visita','clique_whatsapp','clique_quero','optout','mensagem_enviada'));

create or replace function hoje_sp() returns date
language sql stable as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

create or replace function inicio_dia_sp() returns timestamptz
language sql stable as $$ select (hoje_sp()::timestamp at time zone 'America/Sao_Paulo') $$;

alter table mensagens alter column agendada_para set default hoje_sp();

create or replace function resumo_envios() returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'enviados_hoje', (select count(*) from mensagens where status = 'enviada' and enviada_em >= inicio_dia_sp()),
    'limite', (select limite_envios_dia from configuracoes where id = 1),
    'hoje', hoje_sp());
$$;

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

create or replace function pular_mensagem(p_mensagem_id uuid, p_motivo text default null) returns jsonb
language plpgsql security invoker set search_path = public as $$
begin
  update mensagens set status = 'pulada', motivo_pulo = nullif(btrim(coalesce(p_motivo, '')), '')
  where id = p_mensagem_id and status = 'pendente';
  if not found then raise exception 'Mensagem não encontrada ou já processada'; end if;
  return jsonb_build_object('ok', true);
end $$;

do $$
declare f text;
begin
  foreach f in array array['resumo_envios()', 'aprovar_previa(uuid, text)', 'descartar_lead(uuid, text)',
                           'registrar_envio(uuid, text)', 'pular_mensagem(uuid, text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;


-- ===== 20260930000000_logo_agencia =====
alter table configuracoes add column if not exists negocio_logo text;
do $$ begin
  alter table configuracoes add constraint configuracoes_logo_tamanho
    check (negocio_logo is null or (negocio_logo like 'data:image/%' and length(negocio_logo) <= 400000));
exception when duplicate_object then null; end $$;

create or replace function get_site_publico(p_slug text, p_token text default null) returns jsonb
language sql security definer stable set search_path = public as $$
  select jsonb_build_object(
    'site_id', s.id, 'slug', s.slug, 'template', s.template, 'conteudo', s.conteudo,
    'versao', s.versao, 'publicado', s.publicado, 'token_optout', s.token_optout,
    'fotos', coalesce((select jsonb_agg(jsonb_build_object('name', f->>'name', 'atribuicao', f->>'atribuicao', 'atribuicao_uri', f->>'atribuicao_uri'))
      from jsonb_array_elements(l.fotos) f), '[]'::jsonb),
    'avaliacoes', coalesce((select jsonb_agg(jsonb_build_object('autor', a->>'autor', 'nota', (a->>'nota')::numeric, 'texto', a->>'texto', 'data', a->>'data'))
      from jsonb_array_elements(l.avaliacoes) a
      where coalesce((a->>'nota')::numeric, 0) >= 4 and length(coalesce(a->>'texto', '')) >= 15), '[]'::jsonb),
    'negocio_nome', c.negocio_nome, 'negocio_whatsapp', c.negocio_whatsapp, 'negocio_logo', c.negocio_logo)
  from sites s join leads l on l.id = s.lead_id cross join configuracoes c
  where s.slug = p_slug and c.id = 1 and l.status_funil <> 'nao_contatar'
    and (s.publicado = true or (p_token is not null and s.token_acesso = p_token));
$$;
revoke all on function get_site_publico(text, text) from public;
grant execute on function get_site_publico(text, text) to anon, authenticated;

-- ===== 20261001000000_fase6_funil =====

alter table leads add column if not exists valor_fechado numeric(12,2);
alter table leads add column if not exists perdido_em timestamptz;

create unique index if not exists mensagens_followup_unico on mensagens (lead_id, tipo)
  where tipo in ('followup_1', 'followup_2');

create table if not exists historico_status (
  id bigint generated always as identity primary key,
  lead_id uuid not null references leads(id) on delete cascade,
  de status_funil,
  para status_funil not null,
  em timestamptz not null default now()
);
create index if not exists historico_status_lead_idx on historico_status (lead_id, em);
create index if not exists historico_status_para_idx on historico_status (para, em);
alter table historico_status enable row level security;
drop policy if exists auth_total on historico_status;
create policy auth_total on historico_status for all to authenticated using (true) with check (true);

create or replace function leads_status_antes() returns trigger
language plpgsql as $$
begin
  if new.status_funil is distinct from old.status_funil then
    new.perdido_em := case when new.status_funil = 'perdido' then now() else null end;
    insert into historico_status (lead_id, de, para) values (new.id, old.status_funil, new.status_funil);
  end if;
  return new;
end $$;

create or replace function leads_status_novo() returns trigger
language plpgsql as $$
begin
  insert into historico_status (lead_id, de, para) values (new.id, null, new.status_funil);
  return null;
end $$;

drop trigger if exists leads_status_antes on leads;
create trigger leads_status_antes before update of status_funil on leads
  for each row execute function leads_status_antes();
drop trigger if exists leads_status_novo on leads;
create trigger leads_status_novo after insert on leads
  for each row execute function leads_status_novo();

insert into historico_status (lead_id, de, para, em)
select l.id, null, l.status_funil, l.atualizado_em from leads l
where not exists (select 1 from historico_status h where h.lead_id = l.id);

create or replace function ordem_funil(s status_funil) returns int
language sql immutable as $$
  select case s when 'qualificado' then 1 when 'previa_gerada' then 2 when 'aprovado' then 3 when 'enviado' then 4
    when 'abriu' then 5 when 'respondeu' then 6 when 'negociando' then 7 when 'fechado' then 8 end
$$;

create or replace function link_previa_lead(p_lead_id uuid) returns text
language sql stable set search_path = public as $$
  select coalesce(
    (select substring(m.texto from 'https?://[^[:space:]]+/p/[^[:space:]]+') from mensagens m
      where m.lead_id = p_lead_id and m.tipo = 'primeiro_contato'),
    (select rtrim(nullif(c.app_url, ''), '/') || '/p/' || s.slug || '?k=' || s.token_acesso
      from sites s cross join configuracoes c where s.lead_id = p_lead_id and c.id = 1),
    '')
$$;

create or replace function agendar_followups() returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_pulados int; v_f1 int; v_f2 int; v_perdidos int; v_despublicados int; v_total int;
  v_limite text := to_char(hoje_sp() + 35, 'DD/MM/YYYY');
begin
  perform pg_advisory_xact_lock(hashtext('sp_agendar_followups'));

  update mensagens m set status = 'pulada', motivo_pulo = 'lead avançou no funil'
  from leads l
  where l.id = m.lead_id and m.status = 'pendente' and m.tipo in ('followup_1', 'followup_2')
    and l.status_funil not in ('enviado', 'abriu');
  get diagnostics v_pulados = row_count;

  insert into mensagens (lead_id, tipo, texto, agendada_para)
  select l.id, 'followup_1',
    case when l.status_funil = 'abriu'
      then 'Oi! Vi que deu uma olhada na prévia do site da ' || l.nome || '. O que achou? Posso ajustar o que quiser antes de colocar no ar.'
      else 'Oi! Só reforçando: montei uma prévia de site para a ' || l.nome || '. Dá uma olhada quando puder: ' || link_previa_lead(l.id)
    end,
    hoje_sp()
  from leads l
  join mensagens p on p.lead_id = l.id and p.tipo = 'primeiro_contato' and p.status = 'enviada'
  where l.status_funil in ('enviado', 'abriu')
    and p.enviada_em <= now() - interval '2 days'
    and not exists (select 1 from mensagens f where f.lead_id = l.id and f.tipo = 'followup_1')
  on conflict do nothing;
  get diagnostics v_f1 = row_count;

  insert into mensagens (lead_id, tipo, texto, agendada_para)
  select l.id, 'followup_2',
    'Última mensagem, prometo. A prévia da ' || l.nome || ' fica no ar até ' || v_limite || '. Se fizer sentido, é só me chamar. Obrigado!',
    hoje_sp()
  from leads l
  join mensagens f on f.lead_id = l.id and f.tipo = 'followup_1' and f.status in ('enviada', 'pulada')
  where l.status_funil in ('enviado', 'abriu')
    and coalesce(f.enviada_em, f.criado_em) <= now() - interval '3 days'
    and not exists (select 1 from mensagens g where g.lead_id = l.id and g.tipo = 'followup_2')
  on conflict do nothing;
  get diagnostics v_f2 = row_count;

  update leads l set status_funil = 'perdido', motivo_descarte = 'sem_resposta', atualizado_em = now()
  from mensagens g
  where g.lead_id = l.id and g.tipo = 'followup_2' and g.status in ('enviada', 'pulada')
    and l.status_funil in ('enviado', 'abriu')
    and coalesce(g.enviada_em, g.criado_em) <= now() - interval '5 days';
  get diagnostics v_perdidos = row_count;

  update sites s set publicado = false
  from leads l
  where l.id = s.lead_id and s.publicado and l.status_funil = 'perdido' and l.perdido_em <= now() - interval '30 days';
  get diagnostics v_despublicados = row_count;

  v_total := v_f1 + v_f2 + v_perdidos + v_despublicados;
  if v_total > 0 then
    insert into execucoes (etapa, finalizado_em, sucesso, itens_processados, log)
    values ('followups', now(), true, v_total, jsonb_build_array(jsonb_build_object(
      'em', now(), 'nivel', 'info',
      'msg', format('%s follow-up 1, %s follow-up 2, %s perdido(s), %s prévia(s) despublicada(s)', v_f1, v_f2, v_perdidos, v_despublicados))));
  end if;

  return jsonb_build_object('followup_1', v_f1, 'followup_2', v_f2, 'perdidos', v_perdidos,
    'despublicados', v_despublicados, 'pulados', v_pulados);
end $$;

create or replace function mover_lead(p_lead_id uuid, p_status status_funil, p_valor numeric default null) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare v_atual status_funil;
begin
  if p_status not in ('enviado', 'abriu', 'respondeu', 'negociando', 'fechado', 'perdido') then
    raise exception 'Status inválido para o funil: %', p_status;
  end if;
  select status_funil into v_atual from leads where id = p_lead_id for update;
  if not found then raise exception 'Lead não encontrado'; end if;
  if v_atual = 'nao_contatar' then raise exception 'Este lead pediu para não ser contatado'; end if;

  update leads set
    status_funil = p_status,
    valor_fechado = case when p_valor is not null then p_valor else valor_fechado end,
    motivo_descarte = case when p_status = 'perdido' then coalesce(motivo_descarte, 'manual')
                           when v_atual = 'perdido' then null else motivo_descarte end,
    atualizado_em = now()
  where id = p_lead_id;

  if p_status in ('respondeu', 'negociando', 'fechado', 'perdido') then
    update mensagens set status = 'pulada', motivo_pulo = 'lead avançou no funil'
    where lead_id = p_lead_id and status = 'pendente' and tipo in ('followup_1', 'followup_2');
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function painel_dashboard(p_mes date default null) returns jsonb
language sql stable security invoker set search_path = public as $$
  with periodo as (
    select date_trunc('month', coalesce(p_mes, hoje_sp()))::date as d
  ), limites as (
    select (d::timestamp at time zone 'America/Sao_Paulo') as ini,
           ((d + interval '1 month')::timestamp at time zone 'America/Sao_Paulo') as fim
    from periodo
  ),
  alcance as (
    select k.etapa, h.lead_id, min(h.em) as em
    from historico_status h
    join generate_series(1, 8) as k(etapa) on ordem_funil(h.para) >= k.etapa
    group by k.etapa, h.lead_id
  ),
  etapas as (
    select a.etapa, count(*) as n from alcance a, limites x where a.em >= x.ini and a.em < x.fim group by a.etapa
  ),
  fechados as (
    select a.lead_id from alcance a, limites x where a.etapa = 8 and a.em >= x.ini and a.em < x.fim
  ),
  dias as (
    select generate_series(hoje_sp() - 29, hoje_sp(), interval '1 day')::date as dia
  )
  select jsonb_build_object(
    'mes', (select d from periodo),
    'coletados', (select count(*) from leads l, limites x where l.coletado_em >= x.ini and l.coletado_em < x.fim),
    'etapas', coalesce((select jsonb_object_agg(etapa, n) from etapas), '{}'::jsonb),
    'receita', coalesce((select sum(l.valor_fechado) from leads l join fechados f on f.lead_id = l.id), 0),
    'custo', coalesce((select sum(e.custo_estimado) from execucoes e, limites x where e.iniciado_em >= x.ini and e.iniciado_em < x.fim), 0),
    'serie', (select jsonb_agg(jsonb_build_object(
        'dia', d.dia,
        'envios', (select count(*) from mensagens m where m.status = 'enviada'
                   and (m.enviada_em at time zone 'America/Sao_Paulo')::date = d.dia),
        'aberturas', (select count(distinct ev.lead_id) from eventos ev where ev.tipo = 'visita' and ev.via_link
                      and (ev.criado_em at time zone 'America/Sao_Paulo')::date = d.dia)
      ) order by d.dia) from dias d),
    'quentes', coalesce((select jsonb_agg(q order by q.ultima_visita desc) from (
        select l.id, l.nome, l.telefone, l.score, l.nicho, max(ev.criado_em) as ultima_visita, count(*) as visitas
        from leads l join eventos ev on ev.lead_id = l.id and ev.via_link and ev.tipo in ('visita', 'clique_whatsapp', 'clique_quero')
        where l.status_funil = 'abriu' and ev.criado_em >= now() - interval '48 hours'
        group by l.id order by max(ev.criado_em) desc limit 10) q), '[]'::jsonb),
    'erros', coalesce((select jsonb_agg(e order by e.iniciado_em desc) from (
        select id, etapa, iniciado_em, erro from execucoes where sucesso = false order by iniciado_em desc limit 5) e), '[]'::jsonb)
  );
$$;

do $$
declare f text;
begin
  foreach f in array array['agendar_followups()', 'mover_lead(uuid, status_funil, numeric)', 'painel_dashboard(date)',
                           'link_previa_lead(uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;


-- ===== 20261002000000_fase7_automacao =====

create extension if not exists pg_cron;
create extension if not exists pg_net;

alter table configuracoes add column if not exists automacao_ativa boolean not null default false;
alter table configuracoes add column if not exists alerta_custo_mes numeric(10,2) not null default 100;

do $$ begin
  grant execute on function agendar_followups() to service_role;
exception when undefined_object or undefined_function then null; end $$;

create or replace function sp_definir_segredo(p_nome text, p_valor text) returns text
language plpgsql security definer set search_path = public, vault as $$
declare v_id uuid;
begin
  if coalesce(btrim(p_valor), '') = '' then raise exception 'Valor vazio para %', p_nome; end if;
  select id into v_id from vault.secrets where name = p_nome;
  if v_id is null then
    perform vault.create_secret(btrim(p_valor), p_nome);
    return 'criado: ' || p_nome;
  end if;
  perform vault.update_secret(v_id, btrim(p_valor));
  return 'atualizado: ' || p_nome;
end $$;
revoke all on function sp_definir_segredo(text, text) from public, anon, authenticated;

create or replace function sp_segredo(p_nome text) returns text
language sql stable security definer set search_path = public, vault as $$
  select decrypted_secret from vault.decrypted_secrets where name = p_nome limit 1
$$;
revoke all on function sp_segredo(text) from public, anon, authenticated;

create or replace function sp_chamar_pipeline(p_etapa text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_url text; v_chave text;
begin
  if p_etapa not in ('coletar', 'qualificar', 'gerar', 'followups') then raise exception 'Etapa inválida: %', p_etapa; end if;
  if auth.jwt() is not null and not sp_eh_operador() then raise exception 'Acesso negado'; end if;
  v_url := coalesce(sp_segredo('sp_pipeline_url'), sp_segredo('sp_functions_url') || '/pipeline');
  v_chave := sp_segredo('sp_service_role');
  if v_url is null or v_chave is null then
    raise exception 'Configure os segredos sp_pipeline_url e sp_service_role no Vault (veja o README, Fase 7)';
  end if;
  return net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_chave),
    body := jsonb_build_object('etapa', p_etapa),
    timeout_milliseconds := 150000
  );
end $$;
revoke all on function sp_chamar_pipeline(text) from public, anon;
grant execute on function sp_chamar_pipeline(text) to authenticated;

do $$
declare
  j record;
  agenda constant text[][] := array[
    array['sp-coletar',    '0 6 * * *',       'select sp_chamar_pipeline(''coletar'')'],
    array['sp-qualificar', '30,50 6 * * *',   'select sp_chamar_pipeline(''qualificar'')'],
    array['sp-gerar',      '*/10 7-8 * * *',  'select sp_chamar_pipeline(''gerar'')'],
    array['sp-followups',  '0 11 * * *',      'select agendar_followups() where (select automacao_ativa from configuracoes where id = 1)']
  ];
  i int;
begin
  for j in select jobid from cron.job where jobname in ('sp-coletar', 'sp-qualificar', 'sp-gerar', 'sp-followups') loop
    perform cron.unschedule(j.jobid);
  end loop;
  for i in 1 .. array_length(agenda, 1) loop
    perform cron.schedule(agenda[i][1], agenda[i][2], agenda[i][3]);
  end loop;
end $$;

create table if not exists operadores (
  email text primary key,
  criado_em timestamptz not null default now()
);
alter table operadores enable row level security;
insert into operadores (email) select lower(email) from auth.users where email is not null on conflict do nothing;

create or replace function sp_eh_operador() returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from operadores)
      or exists (select 1 from operadores where email = lower(coalesce(auth.jwt() ->> 'email', '')))
$$;
revoke all on function sp_eh_operador() from public, anon;
grant execute on function sp_eh_operador() to authenticated;

drop policy if exists operador_le on operadores;
create policy operador_le on operadores for select to authenticated using ((select sp_eh_operador()));

do $$
declare t text;
begin
  foreach t in array array['configuracoes', 'campanhas', 'leads', 'sites', 'mensagens', 'eventos', 'bloqueios',
                           'execucoes', 'buscas_cache', 'historico_status'] loop
    continue when to_regclass('public.' || t) is null; -- tabela de fase ainda não aplicada
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists auth_total on %I', t);
    execute format('drop policy if exists operador_total on %I', t);
    execute format('create policy operador_total on %I for all to authenticated using ((select sp_eh_operador())) with check ((select sp_eh_operador()))', t);
  end loop;
end $$;

create or replace function status_automacao() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'ativa', (select automacao_ativa from configuracoes where id = 1),
    'segredos', jsonb_build_object(
      'sp_pipeline_url', exists (select 1 from vault.secrets where name in ('sp_pipeline_url', 'sp_functions_url')),
      'sp_service_role', exists (select 1 from vault.secrets where name = 'sp_service_role')),
    'tarefas', coalesce((select jsonb_agg(jsonb_build_object('nome', jobname, 'agenda', schedule, 'ativa', active) order by jobname)
      from cron.job where jobname like 'sp-%'), '[]'::jsonb),
    'execucoes', coalesce((select jsonb_agg(x order by x.inicio desc) from (
      select j.jobname as nome, d.status, left(d.return_message, 300) as mensagem, d.start_time as inicio
      from cron.job_run_details d join cron.job j on j.jobid = d.jobid
      where j.jobname like 'sp-%' order by d.start_time desc limit 12) x), '[]'::jsonb),
    'respostas', coalesce((select jsonb_agg(r order by r.criado desc) from (
      select id, status_code, left(coalesce(error_msg, content::text), 300) as resumo, created as criado
      from net._http_response order by created desc limit 8) r), '[]'::jsonb)
  )
  where (select sp_eh_operador())
$$;
revoke all on function status_automacao() from public, anon;
grant execute on function status_automacao() to authenticated;


notify pgrst, 'reload schema';
