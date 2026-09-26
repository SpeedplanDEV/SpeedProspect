-- Fase 2 — coleta (idempotente)

-- Quantidade de chamadas pagas à API externa em cada execução (controle do limite diário)
alter table execucoes add column if not exists chamadas_api int not null default 0;
create index if not exists execucoes_etapa_data_idx on execucoes (etapa, iniciado_em desc);

-- Cache de consultas do Text Search: a mesma consulta não é repetida por 30 dias
create table if not exists buscas_cache (
  consulta text primary key,
  executada_em timestamptz not null default now(),
  paginas int not null default 0,
  resultados int not null default 0
);

create index if not exists bloqueios_telefone_idx on bloqueios (telefone);
create index if not exists leads_coletado_idx on leads (coletado_em desc);

alter table buscas_cache enable row level security;
drop policy if exists auth_total on buscas_cache;
create policy auth_total on buscas_cache for all to authenticated using (true) with check (true);

notify pgrst, 'reload schema';
