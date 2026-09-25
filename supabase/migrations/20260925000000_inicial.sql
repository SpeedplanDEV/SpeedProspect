-- SpeedProspect — migration inicial (idempotente)

create extension if not exists pgcrypto;
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$ begin
  create type status_site as enum ('desconhecido','sem_site','site_fraco','site_ok');
exception when duplicate_object then null; end $$;

do $$ begin
  create type status_funil as enum ('novo','qualificado','descartado','previa_gerada','aprovado',
    'enviado','abriu','respondeu','negociando','fechado','perdido','nao_contatar');
exception when duplicate_object then null; end $$;

create table if not exists configuracoes (
  id int primary key default 1 check (id = 1),
  negocio_nome text not null default 'Minha Agência',
  negocio_whatsapp text not null default '',        -- E.164, ex: +5517999999999
  app_url text not null default '',
  limite_buscas_dia int not null default 30,
  limite_geracoes_dia int not null default 60,
  limite_envios_dia int not null default 40,
  auto_aprovar boolean not null default false,
  score_minimo int not null default 50,
  prospectar_site_ok boolean not null default false, -- true = também aborda quem já tem site (redesign)
  modelo_ia text not null default 'claude-sonnet-5',
  preco_texto text not null default 'a partir de R$ 497',
  atualizado_em timestamptz not null default now()
);
insert into configuracoes (id) values (1) on conflict do nothing;

create table if not exists campanhas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  nicho text not null check (nicho in ('saude','alimentacao','automotivo','beleza','servicos')),
  cidade text not null,
  uf text not null default 'SP',
  termos_busca text[] not null,          -- ex: {'dentista','clínica odontológica'}
  bairros text[] not null default '{}',  -- amplia cobertura: termo + bairro
  ativa boolean not null default true,
  max_leads_execucao int not null default 60,
  ultima_execucao timestamptz,
  criado_em timestamptz not null default now()
);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  campanha_id uuid references campanhas(id) on delete set null,
  place_id text not null unique,
  nome text not null,
  nicho text not null,
  cidade text not null,
  bairro text,
  endereco text,
  telefone text,                       -- E.164 (+55DDDNÚMERO) quando possível
  telefone_celular boolean not null default false,
  website text,
  google_maps_url text,
  rating numeric(2,1),
  reviews_count int not null default 0,
  tipos text[] not null default '{}',
  tipo_principal text,
  horarios jsonb,                      -- weekdayDescriptions do Places
  fotos jsonb not null default '[]',   -- [{name, width, height, atribuicao}]
  avaliacoes jsonb not null default '[]', -- [{autor, nota, texto, data}]
  lat double precision, lng double precision,
  status_negocio text,                 -- OPERATIONAL etc.
  status_site status_site not null default 'desconhecido',
  detalhe_site jsonb,
  score int not null default 0,
  status_funil status_funil not null default 'novo',
  motivo_descarte text,
  observacoes text,
  places_atualizado_em timestamptz not null default now(),
  coletado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists leads_funil_score_idx on leads (status_funil, score desc);
create index if not exists leads_campanha_idx on leads (campanha_id);

create table if not exists sites (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  slug text not null unique,
  template text not null,
  conteudo jsonb not null,             -- ConteudoLP
  token_acesso text not null unique default encode(gen_random_bytes(8),'hex'),
  publicado boolean not null default false,
  versao int not null default 1,
  modelo_ia text,
  tokens_entrada int, tokens_saida int,
  custo_estimado numeric(10,4),
  criado_em timestamptz not null default now(),
  publicado_em timestamptz
);
create index if not exists sites_lead_idx on sites (lead_id);

create table if not exists mensagens (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  tipo text not null check (tipo in ('primeiro_contato','followup_1','followup_2','resposta_preco')),
  canal text not null default 'whatsapp',
  texto text not null,
  status text not null default 'pendente' check (status in ('pendente','enviada','pulada')),
  agendada_para date not null default current_date,
  enviada_em timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists mensagens_fila_idx on mensagens (status, agendada_para);

create table if not exists eventos (
  id bigint generated always as identity primary key,
  site_id uuid references sites(id) on delete cascade,
  lead_id uuid references leads(id) on delete cascade,
  tipo text not null check (tipo in ('visita','clique_whatsapp','clique_quero','optout')),
  via_link boolean not null default false,  -- true = veio do link enviado (?k=token)
  sessao text,
  user_agent text,
  criado_em timestamptz not null default now()
);
create index if not exists eventos_lead_idx on eventos (lead_id, criado_em desc);

create table if not exists bloqueios (
  id uuid primary key default gen_random_uuid(),
  place_id text unique,
  telefone text,
  motivo text not null default 'optout',
  criado_em timestamptz not null default now()
);

create table if not exists execucoes (
  id uuid primary key default gen_random_uuid(),
  etapa text not null,                 -- coletar | qualificar | gerar | followups
  campanha_id uuid,
  iniciado_em timestamptz not null default now(),
  finalizado_em timestamptz,
  sucesso boolean,
  itens_processados int not null default 0,
  custo_estimado numeric(10,4) not null default 0,
  log jsonb not null default '[]',
  erro text
);

create or replace function set_atualizado_em() returns trigger language plpgsql as $$
begin new.atualizado_em = now(); return new; end $$;
drop trigger if exists leads_atualizado on leads;
create trigger leads_atualizado before update on leads for each row execute function set_atualizado_em();

-- RLS: operador autenticado tem acesso total; anon não acessa nada diretamente
do $$ declare t text; begin
  foreach t in array array['configuracoes','campanhas','leads','sites','mensagens','eventos','bloqueios','execucoes'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists auth_total on %I', t);
    execute format('create policy auth_total on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- Leitura pública da prévia (só o necessário para renderizar)
create or replace function get_site_publico(p_slug text) returns jsonb
language sql security definer stable set search_path = public as $$
  select jsonb_build_object('site_id', s.id, 'template', s.template, 'conteudo', s.conteudo)
  from sites s where s.slug = p_slug and s.publicado = true;
$$;
revoke all on function get_site_publico(text) from public;
grant execute on function get_site_publico(text) to anon, authenticated;

notify pgrst, 'reload schema';
