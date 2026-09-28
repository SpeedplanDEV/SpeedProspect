import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, RefreshCw, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  centavosParaReais, formatarCentavos, lerReais, metaListar, metaPixels, metaSaude, reaisParaCentavos,
  type ContaAds, type ContaMetaDisponivel, type PaginaMetaDisponivel,
} from '@/lib/ads';
import { formatarDataHora, formatarTelefone, paraE164 } from '@/lib/format';
import { Drawer } from '@/components/ui/Drawer';
import { Switch } from '@/components/ui/Switch';
import { useToast } from '@/components/ui/Toast';
import { AvisoErroMeta, IconeNivel } from './ComumAds';

interface Estado {
  meta_ad_account_id: string;
  nome: string;
  tipo: 'agencia' | 'cliente';
  lead_id: string;
  meta_business_id: string | null;
  moeda: string;
  fuso: string;
  meta_page_id: string;
  meta_pixel_id: string;
  whatsapp: string;
  teto_diario: string;
  teto_mensal: string;
  modo: 'sugerir' | 'automatico';
  taxa_fixa: string;
  taxa_pct: string;
  ativa: boolean;
}

const reais = (c: number) => String(centavosParaReais(c)).replace('.', ',');

function estadoInicial(conta?: ContaAds | null): Estado {
  return {
    meta_ad_account_id: conta?.meta_ad_account_id ?? '',
    nome: conta?.nome ?? '',
    tipo: conta?.tipo ?? 'agencia',
    lead_id: conta?.lead_id ?? '',
    meta_business_id: conta?.meta_business_id ?? null,
    moeda: conta?.moeda ?? 'BRL',
    fuso: conta?.fuso ?? 'America/Sao_Paulo',
    meta_page_id: conta?.meta_page_id ?? '',
    meta_pixel_id: conta?.meta_pixel_id ?? '',
    whatsapp: conta?.whatsapp_numero ? formatarTelefone(conta.whatsapp_numero) : '',
    teto_diario: reais(conta?.teto_diario_centavos ?? 10000),
    teto_mensal: reais(conta?.teto_mensal_centavos ?? 200000),
    modo: conta?.modo_otimizacao ?? 'sugerir',
    taxa_fixa: reais(conta?.taxa_gestao_centavos ?? 0),
    taxa_pct: String(conta?.taxa_gestao_percentual ?? 0).replace('.', ','),
    ativa: conta?.ativa ?? true,
  };
}

/** Conectar (nova) ou editar uma conta de anúncios */
export function FormConta({ aberto, conta, aoFechar }: { aberto: boolean; conta: ContaAds | null; aoFechar: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const editando = !!conta;
  const [e, setE] = useState<Estado>(() => estadoInicial(conta));
  const [busca, setBusca] = useState('');
  const [whatsEditado, setWhatsEditado] = useState(false);

  useEffect(() => {
    if (aberto) {
      setE(estadoInicial(conta));
      setBusca('');
      setWhatsEditado(!!conta?.whatsapp_numero);
    }
  }, [aberto, conta]);

  const ativos = useQuery({ queryKey: ['meta', 'ativos'], queryFn: metaListar, enabled: aberto, retry: false, staleTime: 5 * 60_000 });
  const pixels = useQuery({
    queryKey: ['meta', 'pixels', e.meta_ad_account_id],
    queryFn: () => metaPixels(e.meta_ad_account_id),
    enabled: aberto && !!e.meta_ad_account_id,
    retry: false,
    staleTime: 5 * 60_000,
  });
  const leads = useQuery({
    queryKey: ['leads', 'fechados'],
    enabled: aberto,
    queryFn: async () => {
      const { data, error } = await supabase.from('leads').select('id,nome,cidade').eq('status_funil', 'fechado').order('nome');
      if (error) throw error;
      return data as { id: string; nome: string; cidade: string }[];
    },
  });

  const contaMeta: ContaMetaDisponivel | undefined = ativos.data?.contas.find((c) => c.id === e.meta_ad_account_id);
  const pagina: PaginaMetaDisponivel | undefined = ativos.data?.paginas.find((p) => p.id === e.meta_page_id);
  const pixel = pixels.data?.pixels.find((p) => p.id === e.meta_pixel_id);

  const atualizar = (p: Partial<Estado>) => setE((x) => ({ ...x, ...p }));

  const escolherConta = (c: ContaMetaDisponivel) =>
    atualizar({
      meta_ad_account_id: c.id,
      nome: e.nome && e.meta_ad_account_id ? e.nome : c.nome,
      moeda: c.moeda,
      fuso: c.fuso ?? 'America/Sao_Paulo',
      meta_business_id: c.business?.id ?? null,
      meta_pixel_id: '',
    });

  const escolherPagina = (id: string) => {
    const p = ativos.data?.paginas.find((x) => x.id === id);
    atualizar({
      meta_page_id: id,
      ...(!whatsEditado && p?.whatsapp?.numero ? { whatsapp: formatarTelefone(p.whatsapp.numero) } : {}),
    });
  };

  const contasFiltradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const lista = ativos.data?.contas ?? [];
    return t ? lista.filter((c) => c.nome.toLowerCase().includes(t) || c.id.includes(t)) : lista;
  }, [ativos.data, busca]);

  // Validação (erros impedem salvar; avisos só informam)
  const diario = lerReais(e.teto_diario);
  const mensal = lerReais(e.teto_mensal);
  const taxaFixa = lerReais(e.taxa_fixa);
  const taxaPct = lerReais(e.taxa_pct);
  const whatsE164 = e.whatsapp.trim() ? paraE164(e.whatsapp) : null;
  const erros: Record<string, string> = {};
  if (!e.meta_ad_account_id) erros.conta = 'Escolha a conta de anúncios.';
  if (e.nome.trim().length < 2) erros.nome = 'Informe um nome.';
  if (diario === null || diario < 1) erros.teto_diario = 'Informe o teto diário (mínimo R$ 1,00).';
  if (mensal === null || mensal < 1) erros.teto_mensal = 'Informe o teto mensal.';
  else if (diario !== null && mensal < diario) erros.teto_mensal = 'O teto mensal não pode ser menor que o diário.';
  if (taxaFixa === null || taxaFixa < 0) erros.taxa_fixa = 'Valor inválido.';
  if (taxaPct === null || taxaPct < 0 || taxaPct > 100) erros.taxa_pct = 'Use de 0 a 100%.';
  if (e.whatsapp.trim() && !whatsE164) erros.whatsapp = 'WhatsApp inválido. Ex.: (17) 99999-9999';
  const minimo = contaMeta?.orcamento_minimo_centavos;
  if (minimo && diario !== null && reaisParaCentavos(diario) < minimo) {
    erros.teto_diario = `A Meta exige pelo menos ${formatarCentavos(minimo)} por dia nesta conta.`;
  }
  const avisos: string[] = [];
  if (diario !== null && diario < 20) avisos.push('Abaixo de R$ 20/dia por conjunto a entrega da Meta fica instável.');
  if (contaMeta && contaMeta.moeda !== 'BRL') avisos.push(`Esta conta usa ${contaMeta.moeda}: os valores serão nessa moeda.`);
  if (contaMeta && contaMeta.status_nivel !== 'ok') avisos.push(`Situação da conta na Meta: ${contaMeta.status_rotulo}.`);
  if (contaMeta?.pagamento === false) avisos.push('A conta não tem forma de pagamento: cadastre no Gerenciador de Anúncios → Faturamento.');
  if (pagina && !pagina.pode_anunciar) avisos.push('O System User não tem a tarefa "Anunciar" nesta Página: ajuste em Atribuir ativos.');
  if (pagina?.whatsapp && !pagina.whatsapp.conectado) avisos.push('A Página não tem WhatsApp conectado (necessário para anúncios de conversa).');
  const valido = Object.keys(erros).length === 0;

  const salvar = useMutation({
    mutationFn: async () => {
      if (!valido) throw new Error(Object.values(erros)[0]);
      const dados = {
        nome: e.nome.trim(),
        tipo: e.tipo,
        lead_id: e.tipo === 'cliente' && e.lead_id ? e.lead_id : null,
        meta_ad_account_id: e.meta_ad_account_id,
        meta_business_id: e.meta_business_id,
        meta_page_id: e.meta_page_id || null,
        meta_page_nome: pagina?.nome ?? (e.meta_page_id === conta?.meta_page_id ? conta?.meta_page_nome ?? null : null),
        meta_instagram_id: pagina ? pagina.instagram?.id ?? null : e.meta_page_id === conta?.meta_page_id ? conta?.meta_instagram_id ?? null : null,
        meta_instagram_usuario: pagina ? pagina.instagram?.usuario ?? null : e.meta_page_id === conta?.meta_page_id ? conta?.meta_instagram_usuario ?? null : null,
        meta_pixel_id: e.meta_pixel_id || null,
        meta_pixel_nome: pixel?.nome ?? (e.meta_pixel_id === conta?.meta_pixel_id ? conta?.meta_pixel_nome ?? null : null),
        whatsapp_numero: whatsE164,
        moeda: e.moeda,
        fuso: e.fuso,
        teto_diario_centavos: reaisParaCentavos(diario!),
        teto_mensal_centavos: reaisParaCentavos(mensal!),
        modo_otimizacao: e.modo,
        taxa_gestao_centavos: reaisParaCentavos(taxaFixa!),
        taxa_gestao_percentual: taxaPct!,
        ativa: e.ativa,
        atualizado_em: new Date().toISOString(),
      };
      if (editando) {
        const { error } = await supabase.from('contas_ads').update(dados).eq('id', conta!.id);
        if (error) throw error;
        return conta!.id;
      }
      const { data, error } = await supabase.from('contas_ads').insert(dados).select('id').single();
      if (error) {
        if (error.code === '23505') throw new Error('Esta conta de anúncios já está conectada.');
        throw error;
      }
      return data.id as string;
    },
    onSuccess: (id) => {
      toast(editando ? 'Conta atualizada' : 'Conta conectada — verificando a saúde na Meta…');
      qc.invalidateQueries({ queryKey: ['contas-ads'] });
      qc.invalidateQueries({ queryKey: ['meta', 'ativos'] });
      // Verifica a saúde logo após salvar (não bloqueia o formulário)
      metaSaude(id).then(
        () => qc.invalidateQueries({ queryKey: ['contas-ads'] }),
        () => undefined,
      );
      aoFechar();
    },
    onError: (err: Error) => toast(err.message, 'erro'),
  });

  const erroCampo = (k: string) => (erros[k] ? <p className="mt-1 text-xs text-red-500">{erros[k]}</p> : null);

  return (
    <Drawer
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={editando ? `Editar ${conta!.nome}` : 'Conectar conta de anúncios'}
      largura="max-w-2xl"
      rodape={
        <>
          <button className="btn-fantasma" onClick={aoFechar}>Cancelar</button>
          <button className="btn-primario" onClick={() => salvar.mutate()} disabled={!valido || salvar.isPending}>
            {salvar.isPending && <Loader2 size={15} className="animate-spin" />} {editando ? 'Salvar' : 'Conectar conta'}
          </button>
        </>
      }
    >
      <div className="space-y-6 text-sm">
        {/* 1. Conta de anúncios */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-medium">1. Conta de anúncios</h3>
            <button className="btn-fantasma px-2 py-1 text-xs" onClick={() => ativos.refetch()} disabled={ativos.isFetching}>
              <RefreshCw size={13} className={ativos.isFetching ? 'animate-spin' : ''} /> Atualizar lista
            </button>
          </div>
          {ativos.isLoading ? (
            <p className="flex items-center gap-2 text-suave"><Loader2 size={15} className="animate-spin" /> Buscando o que o System User acessa na Meta…</p>
          ) : ativos.error ? (
            <AvisoErroMeta erro={ativos.error} titulo="Não foi possível listar os ativos da Meta" />
          ) : editando ? (
            <div className="rounded-md border border-borda px-3 py-2">
              <p className="font-medium">{contaMeta?.nome ?? conta!.nome}</p>
              <p className="text-xs text-suave">{conta!.meta_ad_account_id} · {conta!.moeda}{contaMeta ? ` · ${contaMeta.status_rotulo}` : ''}</p>
            </div>
          ) : (
            <>
              {(ativos.data?.contas.length ?? 0) > 5 && (
                <div className="relative mb-2">
                  <Search size={14} className="absolute left-2.5 top-2.5 text-fraco" />
                  <input className="input pl-8" placeholder="Buscar conta pelo nome ou ID" value={busca} onChange={(ev) => setBusca(ev.target.value)} />
                </div>
              )}
              {!ativos.data?.contas.length ? (
                <p className="rounded-md border border-dashed border-borda px-3 py-4 text-center text-suave">
                  O System User não tem nenhuma conta de anúncios. Atribua as contas em Configurações do negócio → Usuários do sistema → Atribuir ativos.
                </p>
              ) : (
                <div role="radiogroup" aria-label="Conta de anúncios" className="max-h-64 space-y-1.5 overflow-y-auto">
                  {contasFiltradas.map((c) => (
                    <label
                      key={c.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 ${
                        e.meta_ad_account_id === c.id ? 'border-marca bg-marca/5' : 'border-borda hover:bg-elevado'
                      } ${c.conectada ? 'cursor-not-allowed opacity-60' : ''}`}
                    >
                      <input
                        type="radio"
                        name="conta-meta"
                        className="accent-[rgb(37,99,235)]"
                        checked={e.meta_ad_account_id === c.id}
                        disabled={c.conectada}
                        onChange={() => escolherConta(c)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{c.nome}</span>
                        <span className="block text-xs text-suave">
                          {c.id} · {c.moeda}{c.business?.nome ? ` · ${c.business.nome}` : ''}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1 text-xs text-suave">
                        {c.conectada ? 'Já conectada' : <><IconeNivel nivel={c.status_nivel} /> {c.status_rotulo}</>}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </>
          )}
          {erroCampo('conta')}
        </section>

        {/* 2. Página, Instagram e WhatsApp */}
        <section>
          <h3 className="mb-2 font-medium">2. Página, Instagram e WhatsApp</h3>
          <label className="label" htmlFor="pagina">Página do Facebook que assina os anúncios</label>
          <select id="pagina" className="input" value={e.meta_page_id} onChange={(ev) => escolherPagina(ev.target.value)} disabled={!ativos.data}>
            <option value="">— Nenhuma —</option>
            {ativos.data?.paginas.map((p) => <option key={p.id} value={p.id}>{p.nome}{p.categoria ? ` · ${p.categoria}` : ''}</option>)}
            {conta?.meta_page_id && !ativos.data?.paginas.some((p) => p.id === conta.meta_page_id) && (
              <option value={conta.meta_page_id}>{conta.meta_page_nome ?? conta.meta_page_id} (sem acesso agora)</option>
            )}
          </select>
          {pagina && (
            <div className="mt-2 space-y-1 text-xs">
              <p className="flex items-center gap-1.5">
                <IconeNivel nivel={pagina.instagram ? 'ok' : 'aviso'} />
                {pagina.instagram ? `Instagram vinculado: @${pagina.instagram.usuario ?? pagina.instagram.id}` : 'Sem Instagram profissional vinculado à Página'}
              </p>
              <p className="flex items-center gap-1.5">
                <IconeNivel nivel={pagina.whatsapp?.conectado ? 'ok' : 'aviso'} />
                {pagina.whatsapp === null
                  ? 'Não foi possível verificar o WhatsApp da Página'
                  : pagina.whatsapp.conectado
                    ? `WhatsApp conectado${pagina.whatsapp.numero ? `: ${formatarTelefone(pagina.whatsapp.numero)}` : ''}`
                    : 'Página sem WhatsApp conectado'}
              </p>
            </div>
          )}
          <div className="mt-3">
            <label className="label" htmlFor="whats">WhatsApp dos anúncios</label>
            <input
              id="whats"
              className="input"
              placeholder="(17) 99999-9999"
              value={e.whatsapp}
              onChange={(ev) => {
                setWhatsEditado(true);
                atualizar({ whatsapp: ev.target.value });
              }}
            />
            <p className="mt-1 text-xs text-fraco">O anúncio de conversa abre o número conectado à Página; este campo é usado nas mensagens e relatórios.</p>
            {erroCampo('whatsapp')}
          </div>
        </section>

        {/* 3. Pixel */}
        <section>
          <h3 className="mb-2 font-medium">3. Pixel (Dataset)</h3>
          {!e.meta_ad_account_id ? (
            <p className="text-xs text-fraco">Escolha a conta de anúncios para ver os pixels.</p>
          ) : pixels.isLoading ? (
            <p className="flex items-center gap-2 text-xs text-suave"><Loader2 size={13} className="animate-spin" /> Buscando pixels…</p>
          ) : pixels.error ? (
            <AvisoErroMeta erro={pixels.error} titulo="Não foi possível listar os pixels" />
          ) : (
            <>
              <select className="input" value={e.meta_pixel_id} onChange={(ev) => atualizar({ meta_pixel_id: ev.target.value })} aria-label="Pixel">
                <option value="">— Sem pixel por enquanto —</option>
                {pixels.data?.pixels.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome} · {p.indisponivel ? 'indisponível' : p.ultimo_evento ? `último evento ${formatarDataHora(p.ultimo_evento)}` : 'sem eventos'}
                  </option>
                ))}
              </select>
              {!pixels.data?.pixels.length && (
                <p className="mt-1 text-xs text-fraco">Nenhum pixel nesta conta. Crie no Gerenciador de Eventos (dá para vincular depois).</p>
              )}
            </>
          )}
        </section>

        {/* 4. Configuração */}
        <section>
          <h3 className="mb-2 font-medium">4. Configuração no sistema</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="nome">Nome</label>
              <input id="nome" className="input" value={e.nome} onChange={(ev) => atualizar({ nome: ev.target.value })} placeholder="Ex.: Speed Sites (agência)" />
              {erroCampo('nome')}
            </div>
            <div className="sm:col-span-2">
              <span className="label">Tipo</span>
              <div className="flex gap-2" role="radiogroup" aria-label="Tipo da conta">
                {([['agencia', 'Agência', 'Campanhas para vender os seus serviços'], ['cliente', 'Cliente', 'Campanhas que você gerencia para um cliente']] as const).map(([v, r, d]) => (
                  <label key={v} className={`flex flex-1 cursor-pointer items-start gap-2 rounded-md border px-3 py-2 ${e.tipo === v ? 'border-marca bg-marca/5' : 'border-borda'}`}>
                    <input type="radio" name="tipo" className="mt-1 accent-[rgb(37,99,235)]" checked={e.tipo === v} onChange={() => atualizar({ tipo: v })} />
                    <span><span className="block font-medium">{r}</span><span className="block text-xs text-suave">{d}</span></span>
                  </label>
                ))}
              </div>
            </div>
            {e.tipo === 'cliente' && (
              <div className="sm:col-span-2">
                <label className="label" htmlFor="lead">Cliente do funil (lead fechado)</label>
                <select id="lead" className="input" value={e.lead_id} onChange={(ev) => atualizar({ lead_id: ev.target.value })}>
                  <option value="">— Sem vínculo —</option>
                  {leads.data?.map((l) => <option key={l.id} value={l.id}>{l.nome} · {l.cidade}</option>)}
                </select>
                <p className="mt-1 text-xs text-fraco">Vincular ao lead fechado liga o site entregue aos anúncios e relatórios.</p>
              </div>
            )}
            <div>
              <label className="label" htmlFor="teto_diario">Teto de orçamento diário (R$)</label>
              <input id="teto_diario" className="input" inputMode="decimal" value={e.teto_diario} onChange={(ev) => atualizar({ teto_diario: ev.target.value })} />
              {erroCampo('teto_diario')}
            </div>
            <div>
              <label className="label" htmlFor="teto_mensal">Teto de gasto mensal (R$)</label>
              <input id="teto_mensal" className="input" inputMode="decimal" value={e.teto_mensal} onChange={(ev) => atualizar({ teto_mensal: ev.target.value })} />
              {erroCampo('teto_mensal')}
            </div>
            <p className="-mt-2 text-xs text-fraco sm:col-span-2">O sistema recusa criar ou editar campanhas acima desses tetos.</p>
            <div className="sm:col-span-2">
              <span className="label">Otimização automática</span>
              <div className="flex flex-col gap-2 sm:flex-row" role="radiogroup" aria-label="Modo de otimização">
                {([['sugerir', 'Sugerir', 'Toda ação espera a sua aprovação'], ['automatico', 'Automático', 'Pausa sozinho anúncios ruins; o resto continua sugerido']] as const).map(([v, r, d]) => (
                  <label key={v} className={`flex flex-1 cursor-pointer items-start gap-2 rounded-md border px-3 py-2 ${e.modo === v ? 'border-marca bg-marca/5' : 'border-borda'}`}>
                    <input type="radio" name="modo" className="mt-1 accent-[rgb(37,99,235)]" checked={e.modo === v} onChange={() => atualizar({ modo: v })} />
                    <span><span className="block font-medium">{r}</span><span className="block text-xs text-suave">{d}</span></span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="label" htmlFor="taxa_fixa">Taxa de gestão fixa (R$/mês)</label>
              <input id="taxa_fixa" className="input" inputMode="decimal" value={e.taxa_fixa} onChange={(ev) => atualizar({ taxa_fixa: ev.target.value })} />
              {erroCampo('taxa_fixa')}
            </div>
            <div>
              <label className="label" htmlFor="taxa_pct">Taxa sobre a verba (%)</label>
              <input id="taxa_pct" className="input" inputMode="decimal" value={e.taxa_pct} onChange={(ev) => atualizar({ taxa_pct: ev.target.value })} />
              {erroCampo('taxa_pct')}
            </div>
            <div className="sm:col-span-2">
              <Switch id="ativa" marcado={e.ativa} aoMudar={(v) => atualizar({ ativa: v })} rotulo="Conta ativa no sistema" descricao="Desativada, a conta não é sincronizada nem otimizada." />
            </div>
          </div>
        </section>

        {avisos.length > 0 && (
          <ul className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-800 dark:text-amber-300">
            {avisos.map((a) => <li key={a} className="flex gap-1.5"><IconeNivel nivel="aviso" tamanho={13} /> {a}</li>)}
          </ul>
        )}
      </div>
    </Drawer>
  );
}
