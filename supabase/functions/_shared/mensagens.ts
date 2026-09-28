// Modelos de mensagem de WhatsApp (pt-BR). Arquivo puro — usado nas Edge Functions e no painel.

export type TipoMensagem = 'primeiro_contato' | 'followup_1' | 'followup_2' | 'resposta_preco';

export interface DadosMensagem {
  lead_id: string;
  nome: string;
  rating: number | null;
  reviews_count: number;
  status_site: string;
  link: string;
  negocio_nome: string;
  preco_texto: string;
  data_limite?: string; // dd/MM/yyyy (follow-up 2)
  abriu?: boolean; // follow-up 1: lead abriu a prévia?
}

/** Três aberturas para as mensagens não parecerem disparo em massa */
const ABERTURAS = [
  'Oi, tudo bem? Falo com a equipe da {nome}?',
  'Olá! Tudo certo? É da {nome}?',
  'Oi! Aqui é da {negocio_nome}. Falo com o responsável pela {nome}?',
];

/** Índice estável por lead (a mesma pessoa sempre recebe a mesma variação) */
export function variacao(id: string, total: number): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % total;
}

/** Primeiro nome de pessoa quando o negócio usa nome próprio ("Dra. Ana Souza" → "Ana"); senão o nome da empresa */
export function primeiroNomeOuEmpresa(nome: string): string {
  const m = nome.match(/^(?:dra?\.?|doutora?|prof\.?)\s+([A-ZÀ-Ú][a-zà-ú]+)/i);
  return m ? m[1] : nome;
}

const nota = (r: number | null) => (r == null ? '' : r.toFixed(1).replace('.', ','));

/** Modelos editáveis em Configurações → Mensagens do WhatsApp (chave → texto com {campos}) */
export type ChaveModelo = 'primeiro_contato' | 'primeiro_contato_site_fraco' | 'followup_1' | 'followup_1_abriu' | 'followup_2';
export type ModelosMensagem = Partial<Record<ChaveModelo, string>>;

/** Textos padrão (usados quando o modelo não foi personalizado) */
export const MODELOS_PADRAO: Record<ChaveModelo, string> = {
  primeiro_contato: [
    '{saudacao}',
    '{frase_google}',
    'Montei uma prévia de como ficaria: {link}',
    'Se gostar, coloco no ar ainda essa semana. Posso te passar os valores?',
    '— {negocio_nome}',
  ].join('\n'),
  primeiro_contato_site_fraco: [
    '{saudacao}',
    'Vi que o site atual não abre bem no celular, e a maioria dos clientes chega por ele.',
    'Montei uma prévia moderna de como poderia ficar: {link}',
    'Posso te passar os valores?',
    '— {negocio_nome}',
  ].join('\n'),
  followup_1: 'Oi! Só reforçando: montei uma prévia de site para a {nome}. Dá uma olhada quando puder: {link}',
  followup_1_abriu: 'Oi! Vi que deu uma olhada na prévia do site da {nome}. O que achou? Posso ajustar o que quiser antes de colocar no ar.',
  followup_2: 'Última mensagem, prometo. A prévia da {nome} fica no ar até {data_limite}. Se fizer sentido, é só me chamar. Obrigado!',
};

/** Campos disponíveis nos modelos (mostrados no editor) */
export const CAMPOS_MODELO: { campo: string; descricao: string }[] = [
  { campo: 'saudacao', descricao: 'Saudação que varia entre 3 opções (evita parecer disparo em massa)' },
  { campo: 'nome', descricao: 'Nome da empresa' },
  { campo: 'primeiro_nome_ou_empresa', descricao: 'Primeiro nome (ex.: "Dra. Ana Souza" → Ana) ou o nome da empresa' },
  { campo: 'frase_google', descricao: 'Frase sobre a nota no Google (ou "Encontrei vocês no Google Maps…" quando há poucas avaliações)' },
  { campo: 'rating', descricao: 'Nota no Google (ex.: 4,8)' },
  { campo: 'reviews_count', descricao: 'Número de avaliações no Google' },
  { campo: 'link', descricao: 'Link da prévia do site' },
  { campo: 'negocio_nome', descricao: 'Nome do seu negócio (Configurações)' },
  { campo: 'preco_texto', descricao: 'Texto de preço (Configurações)' },
  { campo: 'data_limite', descricao: 'Data até quando a prévia fica no ar (follow-up 2)' },
];

/** Modelo em uso: o personalizado (se preenchido) ou o padrão */
export function modeloDe(chave: ChaveModelo, modelos?: ModelosMensagem | null): string {
  const personalizado = modelos?.[chave]?.trim();
  return personalizado || MODELOS_PADRAO[chave];
}

export function preencher(modelo: string, d: DadosMensagem): string {
  const temNota = d.rating != null && d.reviews_count >= 5;
  const valores: Record<string, string> = {
    saudacao: preencherSimples(ABERTURAS[variacao(d.lead_id, ABERTURAS.length)], d),
    nome: d.nome,
    primeiro_nome_ou_empresa: primeiroNomeOuEmpresa(d.nome),
    frase_google: temNota
      ? `Vi que vocês têm ${nota(d.rating)}★ com ${d.reviews_count.toLocaleString('pt-BR')} avaliações no Google, mas ainda não têm site.`
      : 'Encontrei vocês no Google Maps e vi que ainda não têm site.',
    rating: nota(d.rating),
    reviews_count: d.reviews_count.toLocaleString('pt-BR'),
    link: d.link,
    negocio_nome: d.negocio_nome,
    preco_texto: d.preco_texto,
    data_limite: d.data_limite ?? '',
  };
  return modelo.replace(/\{(\w+)\}/g, (m, k) => (k in valores ? valores[k] : m));
}

/** Preenche só os campos simples (usado dentro da saudação, sem recursão) */
function preencherSimples(modelo: string, d: DadosMensagem): string {
  return modelo.replace(/\{(nome|negocio_nome)\}/g, (_m, k) => (k === 'nome' ? d.nome : d.negocio_nome));
}

export function textoMensagem(tipo: TipoMensagem, d: DadosMensagem, modelos?: ModelosMensagem | null): string {
  let modelo: string;
  switch (tipo) {
    case 'primeiro_contato':
      modelo = modeloDe(d.status_site === 'site_fraco' ? 'primeiro_contato_site_fraco' : 'primeiro_contato', modelos);
      break;
    case 'followup_1':
      modelo = modeloDe(d.abriu ? 'followup_1_abriu' : 'followup_1', modelos);
      break;
    case 'followup_2':
      modelo = modeloDe('followup_2', modelos);
      break;
    case 'resposta_preco':
      modelo =
        'O site sai {preco_texto}, com domínio, hospedagem no primeiro ano, botão de WhatsApp e ajustes de conteúdo inclusos. Entrego em até 5 dias úteis. Quer que eu já comece?';
      break;
  }
  return preencher(modelo, d).replace(/\n{3,}/g, '\n\n').trim();
}

/** Link da prévia enviado ao lead (com token de rastreio) */
export function linkPrevia(appUrl: string, slug: string, token: string): string {
  return `${appUrl.replace(/\/+$/, '')}/p/${slug}?k=${token}`;
}
