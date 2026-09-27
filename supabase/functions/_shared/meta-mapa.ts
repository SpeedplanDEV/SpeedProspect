// Tradução dos objetos da Meta para o modelo do SpeedProspect Ads (status, objetivos, saúde da conta).
// Arquivo puro: sem imports; roda em Deno (Edge Functions), Node (Vitest) e no navegador.

export type StatusAds = 'rascunho' | 'planejado' | 'revisao' | 'publicado_pausado' | 'ativo' | 'pausado' | 'encerrado' | 'erro';
export type NivelSaude = 'ok' | 'aviso' | 'erro';

export interface ItemSaude {
  nivel: NivelSaude;
  texto: string;
  dica?: string;
}
export interface SaudeConta {
  geral: NivelSaude;
  status: ItemSaude;
  pagamento: ItemSaude;
  whatsapp: ItemSaude;
  pixel: ItemSaude;
  instagram: ItemSaude;
  verificado_em: string;
}

/** account_status da conta de anúncios (Marketing API) */
export const STATUS_CONTA_META: Record<number, { rotulo: string; nivel: NivelSaude; dica?: string }> = {
  1: { rotulo: 'Ativa', nivel: 'ok' },
  2: { rotulo: 'Desativada', nivel: 'erro', dica: 'Veja o motivo em Qualidade da Conta no Business Manager e peça revisão.' },
  3: { rotulo: 'Pagamento pendente', nivel: 'erro', dica: 'Quite o saldo em Faturamento no Gerenciador de Anúncios.' },
  7: { rotulo: 'Em análise de risco pela Meta', nivel: 'aviso', dica: 'Aguarde a análise; os anúncios podem não rodar enquanto isso.' },
  8: { rotulo: 'Liquidação pendente', nivel: 'erro', dica: 'Regularize o pagamento em Faturamento.' },
  9: { rotulo: 'Em período de carência', nivel: 'aviso', dica: 'Regularize o pagamento antes que a conta seja desativada.' },
  100: { rotulo: 'Encerramento pendente', nivel: 'erro' },
  101: { rotulo: 'Encerrada', nivel: 'erro' },
  201: { rotulo: 'Ativa', nivel: 'ok' },
  202: { rotulo: 'Encerrada', nivel: 'erro' },
};

/** disable_reason (quando a conta está desativada) */
export const MOTIVO_DESATIVACAO: Record<number, string> = {
  0: 'sem motivo informado',
  1: 'política de integridade de anúncios',
  2: 'análise de propriedade intelectual',
  3: 'risco de pagamento',
  4: 'conta suspeita encerrada',
  5: 'análise AFC',
  6: 'integridade do negócio',
  7: 'encerramento permanente',
  8: 'conta de revenda sem uso',
  9: 'conta sem uso',
  10: 'conta guarda-chuva',
  11: 'pagamento de parceiro de negócios',
  12: 'rotulagem pendente',
  13: 'problema com a política da Página',
  14: 'conta sem uso por muito tempo',
  15: 'conta comprometida',
};

const DIA_MS = 86_400_000;

function formatarDataHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(d);
}

/** Telefone E.164 brasileiro para exibição: +5517999999999 → (17) 99999-9999 */
export function telefoneBR(valor: string | null | undefined): string {
  let d = (valor ?? '').replace(/\D/g, '');
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return valor ?? '';
}

export interface ContaMetaBruta {
  account_status?: number;
  disable_reason?: number;
  funding_source?: string | null;
  funding_source_details?: { id?: string; display_string?: string; type?: number } | null;
  /** true quando o campo de pagamento não pôde ser lido (falta de permissão) */
  pagamento_indisponivel?: boolean;
}
export interface PaginaMetaBruta {
  id?: string;
  name?: string;
  whatsapp_number?: string | null;
  has_whatsapp_number?: boolean;
  has_whatsapp_business_number?: boolean;
  instagram_business_account?: { id?: string; username?: string } | null;
  whatsapp_indisponivel?: boolean;
}
export interface PixelMetaBruto {
  id?: string;
  name?: string;
  last_fired_time?: string | null;
  is_unavailable?: boolean;
}

const pior = (...niveis: NivelSaude[]): NivelSaude =>
  niveis.includes('erro') ? 'erro' : niveis.includes('aviso') ? 'aviso' : 'ok';

/** Indicadores de saúde de uma conta conectada (status, pagamento, WhatsApp, pixel, Instagram) */
export function avaliarSaude(entrada: {
  conta: ContaMetaBruta | null;
  pagina?: PaginaMetaBruta | null;
  pixel?: PixelMetaBruto | null;
  temPagina: boolean;
  temPixel: boolean;
  whatsappConfigurado?: string | null;
  agora?: Date;
  erros?: { conta?: string; pagina?: string; pixel?: string };
}): SaudeConta {
  const agora = entrada.agora ?? new Date();
  const { conta, pagina, pixel } = entrada;

  // Status da conta
  let status: ItemSaude;
  if (!conta) {
    status = { nivel: 'erro', texto: `Não foi possível ler a conta${entrada.erros?.conta ? `: ${entrada.erros.conta}` : ''}` };
  } else {
    const s = STATUS_CONTA_META[conta.account_status ?? 0] ?? { rotulo: `Status ${conta.account_status}`, nivel: 'aviso' as NivelSaude };
    const motivo = conta.account_status === 2 && conta.disable_reason ? ` (${MOTIVO_DESATIVACAO[conta.disable_reason] ?? `motivo ${conta.disable_reason}`})` : '';
    status = { nivel: s.nivel, texto: `${s.rotulo}${motivo}`, dica: s.dica };
  }

  // Forma de pagamento (a API não cadastra cartão: é feito no Gerenciador de Anúncios)
  let pagamento: ItemSaude;
  if (!conta) {
    pagamento = { nivel: 'aviso', texto: 'Não verificado' };
  } else if (conta.pagamento_indisponivel) {
    pagamento = {
      nivel: 'aviso',
      texto: 'Não foi possível verificar',
      dica: 'Dê controle total da conta de anúncios ao System User para o sistema ler o pagamento.',
    };
  } else if (conta.funding_source || conta.funding_source_details?.id) {
    const desc = conta.funding_source_details?.display_string;
    pagamento = { nivel: 'ok', texto: desc ?? 'Cadastrado' };
  } else {
    pagamento = {
      nivel: 'erro',
      texto: 'Sem forma de pagamento',
      dica: 'Cadastre um cartão ou saldo em Gerenciador de Anúncios → Faturamento. Sem isso os anúncios não são veiculados.',
    };
  }

  // WhatsApp conectado à Página
  let whatsapp: ItemSaude;
  if (!entrada.temPagina) {
    whatsapp = { nivel: 'aviso', texto: 'Nenhuma Página vinculada', dica: 'Vincule a Página que vai rodar os anúncios.' };
  } else if (!pagina) {
    whatsapp = { nivel: 'aviso', texto: `Não foi possível ler a Página${entrada.erros?.pagina ? `: ${entrada.erros.pagina}` : ''}` };
  } else if (pagina.whatsapp_indisponivel) {
    whatsapp = { nivel: 'aviso', texto: 'Não foi possível verificar', dica: 'Confira em Configurações da Página → WhatsApp.' };
  } else if (pagina.has_whatsapp_business_number || pagina.has_whatsapp_number || pagina.whatsapp_number) {
    const numero = pagina.whatsapp_number ? telefoneBR(pagina.whatsapp_number) : '';
    const cfg = (entrada.whatsappConfigurado ?? '').replace(/\D/g, '');
    const daPagina = (pagina.whatsapp_number ?? '').replace(/\D/g, '');
    const diferente = cfg && daPagina && !daPagina.endsWith(cfg.slice(-8)) && !cfg.endsWith(daPagina.slice(-8));
    whatsapp = diferente
      ? { nivel: 'aviso', texto: `Número da Página (${numero}) é diferente do cadastrado`, dica: 'Os anúncios de conversa abrem o número conectado à Página.' }
      : { nivel: 'ok', texto: numero ? `Conectado: ${numero}` : 'Conectado' };
  } else {
    whatsapp = {
      nivel: 'aviso',
      texto: 'Não conectado à Página',
      dica: 'Conecte o WhatsApp Business em Configurações da Página → WhatsApp (necessário para anúncios de conversa).',
    };
  }

  // Pixel
  let pixelItem: ItemSaude;
  if (!entrada.temPixel) {
    pixelItem = { nivel: 'aviso', texto: 'Nenhum vinculado', dica: 'Crie um pixel (Dataset) no Gerenciador de Eventos e vincule aqui.' };
  } else if (!pixel) {
    pixelItem = { nivel: 'aviso', texto: `Não foi possível ler o pixel${entrada.erros?.pixel ? `: ${entrada.erros.pixel}` : ''}` };
  } else if (pixel.is_unavailable) {
    pixelItem = { nivel: 'erro', texto: 'Indisponível', dica: 'Verifique o pixel no Gerenciador de Eventos.' };
  } else if (!pixel.last_fired_time) {
    pixelItem = { nivel: 'aviso', texto: 'Nunca recebeu eventos', dica: 'Instale o pixel no site ou nas prévias.' };
  } else {
    const dias = Math.floor((agora.getTime() - new Date(pixel.last_fired_time).getTime()) / DIA_MS);
    pixelItem = dias > 7
      ? { nivel: 'aviso', texto: `Último evento há ${dias} dias`, dica: 'O pixel parou de receber eventos; confira a instalação no site.' }
      : { nivel: 'ok', texto: `Último evento: ${formatarDataHora(pixel.last_fired_time)}` };
  }

  // Instagram
  let instagram: ItemSaude;
  if (!entrada.temPagina || !pagina) {
    instagram = { nivel: 'aviso', texto: 'Não verificado' };
  } else if (pagina.instagram_business_account?.id) {
    const u = pagina.instagram_business_account.username;
    instagram = { nivel: 'ok', texto: u ? `@${u}` : 'Conectado' };
  } else {
    instagram = {
      nivel: 'aviso',
      texto: 'Não conectado à Página',
      dica: 'Os anúncios no Instagram usarão a Página. Conecte a conta profissional em Configurações da Página → Contas vinculadas.',
    };
  }

  return {
    geral: pior(status.nivel, pagamento.nivel, whatsapp.nivel, pixelItem.nivel, instagram.nivel === 'erro' ? 'erro' : 'ok'),
    status,
    pagamento,
    whatsapp,
    pixel: pixelItem,
    instagram,
    verificado_em: agora.toISOString(),
  };
}

/** effective_status da Meta → status do sistema. Pausado recém-publicado continua "publicado_pausado" (tratado no SQL). */
export function statusLocal(effective?: string | null, configurado?: string | null): StatusAds {
  const e = (effective ?? configurado ?? '').toUpperCase();
  if (['DELETED', 'ARCHIVED'].includes(e)) return 'encerrado';
  if (['DISAPPROVED', 'WITH_ISSUES', 'PENDING_BILLING_INFO'].includes(e)) return 'erro';
  if (['PAUSED', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED'].includes(e)) return 'pausado';
  if (e === 'ACTIVE') return 'ativo';
  // Em análise / processando: segue o status configurado
  if (['IN_PROCESS', 'PENDING_REVIEW', 'PREAPPROVED'].includes(e)) {
    return (configurado ?? '').toUpperCase() === 'ACTIVE' ? 'ativo' : 'pausado';
  }
  return (configurado ?? '').toUpperCase() === 'ACTIVE' ? 'ativo' : 'pausado';
}

/** objective da campanha (+ destino do conjunto, se conhecido) → objetivo do sistema */
export function objetivoLocal(objective?: string | null, destino?: string | null): string {
  const o = (objective ?? '').toUpperCase();
  const d = (destino ?? '').toUpperCase();
  // Engajamento só conta como "conversas" quando o destino é WhatsApp/mensagens (senão é engajamento com post, vídeo...)
  if (o === 'MESSAGES') return 'conversas_whatsapp';
  if (o === 'OUTCOME_ENGAGEMENT') return d.includes('WHATSAPP') || d.startsWith('MESSAGING') ? 'conversas_whatsapp' : 'outro';
  if (o === 'OUTCOME_TRAFFIC' || o === 'LINK_CLICKS') return 'trafego_site';
  if (o === 'OUTCOME_LEADS' || o === 'LEAD_GENERATION') {
    if (d === 'ON_AD' || o === 'LEAD_GENERATION') return 'formulario';
    if (d.includes('WHATSAPP')) return 'conversas_whatsapp';
    return 'leads_site';
  }
  if (o === 'OUTCOME_SALES' || o === 'CONVERSIONS' || o === 'PRODUCT_CATALOG_SALES') return 'vendas';
  if (o === 'OUTCOME_AWARENESS' || o === 'REACH' || o === 'BRAND_AWARENESS') return 'reconhecimento';
  return 'outro';
}

interface CriativoMetaBruto {
  id?: string;
  body?: string;
  title?: string;
  call_to_action_type?: string;
  video_id?: string;
  image_url?: string;
  object_story_spec?: {
    link_data?: {
      message?: string; name?: string; description?: string; link?: string;
      child_attachments?: unknown[]; call_to_action?: { type?: string; value?: { link?: string } };
    };
    video_data?: { message?: string; title?: string; link_description?: string; video_id?: string; call_to_action?: { type?: string; value?: { link?: string } } };
  };
  asset_feed_spec?: { bodies?: { text?: string }[]; titles?: { text?: string }[]; videos?: unknown[]; images?: unknown[]; call_to_action_types?: string[] };
}

/** Texto, título, CTA e formato de um anúncio já existente (importação somente leitura) */
export function criativoDeAnuncio(criativo: CriativoMetaBruto | null | undefined) {
  const c = criativo ?? {};
  const link = c.object_story_spec?.link_data;
  const video = c.object_story_spec?.video_data;
  const feed = c.asset_feed_spec;
  const formato = link?.child_attachments?.length
    ? 'carrossel'
    : c.video_id || video?.video_id || feed?.videos?.length
      ? 'video_9x16'
      : c.image_url || link || feed?.images?.length
        ? 'imagem_1x1'
        : 'outro';
  return {
    formato,
    texto_primario: c.body ?? link?.message ?? video?.message ?? feed?.bodies?.[0]?.text ?? '',
    titulo: c.title ?? link?.name ?? video?.title ?? feed?.titles?.[0]?.text ?? '',
    descricao: link?.description ?? video?.link_description ?? null,
    cta: c.call_to_action_type ?? link?.call_to_action?.type ?? video?.call_to_action?.type ?? feed?.call_to_action_types?.[0] ?? '',
    link_destino: link?.link ?? link?.call_to_action?.value?.link ?? video?.call_to_action?.value?.link ?? null,
  };
}

/** Motivo de reprovação legível a partir de ad_review_feedback */
export function motivoReprovacao(feedback: unknown): string | null {
  if (!feedback || typeof feedback !== 'object') return null;
  const partes: string[] = [];
  for (const grupo of Object.values(feedback as Record<string, unknown>)) {
    if (grupo && typeof grupo === 'object') {
      for (const [chave, texto] of Object.entries(grupo as Record<string, unknown>)) {
        partes.push(typeof texto === 'string' && texto ? texto : chave);
      }
    }
  }
  return partes.length ? partes.join(' · ').slice(0, 1000) : null;
}

/** Valor monetário da Meta (string em centavos da moeda da conta) → inteiro ou null */
export const centavos = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};
