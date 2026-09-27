// Cliente mínimo da Claude API (Messages API via fetch) para as Edge Functions.
// Chamado somente no servidor; a chave fica no secret ANTHROPIC_API_KEY.

export const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
export const ANTHROPIC_VERSION = '2023-06-01';

/** Preço por milhão de tokens em US$ (https://www.anthropic.com/pricing). Casado por prefixo do ID do modelo. */
export const PRECOS_MTOK: { prefixo: string; entrada: number; saida: number }[] = [
  { prefixo: 'claude-sonnet-5', entrada: 2, saida: 10 },
  { prefixo: 'claude-haiku-4-5', entrada: 1, saida: 5 },
  { prefixo: 'claude-sonnet-4-6', entrada: 3, saida: 15 },
  { prefixo: 'claude-opus-5', entrada: 5, saida: 25 },
];

export interface Uso {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export interface BlocoConteudo {
  type: string;
  id?: string;
  name?: string;
  input?: unknown;
  text?: string;
  [k: string]: unknown;
}

export interface RespostaClaude {
  id: string;
  model: string;
  stop_reason: string | null;
  stop_details?: { category?: string | null; explanation?: string | null } | null;
  content: BlocoConteudo[];
  usage: Uso;
}

export class ErroClaude extends Error {
  constructor(message: string, public status: number, public tentarDeNovo: boolean) {
    super(message);
  }
}

/** Custo estimado em US$ (cache: escrita 1,25× e leitura 0,1× do preço de entrada) */
export function custoUSD(modelo: string, u: Uso): number {
  const p = PRECOS_MTOK.find((x) => modelo.startsWith(x.prefixo)) ?? PRECOS_MTOK[0];
  const escrita = u.cache_creation_input_tokens ?? 0;
  const leitura = u.cache_read_input_tokens ?? 0;
  return (
    (u.input_tokens * p.entrada + escrita * p.entrada * 1.25 + leitura * p.entrada * 0.1 + u.output_tokens * p.saida) /
    1_000_000
  );
}

/** Modelos da família Haiku 4.5 não aceitam `effort` e não pensam por padrão */
export const ehHaiku = (modelo: string) => modelo.startsWith('claude-haiku');

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * POST /v1/messages com até 3 tentativas para 429/5xx/529/rede (respeita retry-after).
 * Erros 4xx definitivos (chave inválida, requisição inválida) sobem na hora.
 * `timeoutMs` é o tempo total (todas as tentativas somadas).
 */
export async function chamarClaude(corpo: Record<string, unknown>, timeoutMs = 90_000): Promise<RespostaClaude> {
  const prazo = Date.now() + timeoutMs;
  const chave = Deno.env.get('ANTHROPIC_API_KEY');
  if (!chave) throw new ErroClaude('Secret ANTHROPIC_API_KEY não configurado no Supabase', 0, false);

  let ultimo: ErroClaude | null = null;
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const restante = prazo - Date.now();
    if (restante < 5_000) break;
    try {
      const r = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': chave,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(restante),
      });
      if (r.ok) return (await r.json()) as RespostaClaude;

      const texto = await r.text();
      let msg = texto.slice(0, 400);
      try {
        msg = JSON.parse(texto)?.error?.message ?? msg;
      } catch { /* corpo não-JSON */ }
      const repetir = r.status === 429 || r.status >= 500;
      ultimo = new ErroClaude(traduzirErro(r.status, msg), r.status, repetir);
      if (!repetir) throw ultimo;
      const ra = Number(r.headers.get('retry-after'));
      await esperar(Math.min(Number.isFinite(ra) && ra > 0 ? Math.min(ra, 30) * 1000 : 2000 * 2 ** tentativa, Math.max(0, prazo - Date.now() - 5_000)));
    } catch (e) {
      if (e instanceof ErroClaude && !e.tentarDeNovo) throw e;
      const tempo = e instanceof DOMException && e.name === 'TimeoutError';
      ultimo = e instanceof ErroClaude
        ? e
        : new ErroClaude(tempo ? 'A Claude API demorou demais para responder.' : `Falha de rede na Claude API: ${(e as Error).message}`, 0, true);
      await esperar(Math.min(2000 * 2 ** tentativa, Math.max(0, prazo - Date.now() - 5_000)));
    }
  }
  throw ultimo ?? new ErroClaude('Falha desconhecida na Claude API', 0, false);
}

function traduzirErro(status: number, msg: string): string {
  if (status === 401) return 'ANTHROPIC_API_KEY inválida (401). Confira o secret no Supabase.';
  if (status === 403) return `Sem permissão na Claude API (403): ${msg}`;
  if (status === 404) return `Modelo não encontrado (404): ${msg}. Confira o modelo em Configurações.`;
  if (status === 429) return 'Limite de uso da Claude API atingido (429). Tente de novo em alguns minutos.';
  if (status === 529) return 'Claude API sobrecarregada (529). Tente de novo em instantes.';
  if (status === 400 && /credit balance/i.test(msg)) return 'Saldo insuficiente na conta da Anthropic. Adicione créditos no console.';
  return `Claude API ${status}: ${msg}`;
}
