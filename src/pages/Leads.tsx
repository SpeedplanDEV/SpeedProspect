import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Search, Smartphone } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatarNumero, formatarTelefone } from '@/lib/format';
import { NICHOS, STATUS_FUNIL, STATUS_SITE, rotuloNicho, statusFunil, type Campanha, type Lead } from '@/lib/types';
import { Badge, Erro, Pagina, Vazio } from '@/components/ui/Pagina';
import { DetalheLead } from '@/components/DetalheLead';

const POR_PAGINA = 100;
const ORDENS = [
  { valor: 'score', rotulo: 'Maior score', coluna: 'score' },
  { valor: 'coletado_em', rotulo: 'Mais recentes', coluna: 'coletado_em' },
  { valor: 'rating', rotulo: 'Maior nota', coluna: 'rating' },
  { valor: 'reviews_count', rotulo: 'Mais avaliações', coluna: 'reviews_count' },
] as const;

export default function Leads() {
  const [busca, setBusca] = useState('');
  const [buscaAtiva, setBuscaAtiva] = useState('');
  const [funil, setFunil] = useState('');
  const [campanha, setCampanha] = useState('');
  const [nicho, setNicho] = useState('');
  const [site, setSite] = useState('');
  const [ordem, setOrdem] = useState<(typeof ORDENS)[number]['valor']>('score');
  const [pagina, setPagina] = useState(0);
  const [selecionado, setSelecionado] = useState<string | null>(null);

  // Busca por nome com atraso para não consultar a cada tecla
  useEffect(() => {
    const t = setTimeout(() => setBuscaAtiva(busca.trim()), 300);
    return () => clearTimeout(t);
  }, [busca]);
  useEffect(() => setPagina(0), [buscaAtiva, funil, campanha, nicho, site, ordem]);

  const campanhas = useQuery({
    queryKey: ['campanhas'],
    queryFn: async () => {
      const { data, error } = await supabase.from('campanhas').select('*').order('nome');
      if (error) throw error;
      return data as Campanha[];
    },
  });
  const nomeCampanha = useMemo(() => {
    const m = new Map((campanhas.data ?? []).map((c) => [c.id, c.nome]));
    return (id: string | null) => (id ? m.get(id) ?? '—' : '—');
  }, [campanhas.data]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['leads', buscaAtiva, funil, campanha, nicho, site, ordem, pagina],
    queryFn: async () => {
      let q = supabase.from('leads').select('*', { count: 'exact' });
      if (buscaAtiva) q = q.ilike('nome', `%${buscaAtiva.replace(/[%_]/g, '')}%`);
      if (funil) q = q.eq('status_funil', funil);
      if (campanha) q = q.eq('campanha_id', campanha);
      if (nicho) q = q.eq('nicho', nicho);
      if (site) q = q.eq('status_site', site);
      const col = ORDENS.find((o) => o.valor === ordem)!.coluna;
      q = q.order(col, { ascending: false, nullsFirst: false }).order('nome');
      const { data, error, count } = await q.range(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA - 1);
      if (error) throw error;
      return { leads: data as Lead[], total: count ?? 0 };
    },
    placeholderData: (anterior) => anterior,
  });

  const total = data?.total ?? 0;
  const ultimaPagina = Math.max(0, Math.ceil(total / POR_PAGINA) - 1);

  return (
    <Pagina titulo="Leads" descricao={`${formatarNumero(total)} empresa(s) encontrada(s)`}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-64">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fraco" />
          <input className="input pl-8" placeholder="Buscar por nome…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <select className="input w-40" value={funil} onChange={(e) => setFunil(e.target.value)}>
          <option value="">Todos os status</option>
          {STATUS_FUNIL.map((s) => <option key={s.valor} value={s.valor}>{s.rotulo}</option>)}
        </select>
        <select className="input w-48" value={campanha} onChange={(e) => setCampanha(e.target.value)}>
          <option value="">Todas as campanhas</option>
          {campanhas.data?.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <select className="input w-36" value={nicho} onChange={(e) => setNicho(e.target.value)}>
          <option value="">Todos os nichos</option>
          {NICHOS.map((n) => <option key={n.valor} value={n.valor}>{n.rotulo}</option>)}
        </select>
        <select className="input w-40" value={site} onChange={(e) => setSite(e.target.value)}>
          <option value="">Qualquer site</option>
          {Object.entries(STATUS_SITE).map(([v, s]) => <option key={v} value={v}>{s.rotulo}</option>)}
        </select>
        <select className="input ml-auto w-40" value={ordem} onChange={(e) => setOrdem(e.target.value as typeof ordem)}>
          {ORDENS.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
        </select>
      </div>

      {error ? (
        <Erro erro={error} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="tabela">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Nicho</th>
                <th>Bairro</th>
                <th>Telefone</th>
                <th className="text-right">Nota</th>
                <th className="text-right">Avaliações</th>
                <th>Site</th>
                <th className="text-right">Score</th>
                <th>Funil</th>
                <th>Campanha</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={10}><Vazio>Carregando…</Vazio></td></tr>}
              {!isLoading && !data?.leads.length && (
                <tr><td colSpan={10}><Vazio>Nenhum lead. Rode “Executar agora” em uma campanha para coletar empresas.</Vazio></td></tr>
              )}
              {data?.leads.map((l) => {
                const f = statusFunil(l.status_funil);
                const s = STATUS_SITE[l.status_site];
                return (
                  <tr key={l.id} className="cursor-pointer" onClick={() => setSelecionado(l.id)}>
                    <td className="max-w-[260px] truncate font-medium" title={l.nome}>{l.nome}</td>
                    <td className="text-suave">{rotuloNicho(l.nicho)}</td>
                    <td className="max-w-[140px] truncate text-suave">{l.bairro ?? '—'}</td>
                    <td className="whitespace-nowrap tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        {formatarTelefone(l.telefone)}
                        {l.telefone_celular && <Smartphone size={12} className="text-emerald-500" aria-label="Celular" />}
                      </span>
                    </td>
                    <td className="text-right tabular-nums">{l.rating != null ? formatarNumero(l.rating, 1) : '—'}</td>
                    <td className="text-right tabular-nums">{formatarNumero(l.reviews_count)}</td>
                    <td>
                      <span title={l.detalhe_site ? JSON.stringify(l.detalhe_site, null, 1) : undefined}>
                        <Badge cor={s.cor}>{s.rotulo}</Badge>
                      </span>
                    </td>
                    <td className="text-right font-medium tabular-nums">{l.score}</td>
                    <td><Badge cor={f.cor}>{f.rotulo}</Badge></td>
                    <td className="max-w-[160px] truncate text-suave">{nomeCampanha(l.campanha_id)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {total > POR_PAGINA && (
        <div className="mt-3 flex items-center justify-end gap-2 text-sm text-suave">
          <span className="tabular-nums">
            {formatarNumero(pagina * POR_PAGINA + 1)}–{formatarNumero(Math.min(total, (pagina + 1) * POR_PAGINA))} de {formatarNumero(total)}
          </span>
          <button className="btn-secundario p-1.5" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)} aria-label="Anterior">
            <ChevronLeft size={16} />
          </button>
          <button className="btn-secundario p-1.5" disabled={pagina >= ultimaPagina} onClick={() => setPagina((p) => p + 1)} aria-label="Próxima">
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      <DetalheLead leadId={selecionado} aoFechar={() => setSelecionado(null)} nomeCampanha={nomeCampanha} />
    </Pagina>
  );
}
