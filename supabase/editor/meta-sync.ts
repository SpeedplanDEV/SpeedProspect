// SpeedProspect — Edge Function `meta-sync` (arquivo único para o editor do Supabase)
// Gerado por scripts/gerar-editor.mjs a partir de supabase/functions — não edite à mão.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';

// ===== _shared/supabase.ts =====
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(corpo: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', ...extra },
  });
}

/** Cliente com service role (ignora RLS) — só dentro das Edge Functions */
function admin(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const chave = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !chave) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes');
  return createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * Funções administrativas aceitam:
 *  - Authorization: Bearer <SERVICE_ROLE_KEY> (cron / pipeline)
 *  - Authorization: Bearer <JWT do operador logado> (botão "Executar agora"), se o e-mail estiver em `operadores`
 */
async function autorizarAdmin(req: Request, db: SupabaseClient): Promise<string | null> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (service && token === service) return 'service_role';
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  // Só operadores cadastrados (tabela `operadores`, Fase 7). Lista vazia ou tabela ainda inexistente = libera.
  const { data: ops, error: eOps } = await db.from('operadores').select('email').limit(500);
  const email = (data.user.email ?? '').toLowerCase();
  if (!eOps && ops?.length && !ops.some((o) => o.email === email)) return null;
  return data.user.email ?? data.user.id;
}

/** Início do dia de hoje em America/Sao_Paulo, como ISO UTC */
function inicioDoDiaSP(agora = new Date()): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(agora); // yyyy-mm-dd
  return new Date(`${partes}T00:00:00-03:00`).toISOString();
}

// ===== _shared/log.ts =====
type Nivel = 'info' | 'aviso' | 'erro';

/** Registro de uma execução em `execucoes`, com log estruturado */
class Execucao {
  id = '';
  itens = 0;
  custo = 0;
  chamadas = 0;
  private entradas: Record<string, unknown>[] = [];

  constructor(private db: SupabaseClient, private etapa: string, private campanhaId: string | null = null) {}

  async iniciar() {
    const { data, error } = await this.db
      .from('execucoes')
      .insert({ etapa: this.etapa, campanha_id: this.campanhaId })
      .select('id')
      .single();
    if (error) throw new Error(`Não foi possível registrar a execução: ${error.message}`);
    this.id = data.id;
    return this;
  }

  log(nivel: Nivel, msg: string, dados: Record<string, unknown> = {}) {
    this.entradas.push({ em: new Date().toISOString(), nivel, msg, ...dados });
    console.log(`[${this.etapa}] ${nivel}: ${msg}`, Object.keys(dados).length ? JSON.stringify(dados) : '');
  }

  /** Grava o progresso parcial (útil se a função estourar o tempo limite) */
  async salvarParcial() {
    await this.db
      .from('execucoes')
      .update({ itens_processados: this.itens, custo_estimado: this.custo, chamadas_api: this.chamadas, log: this.entradas })
      .eq('id', this.id);
  }

  async finalizar(erro?: string) {
    await this.db
      .from('execucoes')
      .update({
        finalizado_em: new Date().toISOString(),
        sucesso: !erro,
        erro: erro ?? null,
        itens_processados: this.itens,
        custo_estimado: Math.round(this.custo * 10000) / 10000,
        chamadas_api: this.chamadas,
        log: this.entradas,
      })
      .eq('id', this.id);
  }
}

// ===== _shared/meta.ts =====
// Cliente da Graph API / Marketing API da Meta — usado SOMENTE nas Edge Functions (o token nunca vai ao navegador).
// Versão fixa em META_API_VERSION; token do System User em META_SYSTEM_USER_TOKEN; appsecret_proof quando
// META_APP_SECRET existe. Sem dependências de Deno no carregamento (testável no Vitest com fetch simulado).

const PERMISSOES_NECESSARIAS = [
  'ads_management',
  'ads_read',
  'business_management',
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_ads',
] as const;
const PERMISSOES_OPCIONAIS = ['leads_retrieval', 'instagram_basic'] as const;

const VERSAO_VALIDA = /^v\d{2,}\.\d$/;
const MAX_LOTE = 50;

type CategoriaErro =
  | 'config' | 'token' | 'permissao' | 'acesso' | 'limite' | 'parametro' | 'politica' | 'versao' | 'temporario' | 'desconhecido';

interface InfoErroMeta {
  categoria: CategoriaErro;
  temporario: boolean;
  orientacao: string;
  http?: number;
  codigo?: number;
  subcodigo?: number;
  tipo?: string;
  fbtrace?: string;
  mensagemMeta?: string;
  /** Minutos estimados pela Meta para liberar novas chamadas (limites de uso) */
  esperarMinutos?: number;
}

/** Erro da Meta já traduzido: `message` é a mensagem para o operador, `orientacao` diz o que corrigir */
class ErroMeta extends Error {
  constructor(mensagem: string, public info: InfoErroMeta) {
    super(mensagem);
    this.name = 'ErroMeta';
  }
}

const ORIENTACAO: Record<CategoriaErro, string> = {
  config: 'Configure os secrets da Meta no Supabase (Edge Functions → Secrets) e publique a função de novo.',
  token:
    'Gere um novo token do System User: Business Manager → Configurações do negócio → Usuários → Usuários do sistema → ' +
    'selecione o usuário → Gerar novo token (escolha o app, validade "Nunca" e as permissões ads_management, ads_read, ' +
    'business_management, pages_show_list, pages_read_engagement e pages_manage_ads). Depois atualize o secret META_SYSTEM_USER_TOKEN.',
  permissao:
    'O token não tem a permissão exigida. Gere um novo token do System User marcando ads_management, ads_read, ' +
    'business_management, pages_show_list, pages_read_engagement e pages_manage_ads, e confira se o app tem o produto Marketing API.',
  acesso:
    'O System User não tem acesso a este ativo. No Business Manager: Configurações do negócio → Usuários do sistema → ' +
    'Atribuir ativos → dê controle total à conta de anúncios, à Página e ao pixel.',
  limite: 'A Meta limitou temporariamente o número de chamadas. O sistema tenta de novo sozinho; se continuar, aguarde alguns minutos.',
  parametro: 'A Meta recusou um parâmetro da chamada. Veja a mensagem acima.',
  politica: 'A Meta bloqueou esta ação por política ou segurança. Veja a Qualidade da Conta no Business Manager.',
  versao: 'A versão em META_API_VERSION foi descontinuada. Atualize o secret para a versão mais recente (ex.: v26.0).',
  temporario: 'Instabilidade temporária na Meta. Tente de novo em instantes.',
  desconhecido: 'Erro inesperado da Meta. Tente de novo; se persistir, confira o Business Manager.',
};

const CODIGOS_LIMITE = new Set([4, 17, 32, 613, 80000, 80001, 80002, 80003, 80004, 80005, 80006, 80008, 80009, 80014]);

interface CorpoErroGraph {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
    is_transient?: boolean;
    error_user_title?: string;
    error_user_msg?: string;
  };
}

/** Remove token e appsecret_proof de qualquer texto (mensagens de erro de rede trazem a URL completa) */
function mascararSegredos(texto: string): string {
  return texto
    .replace(/(access_token|appsecret_proof|input_token)=[^&\s)"']+/gi, '$1=***')
    .replace(/EAA[A-Za-z0-9]{20,}/g, 'EAA***');
}

/** Minutos até a Meta liberar novas chamadas, lidos dos cabeçalhos de uso (quando presentes) */
function minutosParaLiberar(cabecalhos: Headers | null | undefined): number | undefined {
  if (!cabecalhos) return undefined;
  let maior: number | undefined;
  const bruto = cabecalhos.get('x-business-use-case-usage');
  if (bruto) {
    try {
      const uso = JSON.parse(bruto) as Record<string, { estimated_time_to_regain_access?: number }[]>;
      for (const lista of Object.values(uso)) {
        for (const item of lista ?? []) {
          const m = Number(item?.estimated_time_to_regain_access ?? 0);
          if (m > 0) maior = Math.max(maior ?? 0, m);
        }
      }
    } catch { /* cabeçalho inválido: ignora */ }
  }
  const conta = cabecalhos.get('x-ad-account-usage');
  if (conta) {
    try {
      const uso = JSON.parse(conta) as { acc_id_util_pct?: number; reset_time_duration?: number };
      if (Number(uso.acc_id_util_pct) >= 100 && Number(uso.reset_time_duration) > 0) {
        maior = Math.max(maior ?? 0, Math.ceil(Number(uso.reset_time_duration) / 60));
      }
    } catch { /* ignora */ }
  }
  return maior;
}

/** Traduz a resposta de erro da Graph API em ErroMeta com categoria e orientação em pt-BR */
function classificarErro(http: number, corpo: unknown, cabecalhos?: Headers | null): ErroMeta {
  const e = (corpo as CorpoErroGraph | null)?.error;
  const codigo = e?.code;
  const sub = e?.error_subcode;
  const bruta = e?.error_user_msg || e?.message || (typeof corpo === 'string' ? corpo.slice(0, 300) : undefined);
  const msgMeta = bruta ? mascararSegredos(bruta) : undefined;
  let categoria: CategoriaErro = 'desconhecido';

  if (codigo === undefined) {
    categoria = http >= 500 || http === 0 ? 'temporario' : 'desconhecido';
  } else if (codigo === 190 || codigo === 102 || codigo === 2500) {
    categoria = 'token';
  } else if (/appsecret_proof/i.test(e?.message ?? '')) {
    categoria = 'config';
  } else if (codigo === 10 || codigo === 294 || (codigo >= 200 && codigo <= 299)) {
    categoria = 'permissao';
  } else if (codigo === 100 && sub === 33) {
    categoria = 'acesso';
  } else if (CODIGOS_LIMITE.has(codigo) || (codigo >= 80000 && codigo <= 80014)) {
    categoria = 'limite';
  } else if (codigo === 2635) {
    categoria = 'versao';
  } else if (codigo === 368) {
    categoria = 'politica';
  } else if (codigo === 1 || codigo === 2 || e?.is_transient) {
    categoria = 'temporario';
  } else if (codigo === 100) {
    categoria = 'parametro';
  }

  const temporario = categoria === 'limite' || categoria === 'temporario' || !!e?.is_transient;
  const esperarMinutos = categoria === 'limite' ? minutosParaLiberar(cabecalhos) : undefined;
  const titulos: Record<CategoriaErro, string> = {
    config: 'Configuração da Meta incompleta',
    token: 'Token da Meta inválido ou expirado',
    permissao: 'Permissão da Meta ausente',
    acesso: 'Sem acesso ao ativo na Meta',
    limite: 'Limite de chamadas da Meta atingido',
    parametro: 'A Meta recusou a chamada',
    politica: 'Ação bloqueada pela Meta',
    versao: 'Versão da API da Meta descontinuada',
    temporario: 'Instabilidade na Meta',
    desconhecido: 'Erro da Meta',
  };
  const detalhe = msgMeta ? `: ${msgMeta}` : '';
  const espera = esperarMinutos ? ` Tente de novo em cerca de ${esperarMinutos} min.` : '';
  return new ErroMeta(`${titulos[categoria]}${detalhe}${espera}`, {
    categoria,
    temporario,
    orientacao: ORIENTACAO[categoria],
    http,
    codigo,
    subcodigo: sub,
    tipo: e?.type,
    fbtrace: e?.fbtrace_id,
    mensagemMeta: msgMeta,
    esperarMinutos,
  });
}

interface ConfigMeta {
  versao: string;
  token: string;
  appSecret?: string;
  appId?: string;
  /** Endereço base (padrão https://graph.facebook.com; trocável em testes por META_GRAPH_URL) */
  base?: string;
  fetch?: typeof fetch;
  espera?: (ms: number) => Promise<void>;
  /** Horário-limite (Date.now()) para não passar do tempo da Edge Function */
  prazo?: number;
  tentativas?: number;
  /** Chamado a cada requisição (para log e contagem de chamadas); nunca recebe o token */
  aoChamar?: (info: { metodo: string; caminho: string; http: number; ms: number; codigo?: number; lote?: number }) => void;
}

type LerEnv = (nome: string) => string | undefined;
const envPadrao: LerEnv = (nome) =>
  (globalThis as unknown as { Deno?: { env: { get(n: string): string | undefined } } }).Deno?.env.get(nome);

/** Lê a configuração dos secrets; erro claro (categoria config) quando falta algo */
function lerConfigMeta(env: LerEnv = envPadrao): ConfigMeta {
  const versao = env('META_API_VERSION')?.trim() ?? '';
  const token = env('META_SYSTEM_USER_TOKEN')?.trim() ?? '';
  const faltando = [!versao && 'META_API_VERSION', !token && 'META_SYSTEM_USER_TOKEN'].filter(Boolean) as string[];
  if (faltando.length) {
    throw new ErroMeta(`Configuração da Meta incompleta: falta ${faltando.join(' e ')}`, {
      categoria: 'config',
      temporario: false,
      orientacao: `Crie ${faltando.length > 1 ? 'os secrets' : 'o secret'} ${faltando.join(' e ')} em Supabase → Edge Functions → Secrets (ex.: META_API_VERSION = v26.0).`,
    });
  }
  if (!VERSAO_VALIDA.test(versao)) {
    throw new ErroMeta(`META_API_VERSION inválida: "${versao}"`, {
      categoria: 'config',
      temporario: false,
      orientacao: 'Use o formato vXX.0, por exemplo v26.0 (a versão mais recente em developers.facebook.com/docs/graph-api/changelog).',
    });
  }
  return {
    versao,
    token,
    appSecret: env('META_APP_SECRET')?.trim() || undefined,
    appId: env('META_APP_ID')?.trim() || undefined,
    base: env('META_GRAPH_URL')?.trim() || undefined,
  };
}

async function hmacHex(chave: string, mensagem: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey('raw', enc.encode(chave), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const assinatura = await crypto.subtle.sign('HMAC', k, enc.encode(mensagem));
  return [...new Uint8Array(assinatura)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Parâmetros da Graph API: objetos e listas viram JSON (formato usado nos exemplos oficiais da Meta) */
function paraParametros(params: Record<string, unknown> = {}): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    p.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  return p;
}

interface OperacaoLote {
  metodo: 'GET' | 'POST' | 'DELETE';
  caminho: string;
  params?: Record<string, unknown>;
}
type ResultadoLote<T = unknown> = { ok: true; dados: T } | { ok: false; erro: ErroMeta };

interface ClienteMeta {
  versao: string;
  get<T = unknown>(caminho: string, params?: Record<string, unknown>): Promise<T>;
  post<T = unknown>(caminho: string, params?: Record<string, unknown>): Promise<T>;
  del<T = unknown>(caminho: string, params?: Record<string, unknown>): Promise<T>;
  /** Lista paginada (segue paging.cursors.after); `max` limita o total de itens */
  paginar<T = unknown>(caminho: string, params?: Record<string, unknown>, max?: number): Promise<{ itens: T[]; truncado: boolean }>;
  /** Até 50 operações por chamada (divide automaticamente); falhas temporárias de itens são repetidas */
  lote<T = unknown>(ops: OperacaoLote[]): Promise<ResultadoLote<T>[]>;
}

/** Cria o cliente da Graph API (retry com backoff exponencial: 3 tentativas; espera nos limites de uso) */
function criarClienteMeta(cfg: ConfigMeta): ClienteMeta {
  const base = `${(cfg.base ?? 'https://graph.facebook.com').replace(/\/+$/, '')}/${cfg.versao}`;
  const f = cfg.fetch ?? fetch;
  const espera = cfg.espera ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const tentativas = cfg.tentativas ?? 3;
  let prova: Promise<string> | null = null;
  const appsecretProof = (token: string) => {
    if (!cfg.appSecret) return Promise.resolve('');
    if (token !== cfg.token) return hmacHex(cfg.appSecret, token);
    return (prova ??= hmacHex(cfg.appSecret, cfg.token));
  };

  /** Token do System User por padrão; uma chamada pode informar outro (ex.: token do app no debug_token) */
  const credenciais = async (p: URLSearchParams) => {
    const token = p.get('access_token') || cfg.token;
    p.set('access_token', token);
    const pr = await appsecretProof(token);
    if (pr) p.set('appsecret_proof', pr);
    return p;
  };

  /** Espera antes da próxima tentativa sem passar do prazo; devolve false se não há tempo */
  const aguardar = async (tentativa: number, erro: ErroMeta): Promise<boolean> => {
    const minutos = erro.info.esperarMinutos;
    // Limite com espera longa (minutos): não adianta ficar esperando dentro da função
    if (minutos && minutos > 1) return false;
    const ms = Math.round(1000 * 2 ** tentativa * (0.8 + Math.random() * 0.4));
    if (cfg.prazo && Date.now() + ms > cfg.prazo - 2000) return false;
    await espera(ms);
    return true;
  };

  async function chamar<T>(metodo: 'GET' | 'POST' | 'DELETE', caminho: string, params: Record<string, unknown> = {}): Promise<T> {
    const limpo = caminho.replace(/^\/+/, '');
    let ultimo: ErroMeta | null = null;
    for (let t = 0; t < tentativas; t++) {
      const inicio = Date.now();
      let http = 0;
      try {
        const p = await credenciais(paraParametros(params));
        const url = metodo === 'POST' ? `${base}/${limpo}` : `${base}/${limpo}?${p}`;
        const resp = await f(url, {
          method: metodo,
          headers: metodo === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : undefined,
          body: metodo === 'POST' ? p.toString() : undefined,
          signal: cfg.prazo ? AbortSignal.timeout(Math.max(3000, cfg.prazo - Date.now())) : undefined,
        });
        http = resp.status;
        const texto = await resp.text();
        let corpo: unknown = texto;
        try {
          corpo = texto ? JSON.parse(texto) : {};
        } catch { /* corpo não-JSON (ex.: HTML de erro do proxy) */ }
        const temErro = !resp.ok || (typeof corpo === 'object' && corpo !== null && 'error' in corpo);
        cfg.aoChamar?.({ metodo, caminho: limpo.split('?')[0], http, ms: Date.now() - inicio, codigo: temErro ? (corpo as CorpoErroGraph).error?.code : undefined });
        if (!temErro) return corpo as T;
        ultimo = classificarErro(http, corpo, resp.headers);
      } catch (e) {
        if (e instanceof ErroMeta) throw e;
        const msg = mascararSegredos(e instanceof Error ? e.message : String(e));
        cfg.aoChamar?.({ metodo, caminho: limpo.split('?')[0], http, ms: Date.now() - inicio });
        ultimo = new ErroMeta(`Falha de rede ao chamar a Meta: ${msg}`, {
          categoria: 'temporario', temporario: true, orientacao: ORIENTACAO.temporario, http,
        });
      }
      if (!ultimo.info.temporario || t === tentativas - 1 || !(await aguardar(t, ultimo))) break;
    }
    throw ultimo!;
  }

  async function lote<T>(ops: OperacaoLote[]): Promise<ResultadoLote<T>[]> {
    const resultados: (ResultadoLote<T> | null)[] = ops.map(() => null);
    let pendentes = ops.map((_, i) => i);
    for (let t = 0; t < tentativas && pendentes.length; t++) {
      const repetir: number[] = [];
      for (let i = 0; i < pendentes.length; i += MAX_LOTE) {
        const grupo = pendentes.slice(i, i + MAX_LOTE);
        const batch = grupo.map((idx) => {
          const op = ops[idx];
          const q = paraParametros(op.params).toString();
          const caminho = op.caminho.replace(/^\/+/, '');
          return op.metodo === 'POST'
            ? { method: 'POST', relative_url: caminho, body: q }
            : { method: op.metodo, relative_url: q ? `${caminho}?${q}` : caminho };
        });
        let respostas: ({ code: number; body?: string } | null)[];
        try {
          respostas = await chamar<({ code: number; body?: string } | null)[]>('POST', '', { batch, include_headers: false });
        } catch (e) {
          const erro = e instanceof ErroMeta ? e : new ErroMeta(String(e), { categoria: 'desconhecido', temporario: false, orientacao: ORIENTACAO.desconhecido });
          for (const idx of grupo) resultados[idx] = { ok: false, erro };
          continue;
        }
        grupo.forEach((idx, j) => {
          const r = respostas?.[j];
          if (!r) {
            // A Meta devolve null quando um item do lote estourou o tempo: tenta de novo
            resultados[idx] = { ok: false, erro: new ErroMeta('Item do lote sem resposta da Meta', { categoria: 'temporario', temporario: true, orientacao: ORIENTACAO.temporario }) };
            repetir.push(idx);
            return;
          }
          let corpo: unknown = r.body;
          try {
            corpo = r.body ? JSON.parse(r.body) : {};
          } catch { /* mantém texto */ }
          const falhou = r.code >= 400 || (typeof corpo === 'object' && corpo !== null && 'error' in corpo);
          if (!falhou) {
            resultados[idx] = { ok: true, dados: corpo as T };
          } else {
            const erro = classificarErro(r.code, corpo);
            resultados[idx] = { ok: false, erro };
            if (erro.info.temporario) repetir.push(idx);
          }
        });
      }
      pendentes = repetir;
      if (pendentes.length && t < tentativas - 1) {
        const ms = 1000 * 2 ** t;
        if (cfg.prazo && Date.now() + ms > cfg.prazo - 2000) break;
        await espera(ms);
      }
    }
    return resultados as ResultadoLote<T>[];
  }

  async function paginar<T>(caminho: string, params: Record<string, unknown> = {}, max = 1000) {
    const itens: T[] = [];
    let after: string | undefined;
    for (;;) {
      const r = await chamar<{ data?: T[]; paging?: { cursors?: { after?: string }; next?: string } }>('GET', caminho, {
        limit: 100,
        ...params,
        ...(after ? { after } : {}),
      });
      itens.push(...(r.data ?? []));
      after = r.paging?.next ? r.paging?.cursors?.after : undefined;
      if (!after) return { itens, truncado: false };
      if (itens.length >= max) return { itens: itens.slice(0, max), truncado: true };
    }
  }

  return {
    versao: cfg.versao,
    get: (c, p) => chamar('GET', c, p),
    post: (c, p) => chamar('POST', c, p),
    del: (c, p) => chamar('DELETE', c, p),
    paginar,
    lote,
  };
}

/** "123" ou "act_123" → "act_123" */
const idContaAnuncio = (v: string) => (v.startsWith('act_') ? v : `act_${v.replace(/\D/g, '')}`);

/** Resposta JSON de erro padronizada para o painel (mensagem + o que fazer) */
function erroParaResposta(e: unknown): { erro: string; orientacao?: string; categoria?: CategoriaErro; codigo?: number } {
  if (e instanceof ErroMeta) {
    return { erro: mascararSegredos(e.message), orientacao: e.info.orientacao, categoria: e.info.categoria, codigo: e.info.codigo };
  }
  return { erro: mascararSegredos(e instanceof Error ? e.message : String(e)) };
}

// ===== _shared/meta-mapa.ts =====
// Tradução dos objetos da Meta para o modelo do SpeedProspect Ads (status, objetivos, saúde da conta).
// Arquivo puro: sem imports; roda em Deno (Edge Functions), Node (Vitest) e no navegador.

type StatusAds = 'rascunho' | 'planejado' | 'revisao' | 'publicado_pausado' | 'ativo' | 'pausado' | 'encerrado' | 'erro';
type NivelSaude = 'ok' | 'aviso' | 'erro';

interface ItemSaude {
  nivel: NivelSaude;
  texto: string;
  dica?: string;
}
interface SaudeConta {
  geral: NivelSaude;
  status: ItemSaude;
  pagamento: ItemSaude;
  whatsapp: ItemSaude;
  pixel: ItemSaude;
  instagram: ItemSaude;
  verificado_em: string;
}

/** account_status da conta de anúncios (Marketing API) */
const STATUS_CONTA_META: Record<number, { rotulo: string; nivel: NivelSaude; dica?: string }> = {
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
const MOTIVO_DESATIVACAO: Record<number, string> = {
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
function telefoneBR(valor: string | null | undefined): string {
  let d = (valor ?? '').replace(/\D/g, '');
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return valor ?? '';
}

interface ContaMetaBruta {
  account_status?: number;
  disable_reason?: number;
  funding_source?: string | null;
  funding_source_details?: { id?: string; display_string?: string; type?: number } | null;
  /** true quando o campo de pagamento não pôde ser lido (falta de permissão) */
  pagamento_indisponivel?: boolean;
}
interface PaginaMetaBruta {
  id?: string;
  name?: string;
  whatsapp_number?: string | null;
  has_whatsapp_number?: boolean;
  has_whatsapp_business_number?: boolean;
  instagram_business_account?: { id?: string; username?: string } | null;
  whatsapp_indisponivel?: boolean;
}
interface PixelMetaBruto {
  id?: string;
  name?: string;
  last_fired_time?: string | null;
  is_unavailable?: boolean;
}

const pior = (...niveis: NivelSaude[]): NivelSaude =>
  niveis.includes('erro') ? 'erro' : niveis.includes('aviso') ? 'aviso' : 'ok';

/** Indicadores de saúde de uma conta conectada (status, pagamento, WhatsApp, pixel, Instagram) */
function avaliarSaude(entrada: {
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
function statusLocal(effective?: string | null, configurado?: string | null): StatusAds {
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
function objetivoLocal(objective?: string | null, destino?: string | null): string {
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
function criativoDeAnuncio(criativo: CriativoMetaBruto | null | undefined) {
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
function motivoReprovacao(feedback: unknown): string | null {
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
const centavos = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

// ===== meta-sync/index.ts =====
// Edge Function `meta-sync` — importa campanhas, conjuntos e anúncios que já existem nas contas conectadas (somente
// leitura, para o dashboard) e sincroniza o status real (effective_status, problemas, reprovações) dos objetos criados
// pelo sistema. POST { conta_id? } (sem conta: todas as ativas). Operador logado ou service role.
// Obs.: a Meta remove o GET /?ids=... em 27/10/2026; objetos fora da listagem são conferidos via lote (batch).
const Entrada = z.object({ conta_id: z.string().uuid().optional() }).strict();

const PRAZO_MS = 135_000;
const MAX_POR_NIVEL = 2000;
const MAX_CONFERIR_AUSENTES = 300;

const CAMPOS = {
  campaigns: 'id,name,objective,status,effective_status,daily_budget,lifetime_budget,special_ad_categories,start_time,stop_time,issues_info',
  adsets: 'id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget,optimization_goal,destination_type,targeting,learning_stage_info,issues_info',
  ads: 'id,name,adset_id,status,effective_status,ad_review_feedback,issues_info,creative{id,body,title,call_to_action_type,object_story_spec,image_url,video_id,asset_feed_spec}',
} as const;

// Ignora objetos excluídos/arquivados na listagem (os já conhecidos são conferidos depois, um a um, em lote)
const STATUS_LISTAGEM = {
  campaigns: ['ACTIVE', 'PAUSED', 'IN_PROCESS', 'WITH_ISSUES'],
  adsets: ['ACTIVE', 'PAUSED', 'CAMPAIGN_PAUSED', 'IN_PROCESS', 'WITH_ISSUES'],
  ads: ['ACTIVE', 'PAUSED', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED', 'IN_PROCESS', 'WITH_ISSUES', 'PENDING_REVIEW', 'DISAPPROVED', 'PREAPPROVED', 'PENDING_BILLING_INFO'],
};

interface Base { id: string; name?: string; status?: string; effective_status?: string; issues_info?: unknown }
interface CampanhaMeta extends Base { objective?: string; daily_budget?: string; lifetime_budget?: string; special_ad_categories?: string[]; start_time?: string; stop_time?: string }
interface ConjuntoMeta extends Base { campaign_id?: string; daily_budget?: string; optimization_goal?: string; destination_type?: string; targeting?: unknown; learning_stage_info?: { status?: string } }
interface AnuncioMeta extends Base { adset_id?: string; ad_review_feedback?: unknown; creative?: Parameters<typeof criativoDeAnuncio>[0] & { id?: string } }

/** Lista um nível da conta; se a Meta recusar o filtro de status nesta versão, lista sem ele */
async function listar<T>(meta: ClienteMeta, conta: string, edge: keyof typeof CAMPOS) {
  try {
    return await meta.paginar<T>(`${conta}/${edge}`, { fields: CAMPOS[edge], effective_status: STATUS_LISTAGEM[edge] }, MAX_POR_NIVEL);
  } catch (e) {
    if (e instanceof ErroMeta && e.info.categoria === 'parametro') {
      return await meta.paginar<T>(`${conta}/${edge}`, { fields: CAMPOS[edge] }, MAX_POR_NIVEL);
    }
    throw e;
  }
}

const issues = (v: unknown) => (Array.isArray(v) && v.length ? v : null);

async function sincronizarConta(meta: ClienteMeta, db: ReturnType<typeof admin>, conta: { id: string; nome: string; meta_ad_account_id: string }) {
  const act = conta.meta_ad_account_id;
  const [camp, conj, anun] = [
    await listar<CampanhaMeta>(meta, act, 'campaigns'),
    await listar<ConjuntoMeta>(meta, act, 'adsets'),
    await listar<AnuncioMeta>(meta, act, 'ads'),
  ];

  // Destino dos conjuntos ajuda a entender o objetivo (ex.: engajamento com destino WhatsApp = conversas)
  const destinoDaCampanha = new Map<string, string>();
  for (const s of conj.itens) if (s.campaign_id && s.destination_type) destinoDaCampanha.set(s.campaign_id, s.destination_type);

  const campanhas = camp.itens.map((c) => ({
    meta_id: c.id,
    nome: c.name ?? '',
    objetivo: objetivoLocal(c.objective, destinoDaCampanha.get(c.id)),
    meta_objective: c.objective ?? null,
    orcamento_tipo: c.daily_budget || c.lifetime_budget ? 'cbo' : 'abo',
    orcamento_diario_centavos: centavos(c.daily_budget),
    special_ad_categories: (c.special_ad_categories ?? []).filter((x) => x && x !== 'NONE'),
    status: statusLocal(c.effective_status, c.status),
    meta_status: c.status ?? null,
    meta_effective_status: c.effective_status ?? null,
    issues: issues(c.issues_info),
    inicio: c.start_time ?? null,
    fim: c.stop_time ?? null,
  }));
  const conjuntos = conj.itens.map((s) => ({
    meta_id: s.id,
    meta_campaign_id: s.campaign_id ?? null,
    nome: s.name ?? '',
    targeting: s.targeting ?? {},
    otimizacao: s.optimization_goal ?? '',
    destino: s.destination_type ?? '',
    orcamento_diario_centavos: centavos(s.daily_budget),
    status: statusLocal(s.effective_status, s.status),
    meta_status: s.status ?? null,
    meta_effective_status: s.effective_status ?? null,
    issues: issues(s.issues_info),
    aprendizado: s.learning_stage_info ?? null,
    aprendizado_concluido: s.learning_stage_info?.status === 'SUCCESS',
  }));
  const anuncios = anun.itens.map((a) => {
    const cr = criativoDeAnuncio(a.creative);
    return {
      meta_id: a.id,
      meta_adset_id: a.adset_id ?? null,
      nome: a.name ?? '',
      ...cr,
      meta_creative_id: a.creative?.id ?? null,
      status: statusLocal(a.effective_status, a.status),
      meta_status: a.status ?? null,
      meta_effective_status: a.effective_status ?? null,
      issues: issues(a.issues_info),
      motivo_reprovacao: motivoReprovacao(a.ad_review_feedback),
    };
  });

  // Conhecidos localmente que não vieram na listagem (arquivados, excluídos ou sem acesso): confere um a um em lote
  const { data: conhecidos, error: eIds } = await db.rpc('meta_ids_da_conta', { p_conta_id: conta.id });
  if (eIds) throw new Error(`Rode o SQL da Fase 8 (meta_ids_da_conta): ${eIds.message}`);
  const vistos = new Set([...campanhas, ...conjuntos, ...anuncios].map((x) => x.meta_id));
  const ausentesIds: { nivel: 'campanha' | 'conjunto' | 'anuncio'; meta_id: string }[] = [];
  const k = conhecidos as { campanhas: string[]; conjuntos: string[]; anuncios: string[] };
  for (const id of k.campanhas ?? []) if (!vistos.has(id)) ausentesIds.push({ nivel: 'campanha', meta_id: id });
  for (const id of k.conjuntos ?? []) if (!vistos.has(id)) ausentesIds.push({ nivel: 'conjunto', meta_id: id });
  for (const id of k.anuncios ?? []) if (!vistos.has(id)) ausentesIds.push({ nivel: 'anuncio', meta_id: id });
  const conferir = ausentesIds.slice(0, MAX_CONFERIR_AUSENTES);
  const respostas = conferir.length
    ? await meta.lote<Base>(conferir.map((x) => ({ metodo: 'GET' as const, caminho: x.meta_id, params: { fields: 'status,effective_status,issues_info' } })))
    : [];
  type Ausente = { nivel: string; meta_id: string; status: StatusAds; meta_status: string | null; meta_effective_status: string | null; issues: unknown };
  const ausentes = conferir.flatMap((x, i): Ausente[] => {
    const r = respostas[i];
    if (r?.ok) {
      return [{ ...x, status: statusLocal(r.dados.effective_status, r.dados.status), meta_status: r.dados.status ?? null, meta_effective_status: r.dados.effective_status ?? null, issues: issues(r.dados.issues_info) }];
    }
    // Excluído de vez ou sem acesso: considera encerrado
    if (r && !r.ok && r.erro.info.categoria === 'acesso') {
      return [{ ...x, status: 'encerrado', meta_status: null, meta_effective_status: 'DELETED', issues: null }];
    }
    return [];
  });

  const { data: resumo, error } = await db.rpc('meta_sincronizar', {
    p_conta_id: conta.id,
    p_campanhas: campanhas,
    p_conjuntos: conjuntos,
    p_anuncios: anuncios,
    p_ausentes: ausentes,
  });
  if (error) throw new Error(`Falha ao gravar a sincronização: ${error.message}`);
  return {
    resumo: resumo as Record<string, unknown>,
    listados: { campanhas: campanhas.length, conjuntos: conjuntos.length, anuncios: anuncios.length },
    truncado: camp.truncado || conj.truncado || anun.truncado,
    ausentes_conferidos: conferir.length,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ erro: 'Use POST' }, 405);
  const inicio = Date.now();
  const db = admin();
  const quem = await autorizarAdmin(req, db);
  if (!quem) return json({ erro: 'Não autorizado' }, 401);

  let entrada: z.infer<typeof Entrada>;
  try {
    entrada = Entrada.parse(await req.json().catch(() => ({})));
  } catch {
    return json({ erro: 'Entrada inválida. Envie {} ou { "conta_id": "<uuid>" }' }, 400);
  }

  let cfg;
  try {
    cfg = lerConfigMeta();
  } catch (e) {
    return json(erroParaResposta(e), 400);
  }

  let q = db.from('contas_ads').select('id,nome,meta_ad_account_id').order('nome');
  q = entrada.conta_id ? q.eq('id', entrada.conta_id) : q.eq('ativa', true);
  const { data: contas, error } = await q;
  if (error) return json({ erro: `Rode o SQL da Fase 8: ${error.message}` }, 500);
  if (!contas?.length) return json({ ok: true, contas: [], mensagem: 'Nenhuma conta conectada.' });

  const ex = await new Execucao(db, 'meta-sync').iniciar();
  const meta = criarClienteMeta({
    ...cfg,
    prazo: inicio + PRAZO_MS,
    aoChamar: (c) => {
      ex.chamadas += 1;
      if (c.codigo) ex.log('aviso', `Meta respondeu erro ${c.codigo}`, { metodo: c.metodo, caminho: c.caminho, http: c.http });
    },
  });

  const resultado: Record<string, unknown>[] = [];
  let falhas = 0;
  for (const conta of contas) {
    if (Date.now() - inicio > PRAZO_MS - 20_000) {
      ex.log('aviso', 'Tempo limite: contas restantes ficam para a próxima sincronização', { conta: conta.nome });
      resultado.push({ conta_id: conta.id, nome: conta.nome, pulada: true });
      continue;
    }
    try {
      const r = await sincronizarConta(meta, db, conta);
      ex.itens += r.listados.campanhas + r.listados.conjuntos + r.listados.anuncios;
      ex.log('info', `${conta.nome}: sincronizada`, { conta_id: conta.id, ...r.listados, resumo: r.resumo, truncado: r.truncado });
      if (r.truncado) ex.log('aviso', `${conta.nome}: listagem cortada em ${MAX_POR_NIVEL} itens por nível`);
      resultado.push({ conta_id: conta.id, nome: conta.nome, ...r });
    } catch (e) {
      falhas++;
      const r = erroParaResposta(e);
      ex.log('erro', `${conta.nome}: ${r.erro}`, { conta_id: conta.id, orientacao: r.orientacao });
      resultado.push({ conta_id: conta.id, nome: conta.nome, ...r });
    }
  }
  const erroGeral = falhas === contas.length ? String((resultado[0] as { erro?: string }).erro ?? 'Falha na sincronização') : undefined;
  await ex.finalizar(erroGeral);
  return json({ ok: !erroGeral, contas: resultado, chamadas: ex.chamadas, segundos: Math.round((Date.now() - inicio) / 100) / 10 }, erroGeral ? 502 : 200);
});
