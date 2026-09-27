import { z } from 'zod';
import { somenteDigitos } from './format';

// Modelos de IA disponíveis (confirmar nomes em https://docs.claude.com/en/docs/about-claude/models)
export const MODELOS_IA = [
  { valor: 'claude-sonnet-5', rotulo: 'Claude Sonnet 5 — melhor texto (US$ 2 / US$ 10 por milhão de tokens)' },
  { valor: 'claude-haiku-4-5', rotulo: 'Claude Haiku 4.5 — econômico (US$ 1 / US$ 5 por milhão de tokens)' },
] as const;

const inteiro = (min: number, max: number) =>
  z.coerce.number({ invalid_type_error: 'Informe um número' }).int('Use um número inteiro').min(min, `Mínimo ${min}`).max(max, `Máximo ${max}`);

export const configuracoesSchema = z.object({
  negocio_nome: z.string().trim().min(1, 'Informe o nome do negócio'),
  negocio_whatsapp: z
    .string()
    .trim()
    .transform((v) => {
      if (!v) return '';
      const d = somenteDigitos(v);
      return `+${d.startsWith('55') ? d : `55${d}`}`;
    })
    .refine((v) => v === '' || /^\+55\d{10,11}$/.test(v), 'WhatsApp inválido. Ex.: (17) 99999-9999'),
  app_url: z
    .string()
    .trim()
    .transform((v) => v.replace(/\/+$/, ''))
    .refine((v) => v === '' || /^https?:\/\/.+/.test(v), 'URL deve começar com http:// ou https://'),
  limite_buscas_dia: inteiro(0, 1000),
  limite_geracoes_dia: inteiro(0, 1000),
  limite_envios_dia: inteiro(0, 500),
  auto_aprovar: z.boolean(),
  score_minimo: inteiro(0, 100),
  prospectar_site_ok: z.boolean(),
  modelo_ia: z.string().trim().min(1, 'Informe o modelo'),
  preco_texto: z.string().trim().min(1, 'Informe o texto de preço'),
});
export type ConfiguracoesForm = z.input<typeof configuracoesSchema>;
export type ConfiguracoesDados = z.output<typeof configuracoesSchema>;

export const campanhaSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome da campanha'),
  nicho: z.enum(['saude', 'alimentacao', 'automotivo', 'beleza', 'servicos'], {
    errorMap: () => ({ message: 'Escolha o nicho' }),
  }),
  cidade: z.string().trim().min(2, 'Informe a cidade'),
  uf: z.string().length(2, 'UF inválida'),
  termos_busca: z.array(z.string().trim().min(1)).min(1, 'Adicione ao menos um termo de busca'),
  bairros: z.array(z.string().trim().min(1)),
  ativa: z.boolean(),
  max_leads_execucao: inteiro(1, 500),
});
export type CampanhaForm = z.input<typeof campanhaSchema>;
export type CampanhaDados = z.output<typeof campanhaSchema>;
