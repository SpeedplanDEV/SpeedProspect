-- Fase 8 — SpeedProspect Ads: modelo de dados do módulo Meta Ads (idempotente)
-- Tabelas da seção 5 do PROMPT_SPEEDPROSPECT_META_ADS.md, com acréscimos para importar objetos já existentes na Meta
-- (origem, status reais da Meta), biblioteca de mídia (midias_ads) e saúde das contas. Acesso só para operadores.

do $$ begin
  create type ads_temperatura as enum ('frio','morno','quente','lookalike');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ads_status as enum ('rascunho','planejado','revisao','publicado_pausado','ativo','pausado','encerrado','erro');
exception when duplicate_object then null; end $$;

-- Origem do lead (integra os anúncios ao funil do SpeedProspect)
alter table leads add column if not exists origem text not null default 'google_maps';
do $$ begin
  alter table leads add constraint leads_origem_check check (origem in ('google_maps','meta_ads','manual'));
exception when duplicate_object then null; end $$;
alter table leads add column if not exists utm jsonb;
alter table leads add column if not exists valor_fechado numeric(12,2);

create table if not exists contas_ads (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null check (tipo in ('agencia','cliente')),
  lead_id uuid references leads(id) on delete set null,      -- cliente vindo do funil (opcional)
  meta_ad_account_id text not null unique,                    -- act_123...
  meta_business_id text,
  meta_page_id text, meta_page_nome text,
  meta_instagram_id text, meta_instagram_usuario text,
  meta_pixel_id text, meta_pixel_nome text,
  whatsapp_numero text,                                       -- E.164 conectado à Página
  moeda text not null default 'BRL',
  fuso text not null default 'America/Sao_Paulo',
  teto_diario_centavos int not null default 10000 check (teto_diario_centavos >= 0),
  teto_mensal_centavos int not null default 200000 check (teto_mensal_centavos >= 0),
  modo_otimizacao text not null default 'sugerir' check (modo_otimizacao in ('sugerir','automatico')),
  taxa_gestao_centavos int not null default 0 check (taxa_gestao_centavos >= 0),   -- mensalidade da agência
  taxa_gestao_percentual numeric(5,2) not null default 0 check (taxa_gestao_percentual between 0 and 100),
  ativa boolean not null default true,
  saude jsonb,                                                -- último diagnóstico (status, pagamento, WhatsApp, pixel, Instagram)
  saude_em timestamptz,
  sincronizado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists pesquisas_nicho (
  id uuid primary key default gen_random_uuid(),
  nicho text not null, cidade text not null,
  conteudo jsonb not null,                                    -- PesquisaNicho (seção 6.1)
  modelo_ia text, custo_estimado numeric(10,4),
  criado_em timestamptz not null default now(),
  unique (nicho, cidade)
);

create table if not exists publicos (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references contas_ads(id) on delete cascade,
  nome text not null,
  temperatura ads_temperatura not null,
  tipo text not null check (tipo in ('salvo','custom','lookalike')),
  meta_audience_id text,                                      -- custom/lookalike criados na Meta
  targeting_spec jsonb,                                       -- para tipo 'salvo'
  tamanho_estimado_min bigint, tamanho_estimado_max bigint,
  pontuacao int not null default 0,
  origem text,                                                -- ia | manual | automatico
  justificativa text,
  atualizado_em timestamptz not null default now(),
  criado_em timestamptz not null default now()
);
create index if not exists publicos_conta_idx on publicos (conta_id, temperatura);

create table if not exists campanhas_ads (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references contas_ads(id) on delete cascade,
  nome text not null,
  objetivo text not null check (objetivo in ('conversas_whatsapp','trafego_site','leads_site','formulario','vendas','reconhecimento','outro')),
  briefing jsonb not null,                                    -- Briefing (seção 6.2); {} nas importadas
  plano jsonb,                                                -- PlanoCampanha (seção 6.3)
  orcamento_tipo text not null default 'cbo' check (orcamento_tipo in ('cbo','abo')),
  orcamento_diario_centavos int,
  cpa_alvo_centavos int,
  inicio timestamptz, fim timestamptz,
  special_ad_categories text[] not null default '{}',
  meta_campaign_id text unique,
  status ads_status not null default 'rascunho',
  conformidade jsonb,                                         -- resultado da checagem
  erro text,
  origem text not null default 'sistema' check (origem in ('sistema','importado')),
  meta_objective text, meta_status text, meta_effective_status text,
  issues jsonb,                                               -- issues_info da Meta
  sincronizado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists campanhas_ads_conta_idx on campanhas_ads (conta_id, status);

create table if not exists conjuntos_ads (
  id uuid primary key default gen_random_uuid(),
  campanha_id uuid not null references campanhas_ads(id) on delete cascade,
  publico_id uuid references publicos(id) on delete set null,
  nome text not null,
  targeting_spec jsonb not null,
  otimizacao text not null,                                   -- CONVERSATIONS | LANDING_PAGE_VIEWS | ...
  destino text not null,                                      -- WHATSAPP | WEBSITE | ON_AD
  orcamento_diario_centavos int,                              -- só em ABO
  posicionamentos text not null default 'advantage' check (posicionamentos in ('advantage','manual')),
  meta_adset_id text unique,
  status ads_status not null default 'rascunho',
  aprendizado_concluido boolean not null default false,
  origem text not null default 'sistema' check (origem in ('sistema','importado')),
  meta_status text, meta_effective_status text,
  issues jsonb, aprendizado jsonb,                            -- learning_stage_info da Meta
  sincronizado_em timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists conjuntos_ads_campanha_idx on conjuntos_ads (campanha_id);

create table if not exists criativos_ads (
  id uuid primary key default gen_random_uuid(),
  conjunto_id uuid not null references conjuntos_ads(id) on delete cascade,
  nome text not null,
  angulo text not null,                                       -- dor | prova_social | oferta | curiosidade | autoridade | urgencia | importado
  formato text not null check (formato in ('imagem_1x1','imagem_4x5','video_9x16','carrossel','outro')),
  texto_primario text not null,
  variacoes_texto text[] not null default '{}',
  titulo text not null, descricao text,
  cta text not null,
  link_destino text,
  url_tags text,                                              -- utm_source=meta&utm_campaign={{campaign.name}}...
  midia_storage_path text,                                    -- Supabase Storage (bucket ads-midia)
  meta_image_hash text, meta_video_id text,
  roteiro_video jsonb,                                        -- cenas/falas quando formato vídeo
  meta_creative_id text, meta_ad_id text unique,
  status ads_status not null default 'rascunho',
  motivo_reprovacao text,
  origem text not null default 'sistema' check (origem in ('sistema','importado')),
  meta_status text, meta_effective_status text,
  issues jsonb,
  sincronizado_em timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists criativos_ads_conjunto_idx on criativos_ads (conjunto_id);

create table if not exists metricas_ads (
  id bigint generated always as identity primary key,
  conta_id uuid not null references contas_ads(id) on delete cascade,
  nivel text not null check (nivel in ('campanha','conjunto','anuncio')),
  ref_id uuid not null,                                       -- id local do objeto
  meta_id text not null,
  data date not null,
  gasto_centavos int not null default 0,
  impressoes int not null default 0, alcance int not null default 0, frequencia numeric(6,2),
  cliques_link int not null default 0, ctr_link numeric(6,3), cpc_link_centavos int, cpm_centavos int,
  resultados int not null default 0, custo_por_resultado_centavos int,
  conversas_iniciadas int not null default 0, leads int not null default 0,
  visualizacoes_lp int not null default 0,
  video_3s int not null default 0, thruplay int not null default 0,
  bruto jsonb,
  unique (nivel, meta_id, data)
);
create index if not exists metricas_ads_ref_idx on metricas_ads (ref_id, data desc);

create table if not exists regras_otimizacao (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid references contas_ads(id) on delete cascade,  -- null = regra global
  nome text not null,
  descricao text,                                             -- explicação exibida na UI ("por quê")
  ordem int not null default 0,
  condicao jsonb not null,                                    -- RegraCondicao (seção 6.5)
  acao text not null check (acao in ('pausar_anuncio','pausar_conjunto','escalar_orcamento','novos_criativos','realocar_verba','alertar')),
  parametros jsonb not null default '{}',
  modo text not null default 'sugerir' check (modo in ('sugerir','automatico','guarda')),
  ativa boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists acoes_otimizacao (
  id uuid primary key default gen_random_uuid(),
  regra_id uuid references regras_otimizacao(id) on delete set null,
  conta_id uuid not null references contas_ads(id) on delete cascade,
  nivel text not null, ref_id uuid not null,
  sugestao text not null,
  justificativa jsonb not null,                               -- métricas que dispararam
  status text not null default 'pendente' check (status in ('pendente','aprovada','rejeitada','executada','falhou')),
  executada_em timestamptz, resultado jsonb,
  criado_em timestamptz not null default now()
);
create index if not exists acoes_otimizacao_status_idx on acoes_otimizacao (conta_id, status);

create table if not exists cobrancas_ads (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references contas_ads(id) on delete cascade,
  tipo text not null check (tipo in ('taxa_gestao','verba')),
  valor_centavos int not null,
  competencia date not null,
  vencimento date not null,
  status text not null default 'pendente' check (status in ('pendente','paga','vencida','cancelada')),
  gateway text not null default 'asaas',
  gateway_id text unique, pix_payload text, link_pagamento text,
  paga_em timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists cobrancas_ads_conta_idx on cobrancas_ads (conta_id, status);

create table if not exists relatorios_ads (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references contas_ads(id) on delete cascade,
  periodo_inicio date not null, periodo_fim date not null,
  resumo jsonb not null,                                      -- KPIs + narrativa da IA
  token_acesso text not null unique default encode(gen_random_bytes(8),'hex'),
  criado_em timestamptz not null default now()
);

create table if not exists notificacoes (
  id bigint generated always as identity primary key,
  tipo text not null, titulo text not null, corpo text, ref jsonb,
  lida boolean not null default false,
  criado_em timestamptz not null default now()
);

-- Biblioteca de mídia dos anúncios (fotos/vídeos do cliente ou da agência; fotos do Google nunca entram aqui)
create table if not exists midias_ads (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references contas_ads(id) on delete cascade,
  storage_path text not null unique,
  nome_original text,
  tipo text not null check (tipo in ('imagem','video')),
  mime text not null,
  largura int, altura int,
  proporcao text check (proporcao in ('1x1','4x5','9x16')),
  duracao_s numeric(8,2),
  tamanho_bytes bigint not null,
  origem text not null default 'cliente' check (origem in ('cliente','agencia','print_previa')),
  descricao text,
  meta_image_hash text, meta_video_id text,
  criado_em timestamptz not null default now()
);
create index if not exists midias_ads_conta_idx on midias_ads (conta_id, criado_em desc);

-- ===== Acesso: só operadores (mesma regra da Fase 7) =====
do $$ begin
  if to_regprocedure('public.sp_eh_operador()') is null then
    -- Sem a Fase 7 (módulo usado sozinho): qualquer usuário logado
    execute 'create function public.sp_eh_operador() returns boolean language sql stable as ''select true''';
  end if;
end $$;

do $$ declare t text; begin
  foreach t in array array['contas_ads','pesquisas_nicho','publicos','campanhas_ads','conjuntos_ads','criativos_ads',
    'metricas_ads','regras_otimizacao','acoes_otimizacao','cobrancas_ads','relatorios_ads','notificacoes','midias_ads'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists auth_total on %I', t);
    execute format('drop policy if exists operador_total on %I', t);
    execute format('create policy operador_total on %I for all to authenticated using ((select sp_eh_operador())) with check ((select sp_eh_operador()))', t);
  end loop;
end $$;

-- Relatório público por token (Fase 14)
create or replace function get_relatorio_publico(p_token text) returns jsonb
language sql security definer stable set search_path = public as $$
  select jsonb_build_object('conta', c.nome, 'inicio', r.periodo_inicio, 'fim', r.periodo_fim, 'resumo', r.resumo)
  from relatorios_ads r join contas_ads c on c.id = r.conta_id where r.token_acesso = p_token;
$$;
revoke all on function get_relatorio_publico(text) from public;
grant execute on function get_relatorio_publico(text) to anon, authenticated;

-- ===== As 7 regras padrão da seção 4.6 (globais, idempotentes pelo nome) =====
insert into regras_otimizacao (conta_id, nome, descricao, ordem, condicao, acao, parametros, modo)
select null, r.nome, r.descricao, r.ordem, r.condicao::jsonb, r.acao, r.parametros::jsonb, r.modo
from (values
  (1, 'Pausar anúncio sem resultado (2× CPA)',
   'Gastou o dobro do CPA-alvo sem nenhum resultado desde o início: o anúncio dificilmente vai recuperar.',
   '{"nivel":"anuncio","janela_dias":null,"todas":[{"metrica":"gasto_centavos","op":">=","valor":"2x_cpa_alvo"},{"metrica":"resultados","op":"==","valor":0}]}',
   'pausar_anuncio', '{}', 'automatico'),
  (2, 'CTR de link baixo',
   'Com mais de 1.500 impressões e CTR de link abaixo de 0,7%, o criativo não está chamando atenção.',
   '{"nivel":"anuncio","janela_dias":7,"todas":[{"metrica":"impressoes","op":">=","valor":1500},{"metrica":"ctr_link","op":"<","valor":0.7}]}',
   'pausar_anuncio', '{"sugerir_novo_criativo":true}', 'sugerir'),
  (3, 'Fadiga de criativo',
   'Frequência acima de 3 na semana com CPA 20% maior: o público cansou do anúncio.',
   '{"nivel":"anuncio","janela_dias":7,"todas":[{"metrica":"frequencia","op":">","valor":3.0},{"metrica":"custo_por_resultado_centavos","op":">=","valor":"1.2x_periodo_anterior"}]}',
   'novos_criativos', '{}', 'sugerir'),
  (4, 'Escalar conjunto vencedor',
   'CPA 20% abaixo da meta por 3 dias seguidos, com pelo menos 5 resultados: vale aumentar 20% (no máximo 1× ao dia).',
   '{"nivel":"conjunto","janela_dias":3,"dias_seguidos":3,"todas":[{"metrica":"custo_por_resultado_centavos","op":"<=","valor":"0.8x_cpa_alvo"},{"metrica":"resultados","op":">=","valor":5}]}',
   'escalar_orcamento', '{"percentual":20,"max_por_dia":1}', 'sugerir'),
  (5, 'Conjunto caro: realocar verba',
   'CPA 50% acima do melhor conjunto por 3 dias: pausar e mover a verba para quem performa.',
   '{"nivel":"conjunto","janela_dias":3,"dias_seguidos":3,"todas":[{"metrica":"custo_por_resultado_centavos","op":">=","valor":"1.5x_melhor_conjunto"}]}',
   'realocar_verba', '{"pausar_conjunto":true}', 'sugerir'),
  (6, 'Guarda da fase de aprendizado',
   'Conjunto com menos de 7 dias ou menos de 50 resultados na semana: mexer no orçamento reinicia o aprendizado.',
   '{"nivel":"conjunto","janela_dias":7,"qualquer":[{"metrica":"dias_ativo","op":"<","valor":7},{"metrica":"resultados","op":"<","valor":50}]}',
   'alertar', '{"bloqueia":["escalar_orcamento","realocar_verba","pausar_conjunto"],"exceto_regras":["Pausar anúncio sem resultado (2× CPA)"]}', 'guarda'),
  (7, 'Problema na conta ou saldo baixo',
   'Anúncio reprovado, conta com problema ou saldo de verba do cliente para menos de 3 dias: alerta e pausa pelo saldo.',
   '{"nivel":"campanha","qualquer":[{"metrica":"anuncio_reprovado","op":"==","valor":true},{"metrica":"conta_com_problema","op":"==","valor":true},{"metrica":"saldo_dias","op":"<","valor":3}]}',
   'alertar', '{"pausar_campanhas_quando":"saldo_dias < 3"}', 'automatico')
) as r(ordem, nome, descricao, condicao, acao, parametros, modo)
where not exists (select 1 from regras_otimizacao x where x.conta_id is null and x.nome = r.nome);

-- ===== Sincronização com a Meta (usada pela Edge Function meta-sync) =====

-- IDs da Meta já conhecidos de uma conta (para conferir o status dos que não vieram na listagem)
create or replace function meta_ids_da_conta(p_conta_id uuid) returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'campanhas', coalesce((select jsonb_agg(c.meta_campaign_id) from campanhas_ads c
      where c.conta_id = p_conta_id and c.meta_campaign_id is not null and c.status <> 'encerrado'), '[]'::jsonb),
    'conjuntos', coalesce((select jsonb_agg(s.meta_adset_id) from conjuntos_ads s join campanhas_ads c on c.id = s.campanha_id
      where c.conta_id = p_conta_id and s.meta_adset_id is not null and s.status <> 'encerrado'), '[]'::jsonb),
    'anuncios', coalesce((select jsonb_agg(a.meta_ad_id) from criativos_ads a join conjuntos_ads s on s.id = a.conjunto_id
      join campanhas_ads c on c.id = s.campanha_id
      where c.conta_id = p_conta_id and a.meta_ad_id is not null and a.status <> 'encerrado'), '[]'::jsonb))
$$;

-- Grava o que veio da Meta: importa objetos novos (origem 'importado', somente leitura) e atualiza o status de todos.
-- Objetos criados pelo sistema só têm status/problemas atualizados; o conteúdo local nunca é sobrescrito.
create or replace function meta_sincronizar(p_conta_id uuid, p_campanhas jsonb, p_conjuntos jsonb, p_anuncios jsonb,
  p_ausentes jsonb default '[]') returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  c_ins int := 0; c_upd int := 0; s_ins int := 0; s_upd int := 0; a_ins int := 0; a_upd int := 0; aus int := 0; n int;
  r record;
begin
  if not exists (select 1 from contas_ads where id = p_conta_id) then raise exception 'Conta não encontrada'; end if;

  with dados as (
    select * from jsonb_to_recordset(coalesce(p_campanhas, '[]')) as x(
      meta_id text, nome text, objetivo text, meta_objective text, orcamento_tipo text, orcamento_diario_centavos int,
      special_ad_categories text[], status ads_status, meta_status text, meta_effective_status text, issues jsonb,
      inicio timestamptz, fim timestamptz)
  ), up as (
    insert into campanhas_ads as c (conta_id, nome, objetivo, briefing, orcamento_tipo, orcamento_diario_centavos,
      special_ad_categories, meta_campaign_id, status, origem, meta_objective, meta_status, meta_effective_status, issues,
      inicio, fim, sincronizado_em, atualizado_em)
    select p_conta_id, left(coalesce(nullif(d.nome, ''), '(sem nome)'), 400), coalesce(d.objetivo, 'outro'), '{}'::jsonb,
      coalesce(d.orcamento_tipo, 'abo'), d.orcamento_diario_centavos, coalesce(d.special_ad_categories, '{}'), d.meta_id,
      coalesce(d.status, 'pausado'), 'importado', d.meta_objective, d.meta_status, d.meta_effective_status, d.issues,
      d.inicio, d.fim, now(), now()
    from dados d where d.meta_id is not null
    on conflict (meta_campaign_id) do update set
      status = case when c.origem = 'sistema' and excluded.status = 'pausado' and c.status = 'publicado_pausado'
                    then c.status else excluded.status end,
      meta_status = excluded.meta_status, meta_effective_status = excluded.meta_effective_status,
      issues = excluded.issues, sincronizado_em = now(),
      nome = case when c.origem = 'importado' then excluded.nome else c.nome end,
      objetivo = case when c.origem = 'importado' then excluded.objetivo else c.objetivo end,
      meta_objective = excluded.meta_objective,
      orcamento_tipo = case when c.origem = 'importado' then excluded.orcamento_tipo else c.orcamento_tipo end,
      orcamento_diario_centavos = case when c.origem = 'importado' then excluded.orcamento_diario_centavos else c.orcamento_diario_centavos end,
      special_ad_categories = case when c.origem = 'importado' then excluded.special_ad_categories else c.special_ad_categories end,
      inicio = case when c.origem = 'importado' then excluded.inicio else c.inicio end,
      fim = case when c.origem = 'importado' then excluded.fim else c.fim end
    where c.conta_id = p_conta_id
    returning (xmax = 0) as inserido
  )
  select count(*) filter (where inserido), count(*) filter (where not inserido) into c_ins, c_upd from up;

  with dados as (
    select * from jsonb_to_recordset(coalesce(p_conjuntos, '[]')) as x(
      meta_id text, meta_campaign_id text, nome text, targeting jsonb, otimizacao text, destino text,
      orcamento_diario_centavos int, status ads_status, meta_status text, meta_effective_status text, issues jsonb,
      aprendizado jsonb, aprendizado_concluido boolean)
  ), up as (
    insert into conjuntos_ads as s (campanha_id, nome, targeting_spec, otimizacao, destino, orcamento_diario_centavos,
      meta_adset_id, status, origem, meta_status, meta_effective_status, issues, aprendizado, aprendizado_concluido, sincronizado_em)
    select c.id, left(coalesce(nullif(d.nome, ''), '(sem nome)'), 400), coalesce(d.targeting, '{}'::jsonb),
      coalesce(d.otimizacao, ''), coalesce(d.destino, ''), d.orcamento_diario_centavos, d.meta_id, coalesce(d.status, 'pausado'),
      'importado', d.meta_status, d.meta_effective_status, d.issues, d.aprendizado, coalesce(d.aprendizado_concluido, false), now()
    from dados d join campanhas_ads c on c.meta_campaign_id = d.meta_campaign_id and c.conta_id = p_conta_id
    where d.meta_id is not null
    on conflict (meta_adset_id) do update set
      status = case when s.origem = 'sistema' and excluded.status = 'pausado' and s.status = 'publicado_pausado'
                    then s.status else excluded.status end,
      meta_status = excluded.meta_status, meta_effective_status = excluded.meta_effective_status,
      issues = excluded.issues, aprendizado = excluded.aprendizado,
      aprendizado_concluido = excluded.aprendizado_concluido, sincronizado_em = now(),
      nome = case when s.origem = 'importado' then excluded.nome else s.nome end,
      targeting_spec = case when s.origem = 'importado' then excluded.targeting_spec else s.targeting_spec end,
      otimizacao = case when s.origem = 'importado' then excluded.otimizacao else s.otimizacao end,
      destino = case when s.origem = 'importado' then excluded.destino else s.destino end,
      orcamento_diario_centavos = case when s.origem = 'importado' then excluded.orcamento_diario_centavos else s.orcamento_diario_centavos end
    returning (xmax = 0) as inserido
  )
  select count(*) filter (where inserido), count(*) filter (where not inserido) into s_ins, s_upd from up;

  with dados as (
    select * from jsonb_to_recordset(coalesce(p_anuncios, '[]')) as x(
      meta_id text, meta_adset_id text, nome text, formato text, texto_primario text, titulo text, descricao text,
      cta text, link_destino text, meta_creative_id text, status ads_status, meta_status text, meta_effective_status text,
      issues jsonb, motivo_reprovacao text)
  ), up as (
    insert into criativos_ads as a (conjunto_id, nome, angulo, formato, texto_primario, titulo, descricao, cta, link_destino,
      meta_creative_id, meta_ad_id, status, origem, meta_status, meta_effective_status, issues, motivo_reprovacao, sincronizado_em)
    select s.id, left(coalesce(nullif(d.nome, ''), '(sem nome)'), 400), 'importado', coalesce(d.formato, 'outro'),
      coalesce(d.texto_primario, ''), coalesce(d.titulo, ''), d.descricao, coalesce(d.cta, ''), d.link_destino,
      d.meta_creative_id, d.meta_id, coalesce(d.status, 'pausado'), 'importado', d.meta_status, d.meta_effective_status,
      d.issues, d.motivo_reprovacao, now()
    from dados d
    join conjuntos_ads s on s.meta_adset_id = d.meta_adset_id
    join campanhas_ads c on c.id = s.campanha_id and c.conta_id = p_conta_id
    where d.meta_id is not null
    on conflict (meta_ad_id) do update set
      status = case when a.origem = 'sistema' and excluded.status = 'pausado' and a.status = 'publicado_pausado'
                    then a.status else excluded.status end,
      meta_status = excluded.meta_status, meta_effective_status = excluded.meta_effective_status,
      issues = excluded.issues, motivo_reprovacao = excluded.motivo_reprovacao, sincronizado_em = now(),
      nome = case when a.origem = 'importado' then excluded.nome else a.nome end,
      formato = case when a.origem = 'importado' then excluded.formato else a.formato end,
      texto_primario = case when a.origem = 'importado' then excluded.texto_primario else a.texto_primario end,
      titulo = case when a.origem = 'importado' then excluded.titulo else a.titulo end,
      descricao = case when a.origem = 'importado' then excluded.descricao else a.descricao end,
      cta = case when a.origem = 'importado' then excluded.cta else a.cta end,
      link_destino = case when a.origem = 'importado' then excluded.link_destino else a.link_destino end,
      meta_creative_id = case when a.origem = 'importado' then excluded.meta_creative_id else a.meta_creative_id end
    returning (xmax = 0) as inserido
  )
  select count(*) filter (where inserido), count(*) filter (where not inserido) into a_ins, a_upd from up;

  -- Objetos que não vieram na listagem (arquivados, excluídos ou sem acesso)
  for r in select * from jsonb_to_recordset(coalesce(p_ausentes, '[]')) as x(
      nivel text, meta_id text, status ads_status, meta_status text, meta_effective_status text, issues jsonb) loop
    if r.nivel = 'campanha' then
      update campanhas_ads set status = r.status, meta_status = r.meta_status, meta_effective_status = r.meta_effective_status,
        issues = coalesce(r.issues, issues), sincronizado_em = now()
      where meta_campaign_id = r.meta_id and conta_id = p_conta_id;
    elsif r.nivel = 'conjunto' then
      update conjuntos_ads s set status = r.status, meta_status = r.meta_status, meta_effective_status = r.meta_effective_status,
        issues = coalesce(r.issues, s.issues), sincronizado_em = now()
      from campanhas_ads c where c.id = s.campanha_id and c.conta_id = p_conta_id and s.meta_adset_id = r.meta_id;
    elsif r.nivel = 'anuncio' then
      update criativos_ads a set status = r.status, meta_status = r.meta_status, meta_effective_status = r.meta_effective_status,
        issues = coalesce(r.issues, a.issues), sincronizado_em = now()
      from conjuntos_ads s join campanhas_ads c on c.id = s.campanha_id
      where s.id = a.conjunto_id and c.conta_id = p_conta_id and a.meta_ad_id = r.meta_id;
    end if;
    get diagnostics n = row_count;
    aus := aus + n;
  end loop;

  update contas_ads set sincronizado_em = now() where id = p_conta_id;

  return jsonb_build_object(
    'campanhas', jsonb_build_object('novas', c_ins, 'atualizadas', c_upd),
    'conjuntos', jsonb_build_object('novos', s_ins, 'atualizados', s_upd),
    'anuncios', jsonb_build_object('novos', a_ins, 'atualizados', a_upd),
    'ausentes_atualizados', aus);
end $$;

do $$
declare f text;
begin
  foreach f in array array['meta_ids_da_conta(uuid)', 'meta_sincronizar(uuid, jsonb, jsonb, jsonb, jsonb)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
    begin
      execute format('grant execute on function %s to service_role', f);
    exception when undefined_object then null; end;
  end loop;
end $$;

-- ===== Storage: bucket privado 'ads-midia' (upload só por operadores logados) =====
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, allowed_mime_types)
    values ('ads-midia', 'ads-midia', false, array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime'])
    on conflict (id) do update set public = false, allowed_mime_types = excluded.allowed_mime_types;

    execute 'drop policy if exists ads_midia_ler on storage.objects';
    execute 'drop policy if exists ads_midia_enviar on storage.objects';
    execute 'drop policy if exists ads_midia_alterar on storage.objects';
    execute 'drop policy if exists ads_midia_apagar on storage.objects';
    execute $p$create policy ads_midia_ler on storage.objects for select to authenticated
      using (bucket_id = 'ads-midia' and (select public.sp_eh_operador()))$p$;
    execute $p$create policy ads_midia_enviar on storage.objects for insert to authenticated
      with check (bucket_id = 'ads-midia' and (select public.sp_eh_operador()))$p$;
    execute $p$create policy ads_midia_alterar on storage.objects for update to authenticated
      using (bucket_id = 'ads-midia' and (select public.sp_eh_operador()))$p$;
    execute $p$create policy ads_midia_apagar on storage.objects for delete to authenticated
      using (bucket_id = 'ads-midia' and (select public.sp_eh_operador()))$p$;
  end if;
end $$;

notify pgrst, 'reload schema';
