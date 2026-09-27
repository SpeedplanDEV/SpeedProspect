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

export function preencher(modelo: string, d: DadosMensagem): string {
  const valores: Record<string, string> = {
    nome: d.nome,
    primeiro_nome_ou_empresa: primeiroNomeOuEmpresa(d.nome),
    rating: nota(d.rating),
    reviews_count: d.reviews_count.toLocaleString('pt-BR'),
    link: d.link,
    negocio_nome: d.negocio_nome,
    preco_texto: d.preco_texto,
    data_limite: d.data_limite ?? '',
  };
  return modelo.replace(/\{(\w+)\}/g, (m, k) => (k in valores ? valores[k] : m));
}

export function textoMensagem(tipo: TipoMensagem, d: DadosMensagem): string {
  const abertura = ABERTURAS[variacao(d.lead_id, ABERTURAS.length)];
  const temNota = d.rating != null && d.reviews_count >= 5;
  let corpo: string[];

  switch (tipo) {
    case 'primeiro_contato':
      if (d.status_site === 'site_fraco') {
        corpo = [
          abertura,
          'Vi que o site atual não abre bem no celular, e a maioria dos clientes chega por ele.',
          'Montei uma prévia moderna de como poderia ficar: {link}',
          'Posso te passar os valores?',
          '— {negocio_nome}',
        ];
      } else {
        corpo = [
          abertura,
          temNota
            ? 'Vi que vocês têm {rating}★ com {reviews_count} avaliações no Google, mas ainda não têm site.'
            : 'Encontrei vocês no Google Maps e vi que ainda não têm site.',
          'Montei uma prévia de como ficaria: {link}',
          'Se gostar, coloco no ar ainda essa semana. Posso te passar os valores?',
          '— {negocio_nome}',
        ];
      }
      break;
    case 'followup_1':
      corpo = d.abriu
        ? ['Oi! Vi que deu uma olhada na prévia do site da {nome}. O que achou? Posso ajustar o que quiser antes de colocar no ar.']
        : ['Oi! Só reforçando: montei uma prévia de site para a {nome}. Dá uma olhada quando puder: {link}'];
      break;
    case 'followup_2':
      corpo = ['Última mensagem, prometo. A prévia da {nome} fica no ar até {data_limite}. Se fizer sentido, é só me chamar. Obrigado!'];
      break;
    case 'resposta_preco':
      corpo = [
        'O site sai {preco_texto}, com domínio, hospedagem no primeiro ano, botão de WhatsApp e ajustes de conteúdo inclusos. Entrego em até 5 dias úteis. Quer que eu já comece?',
      ];
      break;
  }
  return preencher(corpo.join('\n'), d);
}

/** Link da prévia enviado ao lead (com token de rastreio) */
export function linkPrevia(appUrl: string, slug: string, token: string): string {
  return `${appUrl.replace(/\/+$/, '')}/p/${slug}?k=${token}`;
}
