// Cliente da Graph API / Marketing API da Meta — usado SOMENTE nas Edge Functions (o token nunca vai ao navegador).
// Versão fixa em META_API_VERSION; token do System User em META_SYSTEM_USER_TOKEN; appsecret_proof quando
// META_APP_SECRET existe. Sem dependências de Deno no carregamento (testável no Vitest com fetch simulado).

export const PERMISSOES_NECESSARIAS = [
  'ads_management',
  'ads_read',
  'business_management',
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_ads',
] as const;
export const PERMISSOES_OPCIONAIS = ['leads_retrieval', 'instagram_basic'] as const;

const VERSAO_VALIDA = /^v\d{2,}\.\d$/;
const MAX_LOTE = 50;

export type CategoriaErro =
  | 'config' | 'token' | 'permissao' | 'acesso' | 'limite' | 'parametro' | 'politica' | 'versao' | 'temporario' | 'desconhecido';

export interface InfoErroMeta {
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
export class ErroMeta extends Error {
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
export function mascararSegredos(texto: string): string {
  return texto
    .replace(/(access_token|appsecret_proof|input_token)=[^&\s)"']+/gi, '$1=***')
    .replace(/EAA[A-Za-z0-9]{20,}/g, 'EAA***');
}

/** Minutos até a Meta liberar novas chamadas, lidos dos cabeçalhos de uso (quando presentes) */
export function minutosParaLiberar(cabecalhos: Headers | null | undefined): number | undefined {
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
export function classificarErro(http: number, corpo: unknown, cabecalhos?: Headers | null): ErroMeta {
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

export interface ConfigMeta {
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
export function lerConfigMeta(env: LerEnv = envPadrao): ConfigMeta {
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
export function paraParametros(params: Record<string, unknown> = {}): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    p.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  return p;
}

export interface OperacaoLote {
  metodo: 'GET' | 'POST' | 'DELETE';
  caminho: string;
  params?: Record<string, unknown>;
}
export type ResultadoLote<T = unknown> = { ok: true; dados: T } | { ok: false; erro: ErroMeta };

export interface ClienteMeta {
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
export function criarClienteMeta(cfg: ConfigMeta): ClienteMeta {
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
export const idContaAnuncio = (v: string) => (v.startsWith('act_') ? v : `act_${v.replace(/\D/g, '')}`);

/** Resposta JSON de erro padronizada para o painel (mensagem + o que fazer) */
export function erroParaResposta(e: unknown): { erro: string; orientacao?: string; categoria?: CategoriaErro; codigo?: number } {
  if (e instanceof ErroMeta) {
    return { erro: mascararSegredos(e.message), orientacao: e.info.orientacao, categoria: e.info.categoria, codigo: e.info.codigo };
  }
  return { erro: mascararSegredos(e instanceof Error ? e.message : String(e)) };
}
