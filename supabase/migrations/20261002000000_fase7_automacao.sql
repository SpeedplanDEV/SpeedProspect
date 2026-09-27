-- Fase 7 — Automação diária (pg_cron + pg_net + Vault), controle de custo (idempotente)
-- Segredos NUNCA ficam neste arquivo: são gravados no Vault com sp_definir_segredo (ver README).

create extension if not exists pg_cron;
create extension if not exists pg_net;

alter table configuracoes add column if not exists automacao_ativa boolean not null default false;
alter table configuracoes add column if not exists alerta_custo_mes numeric(10,2) not null default 100;

-- O pipeline (service role) também agenda follow-ups
do $$ begin
  grant execute on function agendar_followups() to service_role;
exception when undefined_object or undefined_function then null; end $$;

-- Grava/atualiza um segredo no Vault (só pelo SQL Editor; ninguém do app executa)
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

-- Dispara uma etapa no pipeline (assíncrono, via pg_net). Usado pelo cron e pelo botão "Testar" do painel.
create or replace function sp_chamar_pipeline(p_etapa text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_url text; v_chave text;
begin
  if p_etapa not in ('coletar', 'qualificar', 'gerar', 'followups') then raise exception 'Etapa inválida: %', p_etapa; end if;
  -- Pelo painel, só operadores (o cron roda sem usuário e não passa por aqui)
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

-- Agenda (horários em UTC; São Paulo = UTC−3): 03:00 coletar, 03:30/03:50 qualificar,
-- 04:00–05:50 gerar (a cada 10 min; cada chamada gera poucas prévias até o limite diário), 08:00 follow-ups
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

-- ===== Segurança: só operadores cadastrados acessam os dados =====
-- Antes, qualquer usuário logado do projeto tinha acesso total. Agora o acesso exige o e-mail em `operadores`.
-- Os usuários que já existem entram na lista automaticamente (ninguém fica trancado para fora).
create table if not exists operadores (
  email text primary key,
  criado_em timestamptz not null default now()
);
alter table operadores enable row level security;
insert into operadores (email) select lower(email) from auth.users where email is not null on conflict do nothing;

-- Lista vazia = libera qualquer usuário logado (evita bloquear o acesso por engano)
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

-- Estado da automação para o painel (tarefas, últimas execuções do cron, respostas HTTP e segredos)
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
