// Edge Function `ranking` — posição do lead na busca oficial do Google (Places API Text Search) e concorrentes à frente.
// Regras: só API oficial (sem scraping), conta no limite diário de buscas, reaproveita consultas dos últimos 7 dias.
import { z } from 'npm:zod@3';
import { admin, autorizarAdmin, cors, inicioDoDiaSP, json } from '../_shared/supabase.ts';
import { FIELD_MASK_RANKING, buscarPagina, custoBuscaBRL, type PlaceBruto } from '../_shared/places.ts';
import { consultaRanking, itensDoRanking, posicaoDe } from '../_shared/ranking.ts';
import { Execucao } from '../_shared/log.ts';

const MAX_PAGINAS = 3; // até 60 empresas
const DIAS_CACHE = 7;

const Entrada = z
  .object({
    lead_id: z.string().uuid(),
    termo: z.string().trim().min(2).max(80).optional(),
    atualizar: z.boolean().optional(),
  })
  .strict();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ erro: 'Use POST' }, 405);

  const db = admin();
  const quem = await autorizarAdmin(req, db);
  if (!quem) return json({ erro: 'Não autorizado' }, 401);

  let entrada: z.infer<typeof Entrada>;
  try {
    entrada = Entrada.parse(await req.json());
  } catch (e) {
    return json({ erro: 'Entrada inválida', detalhe: (e as Error).message }, 400);
  }

  const { data: lead, error: eLead } = await db
    .from('leads')
    .select('id,nome,place_id,cidade,campanha_id,rating,reviews_count')
    .eq('id', entrada.lead_id)
    .single();
  if (eLead || !lead) return json({ erro: 'Lead não encontrado' }, 404);

  const { data: camp } = lead.campanha_id
    ? await db.from('campanhas').select('termos_busca,cidade,uf').eq('id', lead.campanha_id).maybeSingle()
    : { data: null };
  const termo = entrada.termo || camp?.termos_busca?.[0];
  if (!termo) return json({ erro: 'Informe o termo de busca (ex.: dentista)' }, 400);
  const consulta = consultaRanking(termo, camp?.cidade || lead.cidade, camp?.uf ?? '');

  // Consulta recente → não gasta busca
  if (!entrada.atualizar) {
    const { data: recente } = await db
      .from('rankings')
      .select('*')
      .eq('lead_id', lead.id)
      .eq('consulta', consulta)
      .gte('criado_em', new Date(Date.now() - DIAS_CACHE * 864e5).toISOString())
      .order('criado_em', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recente) return json({ ok: true, em_cache: true, lead: { nome: lead.nome, place_id: lead.place_id }, ...recente });
  }

  // Limite diário de buscas (compartilhado com a coleta)
  const { data: cfg } = await db.from('configuracoes').select('limite_buscas_dia').eq('id', 1).single();
  const { data: hoje } = await db
    .from('execucoes')
    .select('chamadas_api')
    .in('etapa', ['coletar', 'ranking'])
    .gte('iniciado_em', inicioDoDiaSP());
  const usadas = (hoje ?? []).reduce((s, x) => s + (x.chamadas_api ?? 0), 0);
  let restante = Math.max(0, (cfg?.limite_buscas_dia ?? 0) - usadas);
  if (restante <= 0) return json({ erro: 'Limite diário de buscas no Google atingido. Aumente em Configurações ou tente amanhã.' }, 429);

  const ex = await new Execucao(db, 'ranking', lead.campanha_id).iniciar();
  ex.log('info', `Posição no Google: ${lead.nome}`, { por: quem, consulta });
  try {
    const places: PlaceBruto[] = [];
    let token: string | undefined;
    for (let pagina = 0; pagina < MAX_PAGINAS && restante > 0; pagina++) {
      const resp = await buscarPagina(consulta, token, FIELD_MASK_RANKING);
      restante--;
      ex.chamadas++;
      ex.custo += custoBuscaBRL();
      places.push(...(resp.places ?? []));
      token = resp.nextPageToken;
      if (!token || places.some((p) => p.id === lead.place_id)) break;
      await new Promise((r) => setTimeout(r, 300));
    }

    const itens = itensDoRanking(places);
    const posicao = posicaoDe(itens, lead.place_id);
    const { data: salvo, error } = await db
      .from('rankings')
      .insert({ lead_id: lead.id, consulta, posicao, total: itens.length, resultados: itens })
      .select('*')
      .single();
    if (error) throw new Error(error.message);

    ex.itens = 1;
    ex.log('info', posicao ? `Posição ${posicao} de ${itens.length}` : `Fora das ${itens.length} primeiras`, { consulta });
    await ex.finalizar();
    return json({ ok: true, em_cache: false, lead: { nome: lead.nome, place_id: lead.place_id }, ...salvo });
  } catch (e) {
    const msg = (e as Error).message;
    ex.log('erro', msg);
    await ex.finalizar(msg);
    return json({ erro: msg }, 502);
  }
});
