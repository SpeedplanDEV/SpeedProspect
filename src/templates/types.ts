// Tipos dos templates de landing page. O contrato do conteúdo (ConteudoLP) é o mesmo das Edge Functions.
export type { ConteudoLP, EstiloLP, IconeLP, NichoLP } from '@shared/conteudo';
import type { ConteudoLP } from '@shared/conteudo';

export interface InfoPrevia {
  negocioNome: string;
  negocioWhatsapp: string; // E.164 do operador (botão "Quero esse site")
  slug: string;
  token: string | null; // token do link enviado (?k=)
  tokenOptout: string | null;
  demo?: boolean;
}

export interface PropsTemplate {
  conteudo: ConteudoLP;
  /** URLs das fotos reais (Edge Function `foto`), na ordem do Google */
  fotos: string[];
  /** Autores das fotos, exibidos no rodapé (exigência do Google) */
  atribuicoes: string[];
  previa: InfoPrevia;
  /** Avaliações positivas reais do Google (nota >= 4), direto dos dados coletados */
  avaliacoes?: AvaliacaoPublica[];
  /** Chamado quando o visitante clica para falar com a empresa */
  aoContatar?: () => void;
}

export interface AvaliacaoPublica {
  autor: string;
  nota: number;
  texto: string;
  data: string;
}
