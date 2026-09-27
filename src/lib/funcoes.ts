import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';

export { urlFoto } from './config';

/** Chama uma Edge Function administrativa com o JWT do operador logado */
export async function chamarFuncao<T = unknown>(nome: string, corpo: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke(nome, { body: corpo });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const det = await error.context.json().catch(() => null);
      throw new Error(det?.erro ? `${det.erro}${det.detalhe ? ` (${det.detalhe})` : ''}` : error.message);
    }
    if (/failed to send|fetch/i.test(error.message)) {
      throw new Error(`A Edge Function "${nome}" não respondeu. Ela já foi publicada no Supabase?`);
    }
    throw error;
  }
  return data as T;
}

export interface ResumoColeta {
  ok: boolean;
  buscas_restantes_hoje: number;
  resumo: { campanha: string; novos?: number; atualizados?: number; em_cache?: number; buscas?: number; erro?: string; limite_atingido?: boolean }[];
}

export function textoResumoColeta(r: ResumoColeta): string {
  const novos = r.resumo.reduce((s, x) => s + (x.novos ?? 0), 0);
  const buscas = r.resumo.reduce((s, x) => s + (x.buscas ?? 0), 0);
  const erros = r.resumo.filter((x) => x.erro);
  if (erros.length) return `Coleta com erro: ${erros[0].erro}`;
  const limite = r.resumo.some((x) => x.limite_atingido) ? ' Limite diário de buscas atingido.' : '';
  return `Coleta concluída: ${novos} lead(s) novo(s), ${buscas} busca(s) usada(s), ${r.buscas_restantes_hoje} restante(s) hoje.${limite}`;
}

export interface ResumoQualificacao {
  ok: boolean;
  processados: number;
  qualificados?: number;
  descartados?: number;
  restantes?: number;
}

export function textoResumoQualificacao(r: ResumoQualificacao): string {
  if (!r.processados) return 'Nenhum lead novo para qualificar.';
  const resto = r.restantes ? ` ${r.restantes} ficaram para a próxima rodada.` : '';
  return `Qualificação: ${r.qualificados ?? 0} qualificado(s), ${r.descartados ?? 0} descartado(s).${resto}`;
}

export interface ResumoGeracao {
  ok: boolean;
  erro?: string;
  gerados: number;
  falhas: number;
  restantes: number | null;
  limite_atingido: boolean;
  custo_brl?: number;
  resultados: { lead_id: string; nome: string; ok: boolean; erro?: string; slug?: string }[];
}

export function textoResumoGeracao(r: ResumoGeracao): string {
  if (r.limite_atingido && !r.gerados) return 'Limite diário de gerações de IA atingido. Ajuste em Configurações ou tente amanhã.';
  if (!r.gerados && !r.falhas) return 'Nenhum lead qualificado aguardando prévia.';
  const partes = [`${r.gerados} prévia(s) gerada(s)`];
  if (r.falhas) partes.push(`${r.falhas} falha(s)`);
  if (r.erro && !r.gerados) partes.push(r.erro);
  return partes.join(' · ');
}
