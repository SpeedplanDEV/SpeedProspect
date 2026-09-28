import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, Pencil, Play, Plus, Sparkles, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatarDataHora, formatarNumero } from '@/lib/format';
import { campanhaSchema, type CampanhaDados, type CampanhaForm } from '@/lib/schemas';
import { NICHOS, UFS, rotuloNicho, type Campanha, type Nicho } from '@/lib/types';
import { TERMOS_SUGERIDOS, nomeSugerido, normalizarNome, useMunicipios } from '@/lib/sugestoes';
import { Badge, CampoErro, Erro, Pagina, Vazio } from '@/components/ui/Pagina';
import { Drawer } from '@/components/ui/Drawer';
import { Switch } from '@/components/ui/Switch';
import { TagInput } from '@/components/ui/TagInput';
import { useToast } from '@/components/ui/Toast';
import {
  chamarFuncao, textoResumoColeta, textoResumoQualificacao, type ResumoColeta, type ResumoQualificacao,
} from '@/lib/funcoes';


const VAZIA: CampanhaForm = {
  nome: '',
  nicho: 'saude',
  cidade: '',
  uf: 'SP',
  termos_busca: [],
  bairros: [],
  ativa: true,
  max_leads_execucao: 60,
};

export default function Campanhas() {
  const qc = useQueryClient();
  const toast = useToast();
  const [editando, setEditando] = useState<Campanha | 'nova' | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['campanhas'],
    queryFn: async () => {
      const { data, error } = await supabase.from('campanhas').select('*').order('criado_em', { ascending: false });
      if (error) throw error;
      return data as Campanha[];
    },
  });

  const alternarAtiva = useMutation({
    mutationFn: async (c: Campanha) => {
      const { error } = await supabase.from('campanhas').update({ ativa: !c.ativa }).eq('id', c.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campanhas'] }),
    onError: (e: Error) => toast(e.message, 'erro'),
  });

  const executar = useMutation({
    // Coleta e, em seguida, qualifica os leads novos
    mutationFn: async (c: Campanha) => {
      const coleta = await chamarFuncao<ResumoColeta>('coletar', { campanha_id: c.id });
      if (coleta.resumo.some((x) => x.erro)) return { coleta, qualif: null };
      const qualif = await chamarFuncao<ResumoQualificacao>('qualificar', {});
      return { coleta, qualif };
    },
    onSuccess: ({ coleta, qualif }) => {
      qc.invalidateQueries({ queryKey: ['campanhas'] });
      qc.invalidateQueries({ queryKey: ['execucoes'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      const erro = coleta.resumo.some((x) => x.erro);
      toast(textoResumoColeta(coleta) + (qualif ? ` ${textoResumoQualificacao(qualif)}` : ''), erro ? 'erro' : 'sucesso');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['leads'] }),
    onError: (e: Error) => toast(e.message, 'erro'),
  });

  const excluir = useMutation({
    mutationFn: async (c: Campanha) => {
      const { error } = await supabase.from('campanhas').delete().eq('id', c.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campanhas'] });
      toast('Campanha excluída');
    },
    onError: (e: Error) => toast(e.message, 'erro'),
  });

  return (
    <Pagina
      titulo="Campanhas"
      descricao="Nicho + cidade + termos de busca que alimentam a coleta no Google Maps"
      acoes={
        <button className="btn-primario" onClick={() => setEditando('nova')}>
          <Plus size={15} /> Nova campanha
        </button>
      }
    >
      {error ? (
        <Erro erro={error} />
      ) : (
        <>
        {/* Celular: cartões */}
        <ul className="space-y-2 md:hidden">
          {isLoading && <li className="card"><Vazio>Carregando…</Vazio></li>}
          {!isLoading && !data?.length && (
            <li className="card"><Vazio>Nenhuma campanha ainda. Crie a primeira em “Nova campanha”.</Vazio></li>
          )}
          {data?.map((c) => (
            <li key={c.id} className={`card p-4 ${c.ativa ? '' : 'opacity-70'}`}>
              <div className="flex items-start gap-3">
                <button className="min-w-0 flex-1 text-left" onClick={() => setEditando(c)}>
                  <div className="font-medium">{c.nome}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-suave">
                    <Badge cor="azul">{rotuloNicho(c.nicho)}</Badge>
                    <span>{c.cidade} - {c.uf}</span>
                    <span>· até {formatarNumero(c.max_leads_execucao)} leads</span>
                  </div>
                </button>
                <Switch marcado={c.ativa} aoMudar={() => alternarAtiva.mutate(c)} />
              </div>
              <p className="mt-2 line-clamp-2 text-xs text-suave">
                <span className="text-fraco">Termos:</span> {c.termos_busca.join(', ') || '—'}
                {c.bairros.length ? <> · <span className="text-fraco">{formatarNumero(c.bairros.length)} bairro(s)</span></> : null}
              </p>
              <p className="mt-0.5 text-xs text-fraco">Última execução: {formatarDataHora(c.ultima_execucao)}</p>
              <div className="mt-3 flex items-center gap-2">
                <button
                  className="btn-secundario flex-1"
                  disabled={!c.ativa || executar.isPending}
                  onClick={() => executar.mutate(c)}
                >
                  {executar.isPending && executar.variables?.id === c.id ? (
                    <><Loader2 size={15} className="animate-spin" /> Coletando…</>
                  ) : (
                    <><Play size={15} /> Executar agora</>
                  )}
                </button>
                <button className="btn-secundario w-10 px-0" aria-label="Editar" onClick={() => setEditando(c)}>
                  <Pencil size={15} />
                </button>
                <button
                  className="btn-secundario w-10 px-0 hover:text-red-500"
                  aria-label="Excluir"
                  onClick={() => {
                    if (confirm(`Excluir a campanha “${c.nome}”? Os leads coletados são mantidos.`)) excluir.mutate(c);
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </li>
          ))}
        </ul>
        <div className="card hidden overflow-x-auto md:block">
          <table className="tabela">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Nicho</th>
                <th>Cidade</th>
                <th>Termos de busca</th>
                <th>Bairros</th>
                <th className="text-right">Máx. leads</th>
                <th>Última execução</th>
                <th>Ativa</th>
                <th className="w-px" />
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={9}><Vazio>Carregando…</Vazio></td></tr>
              )}
              {!isLoading && !data?.length && (
                <tr><td colSpan={9}><Vazio>Nenhuma campanha ainda. Crie a primeira em “Nova campanha”.</Vazio></td></tr>
              )}
              {data?.map((c) => (
                <tr key={c.id} className={c.ativa ? '' : 'opacity-60'}>
                  <td className="font-medium">
                    <button className="hover:text-marca" onClick={() => setEditando(c)}>{c.nome}</button>
                  </td>
                  <td><Badge cor="azul">{rotuloNicho(c.nicho)}</Badge></td>
                  <td className="whitespace-nowrap">{c.cidade} - {c.uf}</td>
                  <td className="max-w-[240px] truncate text-suave" title={c.termos_busca.join(', ')}>
                    {c.termos_busca.join(', ')}
                  </td>
                  <td className="text-suave" title={c.bairros.join(', ')}>
                    {c.bairros.length ? formatarNumero(c.bairros.length) : '—'}
                  </td>
                  <td className="text-right tabular-nums">{formatarNumero(c.max_leads_execucao)}</td>
                  <td className="whitespace-nowrap text-suave">{formatarDataHora(c.ultima_execucao)}</td>
                  <td>
                    <Switch marcado={c.ativa} aoMudar={() => alternarAtiva.mutate(c)} />
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button
                        className="btn-secundario whitespace-nowrap px-2 py-1 text-xs"
                        disabled={!c.ativa || executar.isPending}
                        title={c.ativa ? 'Buscar empresas desta campanha no Google Maps agora' : 'Ative a campanha para executar'}
                        onClick={() => executar.mutate(c)}
                      >
                        {executar.isPending && executar.variables?.id === c.id ? (
                          <><Loader2 size={13} className="animate-spin" /> Coletando…</>
                        ) : (
                          <><Play size={13} /> Executar agora</>
                        )}
                      </button>
                      <button className="btn-fantasma p-1.5" title="Editar" onClick={() => setEditando(c)}>
                        <Pencil size={14} />
                      </button>
                      <button
                        className="btn-fantasma p-1.5 hover:text-red-500"
                        title="Excluir"
                        onClick={() => {
                          if (confirm(`Excluir a campanha “${c.nome}”? Os leads coletados são mantidos.`)) excluir.mutate(c);
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      <FormCampanha campanha={editando} aoFechar={() => setEditando(null)} />
    </Pagina>
  );
}

function FormCampanha({ campanha, aoFechar }: { campanha: Campanha | 'nova' | null; aoFechar: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const nova = campanha === 'nova';

  const { register, handleSubmit, reset, control, formState, watch, setValue } = useForm<CampanhaForm, unknown, CampanhaDados>({
    resolver: zodResolver(campanhaSchema),
    defaultValues: VAZIA,
  });

  const nicho = watch('nicho') as Nicho;
  const uf = watch('uf');
  const cidade = watch('cidade') ?? '';
  const termos = watch('termos_busca') ?? [];
  const nome = watch('nome') ?? '';
  const municipios = useMunicipios(uf);
  const [verTodos, setVerTodos] = useState(false);

  // Cidade digitada confere com a lista oficial do IBGE? (a coleta descarta empresas de outra cidade)
  const cidadeOficial = municipios.data?.find((m) => normalizarNome(m) === normalizarNome(cidade));
  const cidadeDesconhecida = !!municipios.data && cidade.trim().length >= 2 && !cidadeOficial;
  const parecidas = cidadeDesconhecida
    ? municipios.data!.filter((m) => normalizarNome(m).includes(normalizarNome(cidade))).slice(0, 4)
    : [];

  const sugeridos = TERMOS_SUGERIDOS[nicho] ?? [];
  const faltando = sugeridos.filter((t) => !termos.some((x) => normalizarNome(x) === normalizarNome(t)));
  const visiveis = verTodos ? faltando : faltando.slice(0, 8);
  const adicionarTermos = (novos: string[]) =>
    setValue('termos_busca', [...termos, ...novos], { shouldDirty: true, shouldValidate: formState.isSubmitted });
  const sugestaoNome = nomeSugerido(nicho, termos, cidadeOficial ?? cidade);

  useEffect(() => {
    if (campanha === 'nova') reset(VAZIA);
    else if (campanha) {
      const { nome, nicho, cidade, uf, termos_busca, bairros, ativa, max_leads_execucao } = campanha;
      reset({ nome, nicho, cidade, uf, termos_busca, bairros, ativa, max_leads_execucao });
    }
  }, [campanha, reset]);

  const salvar = useMutation({
    mutationFn: async (dados: CampanhaDados) => {
      const q = nova
        ? supabase.from('campanhas').insert(dados)
        : supabase.from('campanhas').update(dados).eq('id', (campanha as Campanha).id);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campanhas'] });
      toast(nova ? 'Campanha criada' : 'Campanha atualizada');
      aoFechar();
    },
    onError: (e: Error) => toast(`Erro ao salvar: ${e.message}`, 'erro'),
  });

  const e = formState.errors;

  return (
    <Drawer
      aberto={campanha !== null}
      aoFechar={aoFechar}
      titulo={nova ? 'Nova campanha' : 'Editar campanha'}
      rodape={
        <>
          <button type="button" className="btn-secundario" onClick={aoFechar}>Cancelar</button>
          <button type="submit" form="form-campanha" className="btn-primario" disabled={salvar.isPending}>
            {salvar.isPending ? 'Salvando…' : 'Salvar'}
          </button>
        </>
      }
    >
      <form id="form-campanha" onSubmit={handleSubmit((d) => salvar.mutate(d))} className="space-y-4" noValidate>
        <div>
          <label className="label" htmlFor="nome">Nome</label>
          <input id="nome" className="input" placeholder="Dentistas Rio Preto" {...register('nome')} />
          {cidade.trim() && sugestaoNome !== nome.trim() && (
            <button
              type="button"
              className="mt-1 inline-flex items-center gap-1 text-xs text-marca hover:underline"
              onClick={() => setValue('nome', sugestaoNome, { shouldDirty: true, shouldValidate: formState.isSubmitted })}
            >
              <Sparkles size={12} /> Usar “{sugestaoNome}”
            </button>
          )}
          <CampoErro msg={e.nome?.message} />
        </div>
        <div>
          <label className="label" htmlFor="nicho">Nicho</label>
          <select id="nicho" className="input" {...register('nicho')}>
            {NICHOS.map((n) => (
              <option key={n.valor} value={n.valor}>{n.rotulo}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-fraco">Define o template da landing page e o tom da IA.</p>
          <CampoErro msg={e.nicho?.message} />
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_90px] gap-3">
          <div>
            <label className="label" htmlFor="cidade">Cidade</label>
            <input
              id="cidade"
              className="input"
              placeholder={municipios.isLoading ? 'Carregando cidades…' : 'Comece a digitar…'}
              list="lista-municipios"
              autoComplete="off"
              {...register('cidade')}
            />
            <datalist id="lista-municipios">
              {municipios.data?.map((m) => <option key={m} value={m} />)}
            </datalist>
            {cidadeOficial && cidadeOficial !== cidade.trim() && (
              <button type="button" className="mt-1 text-xs text-marca hover:underline" onClick={() => setValue('cidade', cidadeOficial, { shouldDirty: true })}>
                Usar a grafia oficial: {cidadeOficial}
              </button>
            )}
            {cidadeOficial && cidadeOficial === cidade.trim() && (
              <p className="mt-1 inline-flex items-center gap-1 text-xs text-emerald-600"><Check size={12} /> Cidade encontrada no IBGE</p>
            )}
            {cidadeDesconhecida && (
              <div className="mt-1 text-xs text-amber-600">
                Não encontrei “{cidade.trim()}” em {uf}. Confira a grafia: a coleta descarta empresas de outra cidade.
                {parecidas.length > 0 && (
                  <span className="mt-1 flex flex-wrap gap-1">
                    {parecidas.map((m) => (
                      <button key={m} type="button" className="rounded border border-borda px-1.5 py-0.5 text-suave hover:border-marca hover:text-marca" onClick={() => setValue('cidade', m, { shouldDirty: true })}>
                        {m}
                      </button>
                    ))}
                  </span>
                )}
              </div>
            )}
            <CampoErro msg={e.cidade?.message} />
          </div>
          <div>
            <label className="label" htmlFor="uf">UF</label>
            <select id="uf" className="input" {...register('uf')}>
              {UFS.map((u) => <option key={u}>{u}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="termos">Termos de busca</label>
          <Controller
            control={control}
            name="termos_busca"
            render={({ field }) => (
              <TagInput id="termos" valor={field.value} aoMudar={field.onChange} placeholder="dentista, clínica odontológica…" />
            )}
          />
          <p className="mt-1 text-xs text-fraco">
            Enter ou vírgula para adicionar. Cada termo vira uma consulta “termo em cidade - UF”, com até 60 empresas; mais termos trazem mais empresas.
          </p>
          <CampoErro msg={e.termos_busca?.message} />
          {faltando.length > 0 && (
            <div className="mt-2 rounded-md border border-dashed border-borda p-2.5">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 text-xs font-medium text-suave">
                  <Sparkles size={12} className="text-marca" /> Sugestões para {rotuloNicho(nicho)}
                </span>
                <button type="button" className="text-xs text-marca hover:underline" onClick={() => adicionarTermos(faltando)}>
                  Adicionar todas ({faltando.length})
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {visiveis.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => adicionarTermos([t])}
                    className="inline-flex items-center gap-1 rounded-full border border-borda bg-superficie px-2.5 py-1 text-xs text-suave hover:border-marca hover:text-marca"
                  >
                    <Plus size={11} /> {t}
                  </button>
                ))}
                {faltando.length > visiveis.length && (
                  <button type="button" className="px-1 text-xs text-marca hover:underline" onClick={() => setVerTodos(true)}>
                    +{faltando.length - visiveis.length} mais
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
        <div>
          <label className="label" htmlFor="bairros">Bairros (opcional)</label>
          <Controller
            control={control}
            name="bairros"
            render={({ field }) => (
              <TagInput id="bairros" valor={field.value} aoMudar={field.onChange} placeholder="Centro, Redentora…" />
            )}
          />
          <p className="mt-1 text-xs text-fraco">Amplia a cobertura: também busca “termo bairro cidade”. Cada combinação consome buscas.</p>
        </div>
        <div>
          <label className="label" htmlFor="max_leads_execucao">Máx. leads por execução</label>
          <input id="max_leads_execucao" type="number" className="input w-32" {...register('max_leads_execucao')} />
          <CampoErro msg={e.max_leads_execucao?.message} />
        </div>
        <Controller
          control={control}
          name="ativa"
          render={({ field }) => (
            <Switch id="ativa" marcado={field.value} aoMudar={field.onChange} rotulo="Campanha ativa" descricao="Só campanhas ativas entram na coleta diária." />
          )}
        />
      </form>
    </Drawer>
  );
}
