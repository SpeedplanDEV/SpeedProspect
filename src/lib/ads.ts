// SpeedProspect Ads (Meta Ads): tipos do banco, valores em centavos e chamadas às Edge Functions da Meta.
// O painel nunca chama a Meta direto: tudo passa por meta-ativos / meta-sync (o token fica no servidor).
import type { NivelSaude, SaudeConta } from '@shared/meta-mapa';
import { chamarFuncao } from './funcoes';
import { formatarMoeda } from './format';

export type { NivelSaude, SaudeConta };

export interface ContaAds {
  id: string;
  nome: string;
  tipo: 'agencia' | 'cliente';
  lead_id: string | null;
  meta_ad_account_id: string;
  meta_business_id: string | null;
  meta_page_id: string | null;
  meta_page_nome: string | null;
  meta_instagram_id: string | null;
  meta_instagram_usuario: string | null;
  meta_pixel_id: string | null;
  meta_pixel_nome: string | null;
  whatsapp_numero: string | null;
  moeda: string;
  fuso: string;
  teto_diario_centavos: number;
  teto_mensal_centavos: number;
  modo_otimizacao: 'sugerir' | 'automatico';
  taxa_gestao_centavos: number;
  taxa_gestao_percentual: number;
  ativa: boolean;
  saude: SaudeConta | null;
  saude_em: string | null;
  sincronizado_em: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface MidiaAds {
  id: string;
  conta_id: string;
  storage_path: string;
  nome_original: string | null;
  tipo: 'imagem' | 'video';
  mime: string;
  largura: number | null;
  altura: number | null;
  proporcao: '1x1' | '4x5' | '9x16' | null;
  duracao_s: number | null;
  tamanho_bytes: number;
  origem: 'cliente' | 'agencia' | 'print_previa';
  descricao: string | null;
  criado_em: string;
}

// ----- Valores: a Meta trabalha em centavos (daily_budget: 3000 = R$ 30,00) -----
export const centavosParaReais = (c: number | null | undefined) => (c ?? 0) / 100;
export const reaisParaCentavos = (r: number) => Math.round(r * 100);
export const formatarCentavos = (c: number | null | undefined) => formatarMoeda(centavosParaReais(c));

/** Converte "1.497,50" / "1497.5" / "R$ 30" em reais (número) ou null */
export function lerReais(texto: string | number): number | null {
  if (typeof texto === 'number') return Number.isFinite(texto) ? texto : null;
  const limpo = texto.replace(/[^\d,.-]/g, '');
  if (!limpo) return null;
  const normal = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo;
  const n = Number(normal);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

// ----- Respostas das Edge Functions -----
export interface DiagnosticoMeta {
  ok: boolean;
  versao: string;
  usuario: { id: string; nome: string | null };
  token: { tipo?: string; valido?: boolean; expira_em?: string | null };
  permissoes: { concedidas: string[]; faltando: string[]; opcionais_faltando: string[] };
  avisos: string[];
}
export interface ContaMetaDisponivel {
  id: string;
  nome: string;
  moeda: string;
  fuso: string | null;
  status: number | null;
  status_rotulo: string;
  status_nivel: NivelSaude;
  business: { id: string; nome: string | null } | null;
  pagamento: boolean | null;
  pagamento_texto: string | null;
  orcamento_minimo_centavos: number | null;
  conectada: boolean;
}
export interface PaginaMetaDisponivel {
  id: string;
  nome: string;
  categoria: string | null;
  foto: string | null;
  instagram: { id: string; usuario: string | null } | null;
  whatsapp: { conectado: boolean; numero: string | null } | null;
  pode_anunciar: boolean;
}
export interface PixelMeta {
  id: string;
  nome: string;
  ultimo_evento: string | null;
  indisponivel: boolean;
}
export interface ResultadoSaude {
  verificadas: number;
  contas: { conta_id: string; nome: string; saude: SaudeConta }[];
}
export interface ResultadoSync {
  ok: boolean;
  contas: {
    conta_id: string;
    nome: string;
    listados?: { campanhas: number; conjuntos: number; anuncios: number };
    truncado?: boolean;
    pulada?: boolean;
    erro?: string;
    orientacao?: string;
  }[];
  chamadas: number;
  mensagem?: string;
}

export const metaDiagnostico = () => chamarFuncao<DiagnosticoMeta>('meta-ativos', { acao: 'diagnostico' });
export const metaListar = () =>
  chamarFuncao<{ contas: ContaMetaDisponivel[]; paginas: PaginaMetaDisponivel[] }>('meta-ativos', { acao: 'listar' });
export const metaPixels = (adAccountId: string) =>
  chamarFuncao<{ pixels: PixelMeta[] }>('meta-ativos', { acao: 'pixels', ad_account_id: adAccountId });
export const metaSaude = (contaId?: string) =>
  chamarFuncao<ResultadoSaude>('meta-ativos', { acao: 'saude', ...(contaId ? { conta_id: contaId } : {}) });
export const metaSincronizar = (contaId?: string) =>
  chamarFuncao<ResultadoSync>('meta-sync', contaId ? { conta_id: contaId } : {});

/** Resumo legível da sincronização */
export function textoSync(r: ResultadoSync): string {
  if (r.mensagem) return r.mensagem;
  const erros = r.contas.filter((c) => c.erro);
  if (erros.length === r.contas.length && erros.length) return `Falha ao sincronizar: ${erros[0].erro}`;
  const t = r.contas.reduce(
    (s, c) => ({
      c: s.c + (c.listados?.campanhas ?? 0),
      a: s.a + (c.listados?.anuncios ?? 0),
    }),
    { c: 0, a: 0 },
  );
  const extra = erros.length ? ` ${erros.length} conta(s) com erro.` : '';
  return `Sincronizado: ${t.c} campanha(s) e ${t.a} anúncio(s) lidos da Meta.${extra}`;
}

export const ROTULO_TIPO_CONTA = { agencia: 'Agência', cliente: 'Cliente' } as const;
export const ROTULO_MODO = {
  sugerir: 'Sugerir (você aprova cada ação)',
  automatico: 'Automático (só pausa; o resto é sugerido)',
} as const;
