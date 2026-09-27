// Acesso público (sem supabase-js, para a página da prévia carregar leve)
import { fetchFuncao, SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/config';
import type { ConteudoLP } from '@/templates/types';

const cabecalhos = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' };

export interface SitePublico {
  site_id: string;
  slug: string;
  template: string;
  conteudo: ConteudoLP;
  versao: number;
  publicado: boolean;
  token_optout: string;
  fotos: { name: string; atribuicao: string | null; atribuicao_uri: string | null }[];
  avaliacoes?: { autor: string; nota: number; texto: string; data: string }[];
  negocio_nome: string;
  negocio_whatsapp: string;
  negocio_logo?: string | null;
}

export async function buscarSite(slug: string, token: string | null): Promise<SitePublico | null> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_site_publico`, {
    method: 'POST',
    headers: cabecalhos,
    body: JSON.stringify({ p_slug: slug, p_token: token }),
  });
  if (!r.ok) throw new Error(`Erro ${r.status}`);
  return (await r.json()) as SitePublico | null;
}

export type TipoEvento = 'visita' | 'clique_whatsapp' | 'clique_quero';

/** Registra evento sem atrapalhar a navegação (keepalive: funciona mesmo abrindo o WhatsApp) */
export function rastrear(slug: string, token: string | null, tipo: TipoEvento, sessao: string) {
  try {
    void fetchFuncao('track', {
      method: 'POST',
      headers: cabecalhos,
      body: JSON.stringify({ slug, token, tipo, sessao }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* rastreio nunca quebra a página */
  }
}

export async function chamarOptout(token: string, confirmar: boolean): Promise<{ ok?: boolean; nome?: string; ja_removido?: boolean; erro?: string }> {
  const r = await fetchFuncao('optout', { method: 'POST', headers: cabecalhos, body: JSON.stringify({ token, confirmar }) });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(corpo?.erro ?? `Erro ${r.status}`);
  return corpo;
}

/** Identificador da sessão do visitante (1 visita por sessão por dia) */
export function idSessao(): string {
  const gerar = () => (crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).replace(/-/g, '');
  try {
    const salvo = sessionStorage.getItem('sp-sessao');
    if (salvo) return salvo;
    const novo = gerar();
    sessionStorage.setItem('sp-sessao', novo);
    return novo;
  } catch {
    return gerar();
  }
}

/** Ajusta título, descrição e bloqueia indexação (prévias não devem aparecer no Google) */
export function aplicarSeo(title: string, description: string) {
  document.title = title;
  const meta = (nome: string, valor: string) => {
    let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${nome}"]`);
    if (!el) {
      el = document.createElement('meta');
      el.name = nome;
      document.head.appendChild(el);
    }
    el.content = valor;
  };
  meta('description', description);
  meta('robots', 'noindex, nofollow');
}
