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
  negocio_logo: string | null;
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

export type StatusSite = 'desconhecido' | 'sem_site' | 'site_fraco' | 'site_ok';
export type StatusFunil =
  | 'novo' | 'qualificado' | 'descartado' | 'previa_gerada' | 'aprovado' | 'enviado'
  | 'abriu' | 'respondeu' | 'negociando' | 'fechado' | 'perdido' | 'nao_contatar';

export const STATUS_FUNIL: { valor: StatusFunil; rotulo: string; cor: 'cinza' | 'verde' | 'vermelho' | 'azul' | 'amarelo' }[] = [
  { valor: 'novo', rotulo: 'Novo', cor: 'cinza' },
  { valor: 'qualificado', rotulo: 'Qualificado', cor: 'azul' },
  { valor: 'descartado', rotulo: 'Descartado', cor: 'vermelho' },
  { valor: 'previa_gerada', rotulo: 'Prévia gerada', cor: 'azul' },
  { valor: 'aprovado', rotulo: 'Aprovado', cor: 'azul' },
  { valor: 'enviado', rotulo: 'Enviado', cor: 'amarelo' },
  { valor: 'abriu', rotulo: 'Abriu', cor: 'amarelo' },
  { valor: 'respondeu', rotulo: 'Respondeu', cor: 'verde' },
  { valor: 'negociando', rotulo: 'Negociando', cor: 'verde' },
  { valor: 'fechado', rotulo: 'Fechado', cor: 'verde' },
  { valor: 'perdido', rotulo: 'Perdido', cor: 'vermelho' },
  { valor: 'nao_contatar', rotulo: 'Não contatar', cor: 'vermelho' },
];
export const statusFunil = (v: string) => STATUS_FUNIL.find((s) => s.valor === v) ?? { valor: v, rotulo: v, cor: 'cinza' as const };

export const STATUS_SITE: Record<StatusSite, { rotulo: string; cor: 'cinza' | 'verde' | 'vermelho' | 'amarelo' }> = {
  desconhecido: { rotulo: 'Não verificado', cor: 'cinza' },
  sem_site: { rotulo: 'Sem site', cor: 'vermelho' },
  site_fraco: { rotulo: 'Site fraco', cor: 'amarelo' },
  site_ok: { rotulo: 'Site ok', cor: 'verde' },
};

export interface FotoLead {
  name: string;
  width: number | null;
  height: number | null;
  atribuicao: string | null;
  atribuicao_uri?: string | null;
}
export interface AvaliacaoLead {
  autor: string;
  nota: number | null;
  texto: string;
  data: string;
}

export interface Lead {
  id: string;
  campanha_id: string | null;
  place_id: string;
  nome: string;
  nicho: string;
  cidade: string;
  bairro: string | null;
  endereco: string | null;
  telefone: string | null;
  telefone_celular: boolean;
  website: string | null;
  google_maps_url: string | null;
  rating: number | null;
  reviews_count: number;
  tipos: string[];
  tipo_principal: string | null;
  horarios: string[] | null;
  fotos: FotoLead[];
  avaliacoes: AvaliacaoLead[];
  status_negocio: string | null;
  status_site: StatusSite;
  detalhe_site: Record<string, unknown> | null;
  score: number;
  status_funil: StatusFunil;
  motivo_descarte: string | null;
  observacoes: string | null;
  places_atualizado_em: string;
  coletado_em: string;
  atualizado_em: string;
}

export interface Evento {
  id: number;
  tipo: string;
  via_link: boolean;
  criado_em: string;
}
export interface Mensagem {
  id: string;
  lead_id: string;
  tipo: string;
  texto: string;
  status: string;
  agendada_para: string;
  enviada_em: string | null;
  motivo_pulo?: string | null;
  criado_em: string;
}

export interface Site {
  id: string;
  lead_id: string;
  slug: string;
  template: string;
  conteudo: import('@shared/conteudo').ConteudoLP;
  token_acesso: string;
  token_optout: string;
  publicado: boolean;
  versao: number;
  modelo_ia: string | null;
  tokens_entrada: number | null;
  tokens_saida: number | null;
  custo_estimado: number | null;
  instrucao_extra: string | null;
  criado_em: string;
  atualizado_em: string;
  publicado_em: string | null;
}
