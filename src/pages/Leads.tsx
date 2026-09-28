import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Loader2, Search, ShieldCheck, Smartphone, Wand2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatarNumero, formatarTelefone } from '@/lib/format';
import { NICHOS, STATUS_FUNIL, STATUS_SITE, rotuloNicho, statusFunil, type Campanha, type Lead } from '@/lib/types';
import { Badge, Erro, Pagina, Vazio } from '@/components/ui/Pagina';
import { DetalheLead } from '@/components/DetalheLead';
import { useToast } from '@/components/ui/Toast';
import { useGerarPrevias } from '@/components/useGerarPrevias';
import { chamarFuncao, textoResumoQualificacao, type ResumoQualificacao } from '@/lib/funcoes';
import { resumoDetalheSite, rotuloDescarte } from '@/lib/qualificacao';

const corScore = (s: number) => (s >= 70 ? 'text-emerald-600' : s >= 50 ? 'text-amber-600' : 'text-suave');

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
  const qc = useQueryClient();
  const toast = useToast();

  const novos = useQuery({
    queryKey: ['leads', 'contagem-novos'],
    queryFn: async () => {
      const { count, error } = await supabase.from('leads').select('id', { count: 'exact', head: true }).eq('status_funil', 'novo');
      if (error) throw error;
      return count ?? 0;
    },
  });

  const qualificados = useQuery({
    queryKey: ['leads', 'contagem-qualificados'],
    queryFn: async () => {
      const { count, error } = await supabase.from('leads').select('id', { count: 'exact', head: true }).eq('status_funil', 'qualificado');
      if (error) throw error;
      return count ?? 0;
    },
  });
  const previas = useGerarPrevias();

  const qualificar = useMutation({
    mutationFn: () => chamarFuncao<ResumoQualificacao>('qualificar', {}),
    onSuccess: (r) => toast(textoResumoQualificacao(r)),
    onError: (e: Error) => toast(e.message, 'erro'),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['execucoes'] });
    },
  });

  // Busca por nome com atraso para não consultar a cada tecla
  useEffect(() => {
    const t = setTimeout(() => setBuscaAtiva(busca.trim()), 300);
    return () => clearTimeout(t);
  }, [busca]);
  useEffect(() => {
    setPagina(0);
  }, [buscaAtiva, funil, campanha, nicho, site, ordem]);

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
    <Pagina
      titulo="Leads"
      descricao={`${formatarNumero(total)} empresa(s) encontrada(s)`}
      acoes={
        <>
        <button
          className="btn-secundario"
          disabled={previas.gerando || !qualificados.data}
          onClick={previas.gerar}
          title="Gera com IA a landing page dos leads qualificados (maior score primeiro), respeitando o limite diário"
        >
          {previas.gerando ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
          {previas.gerando ? `Gerando prévias… ${previas.prontas} pronta(s)` : `Gerar prévias (${formatarNumero(qualificados.data ?? 0)})`}
        </button>
        <button
          className="btn-primario"
          disabled={qualificar.isPending || !novos.data}
          onClick={() => qualificar.mutate()}
          title="Checa o site, calcula o score e qualifica os leads com status Novo"
        >
          {qualificar.isPending ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
          {qualificar.isPending ? 'Qualificando…' : `Qualificar novos (${formatarNumero(novos.data ?? 0)})`}
        </button>
        </>
      }
    >
      <div className="mb-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <div className="relative col-span-2 sm:w-64">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fraco" />
          <input className="input pl-8" placeholder="Buscar por nome…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <select className="input sm:w-40" value={funil} onChange={(e) => setFunil(e.target.value)}>
          <option value="">Todos os status</option>
          {STATUS_FUNIL.map((s) => <option key={s.valor} value={s.valor}>{s.rotulo}</option>)}
        </select>
        <select className="input sm:w-48" value={campanha} onChange={(e) => setCampanha(e.target.value)}>
          <option value="">Todas as campanhas</option>
          {campanhas.data?.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <select className="input sm:w-36" value={nicho} onChange={(e) => setNicho(e.target.value)}>
          <option value="">Todos os nichos</option>
          {NICHOS.map((n) => <option key={n.valor} value={n.valor}>{n.rotulo}</option>)}
        </select>
        <select className="input sm:w-40" value={site} onChange={(e) => setSite(e.target.value)}>
          <option value="">Qualquer site</option>
          {Object.entries(STATUS_SITE).map(([v, s]) => <option key={v} value={v}>{s.rotulo}</option>)}
        </select>
        <select className="input sm:ml-auto sm:w-40" value={ordem} onChange={(e) => setOrdem(e.target.value as typeof ordem)}>
          {ORDENS.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
        </select>
      </div>

      {error ? (
        <Erro erro={error} />
      ) : (
        <>
        {/* Celular: lista em cartões */}
        <ul className="card divide-y divide-borda md:hidden">
          {isLoading && <li><Vazio>Carregando…</Vazio></li>}
          {!isLoading && !data?.leads.length && (
            <li><Vazio>Nenhum lead. Rode “Executar agora” em uma campanha para coletar empresas.</Vazio></li>
          )}
          {data?.leads.map((l) => {
            const f = statusFunil(l.status_funil);
            const s = STATUS_SITE[l.status_site];
            return (
              <li key={l.id}>
                <button type="button" className="flex w-full items-start gap-3 px-4 py-3 text-left active:bg-elevado" onClick={() => setSelecionado(l.id)}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{l.nome}</div>
                    <div className="mt-0.5 truncate text-xs text-suave">
                      {rotuloNicho(l.nicho)}{l.bairro ? ` · ${l.bairro}` : ''}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-suave">
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        {formatarTelefone(l.telefone)}
                        {l.telefone_celular && <Smartphone size={12} className="text-emerald-500" aria-label="Celular" />}
                      </span>
                      {l.rating != null && (
                        <span className="tabular-nums">★ {formatarNumero(l.rating, 1)} ({formatarNumero(l.reviews_count)})</span>
                      )}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <Badge cor={f.cor}>{f.rotulo}</Badge>
                      <Badge cor={s.cor}>{s.rotulo}</Badge>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className={`text-lg font-medium leading-none tabular-nums ${corScore(l.score)}`}>{l.score}</div>
                    <div className="mt-0.5 text-[10px] uppercase tracking-wide text-fraco">score</div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="card hidden overflow-x-auto md:block">
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
                      <span title={resumoDetalheSite(l.detalhe_site)} className="cursor-help">
                        <Badge cor={s.cor}>{s.rotulo}</Badge>
                      </span>
                    </td>
                    <td className={`text-right font-medium tabular-nums ${corScore(l.score)}`}>{l.score}</td>
                    <td>
                      <span title={rotuloDescarte(l.motivo_descarte) ?? undefined}>
                        <Badge cor={f.cor}>{f.rotulo}</Badge>
                      </span>
                    </td>
                    <td className="max-w-[160px] truncate text-suave">{nomeCampanha(l.campanha_id)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
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
