import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatarDataHora, formatarTelefone } from '@/lib/format';
import { MODELOS_IA, configuracoesSchema, type ConfiguracoesDados, type ConfiguracoesForm } from '@/lib/schemas';
import type { Configuracoes as Config } from '@/lib/types';
import { CampoErro, Erro, Pagina } from '@/components/ui/Pagina';
import { Switch } from '@/components/ui/Switch';
import { LogoAgencia } from '@/components/LogoAgencia';
import { useToast } from '@/components/ui/Toast';

export default function Configuracoes() {
  const qc = useQueryClient();
  const toast = useToast();

  const { data, isLoading, error } = useQuery({
    queryKey: ['configuracoes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('configuracoes').select('*').eq('id', 1).single();
      if (error) throw error;
      return data as Config;
    },
  });

  const { register, handleSubmit, reset, control, formState } = useForm<ConfiguracoesForm, unknown, ConfiguracoesDados>({
    resolver: zodResolver(configuracoesSchema),
  });

  useEffect(() => {
    if (data)
      reset({
        ...data,
        negocio_whatsapp: data.negocio_whatsapp ? formatarTelefone(data.negocio_whatsapp) : '',
        automacao_ativa: data.automacao_ativa ?? false,
        alerta_custo_mes: data.alerta_custo_mes ?? 100,
      });
  }, [data, reset]);

  // Antes do SQL da Fase 7 as colunas de automação não existem: não envia esses campos
  const temFase7 = !!data && 'automacao_ativa' in data;

  const salvar = useMutation({
    mutationFn: async (dados: ConfiguracoesDados) => {
      const { automacao_ativa, alerta_custo_mes, ...basicos } = dados;
      const campos = temFase7 ? { ...basicos, automacao_ativa, alerta_custo_mes } : basicos;
      const { data, error } = await supabase
        .from('configuracoes')
        .update({ ...campos, atualizado_em: new Date().toISOString() })
        .eq('id', 1)
        .select()
        .single();
      if (error) throw error;
      return data as Config;
    },
    onSuccess: (c) => {
      qc.setQueryData(['configuracoes'], c);
      toast('Configurações salvas');
    },
    onError: (e: Error) => toast(`Erro ao salvar: ${e.message}`, 'erro'),
  });

  const e = formState.errors;

  return (
    <Pagina
      titulo="Configurações"
      descricao={data ? `Atualizado em ${formatarDataHora(data.atualizado_em)}` : undefined}
      acoes={
        <button form="form-config" type="submit" className="btn-primario" disabled={salvar.isPending || isLoading}>
          <Save size={15} /> {salvar.isPending ? 'Salvando…' : 'Salvar'}
        </button>
      }
    >
      {error ? (
        <Erro erro={error} />
      ) : isLoading ? (
        <div className="text-sm text-suave">Carregando…</div>
      ) : (
        <form id="form-config" onSubmit={handleSubmit((d) => salvar.mutate(d))} className="max-w-3xl space-y-4" noValidate>
          <section className="card p-4 sm:p-5">
            <h2 className="mb-4 text-sm font-medium">Seu negócio</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="negocio_nome">Nome do negócio</label>
                <input id="negocio_nome" className="input" {...register('negocio_nome')} />
                <CampoErro msg={e.negocio_nome?.message} />
              </div>
              <div>
                <label className="label" htmlFor="negocio_whatsapp">WhatsApp do operador</label>
                <input id="negocio_whatsapp" className="input" placeholder="(17) 99999-9999" {...register('negocio_whatsapp')} />
                <CampoErro msg={e.negocio_whatsapp?.message} />
              </div>
              <div className="sm:col-span-2">
                <LogoAgencia logo={data?.negocio_logo ?? null} nome={data?.negocio_nome ?? ''} />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="app_url">URL pública do app</label>
                <input id="app_url" className="input" placeholder="https://prospect.seudominio.com.br" {...register('app_url')} />
                <p className="mt-1 text-xs text-fraco">
                  Usada para montar o link das prévias: {'{app_url}'}/p/slug. Sem ela, as mensagens não têm link.
                  {typeof window !== 'undefined' && ` Sugestão: ${window.location.origin}`}
                </p>
                <CampoErro msg={e.app_url?.message} />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="preco_texto">Texto de preço</label>
                <input id="preco_texto" className="input" {...register('preco_texto')} />
                <p className="mt-1 text-xs text-fraco">Ex.: “a partir de R$ 497”. Usado na mensagem de resposta a preço.</p>
                <CampoErro msg={e.preco_texto?.message} />
              </div>
            </div>
          </section>

          <section className="card p-4 sm:p-5">
            <h2 className="mb-1 text-sm font-medium">Limites diários</h2>
            <p className="mb-4 text-xs text-suave">O sistema nunca ultrapassa estes valores.</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="label" htmlFor="limite_buscas_dia">Buscas no Places / dia</label>
                <input id="limite_buscas_dia" type="number" className="input" {...register('limite_buscas_dia')} />
                <CampoErro msg={e.limite_buscas_dia?.message} />
              </div>
              <div>
                <label className="label" htmlFor="limite_geracoes_dia">Gerações de IA / dia</label>
                <input id="limite_geracoes_dia" type="number" className="input" {...register('limite_geracoes_dia')} />
                <CampoErro msg={e.limite_geracoes_dia?.message} />
              </div>
              <div>
                <label className="label" htmlFor="limite_envios_dia">Envios de WhatsApp / dia</label>
                <input id="limite_envios_dia" type="number" className="input" {...register('limite_envios_dia')} />
                <CampoErro msg={e.limite_envios_dia?.message} />
              </div>
            </div>
          </section>

          <section className="card p-4 sm:p-5">
            <h2 className="mb-4 text-sm font-medium">Qualificação e IA</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="score_minimo">Score mínimo (0–100)</label>
                <input id="score_minimo" type="number" className="input" {...register('score_minimo')} />
                <CampoErro msg={e.score_minimo?.message} />
              </div>
              <div>
                <label className="label" htmlFor="modelo_ia">Modelo de IA</label>
                <select id="modelo_ia" className="input" {...register('modelo_ia')}>
                  {MODELOS_IA.map((m) => (
                    <option key={m.valor} value={m.valor}>{m.rotulo}</option>
                  ))}
                  {data && !MODELOS_IA.some((m) => m.valor === data.modelo_ia) && (
                    <option value={data.modelo_ia}>{data.modelo_ia}</option>
                  )}
                </select>
                <p className="mt-1 text-xs text-fraco">A chave da IA fica no Supabase (Edge Functions → Secrets → ANTHROPIC_API_KEY), nunca aqui.</p>
                <CampoErro msg={e.modelo_ia?.message} />
              </div>
              <div className="sm:col-span-2 space-y-4 pt-1">
                <Controller
                  control={control}
                  name="auto_aprovar"
                  render={({ field }) => (
                    <Switch
                      id="auto_aprovar"
                      marcado={!!field.value}
                      aoMudar={field.onChange}
                      rotulo="Aprovar prévias automaticamente"
                      descricao="Publica a prévia e gera a mensagem assim que a IA termina, sem passar pela tela de Aprovação."
                    />
                  )}
                />
                <Controller
                  control={control}
                  name="prospectar_site_ok"
                  render={({ field }) => (
                    <Switch
                      id="prospectar_site_ok"
                      marcado={!!field.value}
                      aoMudar={field.onChange}
                      rotulo="Prospectar empresas que já têm site ok"
                      descricao="Aborda também quem já tem site funcional (proposta de redesign)."
                    />
                  )}
                />
              </div>
            </div>
          </section>
          <section className="card p-4 sm:p-5">
            <h2 className="mb-1 text-sm font-medium">Automação e custos</h2>
            <p className="mb-4 text-xs text-suave">
              Todo dia: 03:00 coleta, 03:30 qualificação, 04:00–05:50 prévias com IA e 08:00 follow-ups (horário de Brasília).
              Nada é enviado pelo WhatsApp sem o seu clique. Acompanhe em Execuções.
            </p>
            {!temFase7 && (
              <p className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                Rode o SQL 20261002000000_fase7_automacao.sql no Supabase para liberar estas opções.
              </p>
            )}
            <fieldset disabled={!temFase7} className="grid grid-cols-1 gap-4 disabled:opacity-60 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Controller
                  control={control}
                  name="automacao_ativa"
                  render={({ field }) => (
                    <Switch
                      id="automacao_ativa"
                      marcado={!!field.value}
                      aoMudar={field.onChange}
                      rotulo="Rodar o pipeline automaticamente todo dia"
                      descricao="Exige o SQL da Fase 7, a função pipeline publicada e os segredos no Vault (veja o README)."
                    />
                  )}
                />
              </div>
              <div>
                <label className="label" htmlFor="alerta_custo_mes">Alerta de custo no mês (R$)</label>
                <input id="alerta_custo_mes" type="number" step="0.01" min="0" className="input" {...register('alerta_custo_mes')} />
                <p className="mt-1 text-xs text-fraco">O Dashboard avisa quando o custo estimado (Google + IA) passar deste valor.</p>
                <CampoErro msg={e.alerta_custo_mes?.message} />
              </div>
            </fieldset>
          </section>
        </form>
      )}
    </Pagina>
  );
}
