-- Fase 6 — Follow-ups, funil e dashboard (idempotente)

alter table leads add column if not exists valor_fechado numeric(12,2);
alter table leads add column if not exists perdido_em timestamptz;

-- No máximo um follow-up de cada tipo por lead
create unique index if not exists mensagens_followup_unico on mensagens (lead_id, tipo)
  where tipo in ('followup_1', 'followup_2');

-- Histórico de mudanças de status (base do funil e do dashboard)
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

-- Registra entradas e mudanças de status; controla perdido_em
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

-- Leads que já existiam: registra o status atual (uma vez)
insert into historico_status (lead_id, de, para, em)
select l.id, null, l.status_funil, l.atualizado_em from leads l
where not exists (select 1 from historico_status h where h.lead_id = l.id);

-- Ordem das etapas do funil (descartado, perdido e não contatar ficam fora)
create or replace function ordem_funil(s status_funil) returns int
language sql immutable as $$
  select case s when 'qualificado' then 1 when 'previa_gerada' then 2 when 'aprovado' then 3 when 'enviado' then 4
    when 'abriu' then 5 when 'respondeu' then 6 when 'negociando' then 7 when 'fechado' then 8 end
$$;

-- Link da prévia do lead (o mesmo enviado no primeiro contato; senão monta com a URL do app)
create or replace function link_previa_lead(p_lead_id uuid) returns text
language sql stable set search_path = public as $$
  select coalesce(
    (select substring(m.texto from 'https?://[^[:space:]]+/p/[^[:space:]]+') from mensagens m
      where m.lead_id = p_lead_id and m.tipo = 'primeiro_contato'),
    (select rtrim(nullif(c.app_url, ''), '/') || '/p/' || s.slug || '?k=' || s.token_acesso
      from sites s cross join configuracoes c where s.lead_id = p_lead_id and c.id = 1),
    '')
$$;

-- Agenda follow-ups (não envia nada) e encerra quem não respondeu. Pode rodar várias vezes por dia.
create or replace function agendar_followups() returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_pulados int; v_f1 int; v_f2 int; v_perdidos int; v_despublicados int; v_total int;
  v_limite text := to_char(hoje_sp() + 35, 'DD/MM/YYYY');
begin
  perform pg_advisory_xact_lock(hashtext('sp_agendar_followups'));

  -- Follow-ups pendentes de quem já avançou (respondeu, negociando, fechado) ou saiu do funil
  update mensagens m set status = 'pulada', motivo_pulo = 'lead avançou no funil'
  from leads l
  where l.id = m.lead_id and m.status = 'pendente' and m.tipo in ('followup_1', 'followup_2')
    and l.status_funil not in ('enviado', 'abriu');
  get diagnostics v_pulados = row_count;

  -- Follow-up 1: 2 dias após o primeiro contato
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

  -- Follow-up 2: 3 dias após o follow-up 1 (enviado ou pulado)
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

  -- Sem resposta 5 dias após o follow-up 2 → perdido
  update leads l set status_funil = 'perdido', motivo_descarte = 'sem_resposta', atualizado_em = now()
  from mensagens g
  where g.lead_id = l.id and g.tipo = 'followup_2' and g.status in ('enviada', 'pulada')
    and l.status_funil in ('enviado', 'abriu')
    and coalesce(g.enviada_em, g.criado_em) <= now() - interval '5 days';
  get diagnostics v_perdidos = row_count;

  -- Prévias de leads perdidos saem do ar 30 dias depois
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

-- Move o lead no funil (kanban); ao fechar, pode registrar o valor
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

  -- Quem voltou a conversar não recebe follow-up automático
  if p_status in ('respondeu', 'negociando', 'fechado', 'perdido') then
    update mensagens set status = 'pulada', motivo_pulo = 'lead avançou no funil'
    where lead_id = p_lead_id and status = 'pendente' and tipo in ('followup_1', 'followup_2');
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Números do dashboard para um mês (padrão: mês atual, fuso de São Paulo)
create or replace function painel_dashboard(p_mes date default null) returns jsonb
language sql stable security invoker set search_path = public as $$
  with periodo as (
    select date_trunc('month', coalesce(p_mes, hoje_sp()))::date as d
  ), limites as (
    select (d::timestamp at time zone 'America/Sao_Paulo') as ini,
           ((d + interval '1 month')::timestamp at time zone 'America/Sao_Paulo') as fim
    from periodo
  ),
  -- Primeira vez que cada lead alcançou cada etapa (ou uma posterior)
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

notify pgrst, 'reload schema';
