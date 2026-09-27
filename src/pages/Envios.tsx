import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CalendarClock, Copy, ExternalLink, Loader2, MessageCircle, SkipForward, Star, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { agendarFollowups, linkWhatsApp, type ResumoFollowups, pularMensagem, registrarEnvio, resumoEnvios } from '@/lib/fila';
import { formatarData, formatarNumero, formatarTelefone, paraE164 } from '@/lib/format';
import { rotuloNicho, type Mensagem } from '@/lib/types';
import { Badge, Erro, Pagina, Vazio } from '@/components/ui/Pagina';
import { useToast } from '@/components/ui/Toast';

interface LeadEnvio {
  id: string;
  nome: string;
  telefone: string | null;
  telefone_celular: boolean;
  score: number;
  status_funil: string;
  nicho: string;
  bairro: string | null;
  cidade: string;
  rating: number | null;
  reviews_count: number;
}
type ItemFila = Mensagem & { lead: LeadEnvio };

const ROTULO_TIPO: Record<string, string> = {
  primeiro_contato: 'Primeiro contato',
  followup_1: 'Follow-up 1',
  followup_2: 'Follow-up 2',
  resposta_preco: 'Resposta de preço',
};

/** Data de hoje em São Paulo (yyyy-mm-dd) */
const hojeSP = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

const corScore = (s: number) => (s >= 70 ? 'text-emerald-600' : s >= 50 ? 'text-amber-600' : 'text-suave');

export default function Envios() {
  const [aba, setAba] = useState<'primeiro' | 'followups'>('primeiro');
  const [linkPendente, setLinkPendente] = useState<{ nome: string; url: string } | null>(null);

  const qc = useQueryClient();
  const toast = useToast();
  const resumo = useQuery({ queryKey: ['envios', 'resumo'], queryFn: resumoEnvios, refetchInterval: 60_000 });

  // Agenda os follow-ups do dia ao abrir a tela (a função é idempotente; na Fase 7 roda também pelo cron)
  // Variável da mutação: true = clique do operador (avisa mesmo sem novidades)
  const agendar = useMutation<ResumoFollowups, Error, boolean>({
    mutationFn: () => agendarFollowups(),
    onSuccess: (r, manual) => {
      const novos = r.followup_1 + r.followup_2;
      if (novos) toast(`${novos} follow-up(s) agendado(s) para hoje`);
      else if (manual) toast('Nenhum follow-up novo para hoje');
      if (r.perdidos) toast(`${r.perdidos} lead(s) sem resposta movido(s) para Perdido`);
      if (novos || r.perdidos || r.pulados) {
        qc.invalidateQueries({ queryKey: ['envios'] });
        qc.invalidateQueries({ queryKey: ['contadores'] });
      }
    },
    onError: (e: Error, manual) => manual && toast(e.message, 'erro'),
  });
  const { mutate: agendarMutate } = agendar;
  useEffect(() => {
    agendarMutate(false);
  }, [agendarMutate]);

  const fila = useQuery({
    queryKey: ['envios', 'fila'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mensagens')
        .select('*, lead:leads!inner(id,nome,telefone,telefone_celular,score,status_funil,nicho,bairro,cidade,rating,reviews_count)')
        .eq('status', 'pendente')
        .lte('agendada_para', hojeSP())
        .not('lead.status_funil', 'in', '(nao_contatar,descartado,perdido)')
        .limit(500);
      if (error) throw error;
      return ((data ?? []) as ItemFila[]).sort((a, b) => b.lead.score - a.lead.score || a.criado_em.localeCompare(b.criado_em));
    },
  });

  const itens = useMemo(() => fila.data ?? [], [fila.data]);
  const primeiros = itens.filter((m) => m.tipo === 'primeiro_contato');
  const followups = itens.filter((m) => m.tipo !== 'primeiro_contato');
  const lista = aba === 'primeiro' ? primeiros : followups;

  const enviados = resumo.data?.enviados_hoje ?? 0;
  const limite = resumo.data?.limite ?? 0;
  const noLimite = !!resumo.data && enviados >= limite;
  const pct = limite ? Math.min(100, Math.round((enviados / limite) * 100)) : 0;

  return (
    <Pagina
      titulo="Envios"
      descricao="Revise o texto e envie pelo WhatsApp com um clique. Nada é enviado automaticamente."
      acoes={
        resumo.data && (
          <div className="w-52 text-right">
            <div className="text-sm">
              <span className="font-medium tabular-nums">{formatarNumero(enviados)}</span>
              <span className="text-suave"> / {formatarNumero(limite)} enviados hoje</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-elevado">
              <div className={`h-full rounded-full ${noLimite ? 'bg-red-500' : pct > 80 ? 'bg-amber-500' : 'bg-marca'}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        )
      }
    >
      {resumo.error && <div className="mb-4"><Erro erro={resumo.error} /></div>}

      {noLimite && (
        <div className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          Limite diário de envios atingido ({formatarNumero(limite)}). A fila continua amanhã, ou ajuste o limite em{' '}
          <Link to="/configuracoes" className="underline">Configurações</Link>.
        </div>
      )}

      {linkPendente && (
        <div className="mb-4 flex items-center gap-3 rounded-md border border-marca/40 bg-marca/5 px-4 py-3 text-sm">
          <span className="flex-1">O navegador bloqueou a nova aba. Envio de <b className="font-medium">{linkPendente.nome}</b> registrado.</span>
          <a href={linkPendente.url} target="_blank" rel="noopener noreferrer" className="btn-primario" onClick={() => setLinkPendente(null)}>
            <ExternalLink size={15} /> Abrir WhatsApp
          </a>
          <button className="text-fraco hover:text-texto" onClick={() => setLinkPendente(null)} aria-label="Fechar"><X size={15} /></button>
        </div>
      )}

      <div className="mb-4 flex gap-1 border-b border-borda" role="tablist">
        {([
          ['primeiro', 'Primeiro contato', primeiros.length],
          ['followups', 'Follow-ups de hoje', followups.length],
        ] as const).map(([valor, rotulo, n]) => (
          <button
            key={valor}
            role="tab"
            aria-selected={aba === valor}
            onClick={() => setAba(valor)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${aba === valor ? 'border-marca font-medium text-marca' : 'border-transparent text-suave hover:text-texto'}`}
          >
            {rotulo} <span className="ml-1 rounded bg-elevado px-1.5 py-px text-[11px] tabular-nums text-suave">{n}</span>
          </button>
        ))}
      </div>

      {aba === 'followups' && (
        <div className="mb-3 flex justify-end">
          <button className="btn-secundario" onClick={() => agendar.mutate(true)} disabled={agendar.isPending}>
            {agendar.isPending ? <Loader2 size={15} className="animate-spin" /> : <CalendarClock size={15} />} Verificar follow-ups agora
          </button>
        </div>
      )}

      {fila.error ? (
        <Erro erro={fila.error} />
      ) : fila.isLoading ? (
        <div className="card"><Vazio>Carregando…</Vazio></div>
      ) : !lista.length ? (
        <div className="card">
          <Vazio>
            {aba === 'primeiro' ? (
              <>Nenhuma mensagem de primeiro contato na fila. <Link to="/aprovacao" className="text-marca hover:underline">Aprove prévias</Link> para preencher.</>
            ) : (
              <>
                Nenhum follow-up para hoje. Eles são criados 2 dias após o primeiro contato (follow-up 1) e 3 dias após o
                follow-up 1 (follow-up 2).
              </>
            )}
          </Vazio>
        </div>
      ) : (
        <div className="space-y-3">
          {lista.map((m) => (
            <ItemEnvio key={m.id} item={m} bloqueado={noLimite} aoPopupBloqueado={setLinkPendente} />
          ))}
        </div>
      )}
    </Pagina>
  );
}

function ItemEnvio({ item, bloqueado, aoPopupBloqueado }: {
  item: ItemFila;
  bloqueado: boolean;
  aoPopupBloqueado: (l: { nome: string; url: string }) => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const { lead } = item;
  const [texto, setTexto] = useState(item.texto);
  const [salvo, setSalvo] = useState(item.texto);
  const [pulando, setPulando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const e164 = paraE164(lead.telefone);
  const atrasada = item.agendada_para < hojeSP();

  useEffect(() => {
    setTexto(item.texto);
    setSalvo(item.texto);
  }, [item.texto]);

  const atualizarListas = () => {
    qc.invalidateQueries({ queryKey: ['envios'] });
    qc.invalidateQueries({ queryKey: ['contadores'] });
    qc.invalidateQueries({ queryKey: ['leads'] });
  };

  /** Persiste o texto editado (ao sair do campo) */
  const salvar = useMutation({
    mutationFn: async () => {
      const t = texto.trim();
      if (!t || t === salvo) return;
      const { error } = await supabase.from('mensagens').update({ texto: t }).eq('id', item.id).eq('status', 'pendente');
      if (error) throw error;
      setSalvo(t);
    },
    onError: (e: Error) => toast(`Não foi possível salvar o texto: ${e.message}`, 'erro'),
  });

  const enviar = useMutation({
    mutationFn: async (janela: Window | null) => {
      const t = texto.trim();
      if (!t) throw new Error('A mensagem está vazia.');
      try {
        await registrarEnvio(item.id, t);
      } catch (e) {
        janela?.close();
        throw e;
      }
      const url = linkWhatsApp(e164!, t);
      if (janela) {
        janela.opener = null;
        janela.location.href = url;
      } else {
        aoPopupBloqueado({ nome: lead.nome, url });
      }
    },
    onSuccess: () => toast(`Envio para ${lead.nome} registrado`),
    onError: (e: Error) => toast(e.message, 'erro'),
    onSettled: atualizarListas,
  });

  const pular = useMutation({
    mutationFn: () => pularMensagem(item.id, motivo),
    onSuccess: () => toast(`${lead.nome} pulado`),
    onError: (e: Error) => toast(e.message, 'erro'),
    onSettled: atualizarListas,
  });

  // A janela é aberta no próprio clique (senão o navegador bloqueia) e só recebe o link após registrar o envio
  const abrirWhatsApp = () => enviar.mutate(window.open('about:blank', '_blank'));

  const copiar = () => {
    navigator.clipboard?.writeText(texto).then(
      () => toast('Mensagem copiada'),
      () => toast('Não foi possível copiar', 'erro'),
    );
  };

  const ocupado = enviar.isPending || pular.isPending;
  const motivoBloqueio = !e164 ? 'Lead sem telefone válido' : bloqueado ? 'Limite diário atingido' : undefined;

  return (
    <div className="card grid gap-4 p-4 md:grid-cols-[220px_minmax(0,1fr)_170px]">
      <div className="min-w-0 text-sm">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium" title={lead.nome}>{lead.nome}</span>
          <span className={`shrink-0 text-xs font-medium tabular-nums ${corScore(lead.score)}`}>{lead.score}</span>
        </div>
        <div className="mt-0.5 truncate text-xs text-suave">
          {rotuloNicho(lead.nicho)}{lead.bairro ? ` · ${lead.bairro}` : ''} · {lead.cidade}
        </div>
        <div className="mt-2 tabular-nums">{formatarTelefone(lead.telefone)}</div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          <Badge cor="azul">{ROTULO_TIPO[item.tipo] ?? item.tipo}</Badge>
          {!lead.telefone_celular && e164 && <Badge cor="amarelo">Fixo</Badge>}
          {atrasada && <Badge cor="vermelho">Desde {formatarData(item.agendada_para + 'T12:00:00')}</Badge>}
        </div>
        {lead.rating != null && (
          <div className="mt-1.5 inline-flex items-center gap-1 text-xs text-suave">
            <Star size={12} className="fill-amber-400 text-amber-400" />
            {formatarNumero(lead.rating, 1)} ({formatarNumero(lead.reviews_count)})
          </div>
        )}
      </div>

      <div className="min-w-0">
        <textarea
          className="input min-h-[120px] text-[13px] leading-relaxed"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={() => salvar.mutate()}
          aria-label={`Mensagem para ${lead.nome}`}
        />
        <div className="mt-1 flex justify-between text-[11px] text-fraco">
          <span>{salvar.isPending ? 'Salvando…' : texto.trim() !== salvo ? 'Alterações serão salvas ao sair do campo' : 'Texto salvo'}</span>
          <span className="tabular-nums">{texto.length} caracteres</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <button
          className="btn bg-emerald-600 py-2 text-white hover:bg-emerald-700"
          onClick={abrirWhatsApp}
          disabled={ocupado || !!motivoBloqueio}
          title={motivoBloqueio}
        >
          {enviar.isPending ? <Loader2 size={15} className="animate-spin" /> : <MessageCircle size={15} />} Abrir WhatsApp
        </button>
        <button className="btn-secundario" onClick={copiar}><Copy size={15} /> Copiar</button>
        {!pulando ? (
          <button className="btn-fantasma" onClick={() => setPulando(true)} disabled={ocupado}><SkipForward size={15} /> Pular</button>
        ) : (
          <div className="space-y-1.5">
            <input
              className="input text-xs"
              placeholder="Motivo (opcional)"
              maxLength={120}
              autoFocus
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') pular.mutate();
                if (e.key === 'Escape') setPulando(false);
              }}
            />
            <div className="flex gap-1">
              <button className="btn-secundario flex-1 px-2 text-xs" onClick={() => pular.mutate()} disabled={pular.isPending}>Confirmar</button>
              <button className="btn-fantasma px-2 text-xs" onClick={() => setPulando(false)}>Cancelar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
