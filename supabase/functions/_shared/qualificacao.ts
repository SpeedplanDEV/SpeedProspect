// Regras puras de qualificação (sem dependências do Deno — usadas pela Edge Function e pelo painel)

export type StatusSite = 'sem_site' | 'site_fraco' | 'site_ok';

/** Hosts de "link na bio", redes sociais e marketplaces: não contam como site próprio */
export const HOSTS_FRACOS = [
  'instagram.com', 'facebook.com', 'fb.com', 'linktr.ee', 'linktree', 'wa.me', 'whatsapp.com', 'beacons.ai',
  'bio.site', 'taplink', 'ifood.com.br', 'linkr.bio', 'tiktok.com', 'youtube.com', 'twitter.com', 'x.com',
  'linkedin.com', 'goo.gl', 'g.page', 'business.site', 'sites.google.com', 'wixsite.com', 'negocio.site',
];

/** Termos de franquias e redes nacionais (descarte automático). Comparação sem acento e minúscula. */
export const FRANQUIAS = [
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

export function ehFranquia(nome: string): boolean {
  const n = sa(nome);
  return FRANQUIAS.some((f) => n.includes(sa(f)));
}

/** Host "fraco" (rede social, link na bio, marketplace)? */
export function hostFraco(host: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, '');
  return HOSTS_FRACOS.some((x) => (x.includes('.') ? h === x || h.endsWith(`.${x}`) : h.includes(x)));
}

export interface DetalheSite {
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

export interface RespostaSite {
  status: number;
  urlFinal: string;
  html: string;
  tempoMs: number;
}

/** Normaliza a URL cadastrada no Google (sem esquema → http://) */
export function normalizarUrl(url: string): URL | null {
  try {
    const u = new URL(/^https?:\/\//i.test(url.trim()) ? url.trim() : `http://${url.trim()}`);
    return u.hostname.includes('.') ? u : null;
  } catch {
    return null;
  }
}

/** Classificação antes de acessar o site: vazio, inválido ou host fraco */
export function preClassificar(website: string | null | undefined): { status: StatusSite; detalhe: DetalheSite } | null {
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

export function extrairTitulo(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return null;
  const t = m[1].replace(/\s+/g, ' ').replace(/&amp;/g, '&').trim();
  return t || null;
}

/** Classificação a partir da resposta HTTP do site */
export function classificarResposta(urlOriginal: string, r: RespostaSite): { status: StatusSite; detalhe: DetalheSite } {
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
export function classificarFalha(urlOriginal: string, erro: string, tempoMs: number): { status: StatusSite; detalhe: DetalheSite } {
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

export interface DadosScore {
  status_site: StatusSite | 'desconhecido';
  rating: number | null;
  reviews_count: number;
  telefone: string | null;
  telefone_celular: boolean;
  horarios: unknown[] | null;
}

export interface ParcelaScore {
  item: string;
  pontos: number;
  detalhe: string;
}

/** Score 0–100 com as parcelas (auditável no painel) */
export function calcularScore(l: DadosScore): { score: number; parcelas: ParcelaScore[] } {
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

export interface DadosDescarte extends DadosScore {
  nome: string;
  status_negocio: string | null;
}

/** Motivo de descarte automático (ou null se o lead segue qualificado) */
export function motivoDescarte(
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

export const ROTULO_DESCARTE: Record<string, string> = {
  fechado_definitivamente: 'Fechado definitivamente',
  fechado_temporariamente: 'Fechado temporariamente',
  sem_telefone: 'Sem telefone',
  franquia_rede: 'Franquia / rede nacional',
  ja_tem_site: 'Já tem site bom',
  score_baixo: 'Score abaixo do mínimo',
  fora_do_perfil: 'Fora do perfil',
  previa_ruim: 'Prévia não ficou boa',
  dados_incorretos: 'Dados incorretos',
  sem_whatsapp: 'Sem telefone / WhatsApp',
  ja_cliente: 'Já é cliente',
  manual: 'Descartado manualmente',
};
