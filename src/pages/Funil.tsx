import { useMemo, useState, type DragEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, ChevronDown, ChevronRight, GripVertical, Loader2, MessageCircle, Star } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { moverLead } from '@/lib/fila';
import { formatarMoeda, formatarNumero, paraE164 } from '@/lib/format';
import { rotuloNicho } from '@/lib/types';
import { Erro, Pagina } from '@/components/ui/Pagina';
import { DetalheLead } from '@/components/DetalheLead';
import { useToast } from '@/components/ui/Toast';

const COLUNAS = [
  { status: 'enviado', rotulo: 'Enviado', cor: 'bg-slate-400' },
  { status: 'abriu', rotulo: 'Abriu', cor: 'bg-amber-500' },
  { status: 'respondeu', rotulo: 'Respondeu', cor: 'bg-sky-500' },
  { status: 'negociando', rotulo: 'Negociando', cor: 'bg-violet-500' },
  { status: 'fechado', rotulo: 'Fechado', cor: 'bg-emerald-500' },
  { status: 'perdido', rotulo: 'Perdido', cor: 'bg-red-500' },
] as const;
type StatusColuna = (typeof COLUNAS)[number]['status'];

const ROTULO_EVENTO: Record<string, string> = {
  visita: 'Abriu a prévia',
  clique_whatsapp: 'Clicou no WhatsApp da prévia',
  clique_quero: 'Clicou em “Quero esse site”',
  mensagem_enviada: 'Mensagem enviada',
  optout: 'Pediu para não receber',
};

interface CardLead {
  id: string;
  nome: string;
  nicho: string;
  bairro: string | null;
  telefone: string | null;
  score: number;
  rating: number | null;
  status_funil: StatusColuna;
  valor_fechado: number | null;
  atualizado_em: string;
  ultimoEvento: { tipo: string; em: string } | null;
  ultimoContato: string | null;
}

const DIA = 86_400_000;
function tempoRelativo(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 3_600_000) return `há ${Math.max(1, Math.round(ms / 60_000))} min`;
  if (ms < DIA) return `há ${Math.round(ms / 3_600_000)} h`;
  const d = Math.floor(ms / DIA);
  return d === 1 ? 'há 1 dia' : `há ${d} dias`;
}
const diasDesde = (iso: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / DIA) : null);

async function carregarFunil(): Promise<CardLead[]> {
  const { data: leads, error } = await supabase
    .from('leads')
    .select('id,nome,nicho,bairro,telefone,score,rating,status_funil,valor_fechado,atualizado_em')
    .in('status_funil', COLUNAS.map((c) => c.status))
    .order('atualizado_em', { ascending: false })
    .limit(600);
  if (error) throw error;
  const ids = (leads ?? []).map((l) => l.id);
  if (!ids.length) return [];

  const [eventos, mensagens] = await Promise.all([
    supabase.from('eventos').select('lead_id,tipo,criado_em').in('lead_id', ids).order('criado_em', { ascending: false }).limit(3000),
    supabase.from('mensagens').select('lead_id,enviada_em').in('lead_id', ids).eq('status', 'enviada').order('enviada_em', { ascending: false }).limit(3000),
  ]);
  const ultimoEvento = new Map<string, { tipo: string; em: string }>();
  for (const e of eventos.data ?? []) if (!ultimoEvento.has(e.lead_id)) ultimoEvento.set(e.lead_id, { tipo: e.tipo, em: e.criado_em });
  const ultimoContato = new Map<string, string>();
  for (const m of mensagens.data ?? []) if (m.enviada_em && !ultimoContato.has(m.lead_id)) ultimoContato.set(m.lead_id, m.enviada_em);

  return (leads ?? []).map((l) => ({
    ...(l as Omit<CardLead, 'ultimoEvento' | 'ultimoContato'>),
    ultimoEvento: ultimoEvento.get(l.id) ?? null,
    ultimoContato: ultimoContato.get(l.id) ?? null,
  }));
}

export default function Funil() {
  const qc = useQueryClient();
  const toast = useToast();
  const [perdidoAberto, setPerdidoAberto] = useState(false);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<StatusColuna | null>(null);
  const [fechando, setFechando] = useState<CardLead | null>(null);
  const [selecionado, setSelecionado] = useState<string | null>(null);

  const funil = useQuery({ queryKey: ['funil'], queryFn: carregarFunil });
  const cards = useMemo(() => funil.data ?? [], [funil.data]);

  const mover = useMutation({
    mutationFn: ({ lead, status, valor }: { lead: CardLead; status: StatusColuna; valor?: number | null }) =>
      moverLead(lead.id, status, valor),
    onMutate: ({ lead, status, valor }) => {
      qc.setQueryData<CardLead[]>(['funil'], (ls) =>
        ls?.map((l) => (l.id === lead.id ? { ...l, status_funil: status, valor_fechado: valor ?? l.valor_fechado } : l)),
      );
    },
    onSuccess: (_r, { lead, status }) => toast(`${lead.nome} → ${COLUNAS.find((c) => c.status === status)?.rotulo}`),
    onError: (e: Error) => toast(e.message, 'erro'),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['funil'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['painel'] });
      qc.invalidateQueries({ queryKey: ['envios'] });
    },
  });

  const pedirMover = (lead: CardLead, status: StatusColuna) => {
    if (lead.status_funil === status) return;
    if (status === 'fechado') setFechando({ ...lead });
    else mover.mutate({ lead, status });
  };

  const aoSoltar = (status: StatusColuna) => (e: DragEvent) => {
    e.preventDefault();
    setSobre(null);
    const lead = cards.find((c) => c.id === e.dataTransfer.getData('text/plain'));
    if (lead) pedirMover(lead, status);
  };

  const receita = cards.filter((c) => c.status_funil === 'fechado').reduce((t, c) => t + (Number(c.valor_fechado) || 0), 0);

  return (
    <Pagina
      titulo="Funil"
      descricao="Arraste os cards para mudar a etapa. Clique no nome para ver o histórico."
      acoes={
        <span className="text-sm text-suave">
          Receita fechada: <span className="font-medium text-texto">{formatarMoeda(receita)}</span>
        </span>
      }
    >
      {funil.error ? (
        <Erro erro={funil.error} />
      ) : funil.isLoading ? (
        <div className="text-sm text-suave">Carregando…</div>
      ) : (
        <div className="flex gap-2.5 overflow-x-auto pb-4">
          {COLUNAS.map((col) => {
            const itens = cards.filter((c) => c.status_funil === col.status);
            const recolhida = col.status === 'perdido' && !perdidoAberto;
            const alvo = sobre === col.status && arrastando;
            return (
              <section
                key={col.status}
                onDragOver={(e) => {
                  e.preventDefault();
                  setSobre(col.status);
                }}
                onDragLeave={() => setSobre((s) => (s === col.status ? null : s))}
                onDrop={aoSoltar(col.status)}
                className={`flex flex-col rounded-lg border bg-elevado/50 transition-colors ${
                  recolhida ? 'w-14 shrink-0' : 'min-w-[200px] flex-1 basis-0'
                } ${alvo ? 'border-marca bg-marca/5' : 'border-borda'}`}
                aria-label={`Coluna ${col.rotulo}`}
              >
                <header
                  className={`flex items-center gap-2 px-3 py-2.5 ${recolhida ? 'h-full flex-col' : ''}`}
                >
                  {col.status === 'perdido' && (
                    <button
                      className="text-suave hover:text-texto"
                      onClick={() => setPerdidoAberto((a) => !a)}
                      aria-label={perdidoAberto ? 'Recolher perdidos' : 'Mostrar perdidos'}
                      aria-expanded={perdidoAberto}
                    >
                      {perdidoAberto ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    </button>
                  )}
                  <span className={`h-2 w-2 shrink-0 rounded-full ${col.cor}`} aria-hidden />
                  <span className={`text-sm font-medium ${recolhida ? '[writing-mode:vertical-rl]' : ''}`}>{col.rotulo}</span>
                  <span className="rounded bg-superficie px-1.5 text-[11px] tabular-nums text-suave">{itens.length}</span>
                </header>
                {!recolhida && (
                  <div className="flex max-h-[calc(100vh-190px)] min-h-[120px] flex-col gap-2 overflow-y-auto px-2 pb-2">
                    {itens.map((c) => (
                      <Card
                        key={c.id}
                        lead={c}
                        aoArrastar={(id) => setArrastando(id)}
                        aoSoltarCard={() => {
                          setArrastando(null);
                          setSobre(null);
                        }}
                        aoMover={(s) => pedirMover(c, s)}
                        aoAbrir={() => setSelecionado(c.id)}
                        aoEditarValor={() => setFechando({ ...c })}
                      />
                    ))}
                    {!itens.length && <p className="px-1 py-6 text-center text-xs text-fraco">Arraste um card para cá</p>}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {fechando && (
        <DialogoValor
          lead={fechando}
          salvando={mover.isPending}
          aoCancelar={() => setFechando(null)}
          aoConfirmar={(valor) => {
            mover.mutate({ lead: fechando, status: 'fechado', valor }, { onSettled: () => setFechando(null) });
          }}
        />
      )}

      <DetalheLead
        leadId={selecionado}
        aoFechar={() => {
          setSelecionado(null);
          qc.invalidateQueries({ queryKey: ['funil'] });
        }}
        nomeCampanha={() => '—'}
      />
    </Pagina>
  );
}

function Card({ lead, aoArrastar, aoSoltarCard, aoMover, aoAbrir, aoEditarValor }: {
  lead: CardLead;
  aoArrastar: (id: string) => void;
  aoSoltarCard: () => void;
  aoMover: (s: StatusColuna) => void;
  aoAbrir: () => void;
  aoEditarValor: () => void;
}) {
  const e164 = paraE164(lead.telefone);
  const dias = diasDesde(lead.ultimoContato);
  const ativo = !['fechado', 'perdido'].includes(lead.status_funil);
  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', lead.id);
        e.dataTransfer.effectAllowed = 'move';
        aoArrastar(lead.id);
      }}
      onDragEnd={aoSoltarCard}
      className="group relative cursor-grab rounded-md border border-borda bg-superficie p-3 text-sm shadow-sm active:cursor-grabbing"
    >
      <div className="flex items-start gap-1.5">
        <GripVertical size={14} className="absolute -left-0.5 top-3.5 text-fraco opacity-0 group-hover:opacity-100" aria-hidden />
        <button onClick={aoAbrir} className="min-w-0 flex-1 truncate text-left font-medium hover:text-marca" title={lead.nome}>
          {lead.nome}
        </button>
        <span className="shrink-0 text-xs font-medium tabular-nums text-suave" title="Score">{lead.score}</span>
      </div>
      <div className="mt-0.5 flex items-center gap-2 text-xs text-suave">
        <span className="truncate">{rotuloNicho(lead.nicho)}{lead.bairro ? ` · ${lead.bairro}` : ''}</span>
        {lead.rating != null && (
          <span className="inline-flex shrink-0 items-center gap-0.5">
            <Star size={11} className="fill-amber-400 text-amber-400" />{formatarNumero(lead.rating, 1)}
          </span>
        )}
      </div>

      <div className="mt-2 space-y-0.5 text-xs">
        <p className="truncate text-suave">
          {lead.ultimoEvento ? `${ROTULO_EVENTO[lead.ultimoEvento.tipo] ?? lead.ultimoEvento.tipo} · ${tempoRelativo(lead.ultimoEvento.em)}` : 'Sem eventos'}
        </p>
        {ativo && dias != null && (
          <p className={dias >= 5 ? 'font-medium text-red-600' : dias >= 2 ? 'text-amber-600' : 'text-suave'}>
            {dias === 0 ? 'Contato hoje' : `${dias} dia(s) sem contato`}
          </p>
        )}
        {lead.status_funil === 'fechado' && (
          <button onClick={aoEditarValor} className="font-medium text-emerald-600 hover:underline">
            {lead.valor_fechado ? formatarMoeda(lead.valor_fechado) : 'Informar valor fechado'}
          </button>
        )}
      </div>

      <div className="mt-2.5 flex items-center gap-1.5">
        {e164 ? (
          <a
            href={`https://wa.me/${e164.replace(/\D/g, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700"
            title="Abrir a conversa no WhatsApp"
          >
            <MessageCircle size={12} /> WhatsApp
          </a>
        ) : (
          <span className="text-xs text-fraco">Sem telefone</span>
        )}
        {/* Alternativa ao arrastar (teclado, celular): lista nativa sobre um botão compacto */}
        <label
          className="relative ml-auto inline-flex shrink-0 cursor-pointer items-center rounded-md border border-borda p-1.5 text-suave hover:bg-elevado hover:text-texto"
          title="Mover para outra etapa"
        >
          <ArrowRightLeft size={13} aria-hidden />
          <select
            className="absolute inset-0 cursor-pointer opacity-0"
            value={lead.status_funil}
            onChange={(e) => aoMover(e.target.value as StatusColuna)}
            aria-label={`Mover ${lead.nome} para`}
          >
            {COLUNAS.map((c) => <option key={c.status} value={c.status}>{c.rotulo}</option>)}
          </select>
        </label>
      </div>
    </article>
  );
}

/** Converte "1.497,50" / "1497.5" / "R$ 1.497" em número */
function lerValor(texto: string): number | null {
  const limpo = texto.replace(/[^\d,.-]/g, '');
  if (!limpo) return null;
  const normal = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo;
  const n = Number(normal);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

function DialogoValor({ lead, salvando, aoCancelar, aoConfirmar }: {
  lead: CardLead;
  salvando: boolean;
  aoCancelar: () => void;
  aoConfirmar: (valor: number | null) => void;
}) {
  const [texto, setTexto] = useState(lead.valor_fechado ? String(lead.valor_fechado).replace('.', ',') : '');
  const valor = lerValor(texto);
  const invalido = texto.trim() !== '' && valor === null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="titulo-fechar" onClick={aoCancelar}>
      <form
        className="card w-full max-w-sm p-5"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (!invalido) aoConfirmar(valor);
        }}
      >
        <h2 id="titulo-fechar" className="text-base font-medium">Negócio fechado</h2>
        <p className="mt-1 text-sm text-suave">{lead.nome}</p>
        <label className="label mt-4" htmlFor="valor-fechado">Valor fechado (R$)</label>
        <input
          id="valor-fechado"
          className="input"
          inputMode="decimal"
          placeholder="Ex.: 1.497,00"
          autoFocus
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        {invalido ? (
          <p className="mt-1 text-xs text-red-500">Valor inválido</p>
        ) : (
          <p className="mt-1 text-xs text-fraco">{valor != null ? formatarMoeda(valor) : 'Opcional — dá para informar depois.'}</p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-fantasma" onClick={aoCancelar}>Cancelar</button>
          <button type="submit" className="btn-primario" disabled={salvando || invalido}>
            {salvando && <Loader2 size={15} className="animate-spin" />} Confirmar
          </button>
        </div>
      </form>
    </div>
  );
}
