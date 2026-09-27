import type { AvaliacaoPublica, ConteudoLP } from '../types';

/**
 * Avaliações exibidas: primeiro as escolhidas/resumidas pela IA; depois todas as outras avaliações
 * positivas reais do Google (nota ≥ 4) que ainda não apareceram. Nada é inventado.
 */
export function avaliacoesParaExibir(depoimentos: ConteudoLP['depoimentos'], reais: AvaliacaoPublica[] = [], max = 6): AvaliacaoPublica[] {
  const saida: AvaliacaoPublica[] = [];
  const autores = new Set<string>();
  const add = (a: AvaliacaoPublica) => {
    const chave = a.autor.trim().toLowerCase();
    if (autores.has(chave) || saida.length >= max) return;
    autores.add(chave);
    saida.push(a);
  };
  depoimentos.filter((d) => d.nota >= 4).forEach(add);
  [...reais].filter((r) => r.nota >= 4 && r.texto?.trim()).sort((a, b) => b.nota - a.nota).forEach(add);
  return saida;
}
