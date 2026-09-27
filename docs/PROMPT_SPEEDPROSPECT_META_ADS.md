# PROMPT — SpeedProspect Ads: módulo de Meta Ads com IA (Fases 8–14)

> **Como usar:** este comando complementa o `PROMPT_SPEEDPROSPECT.md` e assume as Fases 1–7 concluídas (mesmo repositório, mesmo Supabase, mesmo design system). Cole este arquivo no Claude Code e diga: *"Leia o PROMPT_SPEEDPROSPECT_META_ADS.md, execute a Fase 8 e pare."* Depois uma fase por vez. Na Lovable: cole as seções 1–7 no primeiro prompt e depois uma fase por prompt.
> Se for usar sem o SpeedProspect, crie antes as tabelas `configuracoes`, `leads` e `execucoes` do prompt original.

---

## 1. Papel e objetivo

Você é um engenheiro sênior full-stack **e** um gestor de tráfego pago sênior (media buyer) com experiência em Meta Ads para negócios locais no Brasil. Construa o módulo **SpeedProspect Ads**, que:

1. Conecta o sistema ao **Meta Marketing API** (Business Manager, contas de anúncio, Páginas, Instagram, WhatsApp, Pixel/Dataset).
2. Faz **pesquisa de nicho com IA** (dores, objeções, sazonalidade, concorrentes, ganchos) e monta **públicos frios, mornos e quentes** automaticamente, ranqueados por potencial.
3. Cria campanhas por um **wizard guiado por IA**: briefing → plano estratégico → públicos → criativos (copies, títulos, roteiros de vídeo) → orçamento → checagem de políticas → publicação **pausada** → ativação manual.
4. Sincroniza métricas diariamente e aplica **regras de otimização** (pausar, escalar, trocar criativo) no modo "sugerir" ou "automático".
5. Atende dois usos: **campanhas da própria agência** (vender sites/serviços para empresas da região) e **campanhas dos clientes** (donos dos sites entregues), com **cobrança de taxa de gestão e verba dentro do sistema** e relatórios compartilháveis.

Trabalhe fase por fase (seção 8+). Ao terminar cada fase: build/lint, resumo, critérios de aceite, **pare** e aguarde validação.

---

## 2. Regras inegociáveis

- **Tudo é criado com `status: PAUSED`.** Campanha, conjunto e anúncio só ficam ativos por ação explícita do operador no sistema. Nada ativa sozinho.
- **Ação automática permitida apenas: pausar.** Escalar orçamento, trocar público ou criar criativo exigem aprovação (modo "sugerir"). O modo "automático" existe só para regras de pausa e pode ser desligado por conta.
- **Tetos:** orçamento diário máximo por conta e gasto mensal máximo por cliente em `contas_ads`. O sistema recusa criar/editar acima do teto e pausa quando o saldo de verba do cliente acaba.
- **Token no servidor.** Token de System User em Supabase secret; toda chamada à Graph API sai de Edge Function. O front nunca vê token nem chama a Meta.
- **Versão da API fixa** em `META_API_VERSION` (usar a mais recente estável em https://developers.facebook.com/docs/graph-api/changelog). Antes de codar cada endpoint, **confirme parâmetros e enums na documentação atual** (https://developers.facebook.com/docs/marketing-apis). Os exemplos abaixo são a referência de estrutura, não substituem a doc.
- **Fotos do Google Places nunca vão para anúncios.** A licença não permite. Anúncios usam apenas mídia do próprio cliente (upload) ou da agência (prints das prévias, artes próprias).
- **Listas de clientes (custom audiences por telefone/e-mail) só com base legal:** clientes fechados, contatos que responderam ou opt-in. Nunca a base bruta coletada do Google Maps.
- **Políticas de anúncios da Meta:** checagem de conformidade obrigatória antes de publicar (seção 4.7). Categorias especiais (crédito, emprego, habitação, temas sociais) exigem `special_ad_categories` correto.
- **Idempotência:** IDs da Meta gravados no banco imediatamente após cada criação; retry nunca duplica objetos.
- **pt-BR** em tudo; moeda em centavos na API (`daily_budget: 3000` = R$ 30,00) e formatada como `R$ 30,00` na UI.

---

## 3. Pré-requisitos na Meta (checklist manual, gerar no README)

1. Business Manager (BM) da agência com **método de pagamento** configurado nas contas de anúncio (a API não cadastra cartão; isso é feito no Gerenciador de Anúncios).
2. App no Meta for Developers, tipo **Business**, com produto **Marketing API** e permissões `ads_management`, `ads_read`, `business_management`, `pages_show_list`, `pages_read_engagement`, `pages_manage_ads`, `leads_retrieval` (se usar formulários instantâneos), `instagram_basic`.
3. **System User** (admin) no BM com o app atribuído; gerar **token de acesso do System User** com as permissões acima e guardar em `META_SYSTEM_USER_TOKEN`. Atribuir ao System User as contas de anúncio, Páginas, Pixels e contas do Instagram que o sistema vai gerenciar.
4. Contas de clientes: adicionar a conta de anúncio/Página do cliente como **parceiro** no BM da agência (ou criar a conta dentro do BM). Gerenciar ativos fora do BM exige App Review/Acesso Avançado; evitar.
5. Cada Página que rodar anúncios de **WhatsApp** precisa do número do WhatsApp Business conectado à Página.
6. **Pixel/Dataset** criado por cliente (ou um da agência para as prévias) e instalado nos sites.
7. Domínio dos sites verificado no BM (recomendado para conversões).

---

## 4. Playbook do estrategista sênior (a inteligência que o sistema deve embutir)

Estas regras alimentam o system prompt da IA, os defaults do wizard e as regras de otimização. Implemente como constantes em `supabase/functions/_shared/ads-playbook.ts` e exiba as justificativas na UI ("por que a IA sugeriu isso").

### 4.1 Estrutura de campanha
- **1 campanha por objetivo por cliente.** Nomenclatura: `[CLIENTE] [OBJETIVO] [YYYY-MM] [vN]`; conjunto: `[PÚBLICO] [RAIO] [IDADE]`; anúncio: `[ÂNGULO] [FORMATO] [vN]`.
- Orçamento **< R$ 60/dia**: 1 conjunto **Advantage+ audience** (amplo) + 3–4 criativos. Orçamento **≥ R$ 60/dia**: campanha com **orçamento Advantage+ (CBO)** e 2–3 conjuntos: (a) amplo Advantage+, (b) interesses do nicho, (c) morno/quente ou lookalike quando houver base.
- Fase de aprendizado precisa de ~50 resultados/semana por conjunto: **não fragmentar** verba pequena em muitos conjuntos.
- Posicionamentos **Advantage+** por padrão; manual (Feed + Stories + Reels) só quando o criativo é exclusivamente 9:16.
- Lance: `LOWEST_COST_WITHOUT_CAP` no início; `COST_CAP` só com histórico ≥ 50 resultados/semana.
- Teste mínimo: **7 dias** ou 3× o CPA-alvo gastos antes de julgar um conjunto/criativo.

### 4.2 Temperatura de público
| Temperatura | Fonte | Uso |
|---|---|---|
| **Frio** | Advantage+ amplo; interesses e comportamentos do nicho; raio geográfico | Aquisição, maior volume |
| **Morno** | Engajamento com Página/Instagram (365 d), visualizou vídeo ≥ 25% (90 d), visitou site/prévia (pixel, 30–90 d), abriu conversa no WhatsApp (90 d) | Remarketing, CPA menor |
| **Quente** | Lista de clientes/contatos com base legal (hash SHA-256), quem clicou no WhatsApp (pixel evento `Contact`) | Oferta direta, reativação, exclusão em aquisição |
| **Lookalike** | 1–3% BR a partir do morno/quente com ≥ 1.000 pessoas (mínimo 100) | Só quando a base é grande; em raio local costuma render pouco |

O sistema cria os públicos mornos e quentes **automaticamente** para cada conta conectada e atualiza a "pontuação de potencial" (tamanho estimado × temperatura × recência) para ranquear na UI.

### 4.3 Defaults por nicho (ponto de partida; a IA ajusta pelo briefing)
| Nicho | Raio | Idade | Sementes de interesse/comportamento | Ângulos que funcionam | Destino |
|---|---|---|---|---|---|
| saude (dentista/clínica) | 10–15 km | 25–60 | saúde bucal, estética dental, plano odontológico, clínica | dor/urgência, estética (sem antes/depois), parcelamento, avaliação gratuita | WhatsApp |
| alimentacao | 5–8 km | 18–55 | delivery, pizza, restaurantes, comida japonesa | foto do prato, oferta do dia, reels de preparo, horário pré-refeição | WhatsApp / cardápio |
| automotivo | 15–25 km | 25–60 | carros, manutenção automotiva, pneus | revisão, orçamento grátis, honestidade, urgência | WhatsApp |
| beleza | 8–12 km | 18–50 | salão de beleza, barbearia, estética, unhas | transformação (respeitando políticas), agenda aberta, reels | WhatsApp / agendamento |
| servicos (reformas, elétrica, hidráulica) | 20–30 km | 25–65 | casa e jardim, reforma, construção | atendimento 24 h, orçamento grátis, garantia, "antes que piore" | WhatsApp |
| **agência (sites)** | 40–60 km + cidades vizinhas | 25–60 | empreendedorismo, pequenas empresas, marketing digital; comportamento "administradores de Página" | "sua empresa não aparece no Google", prévia real de site, preço de entrada, entrega em 5 dias | WhatsApp / LP |

Interesses são **nomes-semente**: o sistema resolve os IDs reais e o tamanho de público via Targeting Search (Fase 9) e descarta o que não existir.

### 4.4 Orçamento e metas
- Teste local: **R$ 20–50/dia por conjunto**. Abaixo de R$ 20/dia a entrega fica instável.
- CPA-alvo derivado do briefing: `ticket médio × margem × taxa de conversão conversa→cliente` (padrão 15% para serviços locais). Se o usuário não sabe, a IA estima e explica.
- Escala: **+20% a cada 48–72 h**, nunca mais que isso de uma vez (evita reiniciar aprendizado).

### 4.5 Criativos
- Matriz de teste inicial: **3 ângulos × 2 formatos** (imagem 1:1 ou 4:5 e vídeo 9:16 de 15–30 s). Ângulos: dor/problema, prova social, oferta/facilidade; extras: curiosidade, autoridade, urgência.
- Copy: **texto primário** com gancho na 1ª linha (≤ 125 caracteres antes do "ver mais"), 3 variações (curta/média/longa), estrutura PAS ou AIDA; **título** ≤ 40 caracteres; **descrição** ≤ 30; CTA coerente com o destino (`WHATSAPP_MESSAGE`, `LEARN_MORE`, `CONTACT_US`, `GET_QUOTE`, `BOOK_NOW`).
- Vídeo: hook nos **3 primeiros segundos**, legenda embutida, estilo UGC (celular, fala direta), CTA falado e escrito no final. O sistema entrega o **roteiro** (cenas, falas, texto na tela) para o cliente/agência gravar.
- Pouco texto na imagem; sem logos de terceiros; sem antes/depois em saúde/estética; sem promessas de resultado.
- **Fadiga:** frequência 7 d > 3,0 ou CTR caindo 30% em 7 dias → gerar nova rodada de criativos.

### 4.6 Regras de otimização padrão (`regras_otimizacao` semeadas na migration)
| # | Condição (janela) | Ação | Modo padrão |
|---|---|---|---|
| 1 | Anúncio gastou ≥ 2× CPA-alvo com 0 resultados (desde início) | Pausar anúncio | automático |
| 2 | CTR de link < 0,7% após ≥ 1.500 impressões (7 d) | Pausar anúncio + sugerir novo criativo | sugerir |
| 3 | Frequência > 3,0 (7 d) e CPA subiu ≥ 20% | Gerar nova rodada de criativos | sugerir |
| 4 | CPA ≤ 80% da meta por 3 dias seguidos e ≥ 5 resultados | +20% no orçamento (máx. 1×/dia) | sugerir |
| 5 | Conjunto com CPA ≥ 150% do melhor conjunto por 3 dias | Pausar conjunto e realocar verba | sugerir |
| 6 | Conjunto com < 7 dias ou < 50 resultados | Bloquear alterações de orçamento (exceto regra 1) | guarda |
| 7 | Anúncio reprovado / conta com problema / saldo do cliente < 3 dias de orçamento | Alerta + pausar campanhas do cliente (saldo) | automático |

### 4.7 Conformidade (checagem por IA antes de publicar)
Reprovar ou alertar: antes/depois e resultados corporais (saúde, estética, emagrecimento); promessas/garantias de resultado ou cura; atributos pessoais dirigidos ("você que tem diabetes", "está endividado?"); alegações médicas sem base; caixa alta e pontuação excessivas; marcas/logos de terceiros; conteúdo sensacionalista; mídia com texto excessivo. Detectar categoria especial (crédito, emprego, habitação, política) pelo briefing e exigir `special_ad_categories`.

### 4.8 Métricas e referências iniciais (calibrar com os próprios dados após 30 dias)
CPM R$ 8–30 · CTR de link 1–2% (bom > 1,5%) · hook rate (3 s / impressões) > 25% · custo por conversa de WhatsApp em serviços locais R$ 5–30 · conversa → cliente 10–30% · frequência semanal ideal 1,5–2,5. Métricas principais por objetivo: conversas iniciadas e custo por conversa; leads e CPL; visualizações da LP e custo por visualização; ROAS quando houver valor de venda.

---
## 5. Modelo de dados (migration do módulo)

```sql
do $$ begin
  create type ads_temperatura as enum ('frio','morno','quente','lookalike');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ads_status as enum ('rascunho','planejado','revisao','publicado_pausado','ativo','pausado','encerrado','erro');
exception when duplicate_object then null; end $$;

-- origem do lead (integra com o funil do SpeedProspect)
alter table leads add column if not exists origem text not null default 'google_maps'
  check (origem in ('google_maps','meta_ads','manual'));
alter table leads add column if not exists utm jsonb;
alter table leads add column if not exists valor_fechado numeric(12,2);

create table if not exists contas_ads (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null check (tipo in ('agencia','cliente')),
  lead_id uuid references leads(id) on delete set null,     -- cliente vindo do funil (opcional)
  meta_ad_account_id text not null unique,                   -- act_123...
  meta_business_id text,
  meta_page_id text, meta_page_nome text,
  meta_instagram_id text,
  meta_pixel_id text,
  whatsapp_numero text,                                      -- E.164 conectado à Página
  moeda text not null default 'BRL',
  fuso text not null default 'America/Sao_Paulo',
  teto_diario_centavos int not null default 10000,
  teto_mensal_centavos int not null default 200000,
  modo_otimizacao text not null default 'sugerir' check (modo_otimizacao in ('sugerir','automatico')),
  taxa_gestao_centavos int not null default 0,               -- mensalidade da agência
  taxa_gestao_percentual numeric(5,2) not null default 0,    -- % sobre a verba
  ativa boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists pesquisas_nicho (
  id uuid primary key default gen_random_uuid(),
  nicho text not null, cidade text not null,
  conteudo jsonb not null,                                   -- PesquisaNicho (seção 6.1)
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
  meta_audience_id text,                                     -- custom/lookalike criados na Meta
  targeting_spec jsonb,                                      -- para tipo 'salvo'
  tamanho_estimado_min bigint, tamanho_estimado_max bigint,
  pontuacao int not null default 0,
  origem text,                                               -- ia | manual | automatico
  justificativa text,
  atualizado_em timestamptz not null default now(),
  criado_em timestamptz not null default now()
);

create table if not exists campanhas_ads (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references contas_ads(id) on delete cascade,
  nome text not null,
  objetivo text not null check (objetivo in ('conversas_whatsapp','trafego_site','leads_site','formulario','vendas','reconhecimento')),
  briefing jsonb not null,                                   -- Briefing (seção 6.2)
  plano jsonb,                                               -- PlanoCampanha (seção 6.3)
  orcamento_tipo text not null default 'cbo' check (orcamento_tipo in ('cbo','abo')),
  orcamento_diario_centavos int,
  cpa_alvo_centavos int,
  inicio timestamptz, fim timestamptz,
  special_ad_categories text[] not null default '{}',
  meta_campaign_id text unique,
  status ads_status not null default 'rascunho',
  conformidade jsonb,                                        -- resultado da checagem
  erro text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists conjuntos_ads (
  id uuid primary key default gen_random_uuid(),
  campanha_id uuid not null references campanhas_ads(id) on delete cascade,
  publico_id uuid references publicos(id) on delete set null,
  nome text not null,
  targeting_spec jsonb not null,
  otimizacao text not null,                                  -- CONVERSATIONS | LANDING_PAGE_VIEWS | ...
  destino text not null,                                     -- WHATSAPP | WEBSITE | ON_AD
  orcamento_diario_centavos int,                             -- só em ABO
  posicionamentos text not null default 'advantage' check (posicionamentos in ('advantage','manual')),
  meta_adset_id text unique,
  status ads_status not null default 'rascunho',
  aprendizado_concluido boolean not null default false,
  criado_em timestamptz not null default now()
);

create table if not exists criativos_ads (
  id uuid primary key default gen_random_uuid(),
  conjunto_id uuid not null references conjuntos_ads(id) on delete cascade,
  nome text not null,
  angulo text not null,                                      -- dor | prova_social | oferta | curiosidade | autoridade | urgencia
  formato text not null check (formato in ('imagem_1x1','imagem_4x5','video_9x16','carrossel')),
  texto_primario text not null,
  variacoes_texto text[] not null default '{}',
  titulo text not null, descricao text,
  cta text not null,
  link_destino text,
  url_tags text,                                             -- utm_source=meta&utm_campaign={{campaign.name}}...
  midia_storage_path text,                                   -- Supabase Storage (bucket ads-midia)
  meta_image_hash text, meta_video_id text,
  roteiro_video jsonb,                                       -- cenas/falas quando formato vídeo
  meta_creative_id text, meta_ad_id text unique,
  status ads_status not null default 'rascunho',
  motivo_reprovacao text,
  criado_em timestamptz not null default now()
);

create table if not exists metricas_ads (
  id bigint generated always as identity primary key,
  conta_id uuid not null references contas_ads(id) on delete cascade,
  nivel text not null check (nivel in ('campanha','conjunto','anuncio')),
  ref_id uuid not null,                                      -- id local do objeto
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

create table if not exists relatorios_ads (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references contas_ads(id) on delete cascade,
  periodo_inicio date not null, periodo_fim date not null,
  resumo jsonb not null,                                     -- KPIs + narrativa da IA
  token_acesso text not null unique default encode(gen_random_bytes(8),'hex'),
  criado_em timestamptz not null default now()
);

create table if not exists notificacoes (
  id bigint generated always as identity primary key,
  tipo text not null, titulo text not null, corpo text, ref jsonb,
  lida boolean not null default false,
  criado_em timestamptz not null default now()
);

-- RLS igual ao módulo base
do $$ declare t text; begin
  foreach t in array array['contas_ads','pesquisas_nicho','publicos','campanhas_ads','conjuntos_ads','criativos_ads',
    'metricas_ads','regras_otimizacao','acoes_otimizacao','cobrancas_ads','relatorios_ads','notificacoes'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists auth_total on %I', t);
    execute format('create policy auth_total on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- relatório público por token
create or replace function get_relatorio_publico(p_token text) returns jsonb
language sql security definer stable set search_path = public as $$
  select jsonb_build_object('conta', c.nome, 'inicio', r.periodo_inicio, 'fim', r.periodo_fim, 'resumo', r.resumo)
  from relatorios_ads r join contas_ads c on c.id = r.conta_id where r.token_acesso = p_token;
$$;
revoke all on function get_relatorio_publico(text) from public;
grant execute on function get_relatorio_publico(text) to anon, authenticated;

-- semear as 7 regras da seção 4.6 como globais (conta_id null), idempotente por nome
-- bucket de Storage 'ads-midia' (privado; upload só autenticado)

notify pgrst, 'reload schema';
```

---

## 6. Contratos JSON (schemas zod em `_shared/ads-schemas.ts`, usados como `input_schema` das tools)

### 6.1 `PesquisaNicho` (tool `registrar_pesquisa_nicho`)
```json
{
  "resumo_mercado": "", "sazonalidade": [ { "mes": "", "observacao": "" } ],
  "dores": [""], "desejos": [""], "objecoes": [ { "objecao": "", "resposta": "" } ],
  "gatilhos": [""], "ganchos": [""],
  "concorrentes_padroes": [""],                          // como anunciam, o que prometem
  "interesses_semente": [""], "comportamentos_semente": [""],
  "faixa_etaria_sugerida": { "min": 25, "max": 60 }, "raio_km_sugerido": 15,
  "riscos_politica": [""], "fontes": [ { "titulo": "", "url": "" } ]
}
```

### 6.2 `Briefing` (preenchido no wizard)
```json
{
  "conta_id": "", "objetivo": "conversas_whatsapp",
  "negocio": { "nome": "", "nicho": "saude", "cidade": "", "lat": -20.81, "lng": -49.37, "raio_km": 15,
               "ticket_medio": 350, "margem_percentual": 40, "oferta": "", "diferenciais": [""], "servicos_foco": [""] },
  "orcamento_mensal": 1500, "cpa_alvo": null, "duracao_dias": 30,
  "ativos": { "lp_url": "", "whatsapp": "+55...", "pixel_id": "", "tem_fotos": true, "tem_videos": false, "instagram_ativo": true },
  "restricoes": [""], "publico_excluir": [""], "observacoes": ""
}
```

### 6.3 `PlanoCampanha` (tool `gerar_plano_campanha`)
```json
{
  "diagnostico": "",                                       // leitura do briefing em 3–5 linhas
  "objetivo_api": { "campanha": "OUTCOME_ENGAGEMENT", "otimizacao": "CONVERSATIONS", "destino": "WHATSAPP" },
  "orcamento": { "tipo": "cbo", "diario_centavos": 5000, "cpa_alvo_centavos": 2500, "justificativa": "" },
  "cronograma": { "teste_dias": 7, "decisao": "", "escala": "" },
  "conjuntos": [ { "nome": "", "temperatura": "frio", "estrategia": "advantage_amplo|interesses|morno|quente|lookalike",
                   "raio_km": 15, "idade_min": 25, "idade_max": 60, "generos": [1,2],
                   "interesses_semente": [""], "comportamentos_semente": [""], "exclusoes": [""],
                   "posicionamentos": "advantage", "justificativa": "" } ],
  "criativos": [ { "angulo": "dor", "formato": "imagem_1x1", "gancho": "", "texto_primario": ["","",""],
                   "titulo": "", "descricao": "", "cta": "WHATSAPP_MESSAGE",
                   "direcao_visual": "", "roteiro_video": null } ],
  "kpis": { "principal": "custo_por_conversa", "meta": "", "secundarios": [""] },
  "regras_kill_scale": [""], "riscos": [""], "proximos_passos": [""]
}
```

### 6.4 `RodadaCriativos` (tool `gerar_criativos`) — array de criativos no formato de 6.3, com `roteiro_video`:
```json
{ "duracao_s": 20, "cenas": [ { "t": "0-3s", "visual": "", "fala": "", "texto_tela": "" } ], "cta_final": "" }
```

### 6.5 `RegraCondicao`
```json
{ "nivel": "anuncio", "janela_dias": 7, "todas": [
  { "metrica": "gasto_centavos", "op": ">=", "valor": "2x_cpa_alvo" },
  { "metrica": "resultados", "op": "==", "valor": 0 } ] }
```
Métricas aceitas: `gasto_centavos, impressoes, frequencia, ctr_link, cpc_link_centavos, cpm_centavos, resultados, custo_por_resultado_centavos, dias_ativo`; valores podem referenciar `cpa_alvo`, `melhor_conjunto`, `media_conta`.

---

## 7. Mapeamento objetivo → Marketing API (confirmar enums na versão fixada)

| Objetivo no sistema | Campanha `objective` | Conjunto `optimization_goal` / `destination_type` / `promoted_object` | Criativo |
|---|---|---|---|
| conversas_whatsapp | `OUTCOME_ENGAGEMENT` (ou `OUTCOME_LEADS` com destino WhatsApp, se disponível na versão) | `CONVERSATIONS` / `WHATSAPP` / `{page_id}` | `call_to_action: {type: "WHATSAPP_MESSAGE"}`, `link_data.link: "https://api.whatsapp.com/send"` |
| trafego_site | `OUTCOME_TRAFFIC` | `LANDING_PAGE_VIEWS` (com pixel) ou `LINK_CLICKS` / `WEBSITE` / `{pixel_id}` opcional | `LEARN_MORE`, link da LP com `url_tags` |
| leads_site | `OUTCOME_LEADS` | `OFFSITE_CONVERSIONS` / `WEBSITE` / `{pixel_id, custom_event_type: "LEAD"}` | `LEARN_MORE` ou `GET_QUOTE` |
| formulario | `OUTCOME_LEADS` | `LEAD_GENERATION` / `ON_AD` / `{page_id}` | `lead_gen_form_id` (form criado na Página) |
| vendas | `OUTCOME_SALES` | `OFFSITE_CONVERSIONS` / `WEBSITE` / `{pixel_id, custom_event_type: "PURCHASE"}` | `SHOP_NOW` |
| reconhecimento | `OUTCOME_AWARENESS` | `REACH` / — / — | `LEARN_MORE` |

Parâmetros fixos: campanha `special_ad_categories` (obrigatório, `[]` quando não se aplica), `status: PAUSED`; conjunto `billing_event: IMPRESSIONS`, `bid_strategy: LOWEST_COST_WITHOUT_CAP`, `daily_budget` em centavos (só ABO; em CBO vai na campanha com `is_adset_budget_sharing`/`daily_budget` conforme a doc), `start_time`, `targeting`; criativo `object_story_spec { page_id, instagram_user_id?, link_data { image_hash | video_data, link, message, name, description, call_to_action } }`, opcional `degrees_of_freedom_spec` para melhorias Advantage+; anúncio `{ name, adset_id, creative: { creative_id }, status: PAUSED }`.

Exemplo de `targeting` (público frio Advantage+ com sementes):
```json
{
  "geo_locations": { "custom_locations": [ { "latitude": -20.8197, "longitude": -49.3794, "radius": 15, "distance_unit": "kilometer" } ] },
  "age_min": 25, "age_max": 60,
  "flexible_spec": [ { "interests": [ { "id": "<id>", "name": "Saúde bucal" } ] } ],
  "exclusions": { "custom_audiences": [ { "id": "<quente_id>" } ] },
  "targeting_automation": { "advantage_audience": 1 }
}
```

---
## 8. FASE 8 — Integração e contas (`_shared/meta.ts`, Edge Functions `meta-ativos`, `meta-sync`)

- `_shared/meta.ts`: cliente da Graph API com `META_API_VERSION`, token do System User, `GET/POST/DELETE`, **batch** (`/batch`, até 50 operações) para criar muitos criativos, retry com backoff exponencial (3 tentativas) e tratamento dos erros de limite (`code` 17, 32, 613, 80004 → esperar e reprocessar), log estruturado em `execucoes`.
- `meta-ativos`: lista o que o System User acessa: contas de anúncio (`/me/adaccounts?fields=id,name,currency,account_status,timezone_name,funding_source_details`), Páginas (`/me/accounts` com `instagram_business_account`), Pixels/Datasets (`/act_x/adspixels`), e valida se a Página tem WhatsApp conectado.
- `meta-sync`: importa campanhas/conjuntos/anúncios já existentes na conta (somente leitura, para o dashboard) e sincroniza `status` dos objetos criados pelo sistema.
- **Página `/ads/contas`:** conectar conta (escolher ad account + Página + Instagram + Pixel + WhatsApp), tipo agência/cliente, vínculo com lead fechado, tetos, modo de otimização, taxa de gestão. Indicador de saúde: método de pagamento, status da conta, WhatsApp conectado, pixel ativo (último evento recebido).
- Bucket `ads-midia` no Storage, upload de imagens/vídeos com validação (imagem ≥ 1080 px, vídeo ≤ 4 GB, proporções 1:1, 4:5, 9:16).

Critérios de aceite: contas reais listadas e conectadas; status e indicadores corretos; erro de token ou permissão mostra mensagem clara com o que corrigir no BM.

---

## 9. FASE 9 — Pesquisa de nicho e públicos inteligentes (`ads-pesquisar`, `ads-publicos`)

**`ads-pesquisar`:** para `nicho + cidade` (cache 30 dias em `pesquisas_nicho`), chama a Claude API **com a ferramenta de busca na web** (`tools: [{ type: "web_search_20250305", name: "web_search" }]` + tool `registrar_pesquisa_nicho`; confirmar o nome atual da ferramenta na doc da Anthropic) para produzir `PesquisaNicho`: dores, objeções, sazonalidade, padrões dos concorrentes, ganchos e sementes de público. Inclui link para a **Biblioteca de Anúncios da Meta** com a busca do nicho já preenchida (inspiração manual; não fazer scraping).

**`ads-publicos`** (roda ao conectar a conta e semanalmente):
1. **Mornos automáticos** via `POST /act_x/customaudiences`: engajamento com a Página (365 d), engajamento com o Instagram (365 d), visitantes do site/prévias pelo pixel (30, 90 e 180 d), quem iniciou conversa no WhatsApp pela Página (90 d), visualizou vídeo ≥ 25% (90 d). Guardar `meta_audience_id` e tamanho.
2. **Quentes**: lista de clientes (`subtype: CUSTOM`, `customer_file_source: USER_PROVIDED_ONLY`) a partir de leads `fechado`/`respondeu` da conta, telefones normalizados e **hash SHA-256** enviados em `POST /{audience_id}/users`. Só cria se o usuário marcar a base como "com base legal". Também: quem clicou em WhatsApp na prévia (evento `Contact` do pixel).
3. **Lookalike** (`subtype: LOOKALIKE`, `lookalike_spec: { type: "custom_ratio", ratio: 0.01–0.03, country: "BR" }`) apenas quando a origem tem ≥ 1.000 pessoas (avisar se < 1.000).
4. **Frios por IA**: sementes da pesquisa + tabela 4.3 → resolver via `GET /act_x/targetingsearch?q=<semente>` (ou `/search?type=adinterest`), guardar `id`, `name`, `audience_size_lower_bound/upper_bound`; enriquecer com `GET /act_x/targetingsuggestions`; montar 3–5 públicos salvos (amplo Advantage+, interesses principais, interesses secundários, comportamentos) e estimar alcance com `GET /act_x/delivery_estimate` (ou `reachestimate`).
5. **Pontuação** (0–100): temperatura (quente 40 / morno 30 / lookalike 20 / frio 10) + tamanho adequado ao raio (ideal 50 mil–1 mi para local) + recência + histórico de CPA quando existir. Ranquear e explicar em `justificativa`.

**Página `/ads/publicos`:** cards por temperatura com tamanho, pontuação, justificativa, origem, botões "Usar em campanha", "Recriar", "Excluir na Meta"; criação manual de público salvo com editor de `targeting_spec` (geo por raio no mapa, idade, gênero, interesses com autocomplete via `targetingsearch`, exclusões).

Critérios de aceite: pesquisa gerada e cacheada; públicos mornos criados de verdade na conta; interesses resolvidos com tamanho; ranking explicável.

---

## 10. FASE 10 — Wizard de campanha com IA (`ads-planejar`)

Rota `/ads/nova` (e `/ads/campanhas/:id/editar`), 7 passos com salvamento automático em `campanhas_ads` (status `rascunho` → `planejado` → `revisao`):

1. **Conta e objetivo** (cards com explicação de quando usar cada objetivo; padrão para negócio local: conversas no WhatsApp).
2. **Briefing** (formulário do 6.2; pré-preenchido com dados do lead/cliente e do site entregue: nome, nicho, cidade, coordenadas, telefone, LP, serviços). Botão "Pesquisar nicho" chama `ads-pesquisar` e mostra o resumo.
3. **Plano da IA**: `ads-planejar` chama a Claude API com system prompt = playbook da seção 4 + pesquisa do nicho + públicos disponíveis da conta (com tamanhos) e retorna `PlanoCampanha` via tool `gerar_plano_campanha`. Exibir diagnóstico, estrutura, orçamento, CPA-alvo, cronograma, KPIs e riscos, cada item com "por quê". Botões "Regenerar com instrução" e "Ajustar manualmente".
4. **Públicos**: um card por conjunto com o público sugerido (do ranking da Fase 9) e alternativas; editar raio/idade/interesses; mostrar alcance estimado.
5. **Criativos** (Fase 11).
6. **Orçamento e cronograma**: CBO/ABO, diário/vitalício, datas, validação contra tetos da conta e saldo do cliente, mínimo da Meta (validar pela resposta da API ao criar).
7. **Revisão e conformidade**: resumo completo, checagem 4.7, pendências bloqueantes vs. avisos, botão **"Publicar (pausado)"**.

System prompt de `ads-planejar` (incluir): persona de gestor de tráfego sênior BR; seguir o playbook; nunca inventar dados do negócio; justificar cada decisão em 1 frase; respeitar orçamento e tetos; adaptar raio à densidade da cidade; se `cpa_alvo` ausente, estimar por ticket × margem × 15%; sugerir no máximo 3 conjuntos; preferir Advantage+ quando a verba é baixa; listar riscos de política do nicho.

Critérios de aceite: plano coerente para 3 briefings diferentes (dentista, restaurante, agência); alterações manuais persistem; validações de teto funcionam.

---

## 11. FASE 11 — Criativos e conformidade (`ads-criativos`, `ads-conformidade`)

- **`ads-criativos`**: recebe briefing + plano + ângulos escolhidos → tool `gerar_criativos` produz a matriz **3 ângulos × 2 formatos** (configurável) com 3 variações de texto primário, título, descrição, CTA, direção visual e roteiro de vídeo (6.4). Respeita limites de caracteres (validar no zod; cortar não, regenerar).
- **Mídia**: por criativo, escolher do bucket (fotos/vídeos do cliente ou prints das prévias) ou fazer upload. Para a agência, botão "Gerar print da prévia" renderiza `/p/:slug` em 1080×1080 e 1080×1920 (mockup em celular) via Edge Function com renderizador headless, ou fallback manual de upload. Nunca oferecer fotos do Google.
- **Prévia do anúncio** no painel: mock de Feed e Stories/Reels com a mídia e os textos, contagem de caracteres, alerta de "ver mais".
- **`ads-conformidade`**: tool `avaliar_conformidade` retorna `{ aprovado, bloqueios: [{item, motivo, sugestao}], avisos: [...], categoria_especial: null|"CREDIT"|"EMPLOYMENT"|"HOUSING"|"ISSUES_ELECTIONS_POLITICS" }` analisando textos, descrição da mídia (se imagem: usar a capacidade de visão do modelo com a imagem em base64) e o nicho. Bloqueio impede publicar; aviso pede confirmação.
- **Nova rodada** a partir de um criativo vencedor: "Gerar variações deste" (mesmo ângulo, ganchos novos) e "Gerar rodada anti-fadiga" (ângulos não usados).

Critérios de aceite: criativos dentro dos limites; prévia fiel; anúncio com antes/depois é bloqueado; print da prévia gerado para campanha da agência.

---

## 12. FASE 12 — Publicação e gestão (`meta-publicar`, `meta-gerenciar`)

**`meta-publicar`** (ordem, cada passo grava o ID antes do próximo; falha no meio → retomar do ponto):
1. Upload de imagens (`POST /act_x/adimages` → `image_hash`) e vídeos (`POST /act_x/advideos`, aguardar `status.video_status = ready`).
2. Campanha (`POST /act_x/campaigns`) com objetivo, `special_ad_categories`, orçamento se CBO, `status: PAUSED`.
3. Conjuntos (`POST /act_x/adsets`) com `targeting`, otimização, destino, `promoted_object`, orçamento se ABO, `start_time`/`end_time`, `status: PAUSED`.
4. Criativos (`POST /act_x/adcreatives`) com `object_story_spec` (+ `instagram_user_id`, `url_tags` com UTMs dinâmicas `utm_source=meta&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}`).
5. Anúncios (`POST /act_x/ads`) em batch, `status: PAUSED`.
6. Marcar `publicado_pausado`, notificar, mostrar link para o Gerenciador de Anúncios.

**`meta-gerenciar`:** ativar/pausar (campanha, conjunto, anúncio) com confirmação; editar orçamento (respeitando tetos e regra de guarda 4.6 #6); duplicar campanha; encerrar; ler `effective_status`, `issues_info` e motivo de reprovação (`ad_review_feedback`) e refletir na UI.

**Página `/ads/campanhas/:id`:** cabeçalho com status real da Meta, orçamento, gasto, KPI principal; abas Conjuntos, Anúncios (com prévia e métricas), Sugestões (Fase 13), Histórico (todas as ações e quem/quando), Erros.

Critérios de aceite: campanha completa criada pausada e visível no Gerenciador; ativação pelo sistema funciona; reprovação da Meta aparece com motivo; retomada após falha não duplica.

---

## 13. FASE 13 — Métricas e otimização (`meta-insights`, `ads-otimizar`)

- **`meta-insights`** (cron diário 06:00 e botão manual): `GET /{id}/insights?level=ad&time_increment=1&time_range={...}&fields=spend,impressions,reach,frequency,inline_link_clicks,inline_link_click_ctr,cost_per_inline_link_click,cpm,actions,cost_per_action_type,video_thruplay_watched_actions,video_p25_watched_actions,...`. Mapear `actions` para colunas: conversas (`onsite_conversion.messaging_conversation_started_7d`), leads (`lead`, `onsite_conversion.lead_grouped`, `offsite_conversion.fb_pixel_lead`), visualizações de LP (`landing_page_view`), cliques de link. Agregar para conjunto e campanha. Guardar `bruto` para auditoria. Reprocessar os últimos 3 dias a cada execução (atribuição atrasada).
- **`ads-otimizar`** (cron diário 07:00): avalia `regras_otimizacao` ativas (globais + da conta) contra as métricas; gera `acoes_otimizacao` com justificativa numérica. Modo `automatico` → executa via `meta-gerenciar` e registra; `sugerir` → fica pendente; `guarda` → bloqueia ações conflitantes. Notificação por ação.
- **Sugestões com IA** (semanal): tool `analisar_desempenho` recebe 14 dias de métricas por anúncio/conjunto e devolve leitura executiva: vencedores, perdedores, hipóteses, próximos testes, nova rodada de criativos sugerida.
- **Página `/ads`** (dashboard): por conta e período: gasto, resultados, custo por resultado vs. meta, CTR, CPM, frequência, gráfico diário, ranking de anúncios, ações pendentes (aprovar/rejeitar em 1 clique), alertas.
- **Página `/ads/regras`:** CRUD de regras com editor de condição (6.5), teste "quantas ações essa regra geraria nos últimos 7 dias".

Critérios de aceite: métricas batem com o Gerenciador de Anúncios; regra 1 pausa automaticamente um anúncio de teste sem resultados; sugestão de escala respeita a guarda de aprendizado.

---

## 14. FASE 14 — Pixel/CAPI, UTMs, relatórios e cobrança

- **Pixel** nos templates de landing page (`/p/:slug` e sites entregues): `PageView`, `Contact` no clique do WhatsApp, `Lead` no "Quero esse site". **CAPI**: a Edge Function `track` existente passa a enviar os mesmos eventos para `POST /{pixel_id}/events` com `event_id` compartilhado (deduplicação), `fbp/fbc`, IP e user agent hasheados conforme a doc.
- **UTMs → funil:** `track` grava `utm` no evento; visita com `utm_source=meta` cria/atualiza lead com `origem = 'meta_ads'` (nome da campanha em `utm`), aparecendo no funil do SpeedProspect. Para formulários instantâneos: webhook `leadgen` (`meta-webhook`, verificar assinatura `X-Hub-Signature-256`) cria o lead com telefone e origem `meta_ads`.
- **Relatórios** (`ads-relatorio`, semanal e mensal): KPIs do período vs. anterior, top criativos, narrativa da IA em linguagem de cliente (o que foi feito, resultado, próximos passos), gráfico. Página pública `/r/:token` (via `get_relatorio_publico`) para enviar o link ao cliente pelo WhatsApp; exportar PDF.
- **Cobrança (Asaas, Edge Functions `cobranca-criar` e `cobranca-webhook`):** por conta cliente, gerar mensalmente a taxa de gestão (fixa e/ou % da verba) e as cobranças de verba (Pix, boleto ou cartão; `link_pagamento` e `pix_payload`); webhook atualiza `status`/`paga_em`. **Saldo de verba** = verba paga − gasto sincronizado; regra 4.6 #7 pausa as campanhas do cliente quando o saldo cobre menos de 3 dias. Página `/ads/financeiro`: saldo por cliente, cobranças, inadimplência, botão "Cobrar agora" e mensagem de WhatsApp pronta com o link. Observação obrigatória na UI: o pagamento à Meta é feito pelo cartão cadastrado na conta de anúncios (da agência ou do cliente); o sistema controla a cobrança do cliente e o saldo, não o cartão na Meta.

Critérios de aceite: evento `Contact` aparece no Gerenciador de Eventos com deduplicação; lead de anúncio entra no funil com origem correta; relatório público abre pelo token; cobrança Pix criada e baixada pelo webhook; saldo baixo pausa a campanha.

---

## 15. Campanha pronta: a própria agência vendendo sites (semear como modelo)

- **Objetivo:** conversas no WhatsApp. **Conta:** agência. **Raio:** 50 km da cidade base + cidades vizinhas relevantes. **Idade:** 25–60. **Público:** conjunto A Advantage+ amplo; conjunto B interesses "empreendedorismo, pequenas empresas, marketing digital" + comportamento "administradores de Página"; exclusão: clientes fechados.
- **Orçamento:** R$ 30–50/dia por 14 dias de teste; CPA-alvo: R$ 25 por conversa; meta: 20% conversa → cliente.
- **Criativos:** (1) *dor* — "Sua empresa tem nota alta no Google e nem site tem? Você está perdendo cliente pro concorrente." com print da prévia em celular; (2) *prova* — carrossel de 3 prévias reais (com autorização) "site pronto em 5 dias"; (3) *oferta* — vídeo 15 s UGC mostrando a prévia e o preço de entrada. CTA `WHATSAPP_MESSAGE` com mensagem inicial "Quero ver como ficaria o site da minha empresa".
- **Fluxo:** conversa chega no WhatsApp → operador cria o lead manualmente (origem `meta_ads`) ou usa formulário instantâneo com webhook → entra no funil → prévia gerada pelo pipeline normal.

---

## 16. Variáveis e segredos (adicionar aos existentes)

```
META_API_VERSION=            # ex.: vXX.0 (mais recente estável)
META_APP_ID=
META_APP_SECRET=
META_SYSTEM_USER_TOKEN=
META_WEBHOOK_VERIFY_TOKEN=
ASAAS_API_KEY=
ASAAS_WEBHOOK_TOKEN=
```

---

## 17. Checklist final do módulo

- [ ] Contas, Páginas, Instagram, Pixel e WhatsApp conectados com indicador de saúde
- [ ] Pesquisa de nicho com fontes; públicos mornos/quentes criados na Meta; frios resolvidos com tamanho e ranking explicável
- [ ] Wizard completo com plano da IA justificado, validação de tetos e conformidade bloqueante
- [ ] Criativos com matriz de teste, prévia fiel, roteiros de vídeo e prints de prévia
- [ ] Publicação pausada, idempotente, com status e reprovações espelhados da Meta
- [ ] Métricas diárias fiéis; regras de otimização em sugerir/automático com histórico
- [ ] Pixel + CAPI com deduplicação; UTMs alimentando o funil; webhook de formulários
- [ ] Relatório público por token; cobrança Asaas com saldo e pausa por saldo baixo
- [ ] Campanha modelo da agência semeada; README com checklist da Meta (seção 3)