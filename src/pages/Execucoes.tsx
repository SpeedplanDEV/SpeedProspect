import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Play, RefreshCw, ShieldCheck, Wand2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatarDataHora, formatarDuracao, formatarMoeda, formatarNumero } from '@/lib/format';
import type { Campanha, EntradaLog, Execucao } from '@/lib/types';
import { Badge, Erro, Pagina, Vazio } from '@/components/ui/Pagina';
import { Drawer } from '@/components/ui/Drawer';
import { useToast } from '@/components/ui/Toast';
import { useGerarPrevias } from '@/components/useGerarPrevias';
import { PainelAutomacao } from '@/components/PainelAutomacao';
import {
  chamarFuncao, textoResumoColeta, textoResumoQualificacao, type ResumoColeta, type ResumoQualificacao,
} from '@/lib/funcoes';

const ETAPAS = [
  { valor: '', rotulo: 'Todas as etapas' },
  { valor: 'coletar', rotulo: 'Coletar' },
  { valor: 'qualificar', rotulo: 'Qualificar' },
  { valor: 'gerar', rotulo: 'Gerar prévias' },
  { valor: 'followups', rotulo: 'Follow-ups' },
  { valor: 'meta-sync', rotulo: 'Meta Ads: sincronizar' },
  { valor: 'meta-saude', rotulo: 'Meta Ads: saúde das contas' },
];
const rotuloEtapa = (e: string) => ETAPAS.find((x) => x.valor === e)?.rotulo ?? e;

function StatusExecucao({ ex }: { ex: Execucao }) {
  if (ex.sucesso === null) return <Badge cor="amarelo">{ex.finalizado_em ? 'Indefinido' : 'Em andamento'}</Badge>;
  return ex.sucesso ? <Badge cor="verde">Sucesso</Badge> : <Badge cor="vermelho">Erro</Badge>;
}

export default function Execucoes() {
  const [etapa, setEtapa] = useState('');
  const [selecionada, setSelecionada] = useState<Execucao | null>(null);
  const qc = useQueryClient();
  const toast = useToast();

  const coletar = useMutation({
    mutationFn: () => chamarFuncao<ResumoColeta>('coletar', {}),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['execucoes'] });
      qc.invalidateQueries({ queryKey: ['campanhas'] });
      toast(textoResumoColeta(r), r.resumo.some((x) => x.erro) ? 'erro' : 'sucesso');
    },
    onError: (e: Error) => toast(e.message, 'erro'),
  });

  const previas = useGerarPrevias();

  const qualificar = useMutation({
    mutationFn: () => chamarFuncao<ResumoQualificacao>('qualificar', {}),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['execucoes'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      toast(textoResumoQualificacao(r));
    },
    onError: (e: Error) => toast(e.message, 'erro'),
  });

  const campanhas = useQuery({
    queryKey: ['campanhas'],
    queryFn: async () => {
      const { data, error } = await supabase.from('campanhas').select('*');
      if (error) throw error;
      return data as Campanha[];
    },
  });
  const nomeCampanha = (id: string | null) => (id ? campanhas.data?.find((c) => c.id === id)?.nome ?? '—' : '—');

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['execucoes', etapa],
    queryFn: async () => {
      let q = supabase.from('execucoes').select('*').order('iniciado_em', { ascending: false }).limit(200);
      if (etapa) q = q.eq('etapa', etapa);
      const { data, error } = await q;
      if (error) throw error;
      return data as Execucao[];
    },
  });

  const custoTotal = data?.reduce((s, x) => s + Number(x.custo_estimado || 0), 0) ?? 0;

  return (
    <Pagina
      titulo="Execuções"
      descricao="Histórico das etapas do pipeline (últimas 200)"
      acoes={
        <>
          <select className="input w-44" value={etapa} onChange={(e) => setEtapa(e.target.value)}>
            {ETAPAS.map((x) => <option key={x.valor} value={x.valor}>{x.rotulo}</option>)}
          </select>
          <button className="btn-secundario" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} /> Atualizar
          </button>
          <button className="btn-secundario" disabled={previas.gerando} onClick={previas.gerar}>
            {previas.gerando ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
            {previas.gerando ? `Gerando… ${previas.prontas}` : 'Gerar prévias'}
          </button>
          <button className="btn-secundario" disabled={qualificar.isPending} onClick={() => qualificar.mutate()}>
            {qualificar.isPending ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
            {qualificar.isPending ? 'Qualificando…' : 'Qualificar agora'}
          </button>
          <button
            className="btn-primario"
            disabled={coletar.isPending}
            title="Executa a coleta de todas as campanhas ativas"
            onClick={() => coletar.mutate()}
          >
            {coletar.isPending ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
            {coletar.isPending ? 'Coletando…' : 'Executar coleta agora'}
          </button>
        </>
      }
    >
      {error ? (
        <Erro erro={error} />
      ) : (
        <>
          <PainelAutomacao />
          <div className="card overflow-x-auto">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Início</th>
                  <th>Etapa</th>
                  <th>Campanha</th>
                  <th>Status</th>
                  <th className="text-right">Duração</th>
                  <th className="text-right">Itens</th>
                  <th className="text-right">Custo estimado</th>
                  <th>Erro</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={8}><Vazio>Carregando…</Vazio></td></tr>}
                {!isLoading && !data?.length && (
                  <tr><td colSpan={8}><Vazio>Nenhuma execução registrada ainda.</Vazio></td></tr>
                )}
                {data?.map((ex) => (
                  <tr key={ex.id} className="cursor-pointer" onClick={() => setSelecionada(ex)}>
                    <td className="whitespace-nowrap tabular-nums">{formatarDataHora(ex.iniciado_em)}</td>
                    <td>{rotuloEtapa(ex.etapa)}</td>
                    <td className="text-suave">{nomeCampanha(ex.campanha_id)}</td>
                    <td><StatusExecucao ex={ex} /></td>
                    <td className="text-right tabular-nums">{formatarDuracao(ex.iniciado_em, ex.finalizado_em)}</td>
                    <td className="text-right tabular-nums">{formatarNumero(ex.itens_processados)}</td>
                    <td className="text-right tabular-nums">{formatarMoeda(ex.custo_estimado, 4)}</td>
                    <td className="max-w-[280px] truncate text-red-500" title={ex.erro ?? ''}>{ex.erro ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!!data?.length && (
            <p className="mt-2 text-right text-xs text-suave">
              Custo total listado: <span className="tabular-nums">{formatarMoeda(custoTotal, 4)}</span>
            </p>
          )}
        </>
      )}

      <Drawer
        aberto={!!selecionada}
        aoFechar={() => setSelecionada(null)}
        largura="max-w-2xl"
        titulo={selecionada ? `${rotuloEtapa(selecionada.etapa)} · ${formatarDataHora(selecionada.iniciado_em)}` : ''}
      >
        {selecionada && <DetalheExecucao ex={selecionada} campanha={nomeCampanha(selecionada.campanha_id)} />}
      </Drawer>
    </Pagina>
  );
}

function DetalheExecucao({ ex, campanha }: { ex: Execucao; campanha: string }) {
  const log: EntradaLog[] = Array.isArray(ex.log) ? ex.log : [];
  const corNivel = { info: 'text-suave', aviso: 'text-amber-500', erro: 'text-red-500' } as const;

  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <div><dt className="label">Status</dt><dd><StatusExecucao ex={ex} /></dd></div>
        <div><dt className="label">Campanha</dt><dd>{campanha}</dd></div>
        <div><dt className="label">Início</dt><dd className="tabular-nums">{formatarDataHora(ex.iniciado_em)}</dd></div>
        <div><dt className="label">Fim</dt><dd className="tabular-nums">{formatarDataHora(ex.finalizado_em)}</dd></div>
        <div><dt className="label">Duração</dt><dd className="tabular-nums">{formatarDuracao(ex.iniciado_em, ex.finalizado_em)}</dd></div>
        <div><dt className="label">Itens processados</dt><dd className="tabular-nums">{formatarNumero(ex.itens_processados)}</dd></div>
        <div><dt className="label">Custo estimado</dt><dd className="tabular-nums">{formatarMoeda(ex.custo_estimado, 4)}</dd></div>
      </dl>
      {ex.erro && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600">{ex.erro}</div>
      )}
      <div>
        <h3 className="mb-2 text-sm font-medium">Log ({formatarNumero(log.length)})</h3>
        {log.length === 0 ? (
          <p className="text-sm text-suave">Sem entradas de log.</p>
        ) : (
          <ol className="divide-y divide-borda rounded-md border border-borda font-mono text-xs">
            {log.map((l, i) => {
              const { em, nivel, msg, ...resto } = l;
              return (
                <li key={i} className="px-3 py-2">
                  <div className="flex gap-2">
                    {em && <span className="shrink-0 text-fraco">{formatarDataHora(em)}</span>}
                    <span className={corNivel[nivel ?? 'info'] ?? 'text-suave'}>{(nivel ?? 'info').toUpperCase()}</span>
                    <span className="text-texto">{msg ?? ''}</span>
                  </div>
                  {Object.keys(resto).length > 0 && (
                    <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-fraco">{JSON.stringify(resto, null, 2)}</pre>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
