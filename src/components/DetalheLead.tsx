import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Globe, Loader2, MapPin, Phone, RefreshCw, Star } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { chamarFuncao, urlFoto } from '@/lib/funcoes';
import { calcularScore, rotuloDescarte } from '@/lib/qualificacao';
import { formatarData, formatarDataHora, formatarNumero, formatarTelefone } from '@/lib/format';
import {
  STATUS_FUNIL, STATUS_SITE, rotuloNicho, statusFunil, type Evento, type Lead, type Mensagem, type StatusFunil,
} from '@/lib/types';
import { Badge } from '@/components/ui/Pagina';
import { Drawer } from '@/components/ui/Drawer';
import { PreviaLead } from '@/components/PreviaLead';
import { useToast } from '@/components/ui/Toast';

const ROTULO_EVENTO: Record<string, string> = {
  visita: 'Visitou a prévia',
  clique_whatsapp: 'Clicou no WhatsApp',
  clique_quero: 'Clicou em “Quero esse site”',
  optout: 'Pediu para não receber propostas',
  mensagem_enviada: 'WhatsApp aberto para envio',
};

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-suave">{titulo}</h3>
      {children}
    </section>
  );
}

export function DetalheLead({ leadId, aoFechar, nomeCampanha }: {
  leadId: string | null;
  aoFechar: () => void;
  nomeCampanha: (id: string | null) => string;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [obs, setObs] = useState('');
  const [status, setStatus] = useState<StatusFunil>('novo');

  const { data, isLoading } = useQuery({
    queryKey: ['lead', leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const [lead, eventos, mensagens] = await Promise.all([
        supabase.from('leads').select('*').eq('id', leadId!).single(),
        supabase.from('eventos').select('id,tipo,via_link,criado_em').eq('lead_id', leadId!).order('criado_em', { ascending: false }).limit(50),
        supabase.from('mensagens').select('*').eq('lead_id', leadId!).order('criado_em', { ascending: false }),
      ]);
      if (lead.error) throw lead.error;
      return { lead: lead.data as Lead, eventos: (eventos.data ?? []) as Evento[], mensagens: (mensagens.data ?? []) as Mensagem[] };
    },
  });

  useEffect(() => {
    if (data) {
      setObs(data.lead.observacoes ?? '');
      setStatus(data.lead.status_funil);
    }
  }, [data]);

  const salvar = useMutation({
    mutationFn: async () => {
      const l = data!.lead;
      const mudou: Partial<Lead> = { observacoes: obs.trim() || null };
      if (status !== l.status_funil) {
        mudou.status_funil = status;
        if (status === 'descartado' && !l.motivo_descarte) mudou.motivo_descarte = 'manual';
      }
      const { error } = await supabase.from('leads').update(mudou).eq('id', l.id);
      if (error) throw error;
      // "Não contatar" manual também bloqueia recoleta, como o opt-out
      if (status === 'nao_contatar' && l.status_funil !== 'nao_contatar') {
        const { error: e2 } = await supabase
          .from('bloqueios')
          .upsert({ place_id: l.place_id, telefone: l.telefone, motivo: 'manual' }, { onConflict: 'place_id' });
        if (e2) throw e2;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead', leadId] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      toast('Lead atualizado');
    },
    onError: (e: Error) => toast(e.message, 'erro'),
  });

  const requalificar = useMutation({
    mutationFn: () => chamarFuncao('qualificar', { lead_id: leadId }),
    onSuccess: () => toast('Lead requalificado'),
    onError: (e: Error) => toast(e.message, 'erro'),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['lead', leadId] });
      qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });

  const l = data?.lead;
  const auditoria = l ? calcularScore({ ...l, horarios: l.horarios ?? null }) : null;
  const alterado = !!l && ((l.observacoes ?? '') !== obs || l.status_funil !== status);

  return (
    <Drawer
      aberto={!!leadId}
      aoFechar={aoFechar}
      largura="max-w-2xl"
      titulo={l ? l.nome : 'Lead'}
      rodape={
        l && (
          <>
            <button className="btn-secundario" onClick={aoFechar}>Fechar</button>
            <button className="btn-primario" disabled={!alterado || salvar.isPending} onClick={() => salvar.mutate()}>
              {salvar.isPending ? 'Salvando…' : 'Salvar alterações'}
            </button>
          </>
        )
      }
    >
      {isLoading || !l ? (
        <p className="text-sm text-suave">Carregando…</p>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge cor="azul">{rotuloNicho(l.nicho)}</Badge>
            <Badge cor={STATUS_SITE[l.status_site].cor}>{STATUS_SITE[l.status_site].rotulo}</Badge>
            <Badge cor={statusFunil(l.status_funil).cor}>{statusFunil(l.status_funil).rotulo}</Badge>
            <span className="text-sm text-suave">Score <span className="font-medium text-texto">{l.score}</span></span>
            {l.motivo_descarte && <span className="text-sm text-red-500">Motivo: {rotuloDescarte(l.motivo_descarte)}</span>}
            <button
              className="btn-secundario ml-auto px-2 py-1 text-xs"
              disabled={requalificar.isPending}
              onClick={() => requalificar.mutate()}
              title="Checa o site de novo e recalcula o score"
            >
              {requalificar.isPending ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              Requalificar
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="status-lead">Status no funil</label>
              <select id="status-lead" className="input" value={status} onChange={(e) => setStatus(e.target.value as StatusFunil)}>
                {STATUS_FUNIL.map((s) => <option key={s.valor} value={s.valor}>{s.rotulo}</option>)}
              </select>
              {status === 'nao_contatar' && l.status_funil !== 'nao_contatar' && (
                <p className="mt-1 text-xs text-amber-600">Este lead será bloqueado e nunca mais coletado.</p>
              )}
            </div>
            <div>
              <span className="label">Campanha</span>
              <p className="py-1.5 text-sm">{nomeCampanha(l.campanha_id)}</p>
            </div>
          </div>

          <div>
            <label className="label" htmlFor="obs-lead">Observações</label>
            <textarea id="obs-lead" className="input min-h-[80px]" value={obs} onChange={(e) => setObs(e.target.value)} />
          </div>

          <Secao titulo="Prévia (landing page)">
            <PreviaLead lead={l} />
          </Secao>

          <Secao titulo="Dados do Google">
            <ul className="space-y-1.5 text-sm">
              {l.endereco && (
                <li className="flex gap-2"><MapPin size={15} className="mt-0.5 shrink-0 text-fraco" />{l.endereco}{l.bairro ? ` · ${l.bairro}` : ''}</li>
              )}
              <li className="flex gap-2">
                <Phone size={15} className="mt-0.5 shrink-0 text-fraco" />
                {l.telefone ? `${formatarTelefone(l.telefone)} ${l.telefone_celular ? '(celular)' : '(fixo)'}` : 'Sem telefone'}
              </li>
              <li className="flex gap-2">
                <Globe size={15} className="mt-0.5 shrink-0 text-fraco" />
                {l.website ? (
                  <a href={l.website} target="_blank" rel="noreferrer" className="truncate text-marca hover:underline">{l.website}</a>
                ) : 'Sem site'}
              </li>
              <li className="flex gap-2">
                <Star size={15} className="mt-0.5 shrink-0 text-fraco" />
                {l.rating != null ? `${formatarNumero(l.rating, 1)} com ${formatarNumero(l.reviews_count)} avaliações` : 'Sem nota'}
              </li>
              {l.google_maps_url && (
                <li>
                  <a href={l.google_maps_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-marca hover:underline">
                    Abrir no Google Maps <ExternalLink size={13} />
                  </a>
                </li>
              )}
            </ul>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div><dt className="label">Tipo principal</dt><dd>{l.tipo_principal ?? '—'}</dd></div>
              <div><dt className="label">Situação</dt><dd>{l.status_negocio === 'OPERATIONAL' ? 'Em funcionamento' : l.status_negocio ?? '—'}</dd></div>
              <div><dt className="label">Coletado em</dt><dd>{formatarDataHora(l.coletado_em)}</dd></div>
              <div><dt className="label">Dados do Google atualizados em</dt><dd>{formatarData(l.places_atualizado_em)}</dd></div>
              <div className="col-span-2"><dt className="label">Categorias</dt><dd className="text-suave">{l.tipos.join(', ') || '—'}</dd></div>
            </dl>
          </Secao>

          <Secao titulo="Checagem do site">
            {!l.detalhe_site ? (
              <p className="text-sm text-suave">Ainda não verificado. Clique em “Requalificar”.</p>
            ) : (
              <div className="rounded-md border border-borda p-3 text-sm">
                <p className="mb-2">{String(l.detalhe_site.motivo ?? '')}</p>
                <dl className="grid grid-cols-3 gap-x-4 gap-y-1.5 text-xs">
                  <div><dt className="text-suave">HTTP</dt><dd>{String(l.detalhe_site.status_http ?? '—')}</dd></div>
                  <div><dt className="text-suave">Tempo</dt><dd>{l.detalhe_site.tempo_ms != null ? `${l.detalhe_site.tempo_ms} ms` : '—'}</dd></div>
                  <div><dt className="text-suave">Tamanho</dt><dd>{l.detalhe_site.tamanho_kb != null ? `${String(l.detalhe_site.tamanho_kb).replace('.', ',')} KB` : '—'}</dd></div>
                  <div><dt className="text-suave">HTTPS</dt><dd>{l.detalhe_site.https ? 'Sim' : 'Não'}</dd></div>
                  <div><dt className="text-suave">Adaptado ao celular</dt><dd>{l.detalhe_site.viewport ? 'Sim' : 'Não'}</dd></div>
                  <div><dt className="text-suave">Host</dt><dd className="truncate">{String(l.detalhe_site.host ?? '—')}</dd></div>
                  {!!l.detalhe_site.titulo && (
                    <div className="col-span-3"><dt className="text-suave">Título</dt><dd className="truncate">{String(l.detalhe_site.titulo)}</dd></div>
                  )}
                </dl>
              </div>
            )}
          </Secao>

          {auditoria && (
            <Secao titulo="Como o score foi calculado">
              <table className="w-full text-sm">
                <tbody>
                  {auditoria.parcelas.map((p) => (
                    <tr key={p.item} className="border-b border-borda last:border-0">
                      <td className="py-1.5">{p.item}</td>
                      <td className="py-1.5 text-suave">{p.detalhe}</td>
                      <td className="py-1.5 text-right tabular-nums">+{p.pontos}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="pt-2 font-medium" colSpan={2}>Total (máx. 100)</td>
                    <td className="pt-2 text-right font-medium tabular-nums">{auditoria.score}</td>
                  </tr>
                </tbody>
              </table>
              {auditoria.score !== l.score && (
                <p className="mt-1 text-xs text-amber-600">O score salvo ({l.score}) está desatualizado. Clique em “Requalificar”.</p>
              )}
            </Secao>
          )}

          {!!l.horarios?.length && (
            <Secao titulo="Horários">
              <ul className="text-sm">{l.horarios.map((h) => <li key={h}>{h}</li>)}</ul>
            </Secao>
          )}

          {!!l.fotos.length && (
            <Secao titulo={`Fotos (${l.fotos.length})`}>
              <div className="grid grid-cols-3 gap-2">
                {l.fotos.slice(0, 6).map((f) => (
                  <figure key={f.name} className="overflow-hidden rounded-md border border-borda">
                    <img
                      src={urlFoto(f.name, 400)}
                      alt=""
                      loading="lazy"
                      className="aspect-[4/3] w-full bg-elevado object-cover"
                      onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
                    />
                    {f.atribuicao && <figcaption className="truncate px-1.5 py-1 text-[10px] text-fraco">Foto: {f.atribuicao}</figcaption>}
                  </figure>
                ))}
              </div>
            </Secao>
          )}

          <Secao titulo={`Avaliações (${l.avaliacoes.length})`}>
            {l.avaliacoes.length === 0 ? (
              <p className="text-sm text-suave">Nenhuma avaliação coletada.</p>
            ) : (
              <ul className="space-y-3">
                {l.avaliacoes.map((a, i) => (
                  <li key={i} className="rounded-md border border-borda p-3 text-sm">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="font-medium">{a.autor}</span>
                      <span className="text-xs text-suave">{a.nota != null ? `${a.nota}★` : ''} {a.data}</span>
                    </div>
                    <p className="text-suave">{a.texto || '(sem texto)'}</p>
                  </li>
                ))}
              </ul>
            )}
          </Secao>

          <Secao titulo="Histórico">
            {data.eventos.length === 0 && data.mensagens.length === 0 ? (
              <p className="text-sm text-suave">Nenhum evento ou mensagem ainda.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {data.mensagens.map((m) => (
                  <li key={m.id} className="flex gap-2">
                    <span className="shrink-0 tabular-nums text-fraco">{formatarDataHora(m.enviada_em ?? m.criado_em)}</span>
                    <span>Mensagem {m.tipo.replace('_', ' ')} · {m.status}{m.motivo_pulo ? ` (${m.motivo_pulo})` : ''}</span>
                  </li>
                ))}
                {data.eventos.map((e) => (
                  <li key={e.id} className="flex gap-2">
                    <span className="shrink-0 tabular-nums text-fraco">{formatarDataHora(e.criado_em)}</span>
                    <span>{ROTULO_EVENTO[e.tipo] ?? e.tipo}{e.via_link ? ' (pelo link enviado)' : ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </Secao>
        </div>
      )}
    </Drawer>
  );
}
