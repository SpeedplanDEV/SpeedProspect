// Aprovação e fila de envio (Fase 5): chamadas às funções SQL e montagem das mensagens
import { linkPrevia, textoMensagem } from '@shared/mensagens';
import { supabase } from './supabase';
import type { Configuracoes, Lead, Site } from './types';

/** Traduz erros das funções SQL para mensagens claras */
const FUNCOES_FASE6 = ['agendar_followups', 'mover_lead', 'painel_dashboard'];

function traduzirErro(msg: string, nome: string): string {
  if (/could not find the function|schema cache/i.test(msg)) {
    return FUNCOES_FASE6.includes(nome)
      ? 'As funções da Fase 6 ainda não existem no banco. Rode o SQL 20261001000000_fase6_funil.sql no Supabase.'
      : 'As funções da Fase 5 ainda não existem no banco. Rode o SQL 20260929000000_fase5_envios.sql no Supabase.';
  }
  return msg.replace(/^LIMITE_ENVIOS:\s*/, '').replace(/^Limite/, 'Limite');
}

async function rpc<T>(nome: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(nome, args);
  if (error) throw new Error(traduzirErro(error.message, nome));
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

// ---- Fase 6: follow-ups, funil e dashboard ----

export interface ResumoFollowups { followup_1: number; followup_2: number; perdidos: number; despublicados: number; pulados: number }

/** Agenda follow-ups do dia (idempotente — pode rodar a cada abertura da tela de Envios) */
export const agendarFollowups = () => rpc<ResumoFollowups>('agendar_followups', {});

export const moverLead = (leadId: string, status: string, valor?: number | null) =>
  rpc('mover_lead', { p_lead_id: leadId, p_status: status, p_valor: valor ?? null });

export interface PontoSerie { dia: string; envios: number; aberturas: number }
export interface LeadQuente { id: string; nome: string; telefone: string | null; score: number; nicho: string; ultima_visita: string; visitas: number }
export interface Painel {
  mes: string;
  coletados: number;
  /** Leads que alcançaram cada etapa no mês (1 qualificado … 8 fechado) */
  etapas: Record<string, number>;
  receita: number;
  custo: number;
  serie: PontoSerie[];
  quentes: LeadQuente[];
  erros: { id: string; etapa: string; iniciado_em: string; erro: string | null }[];
}

export const painelDashboard = (mes?: string) => rpc<Painel>('painel_dashboard', mes ? { p_mes: mes } : {});

/**
 * Leads "aprovado" sem mensagem de primeiro contato (acontecia na aprovação automática sem a URL do app):
 * cria a mensagem agora, com o endereço do painel como URL. Devolve quantas foram recuperadas.
 */
export async function recuperarAprovadasSemMensagem(): Promise<number> {
  const { data: aprovados, error } = await supabase.from('leads').select('*').eq('status_funil', 'aprovado').limit(200);
  if (error || !aprovados?.length) return 0;
  const ids = aprovados.map((l) => l.id as string);
  const [{ data: msgs }, { data: sites }] = await Promise.all([
    supabase.from('mensagens').select('lead_id').eq('tipo', 'primeiro_contato').in('lead_id', ids),
    supabase.from('sites').select('lead_id,slug,token_acesso').in('lead_id', ids),
  ]);
  const comMensagem = new Set((msgs ?? []).map((m) => m.lead_id as string));
  const sitePorLead = new Map((sites ?? []).map((s) => [s.lead_id as string, s as Pick<Site, 'slug' | 'token_acesso'>]));
  const faltando = (aprovados as Lead[]).filter((l) => !comMensagem.has(l.id) && sitePorLead.has(l.id));
  if (!faltando.length) return 0;
  const cfg = await carregarConfigMensagem();
  let n = 0;
  for (const l of faltando) {
    try {
      await aprovarPrevia(l.id, mensagemPrimeiroContato(l, sitePorLead.get(l.id)!, cfg));
      n++;
    } catch { /* segue para o próximo */ }
  }
  return n;
}
