// SpeedProspect — Edge Function `ranking` (arquivo único para o editor do Supabase)
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
 *  - Authorization: Bearer <JWT do operador logado> (botão "Executar agora"), se o e-mail estiver em `operadores`
 */
async function autorizarAdmin(req: Request, db: SupabaseClient): Promise<string | null> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (service && token === service) return 'service_role';
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  // Só operadores cadastrados (tabela `operadores`, Fase 7). Lista vazia ou tabela ainda inexistente = libera.
  const { data: ops, error: eOps } = await db.from('operadores').select('email').limit(500);
  const email = (data.user.email ?? '').toLowerCase();
  if (!eOps && ops?.length && !ops.some((o) => o.email === email)) return null;
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

// ===== _shared/custos.ts =====
// Conversão de custos para R$ (cotação ajustável pelo secret COTACAO_DOLAR; padrão 5,50)
const cotacaoDolar = () => Number(Deno.env.get('COTACAO_DOLAR') ?? '5.50') || 5.5;
const paraReais = (usd: number) => Math.round(usd * cotacaoDolar() * 10000) / 10000;

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
/** Campos mínimos para a posição no Google (mais barato que a coleta completa) */
const FIELD_MASK_RANKING = [
  'places.id', 'places.displayName', 'places.rating', 'places.userRatingCount', 'places.formattedAddress', 'nextPageToken',
].join(',');

async function buscarPagina(textQuery: string, pageToken?: string, fieldMask = FIELD_MASK): Promise<RespostaBusca> {
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
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': chave, 'X-Goog-FieldMask': fieldMask },
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

// ===== _shared/ranking.ts =====
// Posição no Google — lógica pura (usada pela Edge Function `ranking` e pelos testes)

interface ItemRanking {
  posicao: number;
  place_id: string;
  nome: string;
  rating: number | null;
  reviews: number;
  endereco: string | null;
}

/** Monta a consulta igual à coleta: "termo em Cidade - UF" */
function consultaRanking(termo: string, cidade: string, uf: string): string {
  return `${termo.trim()} em ${cidade.trim()}${uf ? ` - ${uf.trim()}` : ''}`;
}

/** Converte os places das páginas (na ordem do Google) em itens numerados */
function itensDoRanking(
  places: { id: string; displayName?: { text?: string }; rating?: number; userRatingCount?: number; formattedAddress?: string }[],
): ItemRanking[] {
  const vistos = new Set<string>();
  const out: ItemRanking[] = [];
  for (const p of places) {
    if (!p.id || vistos.has(p.id)) continue;
    vistos.add(p.id);
    out.push({
      posicao: out.length + 1,
      place_id: p.id,
      nome: p.displayName?.text?.trim() || 'Sem nome',
      rating: typeof p.rating === 'number' ? Math.round(p.rating * 10) / 10 : null,
      reviews: p.userRatingCount ?? 0,
      endereco: p.formattedAddress ?? null,
    });
  }
  return out;
}

const posicaoDe = (itens: ItemRanking[], placeId: string): number | null =>
  itens.find((i) => i.place_id === placeId)?.posicao ?? null;

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

// ===== ranking/index.ts =====
// Edge Function `ranking` — posição do lead na busca oficial do Google (Places API Text Search) e concorrentes à frente.
// Regras: só API oficial (sem scraping), conta no limite diário de buscas, reaproveita consultas dos últimos 7 dias.
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
