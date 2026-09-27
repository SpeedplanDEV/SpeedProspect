// SpeedProspect — Edge Function `track` (arquivo único para o editor do Supabase)
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

// ===== track/index.ts =====
// Edge Function pública `track` — registra visitas e cliques das prévias.
// POST { slug, token?, tipo, sessao }. 1 visita por sessão por dia; visita pelo link enviado marca o lead como "abriu".
const Entrada = z
  .object({
    slug: z.string().trim().min(1).max(120),
    token: z.string().trim().max(64).nullish(),
    tipo: z.enum(['visita', 'clique_whatsapp', 'clique_quero']),
    sessao: z.string().trim().min(8).max(64),
  })
  .strict();

// Status que ainda não chegaram em "abriu" (clique em "Quero esse site" sempre promove para "abriu")
const ANTES_DE_ABRIU = ['novo', 'qualificado', 'previa_gerada', 'aprovado', 'enviado', 'perdido'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ erro: 'Use POST' }, 405);
  if (excedeuLimite(ipDe(req))) return json({ erro: 'Muitas requisições' }, 429);

  let e: z.infer<typeof Entrada>;
  try {
    e = Entrada.parse(await req.json());
  } catch {
    return json({ erro: 'Entrada inválida' }, 400);
  }

  const db = admin();
  const { data: site } = await db.from('sites').select('id,lead_id,token_acesso,publicado').eq('slug', e.slug).maybeSingle();
  if (!site) return json({ erro: 'Prévia não encontrada' }, 404);
  if (!site.publicado) return json({ ok: true, ignorado: 'prévia não publicada' });

  const viaLink = !!e.token && e.token === site.token_acesso;

  if (e.tipo === 'visita') {
    const { data: jaVisitou } = await db
      .from('eventos')
      .select('id')
      .eq('site_id', site.id)
      .eq('sessao', e.sessao)
      .eq('tipo', 'visita')
      .gte('criado_em', inicioDoDiaSP())
      .limit(1);
    if (jaVisitou?.length) return json({ ok: true, duplicado: true });
  }

  const { error } = await db.from('eventos').insert({
    site_id: site.id,
    lead_id: site.lead_id,
    tipo: e.tipo,
    via_link: viaLink,
    sessao: e.sessao,
    user_agent: (req.headers.get('user-agent') ?? '').slice(0, 300),
  });
  if (error) return json({ erro: error.message }, 500);

  const { data: lead } = await db.from('leads').select('status_funil').eq('id', site.lead_id).maybeSingle();
  const status = lead?.status_funil;
  const abriu =
    (e.tipo === 'visita' && viaLink && status === 'enviado') ||
    (e.tipo === 'clique_quero' && !!status && ANTES_DE_ABRIU.includes(status));
  if (abriu) await db.from('leads').update({ status_funil: 'abriu' }).eq('id', site.lead_id);

  return json({ ok: true, abriu });
});
