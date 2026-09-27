// Schemas da geração de conteúdo: JSON Schema da tool (enviado à Claude API) + validação zod do retorno.
import { z } from 'npm:zod@3';
import { ESTILOS, ICONES, LIMITES } from './conteudo.ts';

export const NOME_TOOL = 'gerar_conteudo_lp';

const texto = (descricao: string) => ({ type: 'string', description: descricao });
const objeto = (props: Record<string, unknown>) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(props),
  properties: props,
});

/**
 * Parte criativa do ConteudoLP que a IA escreve. Os dados factuais (empresa, nota, número de avaliações,
 * horários, autor/nota/data dos depoimentos) são preenchidos pelo sistema a partir dos dados reais do Google.
 * Sem minItems/maxLength no JSON Schema (compatível com strict tool use) — limites vão nas descrições e no zod.
 */
export const INPUT_SCHEMA_TOOL = objeto({
  tagline: texto(`Frase curta que resume o negócio (até ${LIMITES.tagline} caracteres).`),
  hero: objeto({
    titulo: texto(`Título principal da página, até ${LIMITES.titulo} caracteres. Específico para este negócio, sem clichês.`),
    subtitulo: texto(`Complemento do título, 1 ou 2 frases, até ${LIMITES.subtitulo} caracteres.`),
    cta_primario: texto(`Texto do botão principal que abre o WhatsApp, até ${LIMITES.cta} caracteres (ex.: "Agendar pelo WhatsApp").`),
    cta_secundario: texto(`Texto do botão secundário que rola até os serviços, até ${LIMITES.cta} caracteres (ex.: "Ver serviços").`),
  }),
  servicos: {
    type: 'array',
    description: `Entre ${LIMITES.servicos.min} e ${LIMITES.servicos.max} serviços típicos e coerentes com o tipo do negócio.`,
    items: objeto({
      titulo: texto(`Nome do serviço, até ${LIMITES.titulo} caracteres.`),
      descricao: texto(`Descrição do benefício para o cliente, até ${LIMITES.descricao} caracteres, sem prometer o que não está nos dados.`),
      icone: { type: 'string', enum: [...ICONES], description: 'Ícone que melhor representa o serviço.' },
    }),
  },
  diferenciais: {
    type: 'array',
    description: `Entre ${LIMITES.diferenciais.min} e ${LIMITES.diferenciais.max} motivos para escolher o negócio, baseados nos dados reais.`,
    items: objeto({
      titulo: texto(`Até ${LIMITES.titulo} caracteres.`),
      descricao: texto(`Até ${LIMITES.descricao} caracteres.`),
    }),
  },
  depoimentos: {
    type: 'array',
    description: `Até ${LIMITES.depoimentos.max} depoimentos escolhidos SOMENTE entre as avaliações fornecidas com nota 4 ou 5. Lista vazia se não houver.`,
    items: objeto({
      indice_avaliacao: { type: 'integer', description: 'Índice ("indice") da avaliação usada, exatamente como veio nos dados.' },
      texto: texto(`Texto da avaliação, podendo ser resumido sem mudar o sentido e sem acrescentar nada, até ${LIMITES.depoimento} caracteres.`),
    }),
  },
  faq: {
    type: 'array',
    description: `Entre ${LIMITES.faq.min} e ${LIMITES.faq.max} perguntas frequentes respondidas apenas com os dados fornecidos.`,
    items: objeto({
      pergunta: texto('Pergunta que um cliente real faria.'),
      resposta: texto(`Resposta objetiva, até ${LIMITES.resposta_faq} caracteres.`),
    }),
  },
  cta_final: objeto({
    titulo: texto(`Chamada final, até ${LIMITES.titulo} caracteres.`),
    texto: texto(`Uma ou duas frases convidando a chamar no WhatsApp, até ${LIMITES.subtitulo} caracteres.`),
    botao: texto(`Texto do botão, até ${LIMITES.cta} caracteres.`),
  }),
  seo: objeto({
    title: texto(`Título da aba/Google com o nome da empresa e a cidade, até ${LIMITES.seo_title} caracteres.`),
    description: texto(`Meta description, até ${LIMITES.seo_description} caracteres.`),
  }),
  tema: objeto({
    cor_primaria: texto('Cor principal em hexadecimal #RRGGBB, adequada ao nicho; evite cores muito claras.'),
    estilo: { type: 'string', enum: [...ESTILOS], description: 'clean (leve), bold (forte) ou elegante (refinado).' },
  }),
});

const t = (max: number) => z.string().trim().min(1, 'não pode ficar vazio').max(max, `máximo de ${max} caracteres`);

export const ConteudoIASchema = z.object({
  tagline: t(LIMITES.tagline),
  hero: z.object({
    titulo: t(LIMITES.titulo),
    subtitulo: t(LIMITES.subtitulo),
    cta_primario: t(LIMITES.cta),
    cta_secundario: t(LIMITES.cta),
  }),
  servicos: z
    .array(z.object({ titulo: t(LIMITES.titulo), descricao: t(LIMITES.descricao), icone: z.enum(ICONES) }))
    .min(LIMITES.servicos.min, `mínimo de ${LIMITES.servicos.min} serviços`)
    .max(LIMITES.servicos.max, `máximo de ${LIMITES.servicos.max} serviços`),
  diferenciais: z
    .array(z.object({ titulo: t(LIMITES.titulo), descricao: t(LIMITES.descricao) }))
    .min(LIMITES.diferenciais.min, `mínimo de ${LIMITES.diferenciais.min} diferenciais`)
    .max(LIMITES.diferenciais.max, `máximo de ${LIMITES.diferenciais.max} diferenciais`),
  depoimentos: z
    .array(z.object({ indice_avaliacao: z.number().int().min(0), texto: t(LIMITES.depoimento) }))
    .max(LIMITES.depoimentos.max, `máximo de ${LIMITES.depoimentos.max} depoimentos`),
  faq: z
    .array(z.object({ pergunta: t(200), resposta: t(LIMITES.resposta_faq) }))
    .min(LIMITES.faq.min, `mínimo de ${LIMITES.faq.min} perguntas`)
    .max(LIMITES.faq.max, `máximo de ${LIMITES.faq.max} perguntas`),
  cta_final: z.object({ titulo: t(LIMITES.titulo), texto: t(LIMITES.subtitulo), botao: t(LIMITES.cta) }),
  seo: z.object({ title: t(LIMITES.seo_title), description: t(LIMITES.seo_description) }),
  tema: z.object({ cor_primaria: z.string().trim(), estilo: z.enum(ESTILOS) }),
});
export type ConteudoIA = z.infer<typeof ConteudoIASchema>;

/** Lista de erros legível (em pt-BR) para devolver à IA na nova tentativa */
export function errosZod(e: z.ZodError): string[] {
  return e.issues.slice(0, 20).map((i) => `${i.path.join('.') || '(raiz)'}: ${i.message}`);
}

// Schema completo do ConteudoLP salvo em sites.conteudo (usado para validar edições no painel)
export const ConteudoLPSchema = z.object({
  empresa: z.object({
    nome: z.string().min(1),
    tagline: z.string(),
    cidade: z.string(),
    bairro: z.string(),
    endereco: z.string(),
    telefone_exibicao: z.string(),
    whatsapp_e164: z.string(),
    maps_url: z.string(),
  }),
  hero: z.object({
    titulo: t(LIMITES.titulo),
    subtitulo: t(LIMITES.subtitulo),
    cta_primario: t(LIMITES.cta),
    cta_secundario: t(LIMITES.cta),
    foto_index: z.number().int().min(0),
  }),
  prova_social: z.object({ rating: z.number().nullable(), reviews_count: z.number().int().min(0), frase: z.string() }),
  servicos: z.array(z.object({ titulo: t(LIMITES.titulo), descricao: t(LIMITES.descricao), icone: z.enum(ICONES) })).min(1).max(8),
  diferenciais: z.array(z.object({ titulo: t(LIMITES.titulo), descricao: t(LIMITES.descricao) })).max(6),
  depoimentos: z.array(z.object({ autor: z.string(), nota: z.number(), texto: z.string(), data: z.string() })).max(3),
  horarios: z.array(z.object({ dia: z.string(), horario: z.string() })),
  faq: z.array(z.object({ pergunta: z.string().min(1), resposta: z.string().min(1) })).max(6),
  cta_final: z.object({ titulo: t(LIMITES.titulo), texto: t(LIMITES.subtitulo), botao: t(LIMITES.cta) }),
  seo: z.object({ title: z.string().max(LIMITES.seo_title + 10), description: z.string().max(LIMITES.seo_description + 20) }),
  tema: z.object({ cor_primaria: z.string().regex(/^#[0-9a-fA-F]{6}$/), estilo: z.enum(ESTILOS) }),
});
