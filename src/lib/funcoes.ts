import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase, supabaseUrl } from './supabase';

/** URL pública da foto do Google via Edge Function `foto` (nunca expõe a API key) */
export const urlFoto = (name: string, w = 800) =>
  `${supabaseUrl}/functions/v1/foto?name=${encodeURIComponent(name)}&w=${w}`;

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
