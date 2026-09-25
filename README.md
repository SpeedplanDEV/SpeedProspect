# SpeedProspect

Sistema interno de prospecção: busca empresas no Google Maps (Places API New), qualifica,
gera uma landing page de prévia com a Claude API e prepara a abordagem por WhatsApp (envio com 1 clique pelo operador).

> Status: **Fase 1 — Fundação** (painel, login, configurações, campanhas, execuções).
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
