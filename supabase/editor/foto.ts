// SpeedProspect — Edge Function `foto` (arquivo único para o editor do Supabase)
// Gerado por scripts/gerar-editor.mjs a partir de supabase/functions — não edite à mão.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

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

// ===== foto/index.ts =====
// Edge Function pública `foto` — GET /foto?name=places/.../photos/...&w=1200
// Resolve a URL da foto no Places (skipHttpRedirect) e redireciona (302). Sem hotlink da API key.
const NOME_VALIDO = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;
const LIMITE_POR_MINUTO = 60;
const acessos = new Map<string, { inicio: number; n: number }>();

function limitado(ip: string): boolean {
  const agora = Date.now();
  const a = acessos.get(ip);
  if (!a || agora - a.inicio > 60_000) {
    acessos.set(ip, { inicio: agora, n: 1 });
    if (acessos.size > 5000) acessos.clear();
    return false;
  }
  a.n++;
  return a.n > LIMITE_POR_MINUTO;
}

const texto = (msg: string, status: number) =>
  new Response(msg, { status, headers: { ...cors, 'Content-Type': 'text/plain; charset=utf-8' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'GET') return texto('Use GET', 405);

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'desconhecido';
  if (limitado(ip)) return texto('Muitas requisições', 429);

  const url = new URL(req.url);
  const nome = url.searchParams.get('name') ?? '';
  if (!NOME_VALIDO.test(nome)) return texto('Parâmetro name inválido', 400);
  const w = Math.min(1600, Math.max(100, Number(url.searchParams.get('w')) || 1200));

  const chave = Deno.env.get('GOOGLE_PLACES_API_KEY');
  if (!chave) return texto('GOOGLE_PLACES_API_KEY não configurado', 500);

  const r = await fetch(
    `https://places.googleapis.com/v1/${nome}/media?maxWidthPx=${w}&skipHttpRedirect=true`,
    { headers: { 'X-Goog-Api-Key': chave } },
  );
  if (!r.ok) return texto(`Foto indisponível (${r.status})`, r.status === 404 ? 404 : 502);
  const { photoUri } = (await r.json()) as { photoUri?: string };
  if (!photoUri) return texto('Foto indisponível', 404);

  return new Response(null, {
    status: 302,
    headers: { ...cors, Location: photoUri, 'Cache-Control': 'public, max-age=86400' },
  });
});
