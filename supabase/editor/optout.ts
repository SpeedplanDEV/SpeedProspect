// SpeedProspect — Edge Function `optout` (arquivo único para o editor do Supabase)
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
 *  - Authorization: Bearer <JWT do operador logado> (botão "Executar agora")
 */
async function autorizarAdmin(req: Request, db: SupabaseClient): Promise<string | null> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (service && token === service) return 'service_role';
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.email ?? data.user.id;
}

/** Início do dia de hoje em America/Sao_Paulo, como ISO UTC */
function inicioDoDiaSP(agora = new Date()): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(agora); // yyyy-mm-dd
  return new Date(`${partes}T00:00:00-03:00`).toISOString();
}

// ===== _shared/limite.ts =====
// Rate limit simples em memória por IP (por instância da Edge Function)
const janelas = new Map<string, { inicio: number; n: number }>();

function ipDe(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('cf-connecting-ip') || 'desconhecido';
}

/** true quando o IP passou de `limite` requisições no último minuto */
function excedeuLimite(ip: string, limite = 60): boolean {
  const agora = Date.now();
  const j = janelas.get(ip);
  if (!j || agora - j.inicio > 60_000) {
    if (janelas.size > 10_000) janelas.clear();
    janelas.set(ip, { inicio: agora, n: 1 });
    return false;
  }
  j.n++;
  return j.n > limite;
}

// ===== optout/index.ts =====
// Edge Function pública `optout` — "Não quero receber propostas" (LGPD).
// POST { token, confirmar? }: sem confirmar só identifica a empresa; com confirmar=true despublica a prévia,
// marca o lead como "nao_contatar", bloqueia place_id/telefone para sempre e apaga mensagens pendentes.
// GET ?token=... executa direto (compatibilidade com /optout/:token).
const Entrada = z.object({ token: z.string().trim().min(8).max(64), confirmar: z.boolean().optional() }).strict();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (excedeuLimite(ipDe(req), 30)) return json({ erro: 'Muitas requisições' }, 429);

  let e: z.infer<typeof Entrada>;
  try {
    e = req.method === 'GET'
      ? Entrada.parse({ token: new URL(req.url).searchParams.get('token') ?? '', confirmar: true })
      : Entrada.parse(await req.json());
  } catch {
    return json({ erro: 'Link inválido' }, 400);
  }

  const db = admin();
  const { data: site } = await db.from('sites').select('id,lead_id').eq('token_optout', e.token).maybeSingle();
  if (!site) return json({ erro: 'Link inválido ou expirado' }, 404);
  const { data: lead } = await db.from('leads').select('id,nome,place_id,telefone,status_funil').eq('id', site.lead_id).single();
  if (!lead) return json({ erro: 'Link inválido ou expirado' }, 404);

  if (!e.confirmar) return json({ ok: true, nome: lead.nome, ja_removido: lead.status_funil === 'nao_contatar' });

  const erros: string[] = [];
  const passo = async (p: PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await p;
    if (error) erros.push(error.message);
  };
  await passo(db.from('sites').update({ publicado: false }).eq('lead_id', lead.id));
  await passo(db.from('leads').update({ status_funil: 'nao_contatar', motivo_descarte: 'optout' }).eq('id', lead.id));
  await passo(db.from('bloqueios').upsert({ place_id: lead.place_id, telefone: lead.telefone, motivo: 'optout' }, { onConflict: 'place_id' }));
  await passo(db.from('mensagens').delete().eq('lead_id', lead.id).eq('status', 'pendente'));
  if (lead.status_funil !== 'nao_contatar') {
    await passo(db.from('eventos').insert({ site_id: site.id, lead_id: lead.id, tipo: 'optout', sessao: null }));
  }
  if (erros.length) return json({ erro: 'Não foi possível concluir. Tente novamente.', detalhe: erros }, 500);
  return json({ ok: true, nome: lead.nome });
});
