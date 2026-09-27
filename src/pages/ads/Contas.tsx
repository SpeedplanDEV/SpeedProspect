import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity, FolderOpen, Loader2, Pencil, Plus, Power, RefreshCw, ShieldCheck,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  formatarCentavos, metaDiagnostico, metaSaude, metaSincronizar, ROTULO_TIPO_CONTA, textoSync, type ContaAds,
} from '@/lib/ads';
import { formatarDataHora, formatarNumero, formatarTelefone } from '@/lib/format';
import { Badge, Pagina } from '@/components/ui/Pagina';
import { useToast } from '@/components/ui/Toast';
import { AvisoErroMeta, ChecklistMeta, IconeNivel, IndicadoresSaude } from '@/components/ads/ComumAds';
import { FormConta } from '@/components/ads/FormConta';
import { BibliotecaMidia } from '@/components/ads/BibliotecaMidia';

type ContaComLead = ContaAds & { lead: { nome: string } | null };

/** Mensagem clara quando o SQL da Fase 8 ainda não foi rodado */
function erroTabela(e: { message: string; code?: string }): Error {
  if (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache/i.test(e.message)) {
    return new Error('As tabelas do módulo Meta Ads ainda não existem. Rode o SQL 20261003000000_fase8_meta_ads.sql no Supabase.');
  }
  return new Error(e.message);
}

function tempo(iso: string | null) {
  if (!iso) return null;
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'há 1 dia' : `há ${d} dias`;
}

export default function ContasAds() {
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<{ aberto: boolean; conta: ContaAds | null }>({ aberto: false, conta: null });
  const [midias, setMidias] = useState<ContaAds | null>(null);

  const diag = useQuery({ queryKey: ['meta', 'diagnostico'], queryFn: metaDiagnostico, retry: false, staleTime: 5 * 60_000 });

  const contas = useQuery({
    queryKey: ['contas-ads'],
    queryFn: async () => {
      const { data, error } = await supabase.from('contas_ads').select('*, lead:leads(nome)').order('criado_em');
      if (error) throw erroTabela(error);
      return data as ContaComLead[];
    },
  });

  const campanhas = useQuery({
    queryKey: ['contas-ads', 'campanhas'],
    enabled: !!contas.data?.length,
    queryFn: async () => {
      const { data, error } = await supabase.from('campanhas_ads').select('conta_id,origem,status');
      if (error) throw erroTabela(error);
      return data as { conta_id: string; origem: string; status: string }[];
    },
  });
  const porConta = useMemo(() => {
    const m = new Map<string, { total: number; ativas: number; importadas: number }>();
    for (const c of campanhas.data ?? []) {
      const x = m.get(c.conta_id) ?? { total: 0, ativas: 0, importadas: 0 };
      x.total++;
      if (c.status === 'ativo') x.ativas++;
      if (c.origem === 'importado') x.importadas++;
      m.set(c.conta_id, x);
    }
    return m;
  }, [campanhas.data]);

  const atualizarTudo = () => {
    qc.invalidateQueries({ queryKey: ['contas-ads'] });
    qc.invalidateQueries({ queryKey: ['execucoes'] });
  };

  const saude = useMutation({
    mutationFn: (id?: string) => metaSaude(id),
    onSuccess: (r) => {
      const problemas = r.contas.filter((c) => c.saude.geral === 'erro').length;
      toast(problemas ? `${problemas} conta(s) com problema — veja os detalhes` : `Saúde verificada em ${r.verificadas} conta(s)`, problemas ? 'erro' : 'sucesso');
      atualizarTudo();
    },
    onError: (e: Error) => toast(e.message, 'erro'),
  });

  const sync = useMutation({
    mutationFn: (id?: string) => metaSincronizar(id),
    onSuccess: (r) => {
      toast(textoSync(r), r.ok ? 'sucesso' : 'erro');
      atualizarTudo();
    },
    onError: (e: Error) => toast(e.message, 'erro'),
  });

  const alternar = useMutation({
    mutationFn: async (c: ContaAds) => {
      const { error } = await supabase.from('contas_ads').update({ ativa: !c.ativa, atualizado_em: new Date().toISOString() }).eq('id', c.id);
      if (error) throw error;
    },
    onSuccess: atualizarTudo,
    onError: (e: Error) => toast(e.message, 'erro'),
  });

  const lista = contas.data ?? [];
  const conectado = diag.data && !diag.error;

  return (
    <Pagina
      titulo="Contas de anúncio"
      descricao="Meta Ads · contas da agência e dos clientes, conectadas pelo System User"
      acoes={
        <>
          {lista.length > 0 && (
            <>
              <button className="btn-secundario" onClick={() => saude.mutate(undefined)} disabled={saude.isPending}>
                {saude.isPending && saude.variables === undefined ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />} Verificar todas
              </button>
              <button className="btn-secundario" onClick={() => sync.mutate(undefined)} disabled={sync.isPending}>
                {sync.isPending && sync.variables === undefined ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Sincronizar todas
              </button>
            </>
          )}
          <button className="btn-primario" onClick={() => setForm({ aberto: true, conta: null })}>
            <Plus size={15} /> Conectar conta
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Conexão com a Meta */}
        {diag.isLoading ? (
          <div className="card flex items-center gap-2 px-5 py-3 text-sm text-suave">
            <Loader2 size={15} className="animate-spin" /> Verificando a conexão com a Meta…
          </div>
        ) : diag.error ? (
          <AvisoErroMeta erro={diag.error} titulo="Conexão com a Meta não configurada" />
        ) : conectado ? (
          <div className="card px-5 py-3 text-sm">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <IconeNivel nivel={diag.data.ok ? 'ok' : 'aviso'} />
              <span>
                Conectado à Meta como <span className="font-medium">{diag.data.usuario.nome ?? diag.data.usuario.id}</span>
              </span>
              <span className="text-suave">API {diag.data.versao}</span>
              {diag.data.token.tipo && (
                <span className="text-suave">
                  {diag.data.token.tipo === 'SYSTEM_USER' ? 'token de System User' : `token ${diag.data.token.tipo}`}
                  {diag.data.token.expira_em ? ` · expira em ${formatarDataHora(diag.data.token.expira_em)}` : ' · sem expiração'}
                </span>
              )}
              <button className="btn-fantasma ml-auto px-2 py-1 text-xs" onClick={() => diag.refetch()} disabled={diag.isFetching}>
                <RefreshCw size={13} className={diag.isFetching ? 'animate-spin' : ''} /> Testar de novo
              </button>
            </div>
            {diag.data.permissoes.faltando.length > 0 && (
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                Faltam permissões no token: <b className="font-medium">{diag.data.permissoes.faltando.join(', ')}</b>. Gere um novo token do System User marcando essas permissões.
              </p>
            )}
            {diag.data.avisos.map((a) => <p key={a} className="mt-1 text-xs text-fraco">{a}</p>)}
          </div>
        ) : null}

        <ChecklistMeta abertoInicial={!!diag.error} />

        {/* Contas conectadas */}
        {contas.error ? (
          <AvisoErroMeta erro={contas.error} titulo="Não foi possível carregar as contas" />
        ) : contas.isLoading ? (
          <div className="card px-5 py-8 text-center text-sm text-suave">Carregando…</div>
        ) : !lista.length ? (
          <div className="card px-5 py-10 text-center text-sm">
            <p className="font-medium">Nenhuma conta conectada</p>
            <p className="mt-1 text-suave">Conecte primeiro a conta de anúncios da agência; depois as dos clientes.</p>
            <button className="btn-primario mt-4" onClick={() => setForm({ aberto: true, conta: null })}><Plus size={15} /> Conectar conta</button>
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {lista.map((c) => {
              const n = porConta.get(c.id);
              const verificandoEsta = saude.isPending && saude.variables === c.id;
              const sincronizandoEsta = sync.isPending && sync.variables === c.id;
              return (
                <article key={c.id} className={`card flex flex-col ${c.ativa ? '' : 'opacity-70'}`}>
                  <header className="flex items-start gap-3 border-b border-borda px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-[15px] font-medium">{c.nome}</h2>
                        <Badge cor={c.tipo === 'agencia' ? 'azul' : 'cinza'}>{ROTULO_TIPO_CONTA[c.tipo]}</Badge>
                        {!c.ativa && <Badge cor="vermelho">Desativada</Badge>}
                        {c.saude && <IconeNivel nivel={c.saude.geral} />}
                      </div>
                      <p className="mt-0.5 text-xs text-suave">
                        {c.meta_ad_account_id} · {c.moeda}{c.lead ? ` · cliente: ${c.lead.nome}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button className="btn-fantasma p-1.5" title="Editar" aria-label={`Editar ${c.nome}`} onClick={() => setForm({ aberto: true, conta: c })}><Pencil size={15} /></button>
                      <button className="btn-fantasma p-1.5" title="Mídias" aria-label={`Mídias de ${c.nome}`} onClick={() => setMidias(c)}><FolderOpen size={15} /></button>
                      <button
                        className="btn-fantasma p-1.5"
                        title={c.ativa ? 'Desativar no sistema' : 'Reativar'}
                        aria-label={c.ativa ? `Desativar ${c.nome}` : `Reativar ${c.nome}`}
                        onClick={() => alternar.mutate(c)}
                      >
                        <Power size={15} />
                      </button>
                    </div>
                  </header>

                  <div className="grid gap-4 px-5 py-4 text-sm sm:grid-cols-2">
                    <dl className="space-y-1.5 text-xs">
                      <div className="flex gap-2"><dt className="w-20 shrink-0 text-suave">Página</dt><dd className="min-w-0 truncate">{c.meta_page_nome ?? (c.meta_page_id ? c.meta_page_id : '—')}</dd></div>
                      <div className="flex gap-2"><dt className="w-20 shrink-0 text-suave">Instagram</dt><dd>{c.meta_instagram_usuario ? `@${c.meta_instagram_usuario}` : '—'}</dd></div>
                      <div className="flex gap-2"><dt className="w-20 shrink-0 text-suave">WhatsApp</dt><dd className="tabular-nums">{c.whatsapp_numero ? formatarTelefone(c.whatsapp_numero) : '—'}</dd></div>
                      <div className="flex gap-2"><dt className="w-20 shrink-0 text-suave">Pixel</dt><dd className="min-w-0 truncate">{c.meta_pixel_nome ?? c.meta_pixel_id ?? '—'}</dd></div>
                      <div className="flex gap-2"><dt className="w-20 shrink-0 text-suave">Tetos</dt><dd className="tabular-nums">{formatarCentavos(c.teto_diario_centavos)}/dia · {formatarCentavos(c.teto_mensal_centavos)}/mês</dd></div>
                      <div className="flex gap-2"><dt className="w-20 shrink-0 text-suave">Otimização</dt><dd>{c.modo_otimizacao === 'automatico' ? 'Automática (só pausa)' : 'Sugerir'}</dd></div>
                      {(c.taxa_gestao_centavos > 0 || Number(c.taxa_gestao_percentual) > 0) && (
                        <div className="flex gap-2">
                          <dt className="w-20 shrink-0 text-suave">Gestão</dt>
                          <dd className="tabular-nums">
                            {[c.taxa_gestao_centavos > 0 && `${formatarCentavos(c.taxa_gestao_centavos)}/mês`, Number(c.taxa_gestao_percentual) > 0 && `${formatarNumero(c.taxa_gestao_percentual, 1)}% da verba`].filter(Boolean).join(' + ')}
                          </dd>
                        </div>
                      )}
                    </dl>
                    <div>
                      <IndicadoresSaude saude={c.saude} compacto />
                    </div>
                  </div>

                  <footer className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-borda px-5 py-2.5 text-xs text-suave">
                    <span className="inline-flex items-center gap-1">
                      <Activity size={13} />
                      {n ? `${n.total} campanha(s) · ${n.ativas} ativa(s)${n.importadas ? ` · ${n.importadas} importada(s)` : ''}` : 'Nenhuma campanha ainda'}
                    </span>
                    <span>{c.sincronizado_em ? `sincronizada ${tempo(c.sincronizado_em)}` : 'nunca sincronizada'}</span>
                    <span>{c.saude_em ? `saúde ${tempo(c.saude_em)}` : ''}</span>
                    <span className="ml-auto flex gap-1">
                      <button className="btn-fantasma px-2 py-1 text-xs" onClick={() => saude.mutate(c.id)} disabled={saude.isPending}>
                        {verificandoEsta ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />} Verificar
                      </button>
                      <button className="btn-fantasma px-2 py-1 text-xs" onClick={() => sync.mutate(c.id)} disabled={sync.isPending || !c.ativa}>
                        {sincronizandoEsta ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Sincronizar
                      </button>
                    </span>
                  </footer>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <FormConta aberto={form.aberto} conta={form.conta} aoFechar={() => setForm({ aberto: false, conta: null })} />
      <BibliotecaMidia conta={midias} aoFechar={() => setMidias(null)} />
    </Pagina>
  );
}
