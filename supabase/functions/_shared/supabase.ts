import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export function json(corpo: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', ...extra },
  });
}

/** Cliente com service role (ignora RLS) — só dentro das Edge Functions */
export function admin(): SupabaseClient {
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
export async function autorizarAdmin(req: Request, db: SupabaseClient): Promise<string | null> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (service && token === service) return 'service_role';
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.email ?? data.user.id;
}

/** Início do dia de hoje em America/Sao_Paulo, como ISO UTC */
export function inicioDoDiaSP(agora = new Date()): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(agora); // yyyy-mm-dd
  return new Date(`${partes}T00:00:00-03:00`).toISOString();
}
