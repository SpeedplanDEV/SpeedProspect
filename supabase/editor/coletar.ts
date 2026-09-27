// SpeedProspect — Edge Function `coletar` (arquivo único para o editor do Supabase)
// Gerado por scripts/gerar-editor.mjs a partir de supabase/functions — não edite à mão.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';

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

// ===== _shared/normalizar.ts =====
// Funções puras de normalização (sem dependências do Deno — testadas com Vitest)

/** Apenas dígitos */
function somenteDigitos(v: string | null | undefined): string {
  return (v ?? '').replace(/\D/g, '');
}

// DDDs válidos no Brasil
const DDDS = new Set(
  ('11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 ' +
    '51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99')
    .split(' '),
);

/**
 * Normaliza telefone brasileiro para E.164 (+55DDDNÚMERO).
 * Aceita "+55 17 99999-9999", "(17) 99999-9999", "017 3333-4444", "5517999999999".
 * Retorna null quando não é possível obter DDD + número (10 ou 11 dígitos).
 */
function telefoneE164(v: string | null | undefined): string | null {
  let d = somenteDigitos(v);
  if (!d) return null;
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
  d = d.replace(/^0+/, '');
  // Remove código de operadora em números como 0 15 17 99999-9999
  if (d.length === 13 && /^\d{2}[1-9]{2}9/.test(d)) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  if (!DDDS.has(d.slice(0, 2))) return null; // descarta 0800, 0300 etc.
  return `+55${d}`;
}

/** Celular = número local com 9 dígitos começando com 9 */
function ehCelular(e164: string | null | undefined): boolean {
  if (!e164) return false;
  const local = somenteDigitos(e164).replace(/^55/, '').slice(2);
  return local.length === 9 && local.startsWith('9');
}

/** Minúsculas e sem acentos, para comparar nomes de cidades */
function semAcento(v: string | null | undefined): string {
  return (v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

interface ComponenteEndereco {
  longText?: string;
  shortText?: string;
  types?: string[];
}

/** Bairro a partir de addressComponents (sublocality_level_1 ou sublocality) */
function extrairBairro(componentes: ComponenteEndereco[] | undefined): string | null {
  if (!componentes?.length) return null;
  const c =
    componentes.find((x) => x.types?.includes('sublocality_level_1')) ??
    componentes.find((x) => x.types?.includes('sublocality'));
  return c?.longText?.trim() || null;
}

/** Cidade a partir de addressComponents (no Brasil costuma vir em administrative_area_level_2) */
function extrairCidade(componentes: ComponenteEndereco[] | undefined): string | null {
  if (!componentes?.length) return null;
  const c =
    componentes.find((x) => x.types?.includes('locality')) ??
    componentes.find((x) => x.types?.includes('administrative_area_level_2'));
  return c?.longText?.trim() || null;
}

/** Consultas de uma campanha: "termo em cidade - UF" e, por bairro, "termo bairro cidade - UF" */
function montarConsultas(c: { termos_busca: string[]; bairros: string[]; cidade: string; uf: string }): string[] {
  const out: string[] = [];
  for (const termo of c.termos_busca) {
    const t = termo.trim();
    if (!t) continue;
    out.push(`${t} em ${c.cidade} - ${c.uf}`);
    for (const b of c.bairros) {
      if (b.trim()) out.push(`${t} ${b.trim()} ${c.cidade} - ${c.uf}`);
    }
  }
  return [...new Set(out)];
}

// ===== _shared/places.ts =====
// Cliente da Google Places API (New) — somente Text Search oficial. Nada de scraping.
const PLACES_URL = 'https://places.googleapis.com/v1/places:searchText';

const FIELD_MASK = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.addressComponents',
  'places.nationalPhoneNumber', 'places.internationalPhoneNumber', 'places.websiteUri', 'places.rating',
  'places.userRatingCount', 'places.types', 'places.primaryType', 'places.regularOpeningHours', 'places.photos',
  'places.reviews', 'places.googleMapsUri', 'places.businessStatus', 'places.location', 'nextPageToken',
].join(',');

/**
 * Preços unitários (US$ por requisição). Confira a tabela atual em
 * https://developers.google.com/maps/billing-and-pricing/pricing
 * - Text Search com campos de reviews/horários/telefone/site = SKU "Text Search Enterprise + Atmosphere"
 * - Place Photo = SKU "Place Details Photos"
 */
const PRECO_USD = {
  text_search_enterprise_atmosphere: 0.04,
  foto: 0.007,
};
/** Cotação usada para registrar custos em R$ (ajuste via secret COTACAO_DOLAR) */
const cotacaoDolar = () => Number(Deno.env.get('COTACAO_DOLAR') ?? '5.50') || 5.5;
const custoBuscaBRL = () => PRECO_USD.text_search_enterprise_atmosphere * cotacaoDolar();

interface PlaceBruto {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: ComponenteEndereco[];
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  types?: string[];
  primaryType?: string;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  photos?: { name: string; widthPx?: number; heightPx?: number; authorAttributions?: { displayName?: string; uri?: string }[] }[];
  reviews?: {
    rating?: number;
    text?: { text?: string };
    originalText?: { text?: string };
    relativePublishTimeDescription?: string;
    authorAttribution?: { displayName?: string };
  }[];
  googleMapsUri?: string;
  businessStatus?: string;
  location?: { latitude?: number; longitude?: number };
}

interface RespostaBusca {
  places?: PlaceBruto[];
  nextPageToken?: string;
}

/** Uma página do Text Search. Tenta 3 vezes com backoff em erros 429/5xx/rede. */
async function buscarPagina(textQuery: string, pageToken?: string): Promise<RespostaBusca> {
  const chave = Deno.env.get('GOOGLE_PLACES_API_KEY');
  if (!chave) throw new Error('Secret GOOGLE_PLACES_API_KEY não configurado');
  const corpo: Record<string, unknown> = { textQuery, languageCode: 'pt-BR', regionCode: 'BR', pageSize: 20 };
  if (pageToken) corpo.pageToken = pageToken;

  let ultimoErro = '';
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    if (tentativa) await new Promise((r) => setTimeout(r, 1000 * 2 ** tentativa));
    try {
      const r = await fetch(PLACES_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': chave, 'X-Goog-FieldMask': FIELD_MASK },
        body: JSON.stringify(corpo),
      });
      if (r.ok) return (await r.json()) as RespostaBusca;
      const txt = await r.text();
      ultimoErro = `Places ${r.status}: ${txt.slice(0, 300)}`;
      if (r.status !== 429 && r.status < 500) break; // erro definitivo (chave, cota, requisição)
    } catch (e) {
      ultimoErro = `Falha de rede no Places: ${(e as Error).message}`;
    }
  }
  throw new Error(ultimoErro);
}

/** Converte um place da API para as colunas de `leads` (dados do Google apenas) */
function placeParaLead(p: PlaceBruto) {
  const telefone = telefoneE164(p.internationalPhoneNumber) ?? telefoneE164(p.nationalPhoneNumber);
  return {
    place_id: p.id,
    nome: p.displayName?.text?.trim() || 'Sem nome',
    bairro: extrairBairro(p.addressComponents),
    endereco: p.formattedAddress ?? null,
    telefone,
    telefone_celular: ehCelular(telefone),
    website: p.websiteUri ?? null,
    google_maps_url: p.googleMapsUri ?? null,
    rating: typeof p.rating === 'number' ? Math.round(p.rating * 10) / 10 : null,
    reviews_count: p.userRatingCount ?? 0,
    tipos: p.types ?? [],
    tipo_principal: p.primaryType ?? null,
    horarios: p.regularOpeningHours?.weekdayDescriptions ?? null,
    fotos: (p.photos ?? []).slice(0, 10).map((f) => ({
      name: f.name,
      width: f.widthPx ?? null,
      height: f.heightPx ?? null,
      atribuicao: f.authorAttributions?.[0]?.displayName ?? null,
      atribuicao_uri: f.authorAttributions?.[0]?.uri ?? null,
    })),
    avaliacoes: (p.reviews ?? []).slice(0, 5).map((r) => ({
      autor: r.authorAttribution?.displayName ?? 'Cliente do Google',
      nota: r.rating ?? null,
      texto: r.text?.text ?? r.originalText?.text ?? '',
      data: r.relativePublishTimeDescription ?? '',
    })),
    lat: p.location?.latitude ?? null,
    lng: p.location?.longitude ?? null,
    status_negocio: p.businessStatus ?? null,
    places_atualizado_em: new Date().toISOString(),
    cidade_google: extrairCidade(p.addressComponents),
  };
}

// ===== _shared/log.ts =====
type Nivel = 'info' | 'aviso' | 'erro';

/** Registro de uma execução em `execucoes`, com log estruturado */
class Execucao {
  id = '';
  itens = 0;
  custo = 0;
  chamadas = 0;
  private entradas: Record<string, unknown>[] = [];

  constructor(private db: SupabaseClient, private etapa: string, private campanhaId: string | null = null) {}

  async iniciar() {
    const { data, error } = await this.db
      .from('execucoes')
      .insert({ etapa: this.etapa, campanha_id: this.campanhaId })
      .select('id')
      .single();
    if (error) throw new Error(`Não foi possível registrar a execução: ${error.message}`);
    this.id = data.id;
    return this;
  }

  log(nivel: Nivel, msg: string, dados: Record<string, unknown> = {}) {
    this.entradas.push({ em: new Date().toISOString(), nivel, msg, ...dados });
    console.log(`[${this.etapa}] ${nivel}: ${msg}`, Object.keys(dados).length ? JSON.stringify(dados) : '');
  }

  /** Grava o progresso parcial (útil se a função estourar o tempo limite) */
  async salvarParcial() {
    await this.db
      .from('execucoes')
      .update({ itens_processados: this.itens, custo_estimado: this.custo, chamadas_api: this.chamadas, log: this.entradas })
      .eq('id', this.id);
  }

  async finalizar(erro?: string) {
    await this.db
      .from('execucoes')
      .update({
        finalizado_em: new Date().toISOString(),
        sucesso: !erro,
        erro: erro ?? null,
        itens_processados: this.itens,
        custo_estimado: Math.round(this.custo * 10000) / 10000,
        chamadas_api: this.chamadas,
        log: this.entradas,
      })
      .eq('id', this.id);
  }
}

// ===== coletar/index.ts =====
// Edge Function `coletar` — busca empresas pela Google Places API (New) e grava em `leads`.
// Regras: cache de 30 dias por place_id e por consulta, respeita limite_buscas_dia, ignora bloqueios (opt-out).
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
