import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, ExternalLink, Loader2, RefreshCw, Wand2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { chamarFuncao, textoResumoGeracao, type ResumoGeracao } from '@/lib/funcoes';
import { formatarDataHora, formatarMoeda, formatarNumero } from '@/lib/format';
import type { Lead, Site } from '@/lib/types';
import { Badge } from '@/components/ui/Pagina';
import { useToast } from '@/components/ui/Toast';

const STATUS_PODE_GERAR = ['qualificado', 'previa_gerada', 'aprovado', 'enviado', 'abriu', 'respondeu', 'negociando', 'perdido'];

/** Seção "Prévia" do detalhe do lead: gerar, abrir, copiar link e regenerar com instrução extra */
export function PreviaLead({ lead }: { lead: Lead }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [instrucao, setInstrucao] = useState('');
  const [mostrarInstrucao, setMostrarInstrucao] = useState(false);

  const { data: site, isLoading } = useQuery({
    queryKey: ['site', lead.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('sites').select('*').eq('lead_id', lead.id).maybeSingle();
      if (error) throw error;
      return data as Site | null;
    },
  });

  const { data: appUrl } = useQuery({
    queryKey: ['configuracoes', 'app_url'],
    queryFn: async () => {
      const { data } = await supabase.from('configuracoes').select('app_url').eq('id', 1).single();
      return (data?.app_url as string) || window.location.origin;
    },
  });

  const gerar = useMutation({
    mutationFn: (regenerar: boolean) =>
      chamarFuncao<ResumoGeracao>('gerar-previa', {
        lead_id: lead.id,
        ...(regenerar ? { regenerar: true } : {}),
        ...(instrucao.trim() ? { instrucao_extra: instrucao.trim() } : {}),
      }),
    onSuccess: (r) => {
      toast(r.gerados ? (r.resultados[0]?.slug ? 'Prévia pronta!' : textoResumoGeracao(r)) : textoResumoGeracao(r), r.gerados ? 'sucesso' : 'erro');
      if (r.gerados) {
        setInstrucao('');
        setMostrarInstrucao(false);
      }
    },
    onError: (e: Error) => toast(e.message, 'erro'),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['site', lead.id] });
      qc.invalidateQueries({ queryKey: ['lead', lead.id] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['execucoes'] });
    },
  });

  if (isLoading) return <p className="text-sm text-suave">Carregando…</p>;

  const podeGerar = STATUS_PODE_GERAR.includes(lead.status_funil);
  const linkInterno = site ? `/p/${site.slug}?k=${site.token_acesso}&interno=1` : '';
  const linkCliente = site && appUrl ? `${appUrl.replace(/\/+$/, '')}/p/${site.slug}?k=${site.token_acesso}` : '';

  const campoInstrucao = mostrarInstrucao && (
    <div className="mt-3">
      <label className="label" htmlFor="instrucao">Instrução extra para a IA (opcional)</label>
      <textarea
        id="instrucao"
        className="input min-h-[70px]"
        maxLength={600}
        placeholder="Ex.: dar mais destaque ao atendimento infantil; usar tom mais descontraído"
        value={instrucao}
        onChange={(e) => setInstrucao(e.target.value)}
      />
    </div>
  );

  if (!site) {
    return (
      <div className="rounded-md border border-dashed border-borda p-4 text-sm">
        <p className="text-suave">
          {podeGerar ? 'Este lead ainda não tem prévia.' : 'Qualifique o lead antes de gerar a prévia.'}
        </p>
        {podeGerar && (
          <>
            {campoInstrucao}
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn-primario" disabled={gerar.isPending} onClick={() => gerar.mutate(false)}>
                {gerar.isPending ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
                {gerar.isPending ? 'Gerando com IA… (até 1 min)' : 'Gerar prévia com IA'}
              </button>
              {!mostrarInstrucao && (
                <button className="btn-fantasma" onClick={() => setMostrarInstrucao(true)}>Adicionar instrução</button>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-md border border-borda p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge cor={site.publicado ? 'verde' : 'amarelo'}>{site.publicado ? 'Publicada' : 'Rascunho'}</Badge>
        <span className="text-suave">Versão {site.versao} · {site.template}</span>
        <span className="ml-auto text-xs text-fraco">{formatarDataHora(site.atualizado_em ?? site.criado_em)}</span>
      </div>
      <p className="mt-3 truncate font-medium">{site.conteudo?.hero?.titulo}</p>
      <p className="truncate text-suave">{site.conteudo?.hero?.subtitulo}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <a href={linkInterno} target="_blank" rel="noopener noreferrer" className="btn-primario">
          <ExternalLink size={15} /> Abrir prévia
        </a>
        <button
          className="btn-secundario"
          onClick={() => {
            navigator.clipboard?.writeText(linkCliente).then(() => toast('Link do cliente copiado'), () => toast(linkCliente));
          }}
          title={linkCliente}
        >
          <Copy size={15} /> Copiar link do cliente
        </button>
        <button className="btn-secundario" disabled={gerar.isPending} onClick={() => (mostrarInstrucao ? gerar.mutate(true) : setMostrarInstrucao(true))}>
          {gerar.isPending ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          {gerar.isPending ? 'Regenerando…' : mostrarInstrucao ? 'Confirmar regeneração' : 'Regenerar'}
        </button>
      </div>
      {campoInstrucao}

      <dl className="mt-4 grid grid-cols-4 gap-2 text-xs">
        <div><dt className="text-suave">Modelo</dt><dd className="truncate">{site.modelo_ia ?? '—'}</dd></div>
        <div><dt className="text-suave">Tokens entrada</dt><dd className="tabular-nums">{formatarNumero(site.tokens_entrada ?? 0)}</dd></div>
        <div><dt className="text-suave">Tokens saída</dt><dd className="tabular-nums">{formatarNumero(site.tokens_saida ?? 0)}</dd></div>
        <div><dt className="text-suave">Custo</dt><dd className="tabular-nums">{formatarMoeda(site.custo_estimado ?? 0, 4)}</dd></div>
      </dl>
      {!site.publicado && (
        <p className="mt-3 text-xs text-fraco">O link do cliente só funciona depois que a prévia for aprovada (publicada). Aprove em <a href="/aprovacao" className="text-marca hover:underline">Aprovação</a>.</p>
      )}
    </div>
  );
}
