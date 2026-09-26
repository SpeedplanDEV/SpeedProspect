// Edge Function `coletar` — busca empresas pela Google Places API (New) e grava em `leads`.
// Regras: cache de 30 dias por place_id e por consulta, respeita limite_buscas_dia, ignora bloqueios (opt-out).
import { z } from 'npm:zod@3';
import { admin, autorizarAdmin, cors, inicioDoDiaSP, json } from '../_shared/supabase.ts';
import { buscarPagina, custoBuscaBRL, placeParaLead } from '../_shared/places.ts';
import { montarConsultas, semAcento } from '../_shared/normalizar.ts';
import { Execucao } from '../_shared/log.ts';

const MAX_PAGINAS = 3;
const DIAS_CACHE = 30;

const Entrada = z.object({ campanha_id: z.string().uuid().optional() }).strict();

interface Campanha {
  id: string;
  nome: string;
  nicho: string;
  cidade: string;
  uf: string;
  termos_busca: string[];
  bairros: string[];
  max_leads_execucao: number;
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

  const { data: cfg, error: eCfg } = await db.from('configuracoes').select('limite_buscas_dia').eq('id', 1).single();
  if (eCfg) return json({ erro: eCfg.message }, 500);

  // Buscas já consumidas hoje (cada página do Text Search conta 1)
  const { data: hoje, error: eHoje } = await db
    .from('execucoes')
    .select('chamadas_api')
    .eq('etapa', 'coletar')
    .gte('iniciado_em', inicioDoDiaSP());
  if (eHoje) return json({ erro: eHoje.message }, 500);
  const usadas = (hoje ?? []).reduce((s, x) => s + (x.chamadas_api ?? 0), 0);
  let restante = Math.max(0, cfg.limite_buscas_dia - usadas);

  let q = db.from('campanhas').select('id,nome,nicho,cidade,uf,termos_busca,bairros,max_leads_execucao').eq('ativa', true);
  if (entrada.campanha_id) q = q.eq('id', entrada.campanha_id);
  const { data: campanhas, error: eCamp } = await q.order('ultima_execucao', { ascending: true, nullsFirst: true });
  if (eCamp) return json({ erro: eCamp.message }, 500);
  if (!campanhas?.length) return json({ erro: 'Nenhuma campanha ativa encontrada' }, 404);

  const resumo: Record<string, unknown>[] = [];

  for (const c of campanhas as Campanha[]) {
    const ex = await new Execucao(db, 'coletar', c.id).iniciar();
    ex.log('info', `Início da coleta: ${c.nome}`, { por: quem, buscas_disponiveis: restante });
    const cont = { novos: 0, atualizados: 0, em_cache: 0, bloqueados: 0, fora_da_cidade: 0, consultas_em_cache: 0 };
    let limiteAtingido = false;

    try {
      for (const consulta of montarConsultas(c)) {
        if (cont.novos >= c.max_leads_execucao) break;

        // Consulta já feita por completo nos últimos 30 dias → não gasta busca
        const { data: cache } = await db
          .from('buscas_cache')
          .select('executada_em')
          .eq('consulta', consulta)
          .gte('executada_em', new Date(Date.now() - DIAS_CACHE * 864e5).toISOString())
          .maybeSingle();
        if (cache) {
          cont.consultas_em_cache++;
          ex.log('info', 'Consulta em cache (30 dias), pulada', { consulta });
          continue;
        }

        let token: string | undefined;
        let paginas = 0;
        let resultados = 0;
        let completa = false;

        while (paginas < MAX_PAGINAS) {
          if (restante <= 0) {
            limiteAtingido = true;
            break;
          }
          const resp = await buscarPagina(consulta, token);
          restante--;
          paginas++;
          ex.chamadas++;
          ex.custo += custoBuscaBRL();
          const places = resp.places ?? [];
          resultados += places.length;
          await processarPagina(db, c, places.map(placeParaLead), cont);

          token = resp.nextPageToken;
          if (!token || paginas === MAX_PAGINAS) {
            completa = true;
            break;
          }
          if (cont.novos >= c.max_leads_execucao) break;
          await new Promise((r) => setTimeout(r, 300)); // o nextPageToken leva um instante para valer
        }

        ex.log('info', `Consulta: ${consulta}`, { paginas, resultados, completa });
        if (completa) {
          await db
            .from('buscas_cache')
            .upsert({ consulta, executada_em: new Date().toISOString(), paginas, resultados }, { onConflict: 'consulta' });
        }
        ex.itens = cont.novos + cont.atualizados;
        await ex.salvarParcial();
        if (limiteAtingido) break;
      }

      if (limiteAtingido) ex.log('aviso', 'Limite diário de buscas atingido — coleta interrompida', { limite: cfg.limite_buscas_dia });
      ex.log('info', 'Fim da coleta', cont);
      ex.itens = cont.novos + cont.atualizados;
      await db.from('campanhas').update({ ultima_execucao: new Date().toISOString() }).eq('id', c.id);
      await ex.finalizar();
      resumo.push({ campanha: c.nome, execucao_id: ex.id, buscas: ex.chamadas, custo: ex.custo, ...cont, limite_atingido: limiteAtingido });
    } catch (e) {
      const msg = (e as Error).message;
      ex.log('erro', msg);
      await ex.finalizar(msg);
      resumo.push({ campanha: c.nome, execucao_id: ex.id, erro: msg, ...cont });
    }

    if (limiteAtingido) break;
  }

  return json({ ok: true, buscas_restantes_hoje: restante, resumo });
});

type LeadGoogle = ReturnType<typeof placeParaLead>;

async function processarPagina(
  db: ReturnType<typeof admin>,
  c: Campanha,
  itens: LeadGoogle[],
  cont: Record<string, number>,
) {
  if (!itens.length) return;
  const ids = itens.map((x) => x.place_id);
  const tels = itens.map((x) => x.telefone).filter((t): t is string => !!t);

  const [bPlace, bTel, existentes] = await Promise.all([
    db.from('bloqueios').select('place_id').in('place_id', ids),
    tels.length ? db.from('bloqueios').select('telefone').in('telefone', tels) : Promise.resolve({ data: [], error: null }),
    db.from('leads').select('id,place_id,places_atualizado_em').in('place_id', ids),
  ]);
  for (const r of [bPlace, bTel, existentes]) if (r.error) throw new Error(r.error.message);

  const bloqPlace = new Set((bPlace.data ?? []).map((x) => x.place_id));
  const bloqTel = new Set((bTel.data ?? []).map((x: { telefone: string }) => x.telefone));
  const existe = new Map((existentes.data ?? []).map((x) => [x.place_id, x]));
  const limiteCache = Date.now() - DIAS_CACHE * 864e5;
  const cidadeCampanha = semAcento(c.cidade);

  const novos: Record<string, unknown>[] = [];
  for (const item of itens) {
    const { cidade_google, ...dados } = item;
    if (bloqPlace.has(dados.place_id) || (dados.telefone && bloqTel.has(dados.telefone))) {
      cont.bloqueados++;
      continue;
    }
    if (cidade_google && semAcento(cidade_google) !== cidadeCampanha) {
      cont.fora_da_cidade++;
      continue;
    }
    const atual = existe.get(dados.place_id);
    if (atual) {
      if (new Date(atual.places_atualizado_em).getTime() > limiteCache) {
        cont.em_cache++;
        continue;
      }
      // Cache vencido: atualiza só os dados do Google, sem mexer no funil
      const { error } = await db.from('leads').update(dados).eq('id', atual.id);
      if (error) throw new Error(error.message);
      cont.atualizados++;
      continue;
    }
    if (cont.novos + novos.length >= c.max_leads_execucao) continue;
    novos.push({ ...dados, campanha_id: c.id, nicho: c.nicho, cidade: c.cidade, status_funil: 'novo', status_site: 'desconhecido' });
  }

  if (novos.length) {
    const { data, error } = await db
      .from('leads')
      .upsert(novos, { onConflict: 'place_id', ignoreDuplicates: true })
      .select('id');
    if (error) throw new Error(error.message);
    cont.novos += data?.length ?? 0;
  }
}
