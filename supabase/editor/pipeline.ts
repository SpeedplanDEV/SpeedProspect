// SpeedProspect — Edge Function `pipeline` (arquivo único para o editor do Supabase)
// Gerado por scripts/gerar-editor.mjs a partir de supabase/functions — não edite à mão.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';

// ===== _shared/supabase.ts =====
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(corpo: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', ...extra },
  });
}

/** Cliente com service role (ignora RLS) — só dentro das Edge Functions */
function admin(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const chave = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !chave) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes');
  return createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * Funções administrativas aceitam:
 *  - Authorization: Bearer <SERVICE_ROLE_KEY> (cron / pipeline)
 *  - Authorization: Bearer <JWT do operador logado> (botão "Executar agora"), se o e-mail estiver em `operadores`
 */
async function autorizarAdmin(req: Request, db: SupabaseClient): Promise<string | null> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (service && token === service) return 'service_role';
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  // Só operadores cadastrados (tabela `operadores`, Fase 7). Lista vazia ou tabela ainda inexistente = libera.
  const { data: ops, error: eOps } = await db.from('operadores').select('email').limit(500);
  const email = (data.user.email ?? '').toLowerCase();
  if (!eOps && ops?.length && !ops.some((o) => o.email === email)) return null;
  return data.user.email ?? data.user.id;
}

/** Início do dia de hoje em America/Sao_Paulo, como ISO UTC */
function inicioDoDiaSP(agora = new Date()): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(agora); // yyyy-mm-dd
  return new Date(`${partes}T00:00:00-03:00`).toISOString();
}

// ===== _shared/enderecos.ts =====
// Endereço real de cada Edge Function no projeto. Funções criadas pelo editor do painel do Supabase ficam
// com o endereço sugerido por ele (não dá para renomear depois). Arquivo puro: usado pelo painel e pelo pipeline.

const ENDERECO_FUNCOES: Record<string, string> = {
  'gerar-previa': 'quick-handler',
  track: 'smart-responder',
  optout: 'super-endpoint',
};

const enderecoFuncao = (nome: string) => ENDERECO_FUNCOES[nome] ?? nome;

// ===== pipeline/index.ts =====
// Edge Function `pipeline` — orquestra uma etapa por chamada: POST { etapa: 'coletar' | 'qualificar' | 'gerar' | 'followups' }
// Chamada pelo pg_cron (Authorization: Bearer <SERVICE_ROLE_KEY>, lido do Vault) ou pelo operador logado.
// Pelo cron, só roda com a automação ligada em Configurações. Falhas ficam registradas em Execuções.
const Entrada = z.object({ etapa: z.enum(['coletar', 'qualificar', 'gerar', 'followups']) }).strict();
type Etapa = z.infer<typeof Entrada>['etapa'];

/** Função que executa cada etapa (nome canônico; o endereço real vem de enderecos.ts) */
const FUNCAO: Record<Exclude<Etapa, 'followups'>, string> = { coletar: 'coletar', qualificar: 'qualificar', gerar: 'gerar-previa' };

const TENTATIVAS = 3;
const PRAZO_MS = 140_000; // a Edge Function é encerrada em ~150 s

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Chama a função da etapa com a service role; 3 tentativas com backoff em erro de rede/5xx */
async function chamarEtapa(nome: string, prazo: number): Promise<{ status: number; corpo: unknown }> {
  const base = `${Deno.env.get('SUPABASE_URL')}/functions/v1`;
  const chave = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const enderecos = [...new Set([enderecoFuncao(nome), nome])];
  let ultimo: { status: number; corpo: unknown } = { status: 0, corpo: null };

  for (let t = 0; t < TENTATIVAS; t++) {
    if (t) await espera(2000 * 2 ** (t - 1));
    const restante = prazo - Date.now();
    if (restante < 5000) break;
    try {
      for (const endereco of enderecos) {
        const r = await fetch(`${base}/${endereco}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${chave}`, apikey: chave, 'Content-Type': 'application/json' },
          body: '{}',
          signal: AbortSignal.timeout(restante),
        });
        const texto = await r.text();
        let corpo: unknown = texto;
        try {
          corpo = JSON.parse(texto);
        } catch { /* resposta não-JSON */ }
        ultimo = { status: r.status, corpo };
        if (r.status === 404 && endereco !== nome) continue; // endereço antigo: tenta o nome canônico
        break;
      }
      if (ultimo.status < 500) return ultimo; // sucesso ou erro do pedido (não adianta repetir)
    } catch (e) {
      ultimo = { status: 0, corpo: e instanceof Error ? e.message : String(e) };
    }
  }
  return ultimo;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ erro: 'Use POST' }, 405);
  const inicio = Date.now();
  const db = admin();

  const quem = await autorizarAdmin(req, db);
  if (!quem) return json({ erro: 'Não autorizado' }, 401);

  let etapa: Etapa;
  try {
    etapa = Entrada.parse(await req.json()).etapa;
  } catch {
    return json({ erro: 'Entrada inválida. Envie { "etapa": "coletar" | "qualificar" | "gerar" | "followups" }' }, 400);
  }

  // O cron respeita o interruptor de Configurações; o operador pode rodar sempre
  if (quem === 'service_role') {
    const { data: cfg } = await db.from('configuracoes').select('automacao_ativa').eq('id', 1).single();
    if (!cfg?.automacao_ativa) return json({ ok: true, etapa, ignorado: 'Automação desligada em Configurações' });
  }

  let status = 200;
  let resultado: unknown;
  if (etapa === 'followups') {
    const { data, error } = await db.rpc('agendar_followups');
    status = error ? 500 : 200;
    resultado = error ? error.message : data;
  } else {
    const r = await chamarEtapa(FUNCAO[etapa], inicio + PRAZO_MS);
    status = r.status;
    resultado = r.corpo;
  }

  const ok = status >= 200 && status < 300;
  if (!ok) {
    const detalhe = typeof resultado === 'string' ? resultado : JSON.stringify(resultado);
    await db.from('execucoes').insert({
      etapa,
      finalizado_em: new Date().toISOString(),
      sucesso: false,
      erro: `Pipeline (${quem === 'service_role' ? 'automático' : 'manual'}): etapa "${etapa}" falhou${status ? ` (HTTP ${status})` : ''} — ${detalhe.slice(0, 500)}`,
      log: [{ em: new Date().toISOString(), nivel: 'erro', msg: 'Falha no pipeline', status, tentativas: TENTATIVAS }],
    });
  }
  return json({ ok, etapa, status, resultado, segundos: Math.round((Date.now() - inicio) / 100) / 10 }, ok ? 200 : 502);
});
