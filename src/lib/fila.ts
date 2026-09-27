// Aprovação e fila de envio (Fase 5): chamadas às funções SQL e montagem das mensagens
import { linkPrevia, textoMensagem } from '@shared/mensagens';
import { supabase } from './supabase';
import type { Configuracoes, Lead, Site } from './types';

/** Traduz erros das funções SQL para mensagens claras */
function traduzirErro(msg: string): string {
  if (/could not find the function|schema cache/i.test(msg)) {
    return 'As funções da Fase 5 ainda não existem no banco. Rode o SQL 20260929000000_fase5_envios.sql no Supabase.';
  }
  return msg.replace(/^LIMITE_ENVIOS:\s*/, '').replace(/^Limite/, 'Limite');
}

async function rpc<T>(nome: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(nome, args);
  if (error) throw new Error(traduzirErro(error.message));
  return data as T;
}

export interface ResumoEnvios { enviados_hoje: number; limite: number; hoje: string }

export const resumoEnvios = () => rpc<ResumoEnvios>('resumo_envios', {});
export const aprovarPrevia = (leadId: string, texto: string) => rpc('aprovar_previa', { p_lead_id: leadId, p_texto: texto });
export const descartarLead = (leadId: string, motivo: string) => rpc('descartar_lead', { p_lead_id: leadId, p_motivo: motivo });
export const registrarEnvio = (mensagemId: string, texto: string) =>
  rpc<{ enviados_hoje: number; limite: number }>('registrar_envio', { p_mensagem_id: mensagemId, p_texto: texto });
export const pularMensagem = (mensagemId: string, motivo: string) =>
  rpc('pular_mensagem', { p_mensagem_id: mensagemId, p_motivo: motivo });

/** Configurações usadas para montar as mensagens */
export type ConfigMensagem = Pick<Configuracoes, 'app_url' | 'negocio_nome' | 'preco_texto' | 'limite_envios_dia'>;

export async function carregarConfigMensagem(): Promise<ConfigMensagem> {
  const { data, error } = await supabase
    .from('configuracoes')
    .select('app_url,negocio_nome,preco_texto,limite_envios_dia')
    .eq('id', 1)
    .single();
  if (error) throw error;
  return data as ConfigMensagem;
}

/** Endereço público do sistema (Configurações → URL do app; senão o endereço atual) */
export const appUrlDe = (cfg: ConfigMensagem | undefined) => (cfg?.app_url || window.location.origin).replace(/\/+$/, '');

/** Texto de primeiro contato do lead (mesmo modelo usado pelas Edge Functions) */
export function mensagemPrimeiroContato(lead: Lead, site: Pick<Site, 'slug' | 'token_acesso'>, cfg: ConfigMensagem): string {
  return textoMensagem('primeiro_contato', {
    lead_id: lead.id,
    nome: lead.nome,
    rating: lead.rating,
    reviews_count: lead.reviews_count,
    status_site: lead.status_site,
    link: linkPrevia(appUrlDe(cfg), site.slug, site.token_acesso),
    negocio_nome: cfg.negocio_nome,
    preco_texto: cfg.preco_texto,
  });
}

/** Link do WhatsApp (wa.me aceita o número E.164 sem o "+") */
export function linkWhatsApp(telefoneE164: string, texto: string): string {
  return `https://wa.me/${telefoneE164.replace(/\D/g, '')}?text=${encodeURIComponent(texto)}`;
}

/** Motivos rápidos de descarte */
export const MOTIVOS_DESCARTE = [
  { valor: 'fora_do_perfil', rotulo: 'Fora do perfil' },
  { valor: 'previa_ruim', rotulo: 'Prévia não ficou boa' },
  { valor: 'dados_incorretos', rotulo: 'Dados incorretos' },
  { valor: 'sem_whatsapp', rotulo: 'Sem telefone / WhatsApp' },
  { valor: 'ja_cliente', rotulo: 'Já é cliente' },
  { valor: 'manual', rotulo: 'Outro' },
] as const;
