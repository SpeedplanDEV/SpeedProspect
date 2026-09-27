// SpeedProspect — Edge Function `qualificar` (arquivo único para o editor do Supabase)
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

// ===== _shared/qualificacao.ts =====
// Regras puras de qualificação (sem dependências do Deno — usadas pela Edge Function e pelo painel)

type StatusSite = 'sem_site' | 'site_fraco' | 'site_ok';

/** Hosts de "link na bio", redes sociais e marketplaces: não contam como site próprio */
const HOSTS_FRACOS = [
  'instagram.com', 'facebook.com', 'fb.com', 'linktr.ee', 'linktree', 'wa.me', 'whatsapp.com', 'beacons.ai',
  'bio.site', 'taplink', 'ifood.com.br', 'linkr.bio', 'tiktok.com', 'youtube.com', 'twitter.com', 'x.com',
  'linkedin.com', 'goo.gl', 'g.page', 'business.site', 'sites.google.com', 'wixsite.com', 'negocio.site',
];

/** Termos de franquias e redes nacionais (descarte automático). Comparação sem acento e minúscula. */
const FRANQUIAS = [
  "mcdonald", 'burger king', 'subway', 'habib', "bob's", 'giraffas', 'outback', 'spoleto', 'china in box',
  "domino's", 'pizza hut', 'kfc', 'starbucks', 'cacau show', 'kopenhagen', 'o boticario', 'boticario', 'natura',
  'sorridents', 'odontocompany', 'oral sin', 'amor saude', 'dr consulta', 'dr. consulta', 'drogasil', 'droga raia',
  'pague menos', 'drogaria sao paulo', 'ultrafarma', 'localiza', 'unidas', 'movida', 'espacolaser', 'depyl action',
  'jequiti', 'hering', 'chilli beans', 'ri happy', 'smart fit', 'bluefit', 'bodytech', 'lojas americanas',
  'magazine luiza', 'casas bahia', 'carrefour', 'assai', 'atacadao', 'pao de acucar', 'petz', 'cobasi',
];

/** Títulos típicos de página padrão/construtor/domínio estacionado */
const TITULOS_PADRAO =
  /site em constru|em constru[cç][aã]o|coming soon|under construction|em breve|website em manuten|p[aá]gina em manuten|domain for sale|dom[ií]nio [aà] venda|this domain|parked|index of \/|default web site|welcome to nginx|apache2? .*default|it works!|my site|meu site|wix\.com/i;

const sa = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function ehFranquia(nome: string): boolean {
  const n = sa(nome);
  return FRANQUIAS.some((f) => n.includes(sa(f)));
}

/** Host "fraco" (rede social, link na bio, marketplace)? */
function hostFraco(host: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, '');
  return HOSTS_FRACOS.some((x) => (x.includes('.') ? h === x || h.endsWith(`.${x}`) : h.includes(x)));
}

interface DetalheSite {
  status_http: number | null;
  tempo_ms: number | null;
  https: boolean;
  viewport: boolean;
  host: string | null;
  titulo: string | null;
  tamanho_kb?: number | null;
  url_final?: string | null;
  motivo: string;
}

interface RespostaSite {
  status: number;
  urlFinal: string;
  html: string;
  tempoMs: number;
}

/** Normaliza a URL cadastrada no Google (sem esquema → http://) */
function normalizarUrl(url: string): URL | null {
  try {
    const u = new URL(/^https?:\/\//i.test(url.trim()) ? url.trim() : `http://${url.trim()}`);
    return u.hostname.includes('.') ? u : null;
  } catch {
    return null;
  }
}

/** Classificação antes de acessar o site: vazio, inválido ou host fraco */
function preClassificar(website: string | null | undefined): { status: StatusSite; detalhe: DetalheSite } | null {
  const base = { status_http: null, tempo_ms: null, https: false, viewport: false, titulo: null };
  if (!website?.trim()) return { status: 'sem_site', detalhe: { ...base, host: null, motivo: 'Sem site cadastrado no Google' } };
  const u = normalizarUrl(website);
  if (!u) return { status: 'site_fraco', detalhe: { ...base, host: null, motivo: 'URL inválida' } };
  if (hostFraco(u.hostname)) {
    return {
      status: 'site_fraco',
      detalhe: { ...base, https: u.protocol === 'https:', host: u.hostname, motivo: `Usa ${u.hostname.replace(/^www\./, '')} no lugar de site próprio` },
    };
  }
  return null;
}

function extrairTitulo(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return null;
  const t = m[1].replace(/\s+/g, ' ').replace(/&amp;/g, '&').trim();
  return t || null;
}

/** Classificação a partir da resposta HTTP do site */
function classificarResposta(urlOriginal: string, r: RespostaSite): { status: StatusSite; detalhe: DetalheSite } {
  const final = normalizarUrl(r.urlFinal) ?? normalizarUrl(urlOriginal);
  const https = final?.protocol === 'https:';
  const viewport = /<meta[^>]+name\s*=\s*["']?viewport/i.test(r.html);
  const titulo = extrairTitulo(r.html);
  const tamanhoKb = Math.round((new TextEncoder().encode(r.html).length / 1024) * 10) / 10;
  const detalhe: DetalheSite = {
    status_http: r.status,
    tempo_ms: r.tempoMs,
    https,
    viewport,
    host: final?.hostname ?? null,
    titulo,
    tamanho_kb: tamanhoKb,
    url_final: r.urlFinal,
    motivo: '',
  };

  const motivos: string[] = [];
  if (r.status >= 400) motivos.push(`Site responde com erro ${r.status}`);
  if (final && hostFraco(final.hostname)) motivos.push(`Redireciona para ${final.hostname}`);
  if (!https) motivos.push('Sem HTTPS (não seguro)');
  if (r.status < 400) {
    if (!viewport) motivos.push('Não é adaptado para celular (sem meta viewport)');
    if (tamanhoKb < 5) motivos.push('Página quase vazia (menos de 5 KB)');
    if (!titulo) motivos.push('Página sem título');
    else if (TITULOS_PADRAO.test(titulo)) motivos.push(`Título padrão/construção: "${titulo.slice(0, 60)}"`);
    if (/site em constru|em constru[cç][aã]o|coming soon|under construction/i.test(r.html.slice(0, 20000)) && !motivos.some((m) => m.startsWith('Título'))) {
      motivos.push('Página indica "em construção"');
    }
  }

  if (motivos.length) return { status: 'site_fraco', detalhe: { ...detalhe, motivo: motivos.join('; ') } };
  return { status: 'site_ok', detalhe: { ...detalhe, motivo: 'Site funcional, seguro e adaptado ao celular' } };
}

/** Falha de acesso (DNS, TLS, timeout) */
function classificarFalha(urlOriginal: string, erro: string, tempoMs: number): { status: StatusSite; detalhe: DetalheSite } {
  const u = normalizarUrl(urlOriginal);
  const timeout = /timeout|abort/i.test(erro);
  return {
    status: 'site_fraco',
    detalhe: {
      status_http: null,
      tempo_ms: tempoMs,
      https: u?.protocol === 'https:',
      viewport: false,
      host: u?.hostname ?? null,
      titulo: null,
      motivo: timeout ? 'Site não carregou em 8 segundos' : `Site não abre (${erro.slice(0, 120)})`,
    },
  };
}

interface DadosScore {
  status_site: StatusSite | 'desconhecido';
  rating: number | null;
  reviews_count: number;
  telefone: string | null;
  telefone_celular: boolean;
  horarios: unknown[] | null;
}

interface ParcelaScore {
  item: string;
  pontos: number;
  detalhe: string;
}

/** Score 0–100 com as parcelas (auditável no painel) */
function calcularScore(l: DadosScore): { score: number; parcelas: ParcelaScore[] } {
  const parcelas: ParcelaScore[] = [];
  const base = { sem_site: 40, site_fraco: 30, site_ok: 5, desconhecido: 0 }[l.status_site];
  const rotSite = { sem_site: 'sem site', site_fraco: 'site fraco', site_ok: 'site ok', desconhecido: 'não verificado' }[l.status_site];
  parcelas.push({ item: 'Site', pontos: base, detalhe: rotSite });

  let pr = 0;
  let dr = 'sem nota';
  if (l.rating != null) {
    const r = Number(l.rating);
    pr = r >= 4.5 ? 20 : r >= 4.0 ? 12 : 4;
    dr = `nota ${r.toFixed(1).replace('.', ',')}`;
  }
  parcelas.push({ item: 'Nota no Google', pontos: pr, detalhe: dr });

  const vol = Math.min(20, Math.round(Math.log10((l.reviews_count || 0) + 1) * 8));
  parcelas.push({ item: 'Volume de avaliações', pontos: vol, detalhe: `${l.reviews_count || 0} avaliações` });

  const tel = !l.telefone ? 0 : l.telefone_celular ? 15 : 5;
  parcelas.push({ item: 'Telefone', pontos: tel, detalhe: !l.telefone ? 'sem telefone' : l.telefone_celular ? 'celular' : 'fixo' });

  const hor = l.horarios && l.horarios.length ? 5 : 0;
  parcelas.push({ item: 'Horários', pontos: hor, detalhe: hor ? 'informados' : 'não informados' });

  const score = Math.max(0, Math.min(100, parcelas.reduce((s, p) => s + p.pontos, 0)));
  return { score, parcelas };
}

interface DadosDescarte extends DadosScore {
  nome: string;
  status_negocio: string | null;
}

/** Motivo de descarte automático (ou null se o lead segue qualificado) */
function motivoDescarte(
  l: DadosDescarte,
  score: number,
  cfg: { score_minimo: number; prospectar_site_ok: boolean },
): string | null {
  if (l.status_negocio && l.status_negocio !== 'OPERATIONAL') {
    return l.status_negocio === 'CLOSED_PERMANENTLY' ? 'fechado_definitivamente' : 'fechado_temporariamente';
  }
  if (!l.telefone) return 'sem_telefone';
  if (ehFranquia(l.nome)) return 'franquia_rede';
  if (l.status_site === 'site_ok' && !cfg.prospectar_site_ok) return 'ja_tem_site';
  if (score < cfg.score_minimo) return 'score_baixo';
  return null;
}

const ROTULO_DESCARTE: Record<string, string> = {
  fechado_definitivamente: 'Fechado definitivamente',
  fechado_temporariamente: 'Fechado temporariamente',
  sem_telefone: 'Sem telefone',
  franquia_rede: 'Franquia / rede nacional',
  ja_tem_site: 'Já tem site bom',
  score_baixo: 'Score abaixo do mínimo',
  manual: 'Descartado manualmente',
};

// ===== _shared/site.ts =====
// Acesso ao site da empresa para a checagem (timeout 8 s, segue redirects, User-Agent de navegador)
const UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36';
const LIMITE_BYTES = 600_000;

async function lerTexto(r: Response): Promise<string> {
  if (!r.body) return '';
  const leitor = r.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  while (total < LIMITE_BYTES) {
    const { done, value } = await leitor.read();
    if (done) break;
    partes.push(value);
    total += value.length;
  }
  leitor.cancel().catch(() => {});
  const junto = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) {
    junto.set(p, pos);
    pos += p.length;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(junto);
}

async function checarSite(website: string | null) {
  const pre = preClassificar(website);
  if (pre) return pre;
  const url = normalizarUrl(website!)!.toString();
  const inicio = Date.now();
  try {
    const r = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'pt-BR,pt;q=0.9' },
    });
    const html = await lerTexto(r);
    return classificarResposta(url, { status: r.status, urlFinal: r.url || url, html, tempoMs: Date.now() - inicio });
  } catch (e) {
    return classificarFalha(url, (e as Error).message ?? String(e), Date.now() - inicio);
  }
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

// ===== qualificar/index.ts =====
// Edge Function `qualificar` — checa o site, calcula o score e decide qualificado/descartado.
// Sem lead_id: processa leads com status "novo". Com lead_id: requalifica aquele lead (ação manual).
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
