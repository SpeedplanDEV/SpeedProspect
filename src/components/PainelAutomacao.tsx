import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CheckCircle2, CircleAlert, Clock, Loader2, Send, XCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatarDataHora } from '@/lib/format';
import { Badge } from '@/components/ui/Pagina';
import { useToast } from '@/components/ui/Toast';

interface StatusAutomacao {
  ativa: boolean;
  segredos: { sp_pipeline_url: boolean; sp_service_role: boolean };
  tarefas: { nome: string; agenda: string; ativa: boolean }[];
  execucoes: { nome: string; status: string; mensagem: string | null; inicio: string }[];
  respostas: { id: number; status_code: number | null; resumo: string | null; criado: string }[];
}

/** Descrição de cada tarefa no horário de São Paulo (o cron roda em UTC) */
const TAREFAS: Record<string, { rotulo: string; quando: string; agenda: string }> = {
  'sp-coletar': { rotulo: 'Coletar empresas', quando: 'todo dia às 03:00', agenda: '0 6 * * *' },
  'sp-qualificar': { rotulo: 'Qualificar', quando: 'às 03:30 e 03:50', agenda: '30,50 6 * * *' },
  'sp-gerar': { rotulo: 'Gerar prévias com IA', quando: 'a cada 10 min, das 04:00 às 05:50', agenda: '*/10 7-8 * * *' },
  'sp-followups': { rotulo: 'Agendar follow-ups', quando: 'todo dia às 08:00', agenda: '0 11 * * *' },
};

const STATUS_CRON: Record<string, string> = { succeeded: 'ok', failed: 'falhou', running: 'rodando', starting: 'iniciando' };

const ETAPAS_TESTE = [
  { valor: 'qualificar', rotulo: 'Qualificar' },
  { valor: 'followups', rotulo: 'Follow-ups' },
  { valor: 'gerar', rotulo: 'Gerar prévias' },
  { valor: 'coletar', rotulo: 'Coletar' },
];

async function carregarStatus(): Promise<StatusAutomacao> {
  const { data, error } = await supabase.rpc('status_automacao');
  if (error) {
    if (/could not find the function|schema cache/i.test(error.message)) {
      throw new Error('Rode o SQL 20261002000000_fase7_automacao.sql no Supabase para ativar a automação.');
    }
    throw error;
  }
  return data as StatusAutomacao;
}

/** Estado da automação diária (pg_cron → pipeline) e teste manual pelo mesmo caminho do cron */
export function PainelAutomacao() {
  const toast = useToast();
  const [etapa, setEtapa] = useState('qualificar');
  const status = useQuery({ queryKey: ['automacao'], queryFn: carregarStatus, refetchInterval: 30_000 });

  const testar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('sp_chamar_pipeline', { p_etapa: etapa });
      if (error) throw error;
    },
    onSuccess: () => {
      toast('Pedido enviado ao pipeline. A resposta aparece aqui em alguns segundos.');
      setTimeout(() => status.refetch(), 6000);
    },
    onError: (e: Error) => toast(e.message, 'erro'),
  });

  if (status.error) {
    return (
      <div className="card mb-4 flex items-center gap-2 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
        <CircleAlert size={16} /> {(status.error as Error).message}
      </div>
    );
  }
  const s = status.data;
  if (!s) return <div className="card mb-4 px-4 py-3 text-sm text-suave">Carregando automação…</div>;

  const segredosOk = s.segredos.sp_pipeline_url && s.segredos.sp_service_role;
  const ultimaDe = (nome: string) => s.execucoes.find((e) => e.nome === nome);

  return (
    <section className="card mb-4">
      <header className="flex flex-wrap items-center gap-2 border-b border-borda px-5 py-3">
        <Clock size={15} className="text-marca" />
        <h2 className="text-sm font-medium">Automação diária</h2>
        {s.ativa ? <Badge cor="verde">Ligada</Badge> : <Badge cor="cinza">Desligada</Badge>}
        {!segredosOk && <Badge cor="vermelho">Faltam segredos no Vault</Badge>}
        <span className="text-xs text-fraco">horários de Brasília</span>
        <div className="ml-auto flex items-center gap-2">
          <select className="input w-36 py-1 text-xs" value={etapa} onChange={(e) => setEtapa(e.target.value)} aria-label="Etapa para testar">
            {ETAPAS_TESTE.map((x) => <option key={x.valor} value={x.valor}>{x.rotulo}</option>)}
          </select>
          <button
            className="btn-secundario py-1 text-xs"
            onClick={() => testar.mutate()}
            disabled={testar.isPending || !segredosOk}
            title="Chama o pipeline pelo mesmo caminho do cron (Vault + service role). Com a automação desligada, o pipeline só confirma que recebeu."
          >
            {testar.isPending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Testar pelo cron
          </button>
        </div>
      </header>

      {!s.ativa && (
        <p className="border-b border-borda bg-elevado/50 px-5 py-2 text-xs text-suave">
          As tarefas estão agendadas, mas o pipeline ignora as chamadas automáticas até você ligar em{' '}
          <Link to="/configuracoes" className="text-marca hover:underline">Configurações → Automação</Link>.
        </p>
      )}

      <div className="grid gap-px bg-borda sm:grid-cols-2 xl:grid-cols-4">
        {Object.entries(TAREFAS).map(([nome, t]) => {
          const tarefa = s.tarefas.find((x) => x.nome === nome);
          const ultima = ultimaDe(nome);
          const ok = ultima?.status === 'succeeded';
          return (
            <div key={nome} className="bg-superficie px-5 py-3 text-sm">
              <div className="flex items-center gap-1.5 font-medium">
                {!tarefa ? <XCircle size={14} className="text-red-500" /> : <CheckCircle2 size={14} className={tarefa.ativa ? 'text-emerald-500' : 'text-fraco'} />}
                {t.rotulo}
              </div>
              <div className="mt-0.5 text-xs text-suave">
                {!tarefa ? 'Não agendada' : tarefa.agenda === t.agenda ? t.quando : `cron (UTC): ${tarefa.agenda}`}
              </div>
              <div className="mt-1 text-xs text-fraco">
                {ultima ? (
                  <span className={ok || ultima.status === 'running' ? '' : 'text-red-600'} title={ultima.mensagem ?? undefined}>
                    Última: {formatarDataHora(ultima.inicio)} · {STATUS_CRON[ultima.status] ?? ultima.status}
                  </span>
                ) : (
                  'Ainda não rodou'
                )}
              </div>
            </div>
          );
        })}
      </div>

      {s.respostas.length > 0 && (
        <details className="border-t border-borda px-5 py-2 text-xs">
          <summary className="cursor-pointer text-suave">Últimas respostas do pipeline ({s.respostas.length})</summary>
          <ul className="mt-2 space-y-1.5">
            {s.respostas.map((r) => (
              <li key={r.id} className="flex gap-2">
                <span className="shrink-0 tabular-nums text-fraco">{formatarDataHora(r.criado)}</span>
                <Badge cor={r.status_code && r.status_code < 300 ? 'verde' : 'vermelho'}>{r.status_code ?? 'sem resposta'}</Badge>
                <span className="min-w-0 truncate font-mono text-[11px] text-suave" title={r.resumo ?? undefined}>{r.resumo}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
