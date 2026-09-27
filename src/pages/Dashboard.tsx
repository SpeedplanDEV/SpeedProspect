import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, Flame, MessageCircle } from 'lucide-react';
import { painelDashboard, type Painel } from '@/lib/fila';
import { formatarDataHora, formatarMoeda, formatarNumero, formatarTelefone, paraE164 } from '@/lib/format';
import { rotuloNicho } from '@/lib/types';
import { Erro, Pagina, Vazio } from '@/components/ui/Pagina';
import { GraficoEnvios } from '@/components/GraficoEnvios';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** Etapas do funil na ordem (número = ordem_funil no banco) */
const ETAPAS = [
  { n: 1, rotulo: 'Qualificados' },
  { n: 2, rotulo: 'Prévias geradas' },
  { n: 3, rotulo: 'Aprovados' },
  { n: 4, rotulo: 'Enviados' },
  { n: 5, rotulo: 'Abriram' },
  { n: 6, rotulo: 'Responderam' },
  { n: 7, rotulo: 'Negociando' },
  { n: 8, rotulo: 'Fechados' },
];

const ROTULO_ETAPA_EXEC: Record<string, string> = { coletar: 'Coleta', qualificar: 'Qualificação', gerar: 'Geração de prévias', followups: 'Follow-ups' };

/** Últimos 12 meses (yyyy-mm-01) no fuso de São Paulo */
function ultimosMeses(): { valor: string; rotulo: string }[] {
  const [a, m] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' })
    .format(new Date())
    .split('-')
    .map(Number);
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(a, m - 1 - i, 1);
    return {
      valor: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`,
      rotulo: `${MESES[d.getMonth()][0].toUpperCase()}${MESES[d.getMonth()].slice(1)} de ${d.getFullYear()}`,
    };
  });
}

const pct = (a: number, b: number) => (b ? `${formatarNumero((a / b) * 100, a / b < 0.1 ? 1 : 0)}%` : '—');

export default function Dashboard() {
  const meses = useMemo(ultimosMeses, []);
  const [mes, setMes] = useState(meses[0].valor);
  const atual = mes === meses[0].valor;

  const { data, error, isLoading } = useQuery({
    queryKey: ['painel', mes],
    queryFn: () => painelDashboard(mes),
    refetchInterval: atual ? 120_000 : false,
  });

  return (
    <Pagina
      titulo="Dashboard"
      descricao="Resultados da prospecção no mês"
      acoes={
        <select className="input w-auto" value={mes} onChange={(e) => setMes(e.target.value)} aria-label="Mês">
          {meses.map((m) => <option key={m.valor} value={m.valor}>{m.rotulo}</option>)}
        </select>
      }
    >
      {error ? <Erro erro={error} /> : isLoading || !data ? <div className="text-sm text-suave">Carregando…</div> : <Conteudo p={data} atual={atual} />}
    </Pagina>
  );
}

function Conteudo({ p, atual }: { p: Painel; atual: boolean }) {
  const e = (n: number) => Number(p.etapas[String(n)] ?? 0);
  const receita = Number(p.receita) || 0;
  const custo = Number(p.custo) || 0;
  const fechados = e(8);

  const cards = [
    { rotulo: 'Coletados', valor: formatarNumero(p.coletados), link: '/leads' },
    { rotulo: 'Qualificados', valor: formatarNumero(e(1)), link: '/leads' },
    { rotulo: 'Prévias geradas', valor: formatarNumero(e(2)), link: '/aprovacao' },
    { rotulo: 'Enviados', valor: formatarNumero(e(4)), link: '/envios' },
    { rotulo: 'Abriram', valor: formatarNumero(e(5)), sub: `${pct(e(5), e(4))} dos enviados`, link: '/funil' },
    { rotulo: 'Responderam', valor: formatarNumero(e(6)), sub: `${pct(e(6), e(4))} dos enviados`, link: '/funil' },
    { rotulo: 'Fechados', valor: formatarNumero(fechados), sub: `${pct(fechados, e(4))} dos enviados`, link: '/funil' },
    { rotulo: 'Receita fechada', valor: formatarMoeda(receita), destaque: true, link: '/funil' },
    { rotulo: 'Custo estimado', valor: formatarMoeda(custo), sub: 'Google Places + IA', link: '/execucoes' },
    { rotulo: 'Custo por fechamento', valor: fechados ? formatarMoeda(custo / fechados) : '—', sub: receita && custo ? `Retorno ${formatarNumero(receita / custo, 1)}×` : undefined, link: '/execucoes' },
  ];

  const maxFunil = Math.max(1, ...ETAPAS.map((x) => e(x.n)));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {cards.map((c) => (
          <Link key={c.rotulo} to={c.link} className="card p-4 transition-colors hover:border-marca/50">
            <div className="text-xs text-suave">{c.rotulo}</div>
            <div className={`mt-1 text-2xl font-medium tabular-nums ${c.destaque ? 'text-emerald-600' : ''}`}>{c.valor}</div>
            {c.sub && <div className="mt-0.5 text-[11px] text-fraco">{c.sub}</div>}
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        {/* Funil com taxas de conversão entre etapas */}
        <section className="card p-5">
          <h2 className="text-sm font-medium">Funil do mês</h2>
          <p className="mb-4 text-xs text-fraco">Leads que chegaram a cada etapa no mês · % em relação à etapa anterior</p>
          <ol className="space-y-2">
            {ETAPAS.map((x, i) => {
              const v = e(x.n);
              const anterior = i ? e(ETAPAS[i - 1].n) : null;
              return (
                <li key={x.n} className="grid grid-cols-[110px_minmax(0,1fr)_48px] items-center gap-2 text-sm">
                  <span className="truncate text-suave">{x.rotulo}</span>
                  <span className="flex items-center gap-2">
                    <span
                      className="h-5 shrink-0 rounded-[4px]"
                      style={{ width: `calc((100% - 44px) * ${v / maxFunil})`, minWidth: v ? 3 : 0, background: 'var(--serie-funil)' }}
                    />
                    <span className="text-xs font-medium tabular-nums">{formatarNumero(v)}</span>
                  </span>
                  <span className="text-right text-xs tabular-nums text-fraco">{anterior != null ? pct(v, anterior) : ''}</span>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="card p-5">
          <h2 className="text-sm font-medium">Envios × aberturas</h2>
          <p className="mb-3 text-xs text-fraco">Por dia, nos últimos 30 dias · aberturas = leads que abriram a prévia pelo link enviado</p>
          <GraficoEnvios serie={p.serie ?? []} />
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section className="card">
          <header className="flex items-center gap-2 border-b border-borda px-5 py-3">
            <Flame size={15} className="text-orange-500" />
            <h2 className="text-sm font-medium">Leads quentes</h2>
            <span className="text-xs text-fraco">abriram nas últimas 48 h e ainda não responderam</span>
          </header>
          {!atual ? (
            <Vazio>Disponível apenas no mês atual.</Vazio>
          ) : !p.quentes.length ? (
            <Vazio>Nenhum lead quente agora.</Vazio>
          ) : (
            <div className="overflow-x-auto">
              <table className="tabela">
                <thead>
                  <tr><th>Empresa</th><th>Telefone</th><th className="text-right">Visitas</th><th>Última visita</th><th /></tr>
                </thead>
                <tbody>
                  {p.quentes.map((q) => {
                    const e164 = paraE164(q.telefone);
                    return (
                      <tr key={q.id}>
                        <td>
                          <div className="font-medium">{q.nome}</div>
                          <div className="text-xs text-suave">{rotuloNicho(q.nicho)} · score {q.score}</div>
                        </td>
                        <td className="whitespace-nowrap tabular-nums">{formatarTelefone(q.telefone)}</td>
                        <td className="text-right tabular-nums">{q.visitas}</td>
                        <td className="whitespace-nowrap tabular-nums">{formatarDataHora(q.ultima_visita)}</td>
                        <td>
                          {e164 && (
                            <a href={`https://wa.me/${e164.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:underline">
                              <MessageCircle size={13} /> Conversar
                            </a>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card">
          <header className="flex items-center gap-2 border-b border-borda px-5 py-3">
            <AlertTriangle size={15} className="text-red-500" />
            <h2 className="text-sm font-medium">Últimas execuções com erro</h2>
          </header>
          {!p.erros.length ? (
            <Vazio>Nenhum erro registrado.</Vazio>
          ) : (
            <ul className="divide-y divide-borda">
              {p.erros.map((x) => (
                <li key={x.id} className="px-5 py-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{ROTULO_ETAPA_EXEC[x.etapa] ?? x.etapa}</span>
                    <span className="text-xs tabular-nums text-fraco">{formatarDataHora(x.iniciado_em)}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-red-600">{x.erro ?? 'Erro sem mensagem'}</p>
                </li>
              ))}
              <li className="px-5 py-2 text-right text-xs"><Link to="/execucoes" className="text-marca hover:underline">Ver execuções</Link></li>
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
