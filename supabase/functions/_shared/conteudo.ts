// Contrato do conteúdo das landing pages (ConteudoLP) — compartilhado entre Edge Functions e painel.
// Arquivo puro: sem imports, roda em Deno, Node (Vitest) e no navegador.

export type NichoLP = 'saude' | 'alimentacao' | 'automotivo' | 'beleza' | 'servicos';

export const ICONES = [
  'stethoscope', 'utensils', 'wrench', 'scissors', 'hammer', 'sparkles', 'shield', 'clock', 'map-pin', 'star',
  'heart', 'smile', 'car', 'coffee', 'truck', 'check', 'phone', 'calendar', 'zap', 'droplet', 'leaf', 'home',
] as const;
export type IconeLP = (typeof ICONES)[number];

export const ESTILOS = ['clean', 'bold', 'elegante'] as const;
export type EstiloLP = (typeof ESTILOS)[number];

export interface ConteudoLP {
  empresa: {
    nome: string;
    tagline: string;
    cidade: string;
    bairro: string;
    endereco: string;
    telefone_exibicao: string;
    whatsapp_e164: string; // vazio quando o telefone não é celular
    maps_url: string;
  };
  hero: { titulo: string; subtitulo: string; cta_primario: string; cta_secundario: string; foto_index: number };
  prova_social: { rating: number | null; reviews_count: number; frase: string };
  servicos: { titulo: string; descricao: string; icone: IconeLP }[];
  diferenciais: { titulo: string; descricao: string }[];
  depoimentos: { autor: string; nota: number; texto: string; data: string }[];
  horarios: { dia: string; horario: string }[];
  faq: { pergunta: string; resposta: string }[];
  cta_final: { titulo: string; texto: string; botao: string };
  seo: { title: string; description: string };
  tema: { cor_primaria: string; estilo: EstiloLP };
}

/** Limites do conteúdo (validados no servidor e informados à IA) */
export const LIMITES = {
  servicos: { min: 4, max: 6 },
  diferenciais: { min: 3, max: 4 },
  depoimentos: { max: 3 },
  faq: { min: 3, max: 5 },
  titulo: 60,
  subtitulo: 170,
  descricao: 170,
  tagline: 80,
  cta: 32,
  resposta_faq: 320,
  depoimento: 360,
  seo_title: 60,
  seo_description: 160,
} as const;

/** Identidade padrão de cada nicho (cor usada quando a sugerida pela IA é inválida) */
export const NICHO_PADRAO: Record<NichoLP, { cor: string; estilo: EstiloLP; tom: string }> = {
  saude: { cor: '#0f766e', estilo: 'clean', tom: 'confiança, cuidado e acolhimento' },
  alimentacao: { cor: '#c2410c', estilo: 'bold', tom: 'apetite, sabor e ambiente convidativo' },
  automotivo: { cor: '#f59e0b', estilo: 'bold', tom: 'rapidez, transparência e honestidade' },
  beleza: { cor: '#9f4a67', estilo: 'elegante', tom: 'autoestima, cuidado e resultado' },
  servicos: { cor: '#1d4ed8', estilo: 'clean', tom: 'urgência resolvida, confiança e garantia de bom serviço' },
};

export const ehNichoLP = (v: string): v is NichoLP => v in NICHO_PADRAO;
