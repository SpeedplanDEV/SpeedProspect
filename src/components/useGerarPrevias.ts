import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { chamarFuncao, type ResumoGeracao } from '@/lib/funcoes';
import { useToast } from '@/components/ui/Toast';

/**
 * Gera prévias em lote chamando a Edge Function repetidas vezes (cada chamada processa poucos leads para
 * caber no limite de tempo da função). Para quando acabar a fila, bater o limite diário ou nada for gerado.
 */
export function useGerarPrevias() {
  const qc = useQueryClient();
  const toast = useToast();
  const [prontas, setProntas] = useState(0);

  const m = useMutation({
    mutationFn: async () => {
      setProntas(0);
      let gerados = 0;
      let falhas = 0;
      let ultimo: ResumoGeracao | null = null;
      for (let rodada = 0; rodada < 15; rodada++) {
        ultimo = await chamarFuncao<ResumoGeracao>('gerar-previa', {});
        gerados += ultimo.gerados;
        falhas += ultimo.falhas;
        setProntas(gerados);
        qc.invalidateQueries({ queryKey: ['leads'] });
        if (!ultimo.gerados || ultimo.limite_atingido || !ultimo.restantes) break;
      }
      return { gerados, falhas, ultimo };
    },
    onSuccess: ({ gerados, falhas, ultimo }) => {
      if (!gerados && !falhas) {
        toast(ultimo?.limite_atingido ? 'Limite diário de gerações atingido.' : 'Nenhum lead qualificado aguardando prévia.');
      } else if (!gerados) {
        toast(`Nenhuma prévia gerada: ${ultimo?.erro ?? 'veja o log em Execuções'}`, 'erro');
      } else {
        const extra = falhas ? ` ${falhas} falha(s) — veja em Execuções.` : '';
        const limite = ultimo?.limite_atingido ? ' Limite diário atingido.' : '';
        toast(`${gerados} prévia(s) gerada(s).${extra}${limite}`, falhas ? 'erro' : 'sucesso');
      }
    },
    onError: (e: Error) => toast(e.message, 'erro'),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['execucoes'] });
    },
  });

  return { gerar: () => m.mutate(), gerando: m.isPending, prontas };
}
