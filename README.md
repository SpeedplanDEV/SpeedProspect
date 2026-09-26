# SpeedProspect

Sistema interno de prospecção: busca empresas no Google Maps (Places API New), qualifica,
gera uma landing page de prévia com a Claude API e prepara a abordagem por WhatsApp (envio com 1 clique pelo operador).

> Status: **Fase 2 — Coleta** (Google Places API New, cache de 30 dias, página Leads).
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
