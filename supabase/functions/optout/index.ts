// Edge Function pública `optout` — "Não quero receber propostas" (LGPD).
// POST { token, confirmar? }: sem confirmar só identifica a empresa; com confirmar=true despublica a prévia,
// marca o lead como "nao_contatar", bloqueia place_id/telefone para sempre e apaga mensagens pendentes.
// GET ?token=... executa direto (compatibilidade com /optout/:token).
import { z } from 'npm:zod@3';
import { admin, cors, json } from '../_shared/supabase.ts';
import { excedeuLimite, ipDe } from '../_shared/limite.ts';

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
