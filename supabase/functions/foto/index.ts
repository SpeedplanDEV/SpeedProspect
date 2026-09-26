// Edge Function pública `foto` — GET /foto?name=places/.../photos/...&w=1200
// Resolve a URL da foto no Places (skipHttpRedirect) e redireciona (302). Sem hotlink da API key.
import { cors } from '../_shared/supabase.ts';

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
