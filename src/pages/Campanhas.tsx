import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatarDataHora, formatarNumero } from '@/lib/format';
import { campanhaSchema, type CampanhaDados, type CampanhaForm } from '@/lib/schemas';
import { NICHOS, UFS, rotuloNicho, type Campanha } from '@/lib/types';
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
        <div className="card overflow-x-auto">
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
      )}

      <FormCampanha campanha={editando} aoFechar={() => setEditando(null)} />
    </Pagina>
  );
}

function FormCampanha({ campanha, aoFechar }: { campanha: Campanha | 'nova' | null; aoFechar: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const nova = campanha === 'nova';

  const { register, handleSubmit, reset, control, formState } = useForm<CampanhaForm, unknown, CampanhaDados>({
    resolver: zodResolver(campanhaSchema),
    defaultValues: VAZIA,
  });

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
        <div className="grid grid-cols-[1fr_90px] gap-3">
          <div>
            <label className="label" htmlFor="cidade">Cidade</label>
            <input id="cidade" className="input" placeholder="São José do Rio Preto" {...register('cidade')} />
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
          <p className="mt-1 text-xs text-fraco">Enter ou vírgula para adicionar. Cada termo vira uma consulta “termo em cidade - UF”.</p>
          <CampoErro msg={e.termos_busca?.message} />
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
