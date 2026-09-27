// Acesso ao site da empresa para a checagem (timeout 8 s, segue redirects, User-Agent de navegador)
import { classificarFalha, classificarResposta, normalizarUrl, preClassificar } from './qualificacao.ts';

const UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36';
const LIMITE_BYTES = 600_000;

async function lerTexto(r: Response): Promise<string> {
  if (!r.body) return '';
  const leitor = r.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  while (total < LIMITE_BYTES) {
    const { done, value } = await leitor.read();
    if (done) break;
    partes.push(value);
    total += value.length;
  }
  leitor.cancel().catch(() => {});
  const junto = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) {
    junto.set(p, pos);
    pos += p.length;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(junto);
}

export async function checarSite(website: string | null) {
  const pre = preClassificar(website);
  if (pre) return pre;
  const url = normalizarUrl(website!)!.toString();
  const inicio = Date.now();
  try {
    const r = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'pt-BR,pt;q=0.9' },
    });
    const html = await lerTexto(r);
    return classificarResposta(url, { status: r.status, urlFinal: r.url || url, html, tempoMs: Date.now() - inicio });
  } catch (e) {
    return classificarFalha(url, (e as Error).message ?? String(e), Date.now() - inicio);
  }
}
