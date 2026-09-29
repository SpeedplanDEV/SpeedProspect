import { useRef, useState } from 'react';
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

export interface ProgressoSelecao {
  total: number;
  feitos: number;
  gerados: number;
  pulados: number;
  falhas: { nome: string; erro: string }[];
  atual: string[];
}

const PROGRESSO_VAZIO: ProgressoSelecao = { total: 0, feitos: 0, gerados: 0, pulados: 0, falhas: [], atual: [] };

/**
 * Gera prévias para os leads escolhidos na lista (2 por vez, uma chamada por lead).
 * Respeita o limite diário da Edge Function: ao atingir, para e avisa. Pode ser interrompido pelo operador.
 */
export function useGerarSelecionadas() {
  const qc = useQueryClient();
  const toast = useToast();
  const [progresso, setProgresso] = useState<ProgressoSelecao>(PROGRESSO_VAZIO);
  const controleRef = useRef({ pedido: false });

  const m = useMutation({
    mutationFn: async (leads: { id: string; nome: string }[]) => {
      const controle = { pedido: false };
      controleRef.current = controle;
      const fila = [...leads];
      const p: ProgressoSelecao = { ...PROGRESSO_VAZIO, total: leads.length, falhas: [], atual: [] };
      let limite = false;
      let fatal: string | null = null;
      const publicar = () => setProgresso({ ...p, falhas: [...p.falhas], atual: [...p.atual] });
      publicar();

      const trabalhar = async () => {
        while (fila.length && !controle.pedido && !limite && !fatal) {
          const lead = fila.shift()!;
          p.atual.push(lead.nome);
          publicar();
          try {
            const r = await chamarFuncao<ResumoGeracao>('gerar-previa', { lead_id: lead.id });
            if (r.limite_atingido && !r.gerados) limite = true;
            else if (r.gerados) p.gerados++;
            else p.falhas.push({ nome: lead.nome, erro: r.resultados[0]?.erro ?? r.erro ?? 'Falha ao gerar' });
          } catch (e) {
            const msg = (e as Error).message;
            if (/já tem prévia|não pode receber prévia/i.test(msg)) p.pulados++;
            else if (/não respondeu|publicada no Supabase|ANTHROPIC_API_KEY|Saldo insuficiente|Não autorizado/i.test(msg)) fatal = msg;
            else p.falhas.push({ nome: lead.nome, erro: msg });
          }
          p.feitos++;
          p.atual = p.atual.filter((n) => n !== lead.nome);
          publicar();
          qc.invalidateQueries({ queryKey: ['leads'] });
        }
      };
      await Promise.all([trabalhar(), trabalhar()]);
      return { ...p, limite, fatal, interrompido: controle.pedido, restantes: fila.length };
    },
    onSuccess: (r) => {
      if (r.fatal) return toast(r.fatal, 'erro');
      const partes = [`${r.gerados} prévia(s) gerada(s)`];
      if (r.pulados) partes.push(`${r.pulados} já tinham prévia ou não estavam qualificados`);
      if (r.falhas.length) partes.push(`${r.falhas.length} falha(s)`);
      if (r.limite) partes.push(`limite diário atingido (${r.restantes} ficaram para depois)`);
      if (r.interrompido) partes.push(`interrompido (${r.restantes} não processados)`);
      toast(`${partes.join(' · ')}.`, r.falhas.length || r.limite ? 'erro' : 'sucesso');
    },
    onError: (e: Error) => toast(e.message, 'erro'),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['execucoes'] });
      qc.invalidateQueries({ queryKey: ['contadores'] });
    },
  });

  return {
    gerar: (leads: { id: string; nome: string }[]) => m.mutate(leads),
    parar: () => {
      controleRef.current.pedido = true;
    },
    gerando: m.isPending,
    progresso,
    limpar: () => setProgresso(PROGRESSO_VAZIO),
  };
}
