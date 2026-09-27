import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight, Loader2, Minus, Plus, RefreshCw, Save, Star, Trash2, X } from 'lucide-react';
import { LIMITES, type ConteudoLP } from '@shared/conteudo';
import { supabase } from '@/lib/supabase';
import { chamarFuncao, textoResumoGeracao, type ResumoGeracao } from '@/lib/funcoes';
import {
  MOTIVOS_DESCARTE, aprovarPrevia, carregarConfigMensagem, descartarLead, mensagemPrimeiroContato,
} from '@/lib/fila';
import { formatarNumero, formatarTelefone } from '@/lib/format';
import { STATUS_SITE, rotuloNicho, type Lead, type Site } from '@/lib/types';
import { Badge, Erro, Pagina, Vazio } from '@/components/ui/Pagina';
import { PreviaFrame } from '@/components/PreviaFrame';
import { useToast } from '@/components/ui/Toast';

type LeadComSite = Lead & { site: Site | null };

const corScore = (s: number) => (s >= 70 ? 'text-emerald-600' : s >= 50 ? 'text-amber-600' : 'text-suave');
const COR_VALIDA = /^#[0-9a-fA-F]{6}$/;

/** Campos editáveis da prévia */
interface Edicao {
  titulo: string;
  subtitulo: string;
  tagline: string;
  cor: string;
  servicos: { titulo: string; descricao: string }[];
}

const edicaoDe = (c: ConteudoLP): Edicao => ({
  titulo: c.hero?.titulo ?? '',
  subtitulo: c.hero?.subtitulo ?? '',
  tagline: c.empresa?.tagline ?? '',
  cor: c.tema?.cor_primaria ?? '#2563eb',
  servicos: (c.servicos ?? []).map((s) => ({ titulo: s.titulo, descricao: s.descricao })),
});

function aplicarEdicao(c: ConteudoLP, e: Edicao): ConteudoLP {
  return {
    ...c,
    hero: { ...c.hero, titulo: e.titulo.trim(), subtitulo: e.subtitulo.trim() },
    empresa: { ...c.empresa, tagline: e.tagline.trim() },
    tema: { ...c.tema, cor_primaria: e.cor },
    servicos: e.servicos.map((s, i) => ({ ...c.servicos[i], titulo: s.titulo.trim(), descricao: s.descricao.trim() })),
  };
}

function errosEdicao(e: Edicao): string | null {
  if (!e.titulo.trim()) return 'O título não pode ficar vazio.';
  if (!COR_VALIDA.test(e.cor)) return 'Cor inválida (use o formato #RRGGBB).';
  if (e.servicos.some((s) => !s.titulo.trim() || !s.descricao.trim())) return 'Preencha título e descrição de todos os serviços.';
  return null;
}

/** Ignora atalhos enquanto o operador digita */
const digitando = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

export default function Aprovacao() {
  const qc = useQueryClient();
  const toast = useToast();
  const [idAtual, setIdAtual] = useState<string | null>(null);

  const cfg = useQuery({ queryKey: ['configuracoes', 'mensagem'], queryFn: carregarConfigMensagem });

  const fila = useQuery({
    queryKey: ['aprovacao'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('*, site:sites(*)')
        .eq('status_funil', 'previa_gerada')
        .order('score', { ascending: false })
        .order('reviews_count', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []).map((l) => ({ ...l, site: Array.isArray(l.site) ? l.site[0] ?? null : l.site })) as LeadComSite[];
    },
  });

  const leads = useMemo(() => fila.data ?? [], [fila.data]);
  const indice = Math.max(0, leads.findIndex((l) => l.id === idAtual));
  const atual = leads[indice] ?? null;

  useEffect(() => {
    if (leads.length && !leads.some((l) => l.id === idAtual)) setIdAtual(leads[0].id);
  }, [leads, idAtual]);

  const irPara = useCallback(
    (delta: number) => {
      if (!leads.length) return;
      const novo = Math.min(leads.length - 1, Math.max(0, indice + delta));
      setIdAtual(leads[novo].id);
    },
    [leads, indice],
  );

  /** Remove o lead processado e seleciona o próximo da fila */
  const concluir = useCallback(
    (leadId: string) => {
      const resto = leads.filter((l) => l.id !== leadId);
      setIdAtual(resto[Math.min(indice, resto.length - 1)]?.id ?? null);
      qc.setQueryData<LeadComSite[]>(['aprovacao'], resto);
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['contadores'] });
      qc.invalidateQueries({ queryKey: ['envios'] });
    },
    [leads, indice, qc],
  );

  return (
    <Pagina
      titulo="Aprovação"
      descricao={
        leads.length
          ? `${formatarNumero(leads.length)} prévia(s) aguardando revisão, da maior para a menor prioridade`
          : 'Revise as prévias geradas antes de enviar'
      }
      acoes={
        <span className="hidden items-center gap-1.5 text-xs text-fraco md:flex">
          Atalhos: <Kbd>A</Kbd> aprovar <Kbd>R</Kbd> regenerar <Kbd>D</Kbd> descartar <Kbd>←</Kbd><Kbd>→</Kbd> navegar
        </span>
      }
    >
      {fila.error ? (
        <Erro erro={fila.error} />
      ) : fila.isLoading ? (
        <div className="card"><Vazio>Carregando…</Vazio></div>
      ) : !leads.length ? (
        <div className="card">
          <Vazio>
            Nenhuma prévia aguardando aprovação.{' '}
            <Link to="/leads" className="text-marca hover:underline">Gere prévias em Leads</Link>.
          </Vazio>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <ListaFila leads={leads} idAtual={atual?.id ?? null} aoSelecionar={setIdAtual} />
          {atual && cfg.data && (
            <CartaoAprovacao
              key={atual.id}
              lead={atual}
              posicao={indice + 1}
              total={leads.length}
              cfg={cfg.data}
              aoNavegar={irPara}
              aoConcluir={concluir}
              aoAtualizarSite={(site) =>
                qc.setQueryData<LeadComSite[]>(['aprovacao'], (ls) => ls?.map((l) => (l.id === site.lead_id ? { ...l, site } : l)))
              }
              toast={toast}
            />
          )}
          {cfg.error && <Erro erro={cfg.error} />}
        </div>
      )}
    </Pagina>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-borda bg-elevado px-1.5 py-px font-sans text-[11px] text-suave">{children}</kbd>;
}

function ListaFila({ leads, idAtual, aoSelecionar }: { leads: LeadComSite[]; idAtual: string | null; aoSelecionar: (id: string) => void }) {
  const ativo = useRef<HTMLButtonElement>(null);
  useEffect(() => ativo.current?.scrollIntoView({ block: 'nearest' }), [idAtual]);
  return (
    <div className="card max-h-[calc(100vh-150px)] overflow-y-auto p-1.5 lg:sticky lg:top-4">
      {leads.map((l, i) => (
        <button
          key={l.id}
          ref={l.id === idAtual ? ativo : undefined}
          onClick={() => aoSelecionar(l.id)}
          className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm ${
            l.id === idAtual ? 'bg-marca/10' : 'hover:bg-elevado'
          }`}
        >
          <span className="w-5 shrink-0 text-right text-[11px] tabular-nums text-fraco">{i + 1}</span>
          <span className="min-w-0 flex-1">
            <span className={`block truncate ${l.id === idAtual ? 'font-medium text-marca' : ''}`}>{l.nome}</span>
            <span className="block truncate text-xs text-suave">
              {rotuloNicho(l.nicho)}{l.bairro ? ` · ${l.bairro}` : ''}
            </span>
          </span>
          <span className={`shrink-0 text-xs font-medium tabular-nums ${corScore(l.score)}`}>{l.score}</span>
        </button>
      ))}
    </div>
  );
}

type Painel = null | 'regenerar' | 'descartar';

function CartaoAprovacao({ lead, posicao, total, cfg, aoNavegar, aoConcluir, aoAtualizarSite, toast }: {
  lead: LeadComSite;
  posicao: number;
  total: number;
  cfg: Awaited<ReturnType<typeof carregarConfigMensagem>>;
  aoNavegar: (delta: number) => void;
  aoConcluir: (leadId: string) => void;
  aoAtualizarSite: (site: Site) => void;
  toast: ReturnType<typeof useToast>;
}) {
  const site = lead.site;
  const [edicao, setEdicao] = useState<Edicao | null>(site ? edicaoDe(site.conteudo) : null);
  const original = useMemo(() => (site ? JSON.stringify(edicaoDe(site.conteudo)) : ''), [site]);
  const alterado = !!edicao && JSON.stringify(edicao) !== original;
  const textoPadrao = useMemo(() => (site ? mensagemPrimeiroContato(lead, site, cfg) : ''), [lead, site, cfg]);
  const [texto, setTexto] = useState(textoPadrao);
  const [painel, setPainel] = useState<Painel>(null);
  const [instrucao, setInstrucao] = useState('');
  const [motivo, setMotivo] = useState<string>(MOTIVOS_DESCARTE[0].valor);
  const [detalheMotivo, setDetalheMotivo] = useState('');
  const [recarregar, setRecarregar] = useState(0);
  const campoInstrucao = useRef<HTMLTextAreaElement>(null);
  const campoMotivo = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (painel === 'regenerar') campoInstrucao.current?.focus();
    if (painel === 'descartar') campoMotivo.current?.focus();
  }, [painel]);

  const salvar = useMutation({
    mutationFn: async () => {
      if (!site || !edicao) throw new Error('Sem prévia');
      const erro = errosEdicao(edicao);
      if (erro) throw new Error(erro);
      const conteudo = aplicarEdicao(site.conteudo, edicao);
      const { data, error } = await supabase
        .from('sites')
        .update({ conteudo, atualizado_em: new Date().toISOString() })
        .eq('id', site.id)
        .select('*')
        .single();
      if (error) throw error;
      return data as Site;
    },
    onSuccess: (s) => {
      aoAtualizarSite(s);
      setRecarregar((n) => n + 1);
      toast('Alterações salvas');
    },
    onError: (e: Error) => toast(e.message, 'erro'),
  });

  const aprovar = useMutation({
    mutationFn: async () => {
      if (alterado) await salvar.mutateAsync();
      if (!texto.trim()) throw new Error('A mensagem não pode ficar vazia.');
      await aprovarPrevia(lead.id, texto.trim());
    },
    onSuccess: () => {
      toast(`${lead.nome} aprovado — mensagem na fila de Envios`);
      aoConcluir(lead.id);
    },
    onError: (e: Error) => toast(e.message, 'erro'),
  });

  const regenerar = useMutation({
    mutationFn: () =>
      chamarFuncao<ResumoGeracao>('gerar-previa', {
        lead_id: lead.id,
        regenerar: true,
        ...(instrucao.trim() ? { instrucao_extra: instrucao.trim() } : {}),
      }),
    onSuccess: async (r) => {
      if (!r.gerados) {
        toast(textoResumoGeracao(r), 'erro');
        return;
      }
      const { data } = await supabase.from('sites').select('*').eq('lead_id', lead.id).single();
      if (data) {
        aoAtualizarSite(data as Site);
        setEdicao(edicaoDe((data as Site).conteudo));
      }
      setRecarregar((n) => n + 1);
      setInstrucao('');
      setPainel(null);
      toast(r.resultados[0]?.versao ? `Nova versão gerada (v${r.resultados[0].versao})` : 'Nova versão gerada');
    },
    onError: (e: Error) => toast(e.message, 'erro'),
  });

  const descartar = useMutation({
    mutationFn: () => {
      const rotulo = detalheMotivo.trim();
      return descartarLead(lead.id, motivo === 'manual' && rotulo ? rotulo : motivo);
    },
    onSuccess: () => {
      toast(`${lead.nome} descartado`);
      aoConcluir(lead.id);
    },
    onError: (e: Error) => toast(e.message, 'erro'),
  });

  const ocupado = aprovar.isPending || regenerar.isPending || descartar.isPending || salvar.isPending;

  // Atalhos de teclado: A aprovar, R regenerar, D descartar, ← → navegar, Esc fecha o painel
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPainel(null);
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || digitando(e.target) || ocupado) return;
      const k = e.key.toLowerCase();
      if (k === 'a' && site) aprovar.mutate();
      else if (k === 'r') setPainel('regenerar');
      else if (k === 'd') setPainel('descartar');
      else if (e.key === 'ArrowRight') aoNavegar(1);
      else if (e.key === 'ArrowLeft') aoNavegar(-1);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aprovar, aoNavegar, ocupado, site]);

  const semTelefone = !lead.telefone;
  const statusSite = STATUS_SITE[lead.status_site];
  const linkInterno = site ? `/p/${site.slug}?k=${site.token_acesso}&interno=1` : '';

  const atualizar = (p: Partial<Edicao>) => setEdicao((e) => (e ? { ...e, ...p } : e));
  const atualizarServico = (i: number, p: Partial<Edicao['servicos'][number]>) =>
    setEdicao((e) => (e ? { ...e, servicos: e.servicos.map((s, j) => (j === i ? { ...s, ...p } : s)) } : e));

  return (
    <div className="card min-w-0">
      {/* Cabeçalho do lead */}
      <div className="flex flex-wrap items-start gap-3 border-b border-borda px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-lg font-medium">{lead.nome}</h2>
            <span className={`text-sm font-medium tabular-nums ${corScore(lead.score)}`}>score {lead.score}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-suave">
            <span>{rotuloNicho(lead.nicho)}{lead.bairro ? ` · ${lead.bairro}` : ''} · {lead.cidade}</span>
            {lead.rating != null && (
              <span className="inline-flex items-center gap-1">
                <Star size={13} className="fill-amber-400 text-amber-400" />
                {formatarNumero(lead.rating, 1)} ({formatarNumero(lead.reviews_count)})
              </span>
            )}
            <span className="tabular-nums">{formatarTelefone(lead.telefone)}</span>
            <Badge cor={statusSite.cor}>{statusSite.rotulo}</Badge>
            {semTelefone ? (
              <Badge cor="vermelho">Sem telefone</Badge>
            ) : !lead.telefone_celular ? (
              <Badge cor="amarelo">Telefone fixo — confirme se tem WhatsApp</Badge>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-1 text-xs text-suave">
          <button className="btn-fantasma px-2" onClick={() => aoNavegar(-1)} disabled={posicao <= 1} aria-label="Anterior">
            <ChevronLeft size={16} />
          </button>
          <span className="tabular-nums">{posicao} de {total}</span>
          <button className="btn-fantasma px-2" onClick={() => aoNavegar(1)} disabled={posicao >= total} aria-label="Próximo">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {!site || !edicao ? (
        <Vazio>Este lead está marcado com prévia gerada, mas a prévia não foi encontrada. Regenere-a.</Vazio>
      ) : (
        <div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <PreviaFrame src={linkInterno} recarregar={recarregar} />

          <div className="min-w-0 space-y-5">
            {/* Edição rápida */}
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-medium">Ajustes rápidos</h3>
                <span className="text-xs text-fraco">Versão {site.versao}</span>
              </div>
              <div className="space-y-3">
                <Campo rotulo="Título principal" valor={edicao.titulo} max={LIMITES.titulo} aoMudar={(v) => atualizar({ titulo: v })} />
                <Campo rotulo="Subtítulo" valor={edicao.subtitulo} max={LIMITES.subtitulo} multilinha aoMudar={(v) => atualizar({ subtitulo: v })} />
                <Campo rotulo="Frase de apresentação (tagline)" valor={edicao.tagline} max={LIMITES.tagline} aoMudar={(v) => atualizar({ tagline: v })} />
                <div>
                  <label className="label" htmlFor="cor">Cor principal</label>
                  <div className="flex items-center gap-2">
                    <input
                      id="cor"
                      type="color"
                      value={COR_VALIDA.test(edicao.cor) ? edicao.cor : '#2563eb'}
                      onChange={(e) => atualizar({ cor: e.target.value })}
                      className="h-8 w-10 cursor-pointer rounded border border-borda bg-superficie p-0.5"
                    />
                    <input className="input w-28 font-mono" value={edicao.cor} maxLength={7} onChange={(e) => atualizar({ cor: e.target.value })} aria-label="Cor em hexadecimal" />
                  </div>
                </div>
                <details className="rounded-md border border-borda">
                  <summary className="cursor-pointer px-3 py-2 text-sm">Serviços ({edicao.servicos.length})</summary>
                  <div className="space-y-3 border-t border-borda p-3">
                    {edicao.servicos.map((s, i) => (
                      <div key={i} className="space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <input className="input" value={s.titulo} maxLength={LIMITES.titulo} onChange={(e) => atualizarServico(i, { titulo: e.target.value })} aria-label={`Serviço ${i + 1}`} />
                          <button
                            type="button"
                            className="btn-fantasma px-2"
                            title="Remover serviço"
                            disabled={edicao.servicos.length <= LIMITES.servicos.min}
                            onClick={() => setEdicao((e) => (e ? { ...e, servicos: e.servicos.filter((_, j) => j !== i) } : e))}
                          >
                            <Minus size={14} />
                          </button>
                        </div>
                        <textarea className="input min-h-[52px] text-xs" value={s.descricao} maxLength={LIMITES.descricao} onChange={(e) => atualizarServico(i, { descricao: e.target.value })} aria-label={`Descrição do serviço ${i + 1}`} />
                      </div>
                    ))}
                    {edicao.servicos.length < site.conteudo.servicos.length && (
                      <button type="button" className="btn-fantasma text-xs" onClick={() => setEdicao(edicaoDe(site.conteudo))}>
                        <Plus size={13} /> Restaurar serviços removidos
                      </button>
                    )}
                  </div>
                </details>
                {alterado && (
                  <div className="flex gap-2">
                    <button className="btn-secundario" onClick={() => salvar.mutate()} disabled={ocupado}>
                      {salvar.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Salvar e ver na prévia
                    </button>
                    <button className="btn-fantasma" onClick={() => setEdicao(edicaoDe(site.conteudo))} disabled={ocupado}>Desfazer</button>
                  </div>
                )}
              </div>
            </section>

            {/* Mensagem */}
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-medium">Mensagem de primeiro contato</h3>
                {texto !== textoPadrao && (
                  <button className="text-xs text-marca hover:underline" onClick={() => setTexto(textoPadrao)}>Restaurar texto</button>
                )}
              </div>
              <textarea className="input min-h-[150px] text-[13px] leading-relaxed" value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Mensagem de primeiro contato" />
              <p className="mt-1 text-xs text-fraco">Você ainda poderá ajustar o texto na tela de Envios.</p>
            </section>

            {/* Ações */}
            <section className="space-y-2">
              <button className="btn-primario w-full py-2" onClick={() => aprovar.mutate()} disabled={ocupado}>
                {aprovar.isPending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                Aprovar e colocar na fila <Kbd>A</Kbd>
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button className={`btn-secundario ${painel === 'regenerar' ? 'border-marca' : ''}`} onClick={() => setPainel(painel === 'regenerar' ? null : 'regenerar')} disabled={ocupado}>
                  <RefreshCw size={15} /> Regenerar <Kbd>R</Kbd>
                </button>
                <button className={`btn-secundario ${painel === 'descartar' ? 'border-red-500' : ''}`} onClick={() => setPainel(painel === 'descartar' ? null : 'descartar')} disabled={ocupado}>
                  <Trash2 size={15} /> Descartar <Kbd>D</Kbd>
                </button>
              </div>

              {painel === 'regenerar' && (
                <div className="rounded-md border border-borda p-3">
                  <PainelTitulo aoFechar={() => setPainel(null)}>Gerar nova versão com IA</PainelTitulo>
                  <label className="label" htmlFor="instrucao">Instrução extra (opcional)</label>
                  <textarea
                    id="instrucao"
                    ref={campoInstrucao}
                    className="input min-h-[70px]"
                    maxLength={600}
                    placeholder="Ex.: destacar atendimento infantil; tom mais descontraído"
                    value={instrucao}
                    onChange={(e) => setInstrucao(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) regenerar.mutate();
                    }}
                  />
                  <button className="btn-primario mt-2 w-full" onClick={() => regenerar.mutate()} disabled={regenerar.isPending}>
                    {regenerar.isPending ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                    {regenerar.isPending ? 'Gerando… (até 1 min)' : 'Gerar nova versão'}
                  </button>
                  {alterado && <p className="mt-2 text-xs text-amber-600">Os ajustes não salvos serão substituídos pela nova versão.</p>}
                </div>
              )}

              {painel === 'descartar' && (
                <div className="rounded-md border border-red-500/40 p-3">
                  <PainelTitulo aoFechar={() => setPainel(null)}>Descartar este lead</PainelTitulo>
                  <label className="label" htmlFor="motivo">Motivo</label>
                  <select id="motivo" ref={campoMotivo} className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
                    {MOTIVOS_DESCARTE.map((m) => <option key={m.valor} value={m.valor}>{m.rotulo}</option>)}
                  </select>
                  {motivo === 'manual' && (
                    <input className="input mt-2" placeholder="Descreva o motivo" maxLength={120} value={detalheMotivo} onChange={(e) => setDetalheMotivo(e.target.value)} />
                  )}
                  <button className="btn-perigo mt-2 w-full" onClick={() => descartar.mutate()} disabled={descartar.isPending}>
                    {descartar.isPending ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />} Confirmar descarte
                  </button>
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

function PainelTitulo({ children, aoFechar }: { children: React.ReactNode; aoFechar: () => void }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <span className="text-sm font-medium">{children}</span>
      <button className="text-fraco hover:text-texto" onClick={aoFechar} aria-label="Fechar"><X size={15} /></button>
    </div>
  );
}

function Campo({ rotulo, valor, max, multilinha, aoMudar }: {
  rotulo: string;
  valor: string;
  max: number;
  multilinha?: boolean;
  aoMudar: (v: string) => void;
}) {
  const id = useId();
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="label" htmlFor={id}>{rotulo}</label>
        <span className={`text-[11px] tabular-nums ${valor.length > max * 0.9 ? 'text-amber-600' : 'text-fraco'}`}>{valor.length}/{max}</span>
      </div>
      {multilinha ? (
        <textarea id={id} className="input min-h-[64px]" value={valor} maxLength={max} onChange={(e) => aoMudar(e.target.value)} />
      ) : (
        <input id={id} className="input" value={valor} maxLength={max} onChange={(e) => aoMudar(e.target.value)} />
      )}
    </div>
  );
}
