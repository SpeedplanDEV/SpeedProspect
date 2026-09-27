// Edge Function `qualificar` — checa o site, calcula o score e decide qualificado/descartado.
// Sem lead_id: processa leads com status "novo". Com lead_id: requalifica aquele lead (ação manual).
import { z } from 'npm:zod@3';
import { admin, autorizarAdmin, cors, json } from '../_shared/supabase.ts';
import { checarSite } from '../_shared/site.ts';
import { calcularScore, motivoDescarte } from '../_shared/qualificacao.ts';
import { Execucao } from '../_shared/log.ts';

const Entrada = z
  .object({ lead_id: z.string().uuid().optional(), limite: z.number().int().min(1).max(300).optional() })
  .strict();

const CONCORRENCIA = 8;
const ORCAMENTO_MS = 110_000; // para antes do limite de tempo da Edge Function
// Só mexe no funil de leads que ainda não entraram na abordagem
const FUNIL_REQUALIFICAVEL = ['novo', 'qualificado', 'descartado'];

interface LeadQ {
  id: string;
  nome: string;
  website: string | null;
  rating: number | null;
  reviews_count: number;
  telefone: string | null;
  telefone_celular: boolean;
  horarios: unknown[] | null;
  status_negocio: string | null;
  status_funil: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ erro: 'Use POST' }, 405);

  const db = admin();
  const quem = await autorizarAdmin(req, db);
  if (!quem) return json({ erro: 'Não autorizado' }, 401);

  let entrada: z.infer<typeof Entrada>;
  try {
    const texto = await req.text();
    entrada = Entrada.parse(texto ? JSON.parse(texto) : {});
  } catch (e) {
    return json({ erro: 'Entrada inválida', detalhe: (e as Error).message }, 400);
  }

  const { data: cfg, error: eCfg } = await db
    .from('configuracoes')
    .select('score_minimo,prospectar_site_ok')
    .eq('id', 1)
    .single();
  if (eCfg) return json({ erro: eCfg.message }, 500);

  const campos = 'id,nome,website,rating,reviews_count,telefone,telefone_celular,horarios,status_negocio,status_funil';
  let q = db.from('leads').select(campos);
  q = entrada.lead_id
    ? q.eq('id', entrada.lead_id)
    : q.eq('status_funil', 'novo').order('coletado_em', { ascending: true }).limit(entrada.limite ?? 150);
  const { data: leads, error: eLeads } = await q;
  if (eLeads) return json({ erro: eLeads.message }, 500);
  if (!leads?.length) return json({ ok: true, processados: 0, qualificados: 0, descartados: 0, restantes: 0 });

  const ex = await new Execucao(db, 'qualificar').iniciar();
  ex.log('info', entrada.lead_id ? 'Requalificação manual' : `Qualificando ${leads.length} lead(s)`, { por: quem });
  const inicio = Date.now();
  const cont = { qualificados: 0, descartados: 0, sem_site: 0, site_fraco: 0, site_ok: 0 };
  const motivos: Record<string, number> = {};
  const fila = [...(leads as LeadQ[])];

  const trabalhar = async () => {
    while (fila.length && Date.now() - inicio < ORCAMENTO_MS) {
      const l = fila.shift()!;
      try {
        const { status, detalhe } = await checarSite(l.website);
        const dados = { ...l, status_site: status, horarios: Array.isArray(l.horarios) ? l.horarios : null };
        const { score } = calcularScore(dados);
        const motivo = motivoDescarte(dados, score, cfg);

        const upd: Record<string, unknown> = { status_site: status, detalhe_site: detalhe, score };
        if (FUNIL_REQUALIFICAVEL.includes(l.status_funil)) {
          upd.status_funil = motivo ? 'descartado' : 'qualificado';
          upd.motivo_descarte = motivo;
        }
        const { error } = await db.from('leads').update(upd).eq('id', l.id);
        if (error) throw new Error(error.message);

        cont[status]++;
        if (motivo) {
          cont.descartados++;
          motivos[motivo] = (motivos[motivo] ?? 0) + 1;
        } else cont.qualificados++;
        ex.itens++;
      } catch (e) {
        ex.log('erro', `Falha ao qualificar ${l.nome}`, { lead_id: l.id, erro: (e as Error).message });
      }
    }
  };

  try {
    await Promise.all(Array.from({ length: Math.min(CONCORRENCIA, fila.length) }, trabalhar));
    const restantes = fila.length;
    if (restantes) ex.log('aviso', `Tempo esgotado: ${restantes} lead(s) ficam para a próxima execução`);
    ex.log('info', 'Fim da qualificação', { ...cont, motivos_descarte: motivos });
    await ex.finalizar();
    return json({ ok: true, execucao_id: ex.id, processados: ex.itens, ...cont, motivos_descarte: motivos, restantes });
  } catch (e) {
    const msg = (e as Error).message;
    ex.log('erro', msg);
    await ex.finalizar(msg);
    return json({ erro: msg }, 500);
  }
});
