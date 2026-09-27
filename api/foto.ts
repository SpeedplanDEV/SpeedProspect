// Proxy da foto na Vercel: tags <img> não enviam cabeçalho de autorização, e a Edge Function `foto`
// pode estar com "Verify JWT" ligado. Aqui a chamada vai com a chave anon (pública) e o 302 é repassado.
export const config = { runtime: 'edge' };

const SUPABASE_URL = process.env.VITE_SUPABASE_URL?.trim() || 'https://ruseutthqcknhkqpqmyj.supabase.co';
const ANON =
  process.env.VITE_SUPABASE_ANON_KEY?.trim() ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1c2V1dHRocWNrbmhrcXBxbXlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0MjM2NTQsImV4cCI6MjEwNTk5OTY1NH0.JlBT3-kgulo-SSGk2Vs_Z7qvFGmT7fvO4u0bbUiOujs';

const NOME_VALIDO = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const nome = url.searchParams.get('name') ?? '';
  if (!NOME_VALIDO.test(nome)) return new Response('Parâmetro name inválido', { status: 400 });
  const w = Math.min(1600, Math.max(100, Number(url.searchParams.get('w')) || 1200));

  const r = await fetch(`${SUPABASE_URL}/functions/v1/foto?name=${encodeURIComponent(nome)}&w=${w}`, {
    headers: {
      Authorization: `Bearer ${ANON}`,
      apikey: ANON,
      'x-forwarded-for': req.headers.get('x-forwarded-for') ?? '',
    },
    redirect: 'manual',
  });
  const destino = r.headers.get('location');
  if (r.status >= 300 && r.status < 400 && destino) {
    return new Response(null, {
      status: 302,
      headers: { Location: destino, 'Cache-Control': 'public, max-age=3600, s-maxage=86400' },
    });
  }
  return new Response(await r.text(), {
    status: r.status === 404 ? 404 : 502,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
