# SpeedProspect

Sistema interno de prospecção: busca empresas no Google Maps (Places API New), qualifica,
gera uma landing page de prévia com a Claude API e prepara a abordagem por WhatsApp (envio com 1 clique pelo operador).

> Status: **Fase 4 — Prévias com IA** (Claude API, 5 templates por nicho, rota pública, tracking e opt-out).
> O README completo de operação é entregue na Fase 7.

## Requisitos

- Node.js 20+
- Projeto no [Supabase](https://supabase.com) e [Supabase CLI](https://supabase.com/docs/guides/cli)

## Setup rápido

```bash
npm install
cp .env.example .env        # preencha VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY e VITE_APP_URL
```

### Banco de dados

```bash
supabase link --project-ref <ref-do-projeto>
supabase db push            # aplica supabase/migrations/*
```

As migrations são idempotentes (podem ser executadas mais de uma vez). Alternativa: colar o conteúdo de
`supabase/migrations/20260925000000_inicial.sql` no SQL Editor do Supabase.

### Usuário operador

O sistema é de uso único (1 operador). Crie o usuário em **Supabase → Authentication → Users → Add user**
(e-mail + senha, marcando “Auto confirm”). Recomenda-se desativar o cadastro público
(**Authentication → Providers → Email → Allow new users to sign up = off**).

### Rodar

```bash
npm run dev      # http://localhost:5173
npm run build    # typecheck + build de produção
npm run lint
```

## Rotas

| Rota | Acesso | Descrição |
|---|---|---|
| `/login` | pública | Login do operador |
| `/`, `/campanhas`, `/leads`, `/aprovacao`, `/envios`, `/funil`, `/execucoes`, `/configuracoes` | autenticada | Painel |
| `/p/:slug?k=<token>` | pública | Prévia da landing page (Fase 4) |
| `/optout/:token` | pública | “Não quero receber propostas” (Fase 4) |

Em produção, configure o servidor/CDN para responder `index.html` em qualquer rota (SPA fallback).

## Publicar na web (Vercel)

1. Em https://vercel.com, **Add New → Project** e importe o repositório `SpeedplanDEV/SpeedProspect`.
2. Em **Environment Variables**, adicione `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e `VITE_APP_URL`
   (a URL que a Vercel gerar, ex.: `https://speedprospect.vercel.app`).
3. **Deploy**. O `vercel.json` já configura o build do Vite e o fallback de rotas da SPA.
   (Netlify também funciona: `public/_redirects` faz o mesmo papel.)

## Fase 2 — Coleta (Edge Functions)

| Função | Acesso | O que faz |
|---|---|---|
| `coletar` | operador logado ou service role | Text Search do Places por campanha (termo + cidade e termo + bairro), até 3 páginas por consulta, grava/atualiza `leads` |
| `foto` | pública (60 req/min por IP) | `GET /foto?name=<photo.name>&w=1200` → redireciona (302) para a foto do Google, cache de 1 dia |

Regras da coleta:
- Cada página do Text Search conta 1 no `limite_buscas_dia` (somado em `execucoes.chamadas_api`).
- A mesma consulta não é repetida por 30 dias (`buscas_cache`); um `place_id` coletado há menos de 30 dias não é atualizado.
- `place_id` ou telefone em `bloqueios` são ignorados; empresas fora da cidade da campanha também.
- Custo estimado em R$ por execução (preço por SKU em `supabase/functions/_shared/places.ts`, cotação no secret `COTACAO_DOLAR`, padrão 5,50).

### Setup
1. Rode `supabase/migrations/20260926000000_fase2_coleta.sql` no SQL Editor.
2. Google Cloud: ative **Places API (New)**, crie uma API key restrita a ela (billing obrigatório).
3. Supabase → **Edge Functions → Secrets**: `GOOGLE_PLACES_API_KEY` (e opcionalmente `COTACAO_DOLAR`).
4. Deploy das funções, uma das opções:
   - GitHub Actions: crie um token em https://supabase.com/dashboard/account/tokens, salve como secret
     `SUPABASE_ACCESS_TOKEN` no repositório e rode **Actions → Deploy Edge Functions → Run workflow**
     (também roda sozinho a cada push em `supabase/functions`).
   - CLI: `supabase functions deploy --project-ref ruseutthqcknhkqpqmyj`

Testes: `npm test` (normalização de telefone, bairro/cidade e montagem das consultas).

## Fase 3 — Qualificação (Edge Function `qualificar`)

Processa leads `novo` (ou um lead específico com `{ "lead_id": "..." }` — botão "Requalificar").
Regras puras em `supabase/functions/_shared/qualificacao.ts` (as mesmas usadas pelo painel para auditar o score).

- **Checagem do site** (timeout 8 s, segue redirects, User-Agent de navegador): `sem_site`, `site_fraco`
  (rede social/link na bio/iFood/WhatsApp, http sem https, erro ≥ 400, DNS/TLS/timeout, sem meta viewport,
  HTML < 5 KB, título vazio ou de página padrão/"em construção") ou `site_ok`.
- **Score**: site (40/30/5) + nota (20/12/4) + volume `min(20, round(log10(n+1)·8))` + telefone (celular 15 / fixo 5) + horários 5.
- **Descartes**: não operacional, sem telefone, franquia/rede (lista em `FRANQUIAS`), `site_ok` sem `prospectar_site_ok`, score abaixo do mínimo.
- Em Campanhas, "Executar agora" coleta e já qualifica em seguida.

### Deploy pelo editor do painel
Sem CLI/token, gere os arquivos únicos com `node scripts/gerar-editor.mjs` e cole `supabase/editor/<função>.ts`
em Edge Functions → Deploy a new function → Via Editor (nome da função = nome do arquivo).

## Fase 4 — Prévias com IA, templates e página pública

### Geração (`gerar-previa`)
- Processa leads `qualificado` sem prévia (maior score primeiro) até `limite_geracoes_dia`; com `lead_id` gera um lead
  específico e com `regenerar: true` cria a versão seguinte (mesmo slug e mesmos links). Aceita `instrucao_extra`.
- **Claude API** via `fetch` (`_shared/anthropic.ts`): `tool_choice` forçado na ferramenta `gerar_conteudo_lp`
  (`strict: true`), system prompt estável com cache de prompt, retry com backoff em 429/5xx, custo em R$ por prévia
  (preços em `PRECOS_MTOK`; cotação no secret `COTACAO_DOLAR`).
- **A IA só escreve os textos.** Nome, endereço, telefone, nota, número de avaliações, horários e autor/nota/data dos
  depoimentos vêm dos dados reais do Google (`_shared/previa.ts`). Depoimentos só de avaliações reais com nota ≥ 4.
- Validação zod (`_shared/schemas.ts`); erros voltam para a IA corrigir (até 2 tentativas). Leads com 2 falhas saem
  do lote automático (`leads.falhas_previa`).
- Com **Aprovar prévias automaticamente** ligado: publica, cria a mensagem de primeiro contato e marca `aprovado`.

### Templates (`src/templates`)
Cinco identidades visuais (saúde, alimentação, automotivo, beleza, serviços), mobile-first, fotos reais pela função
`foto`, atribuição do Google e link de opt-out no rodapé. Veja todos em `/demo/saude` (menu **Modelos de página**).
Lighthouse mobile nos modelos: desempenho 99, acessibilidade 100, boas práticas 100.

### Página pública
- `/p/:slug?k=<token>`: barra fixa "Prévia criada especialmente para…" + botão **Quero esse site** (WhatsApp do
  operador); título/description do SEO; `noindex` (as prévias não aparecem no Google). Rascunhos só abrem com o token.
  `&interno=1` = visualização do operador, sem rastreio.
- `track` (pública): 1 visita por sessão por dia; visita pelo link enviado muda o lead `enviado` → `abriu`;
  "Quero esse site" promove para `abriu`.
- `/optout/:token` + função `optout`: com um clique de confirmação despublica a prévia, marca `nao_contatar`, bloqueia
  place_id/telefone e apaga mensagens pendentes.

### Setup da Fase 4
1. Rode `supabase/migrations/20260927000000_fase4_previas.sql` no SQL Editor.
2. Crie uma chave em https://console.anthropic.com (API Keys) e adicione créditos. No Supabase → Edge Functions →
   Secrets: `ANTHROPIC_API_KEY`.
3. Publique `gerar-previa`, `track` e `optout` (GitHub Actions ou editor: `supabase/editor/*.ts`).
4. Em Configurações do painel: **URL pública do app** (ex.: `https://speed-prospect-silk.vercel.app`), WhatsApp e nome do negócio.
5. Rode `supabase/migrations/20260928000000_previa_avaliacoes.sql` (avaliações positivas reais na prévia).
6. Fotos: o site busca as fotos por `/api/foto` (função da Vercel em `api/foto.ts`), que chama a Edge Function
   `foto` com a chave pública. Assim as fotos funcionam mesmo com "Verify JWT" ligado na função `foto`.

## Fase 5 — Aprovação e fila de envio

As ações do operador são funções SQL atômicas (migration `20260929000000_fase5_envios.sql`), chamadas pelo painel
com o usuário logado — não há Edge Function nova para publicar.

| Função | O que faz |
|---|---|
| `aprovar_previa(lead, texto)` | publica o site, cria/atualiza a mensagem `primeiro_contato` (fila de hoje) e marca o lead `aprovado` |
| `descartar_lead(lead, motivo)` | lead `descartado` com motivo, prévia despublicada, mensagens pendentes puladas |
| `registrar_envio(mensagem, texto)` | salva o texto final, marca `enviada`, lead `aprovado` → `enviado`, grava evento; recusa ao atingir `limite_envios_dia` (com trava contra cliques simultâneos) |
| `pular_mensagem(mensagem, motivo)` | marca `pulada` com motivo opcional |
| `resumo_envios()` | enviados hoje / limite (dia no fuso de São Paulo) |

### Aprovação (`/aprovacao`)
Fila de leads `previa_gerada` por score. Prévia ao vivo (celular / computador), ajustes rápidos (título, subtítulo,
tagline, serviços, cor principal — salvos em `sites.conteudo`), mensagem de primeiro contato editável, **Aprovar**,
**Regenerar** (com instrução extra para a IA, nova versão) e **Descartar** (com motivo).
Atalhos: `A` aprovar, `R` regenerar, `D` descartar, `←`/`→` navegar, `Esc` fecha o painel.

### Envios (`/envios`)
Abas **Primeiro contato** e **Follow-ups de hoje**, contador `enviados hoje / limite`. Cada item: telefone formatado,
aviso de telefone fixo, texto editável (salvo ao sair do campo), **Abrir WhatsApp** (abre `wa.me` numa nova aba e
registra o envio — quem envia é o operador), **Copiar** e **Pular**. Leads `nao_contatar`, `descartado` e `perdido`
nunca aparecem. O menu lateral mostra quantas prévias aguardam aprovação e quantas mensagens estão na fila.

### Setup da Fase 5
1. Rode `supabase/migrations/20260929000000_fase5_envios.sql` no SQL Editor.
2. Confira em Configurações: **URL pública do app**, **nome do negócio** (assinatura das mensagens) e **envios / dia**.

### Logo da agência
Configurações → **Logo da agência**: a imagem é reduzida no navegador e fica em `configuracoes.negocio_logo`
(data URL, até ~400 KB). Aparece na barra do topo de todas as prévias; sem logo, aparecem as iniciais do nome.
Requer `supabase/migrations/20260930000000_logo_agencia.sql`.

## Fase 6 — Follow-ups, funil e dashboard

Tudo em funções SQL (migration `20261001000000_fase6_funil.sql`) — sem Edge Function nova para publicar.

| Função | O que faz |
|---|---|
| `agendar_followups()` | só agenda (nunca envia): follow-up 1 dois dias após o primeiro contato (texto diferente se o lead abriu), follow-up 2 três dias após o follow-up 1, lead `perdido` (`sem_resposta`) cinco dias após o follow-up 2, prévia despublicada 30 dias depois; pula follow-ups pendentes de quem avançou no funil. Idempotente; registra em Execuções quando cria algo |
| `mover_lead(lead, status, valor)` | muda a etapa no kanban (e o valor fechado) |
| `painel_dashboard(mes)` | números do mês, série de 30 dias, leads quentes e erros |

- **Histórico de status** (`historico_status`, preenchido por trigger): base do funil do dashboard — cada lead conta
  no mês em que alcançou a etapa pela primeira vez. Leads anteriores entram com o status atual.
- **Envios** roda `agendar_followups()` ao abrir a tela (a Fase 7 agenda também pelo cron às 08:00) e tem o botão
  **Verificar follow-ups agora** na aba Follow-ups.
- **Funil (`/funil`)**: kanban Enviado → Abriu → Respondeu → Negociando → Fechado (+ Perdido recolhido); arrastar ou
  botão ⇄ para mover; ao fechar, pede o valor (`leads.valor_fechado`); card com score, último evento, dias sem
  contato e botão do WhatsApp.
- **Dashboard (`/`)**: cards do mês (coletados, qualificados, prévias, enviados, abriram, responderam, fechados,
  receita, custo estimado, custo por fechamento), funil com conversão entre etapas, gráfico envios × aberturas
  (30 dias, com tabela), leads quentes (abriram nas últimas 48 h) e últimas execuções com erro. Seletor de mês.

### Setup da Fase 6
Rode `supabase/migrations/20261001000000_fase6_funil.sql` no SQL Editor.
