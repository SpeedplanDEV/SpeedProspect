// Tipos das tabelas (espelham supabase/migrations)

export type Nicho = 'saude' | 'alimentacao' | 'automotivo' | 'beleza' | 'servicos';

export const NICHOS: { valor: Nicho; rotulo: string }[] = [
  { valor: 'saude', rotulo: 'Saúde' },
  { valor: 'alimentacao', rotulo: 'Alimentação' },
  { valor: 'automotivo', rotulo: 'Automotivo' },
  { valor: 'beleza', rotulo: 'Beleza' },
  { valor: 'servicos', rotulo: 'Serviços' },
];

export const rotuloNicho = (n: string) => NICHOS.find((x) => x.valor === n)?.rotulo ?? n;

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;

export interface Configuracoes {
  id: number;
  negocio_nome: string;
  negocio_whatsapp: string;
  app_url: string;
  limite_buscas_dia: number;
  limite_geracoes_dia: number;
  limite_envios_dia: number;
  auto_aprovar: boolean;
  score_minimo: number;
  prospectar_site_ok: boolean;
  modelo_ia: string;
  preco_texto: string;
  atualizado_em: string;
}

export interface Campanha {
  id: string;
  nome: string;
  nicho: Nicho;
  cidade: string;
  uf: string;
  termos_busca: string[];
  bairros: string[];
  ativa: boolean;
  max_leads_execucao: number;
  ultima_execucao: string | null;
  criado_em: string;
}

export interface EntradaLog {
  em?: string;
  nivel?: 'info' | 'aviso' | 'erro';
  msg?: string;
  [chave: string]: unknown;
}

export interface Execucao {
  id: string;
  etapa: string;
  campanha_id: string | null;
  iniciado_em: string;
  finalizado_em: string | null;
  sucesso: boolean | null;
  itens_processados: number;
  custo_estimado: number;
  log: EntradaLog[];
  erro: string | null;
}
