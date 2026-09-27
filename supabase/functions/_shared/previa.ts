// Montagem da prévia (regras puras): entrada da IA, dados factuais, slug e ajustes do conteúdo.
import { LIMITES, NICHO_PADRAO, ehNichoLP, type ConteudoLP, type NichoLP } from './conteudo.ts';
import { ehCelular, semAcento, somenteDigitos } from './normalizar.ts';

export interface AvaliacaoLead {
  autor: string;
  nota: number | null;
  texto: string;
  data: string;
}

export interface LeadParaPrevia {
  id: string;
  nome: string;
  nicho: string;
  cidade: string;
  bairro: string | null;
  endereco: string | null;
  telefone: string | null;
  telefone_celular: boolean;
  google_maps_url: string | null;
  rating: number | null;
  reviews_count: number;
  tipos: string[];
  tipo_principal: string | null;
  horarios: string[] | null;
  avaliacoes: AvaliacaoLead[];
  fotos: unknown[];
  status_site: string;
}

/** Conteúdo criativo retornado pela IA (já validado) */
export interface ConteudoIAValidado {
  tagline: string;
  hero: { titulo: string; subtitulo: string; cta_primario: string; cta_secundario: string };
  servicos: ConteudoLP['servicos'];
  diferenciais: ConteudoLP['diferenciais'];
  depoimentos: { indice_avaliacao: number; texto: string }[];
  faq: ConteudoLP['faq'];
  cta_final: ConteudoLP['cta_final'];
  seo: ConteudoLP['seo'];
  tema: ConteudoLP['tema'];
}

/** "Clínica Sorriso & Cia" + "Jardim América" → "clinica-sorriso-cia-jardim-america" */
export function gerarSlugBase(nome: string, bairro?: string | null): string {
  const base = semAcento(`${nome} ${bairro ?? ''}`)
    .toLowerCase()
    .replace(/&/g, ' e ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  let slug = base;
  if (slug.length > 60) {
    slug = slug.slice(0, 60);
    const i = slug.lastIndexOf('-');
    if (i > 20) slug = slug.slice(0, i);
  }
  return slug.replace(/-+$/g, '') || 'previa';
}

/** Primeiro slug livre: base, base-2, base-3… */
export function proximoSlugLivre(base: string, usados: Iterable<string>): string {
  const set = new Set(usados);
  if (!set.has(base)) return base;
  for (let i = 2; i < 1000; i++) if (!set.has(`${base}-${i}`)) return `${base}-${i}`;
  return `${base}-${Date.now().toString(36)}`;
}

const DIAS: Record<string, string> = {
  'segunda-feira': 'Segunda', 'terça-feira': 'Terça', 'terca-feira': 'Terça', 'quarta-feira': 'Quarta',
  'quinta-feira': 'Quinta', 'sexta-feira': 'Sexta', 'sábado': 'Sábado', 'sabado': 'Sábado', 'domingo': 'Domingo',
};

/** weekdayDescriptions do Google ("segunda-feira: 08:00–18:00") → [{ dia: "Segunda", horario: "08:00–18:00" }] */
export function horariosDoGoogle(desc: string[] | null | undefined): ConteudoLP['horarios'] {
  if (!desc?.length) return [];
  return desc
    .map((linha) => {
      const i = linha.indexOf(':');
      if (i < 0) return null;
      const diaBruto = linha.slice(0, i).trim().toLowerCase();
      const dia = DIAS[diaBruto] ?? diaBruto.charAt(0).toUpperCase() + diaBruto.slice(1);
      let horario = linha.slice(i + 1).trim().replace(/\u202f|\u2009/g, ' ');
      if (/^fechado$/i.test(horario)) horario = 'Fechado';
      if (/24 horas/i.test(horario)) horario = 'Aberto 24 horas';
      return { dia, horario };
    })
    .filter((x): x is { dia: string; horario: string } => !!x && !!x.horario);
}

const numBR = (n: number) => n.toLocaleString('pt-BR');

/** "Nota 4,8 no Google com mais de 230 avaliações" (arredonda para baixo; nunca aumenta números) */
export function fraseProvaSocial(rating: number | null, n: number): string {
  if (rating == null || !n) return '';
  const nota = rating.toFixed(1).replace('.', ',');
  if (n < 20) return `Nota ${nota} no Google com ${n} ${n === 1 ? 'avaliação' : 'avaliações'}`;
  const passo = n < 1000 ? 10 : 100;
  const arred = Math.floor(n / passo) * passo;
  return arred === n
    ? `Nota ${nota} no Google com ${numBR(n)} avaliações`
    : `Nota ${nota} no Google com mais de ${numBR(arred)} avaliações`;
}

export function telefoneExibicao(e164: string | null): string {
  const d = somenteDigitos(e164).replace(/^55/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return '';
}

/** Avaliações aproveitáveis como depoimento: nota ≥ 4 e com texto */
export function avaliacoesBoas(av: AvaliacaoLead[]): (AvaliacaoLead & { indice: number })[] {
  return (av ?? [])
    .map((a, indice) => ({ ...a, indice }))
    .filter((a) => (a.nota ?? 0) >= 4 && (a.texto ?? '').trim().length >= 15);
}

/** Dados enviados à IA (somente fatos coletados; nada de contato do operador) */
export function montarEntradaIA(l: LeadParaPrevia) {
  const nicho: NichoLP = ehNichoLP(l.nicho) ? l.nicho : 'servicos';
  return {
    nome: l.nome,
    nicho,
    tom_do_nicho: NICHO_PADRAO[nicho].tom,
    tipo_principal: l.tipo_principal,
    tipos: l.tipos,
    cidade: l.cidade,
    bairro: l.bairro,
    endereco: l.endereco,
    atende_whatsapp: l.telefone_celular,
    nota_google: l.rating,
    total_avaliacoes: l.reviews_count,
    horarios: l.horarios ?? [],
    avaliacoes: (l.avaliacoes ?? []).map((a, indice) => ({ indice, autor: a.autor, nota: a.nota, texto: a.texto, quando: a.data })),
    quantidade_fotos: Array.isArray(l.fotos) ? l.fotos.length : 0,
    situacao_do_site_atual:
      l.status_site === 'sem_site' ? 'não tem site' : l.status_site === 'site_fraco' ? 'site fraco ou só rede social' : 'tem site',
  };
}

/** Corta no limite sem quebrar palavra */
export function truncarPalavra(s: string, max: number): string {
  const t = s.trim().replace(/\s+/g, ' ');
  if (t.length <= max) return t;
  const cortado = t.slice(0, max + 1);
  const i = cortado.lastIndexOf(' ');
  return (i > max * 0.6 ? cortado.slice(0, i) : t.slice(0, max)).replace(/[\s,;:–—-]+$/, '');
}

type Qualquer = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : v);

/**
 * Ajustes suaves antes da validação: espaços, pontuação final de títulos, excesso de itens nas listas.
 * Com `truncar` (última tentativa), também encurta textos acima do limite em vez de reprovar.
 */
export function ajustarConteudoIA(bruto: unknown, truncar = false): unknown {
  if (!bruto || typeof bruto !== 'object') return bruto;
  const c = JSON.parse(JSON.stringify(bruto)) as Qualquer;
  const lim = (v: unknown, max: number, titulo = false): unknown => {
    const bruto = str(v);
    if (typeof bruto !== 'string') return bruto;
    const s = titulo ? bruto.replace(/[.;]+$/, '') : bruto;
    return truncar ? truncarPalavra(s, max) : s;
  };
  const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Qualquer) : null);
  const lista = (v: unknown, max: number) => (Array.isArray(v) ? v.slice(0, max) : v);

  c.tagline = lim(c.tagline, LIMITES.tagline, true);
  const hero = obj(c.hero);
  if (hero) {
    hero.titulo = lim(hero.titulo, LIMITES.titulo, true);
    hero.subtitulo = lim(hero.subtitulo, LIMITES.subtitulo);
    hero.cta_primario = lim(hero.cta_primario, LIMITES.cta, true);
    hero.cta_secundario = lim(hero.cta_secundario, LIMITES.cta, true);
  }
  c.servicos = lista(c.servicos, LIMITES.servicos.max);
  if (Array.isArray(c.servicos)) {
    for (const s of c.servicos.map(obj)) if (s) {
      s.titulo = lim(s.titulo, LIMITES.titulo, true);
      s.descricao = lim(s.descricao, LIMITES.descricao);
    }
  }
  c.diferenciais = lista(c.diferenciais, LIMITES.diferenciais.max);
  if (Array.isArray(c.diferenciais)) {
    for (const d of c.diferenciais.map(obj)) if (d) {
      d.titulo = lim(d.titulo, LIMITES.titulo, true);
      d.descricao = lim(d.descricao, LIMITES.descricao);
    }
  }
  if (Array.isArray(c.depoimentos)) {
    const vistos = new Set<unknown>();
    c.depoimentos = c.depoimentos
      .filter((d) => {
        const k = obj(d)?.indice_avaliacao;
        if (vistos.has(k)) return false;
        vistos.add(k);
        return true;
      })
      .slice(0, LIMITES.depoimentos.max);
    for (const d of (c.depoimentos as unknown[]).map(obj)) if (d) d.texto = lim(d.texto, LIMITES.depoimento);
  }
  c.faq = lista(c.faq, LIMITES.faq.max);
  if (Array.isArray(c.faq)) {
    for (const f of c.faq.map(obj)) if (f) {
      f.pergunta = str(f.pergunta);
      f.resposta = lim(f.resposta, LIMITES.resposta_faq);
    }
  }
  const cta = obj(c.cta_final);
  if (cta) {
    cta.titulo = lim(cta.titulo, LIMITES.titulo, true);
    cta.texto = lim(cta.texto, LIMITES.subtitulo);
    cta.botao = lim(cta.botao, LIMITES.cta, true);
  }
  const seo = obj(c.seo);
  if (seo) {
    seo.title = lim(seo.title, LIMITES.seo_title);
    seo.description = lim(seo.description, LIMITES.seo_description);
  }
  return c;
}

export const corHexValida = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim());

/** Luminância relativa (WCAG) */
export function luminancia(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Junta a parte criativa (IA) com os dados reais do lead → ConteudoLP final */
export function montarConteudoLP(l: LeadParaPrevia, ia: ConteudoIAValidado): { conteudo: ConteudoLP; avisos: string[] } {
  const avisos: string[] = [];
  const nicho: NichoLP = ehNichoLP(l.nicho) ? l.nicho : 'servicos';
  const padrao = NICHO_PADRAO[nicho];

  // Depoimentos: só avaliações reais (nota ≥ 4); autor, nota e data vêm do Google, nunca da IA
  const boas = new Map(avaliacoesBoas(l.avaliacoes).map((a) => [a.indice, a]));
  const depoimentos: ConteudoLP['depoimentos'] = [];
  for (const d of ia.depoimentos) {
    const real = boas.get(d.indice_avaliacao);
    if (!real) {
      avisos.push(`Depoimento descartado: avaliação ${d.indice_avaliacao} não existe ou tem nota < 4`);
      continue;
    }
    depoimentos.push({ autor: real.autor, nota: real.nota ?? 5, texto: d.texto, data: real.data });
  }

  let cor = corHexValida(ia.tema.cor_primaria) ? ia.tema.cor_primaria.trim().toLowerCase() : padrao.cor;
  if (!corHexValida(ia.tema.cor_primaria)) avisos.push(`Cor inválida da IA (${ia.tema.cor_primaria}); usando a padrão do nicho`);
  // Cores quase brancas somem nos templates claros
  if (luminancia(cor) > 0.8) {
    avisos.push(`Cor muito clara (${cor}); usando a padrão do nicho`);
    cor = padrao.cor;
  }

  const conteudo: ConteudoLP = {
    empresa: {
      nome: l.nome,
      tagline: ia.tagline,
      cidade: l.cidade,
      bairro: l.bairro ?? '',
      endereco: l.endereco ?? '',
      telefone_exibicao: telefoneExibicao(l.telefone),
      whatsapp_e164: l.telefone && (l.telefone_celular || ehCelular(l.telefone)) ? l.telefone : '',
      maps_url: l.google_maps_url ?? '',
    },
    hero: { ...ia.hero, foto_index: 0 },
    prova_social: {
      rating: l.rating ?? null,
      reviews_count: l.reviews_count ?? 0,
      frase: fraseProvaSocial(l.rating ?? null, l.reviews_count ?? 0),
    },
    servicos: ia.servicos,
    diferenciais: ia.diferenciais,
    depoimentos,
    horarios: horariosDoGoogle(l.horarios),
    faq: ia.faq,
    cta_final: ia.cta_final,
    seo: ia.seo,
    tema: { cor_primaria: cor, estilo: ia.tema.estilo },
  };
  return { conteudo, avisos };
}
