// Edge Function `meta-sync` — importa campanhas, conjuntos e anúncios que já existem nas contas conectadas (somente
// leitura, para o dashboard) e sincroniza o status real (effective_status, problemas, reprovações) dos objetos criados
// pelo sistema. POST { conta_id? } (sem conta: todas as ativas). Operador logado ou service role.
// Obs.: a Meta remove o GET /?ids=... em 27/10/2026; objetos fora da listagem são conferidos via lote (batch).
import { z } from 'npm:zod@3';
import { admin, autorizarAdmin, cors, json } from '../_shared/supabase.ts';
import { Execucao } from '../_shared/log.ts';
import { criarClienteMeta, erroParaResposta, ErroMeta, lerConfigMeta, type ClienteMeta } from '../_shared/meta.ts';
import { centavos, criativoDeAnuncio, motivoReprovacao, objetivoLocal, statusLocal, type StatusAds } from '../_shared/meta-mapa.ts';

const Entrada = z.object({ conta_id: z.string().uuid().optional() }).strict();

const PRAZO_MS = 135_000;
const MAX_POR_NIVEL = 2000;
const MAX_CONFERIR_AUSENTES = 300;

const CAMPOS = {
  campaigns: 'id,name,objective,status,effective_status,daily_budget,lifetime_budget,special_ad_categories,start_time,stop_time,issues_info',
  adsets: 'id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget,optimization_goal,destination_type,targeting,learning_stage_info,issues_info',
  ads: 'id,name,adset_id,status,effective_status,ad_review_feedback,issues_info,creative{id,body,title,call_to_action_type,object_story_spec,image_url,video_id,asset_feed_spec}',
} as const;

// Ignora objetos excluídos/arquivados na listagem (os já conhecidos são conferidos depois, um a um, em lote)
const STATUS_LISTAGEM = {
  campaigns: ['ACTIVE', 'PAUSED', 'IN_PROCESS', 'WITH_ISSUES'],
  adsets: ['ACTIVE', 'PAUSED', 'CAMPAIGN_PAUSED', 'IN_PROCESS', 'WITH_ISSUES'],
  ads: ['ACTIVE', 'PAUSED', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED', 'IN_PROCESS', 'WITH_ISSUES', 'PENDING_REVIEW', 'DISAPPROVED', 'PREAPPROVED', 'PENDING_BILLING_INFO'],
};

interface Base { id: string; name?: string; status?: string; effective_status?: string; issues_info?: unknown }
interface CampanhaMeta extends Base { objective?: string; daily_budget?: string; lifetime_budget?: string; special_ad_categories?: string[]; start_time?: string; stop_time?: string }
interface ConjuntoMeta extends Base { campaign_id?: string; daily_budget?: string; optimization_goal?: string; destination_type?: string; targeting?: unknown; learning_stage_info?: { status?: string } }
interface AnuncioMeta extends Base { adset_id?: string; ad_review_feedback?: unknown; creative?: Parameters<typeof criativoDeAnuncio>[0] & { id?: string } }

/** Lista um nível da conta; se a Meta recusar o filtro de status nesta versão, lista sem ele */
async function listar<T>(meta: ClienteMeta, conta: string, edge: keyof typeof CAMPOS) {
  try {
    return await meta.paginar<T>(`${conta}/${edge}`, { fields: CAMPOS[edge], effective_status: STATUS_LISTAGEM[edge] }, MAX_POR_NIVEL);
  } catch (e) {
    if (e instanceof ErroMeta && e.info.categoria === 'parametro') {
      return await meta.paginar<T>(`${conta}/${edge}`, { fields: CAMPOS[edge] }, MAX_POR_NIVEL);
    }
    throw e;
  }
}

const issues = (v: unknown) => (Array.isArray(v) && v.length ? v : null);

async function sincronizarConta(meta: ClienteMeta, db: ReturnType<typeof admin>, conta: { id: string; nome: string; meta_ad_account_id: string }) {
  const act = conta.meta_ad_account_id;
  const [camp, conj, anun] = [
    await listar<CampanhaMeta>(meta, act, 'campaigns'),
    await listar<ConjuntoMeta>(meta, act, 'adsets'),
    await listar<AnuncioMeta>(meta, act, 'ads'),
  ];

  // Destino dos conjuntos ajuda a entender o objetivo (ex.: engajamento com destino WhatsApp = conversas)
  const destinoDaCampanha = new Map<string, string>();
  for (const s of conj.itens) if (s.campaign_id && s.destination_type) destinoDaCampanha.set(s.campaign_id, s.destination_type);

  const campanhas = camp.itens.map((c) => ({
    meta_id: c.id,
    nome: c.name ?? '',
    objetivo: objetivoLocal(c.objective, destinoDaCampanha.get(c.id)),
    meta_objective: c.objective ?? null,
    orcamento_tipo: c.daily_budget || c.lifetime_budget ? 'cbo' : 'abo',
    orcamento_diario_centavos: centavos(c.daily_budget),
    special_ad_categories: (c.special_ad_categories ?? []).filter((x) => x && x !== 'NONE'),
    status: statusLocal(c.effective_status, c.status),
    meta_status: c.status ?? null,
    meta_effective_status: c.effective_status ?? null,
    issues: issues(c.issues_info),
    inicio: c.start_time ?? null,
    fim: c.stop_time ?? null,
  }));
  const conjuntos = conj.itens.map((s) => ({
    meta_id: s.id,
    meta_campaign_id: s.campaign_id ?? null,
    nome: s.name ?? '',
    targeting: s.targeting ?? {},
    otimizacao: s.optimization_goal ?? '',
    destino: s.destination_type ?? '',
    orcamento_diario_centavos: centavos(s.daily_budget),
    status: statusLocal(s.effective_status, s.status),
    meta_status: s.status ?? null,
    meta_effective_status: s.effective_status ?? null,
    issues: issues(s.issues_info),
    aprendizado: s.learning_stage_info ?? null,
    aprendizado_concluido: s.learning_stage_info?.status === 'SUCCESS',
  }));
  const anuncios = anun.itens.map((a) => {
    const cr = criativoDeAnuncio(a.creative);
    return {
      meta_id: a.id,
      meta_adset_id: a.adset_id ?? null,
      nome: a.name ?? '',
      ...cr,
      meta_creative_id: a.creative?.id ?? null,
      status: statusLocal(a.effective_status, a.status),
      meta_status: a.status ?? null,
      meta_effective_status: a.effective_status ?? null,
      issues: issues(a.issues_info),
      motivo_reprovacao: motivoReprovacao(a.ad_review_feedback),
    };
  });

  // Conhecidos localmente que não vieram na listagem (arquivados, excluídos ou sem acesso): confere um a um em lote
  const { data: conhecidos, error: eIds } = await db.rpc('meta_ids_da_conta', { p_conta_id: conta.id });
  if (eIds) throw new Error(`Rode o SQL da Fase 8 (meta_ids_da_conta): ${eIds.message}`);
  const vistos = new Set([...campanhas, ...conjuntos, ...anuncios].map((x) => x.meta_id));
  const ausentesIds: { nivel: 'campanha' | 'conjunto' | 'anuncio'; meta_id: string }[] = [];
  const k = conhecidos as { campanhas: string[]; conjuntos: string[]; anuncios: string[] };
  for (const id of k.campanhas ?? []) if (!vistos.has(id)) ausentesIds.push({ nivel: 'campanha', meta_id: id });
  for (const id of k.conjuntos ?? []) if (!vistos.has(id)) ausentesIds.push({ nivel: 'conjunto', meta_id: id });
  for (const id of k.anuncios ?? []) if (!vistos.has(id)) ausentesIds.push({ nivel: 'anuncio', meta_id: id });
  const conferir = ausentesIds.slice(0, MAX_CONFERIR_AUSENTES);
  const respostas = conferir.length
    ? await meta.lote<Base>(conferir.map((x) => ({ metodo: 'GET' as const, caminho: x.meta_id, params: { fields: 'status,effective_status,issues_info' } })))
    : [];
  type Ausente = { nivel: string; meta_id: string; status: StatusAds; meta_status: string | null; meta_effective_status: string | null; issues: unknown };
  const ausentes = conferir.flatMap((x, i): Ausente[] => {
    const r = respostas[i];
    if (r?.ok) {
      return [{ ...x, status: statusLocal(r.dados.effective_status, r.dados.status), meta_status: r.dados.status ?? null, meta_effective_status: r.dados.effective_status ?? null, issues: issues(r.dados.issues_info) }];
    }
    // Excluído de vez ou sem acesso: considera encerrado
    if (r && !r.ok && r.erro.info.categoria === 'acesso') {
      return [{ ...x, status: 'encerrado', meta_status: null, meta_effective_status: 'DELETED', issues: null }];
    }
    return [];
  });

  const { data: resumo, error } = await db.rpc('meta_sincronizar', {
    p_conta_id: conta.id,
    p_campanhas: campanhas,
    p_conjuntos: conjuntos,
    p_anuncios: anuncios,
    p_ausentes: ausentes,
  });
  if (error) throw new Error(`Falha ao gravar a sincronização: ${error.message}`);
  return {
    resumo: resumo as Record<string, unknown>,
    listados: { campanhas: campanhas.length, conjuntos: conjuntos.length, anuncios: anuncios.length },
    truncado: camp.truncado || conj.truncado || anun.truncado,
    ausentes_conferidos: conferir.length,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ erro: 'Use POST' }, 405);
  const inicio = Date.now();
  const db = admin();
  const quem = await autorizarAdmin(req, db);
  if (!quem) return json({ erro: 'Não autorizado' }, 401);

  let entrada: z.infer<typeof Entrada>;
  try {
    entrada = Entrada.parse(await req.json().catch(() => ({})));
  } catch {
    return json({ erro: 'Entrada inválida. Envie {} ou { "conta_id": "<uuid>" }' }, 400);
  }

  let cfg;
  try {
    cfg = lerConfigMeta();
  } catch (e) {
    return json(erroParaResposta(e), 400);
  }

  let q = db.from('contas_ads').select('id,nome,meta_ad_account_id').order('nome');
  q = entrada.conta_id ? q.eq('id', entrada.conta_id) : q.eq('ativa', true);
  const { data: contas, error } = await q;
  if (error) return json({ erro: `Rode o SQL da Fase 8: ${error.message}` }, 500);
  if (!contas?.length) return json({ ok: true, contas: [], mensagem: 'Nenhuma conta conectada.' });

  const ex = await new Execucao(db, 'meta-sync').iniciar();
  const meta = criarClienteMeta({
    ...cfg,
    prazo: inicio + PRAZO_MS,
    aoChamar: (c) => {
      ex.chamadas += 1;
      if (c.codigo) ex.log('aviso', `Meta respondeu erro ${c.codigo}`, { metodo: c.metodo, caminho: c.caminho, http: c.http });
    },
  });

  const resultado: Record<string, unknown>[] = [];
  let falhas = 0;
  for (const conta of contas) {
    if (Date.now() - inicio > PRAZO_MS - 20_000) {
      ex.log('aviso', 'Tempo limite: contas restantes ficam para a próxima sincronização', { conta: conta.nome });
      resultado.push({ conta_id: conta.id, nome: conta.nome, pulada: true });
      continue;
    }
    try {
      const r = await sincronizarConta(meta, db, conta);
      ex.itens += r.listados.campanhas + r.listados.conjuntos + r.listados.anuncios;
      ex.log('info', `${conta.nome}: sincronizada`, { conta_id: conta.id, ...r.listados, resumo: r.resumo, truncado: r.truncado });
      if (r.truncado) ex.log('aviso', `${conta.nome}: listagem cortada em ${MAX_POR_NIVEL} itens por nível`);
      resultado.push({ conta_id: conta.id, nome: conta.nome, ...r });
    } catch (e) {
      falhas++;
      const r = erroParaResposta(e);
      ex.log('erro', `${conta.nome}: ${r.erro}`, { conta_id: conta.id, orientacao: r.orientacao });
      resultado.push({ conta_id: conta.id, nome: conta.nome, ...r });
    }
  }
  const erroGeral = falhas === contas.length ? String((resultado[0] as { erro?: string }).erro ?? 'Falha na sincronização') : undefined;
  await ex.finalizar(erroGeral);
  return json({ ok: !erroGeral, contas: resultado, chamadas: ex.chamadas, segundos: Math.round((Date.now() - inicio) / 100) / 10 }, erroGeral ? 502 : 200);
});
