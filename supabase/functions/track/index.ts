// Edge Function pública `track` — registra visitas e cliques das prévias.
// POST { slug, token?, tipo, sessao }. 1 visita por sessão por dia; visita pelo link enviado marca o lead como "abriu".
import { z } from 'npm:zod@3';
import { admin, cors, inicioDoDiaSP, json } from '../_shared/supabase.ts';
import { excedeuLimite, ipDe } from '../_shared/limite.ts';

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
