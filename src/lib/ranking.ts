// Posição no Google: chamada à Edge Function `ranking`, texto da mensagem e imagem para enviar ao lead
import type { ItemRanking } from '@shared/ranking';
import { chamarFuncao } from './funcoes';
import { supabase } from './supabase';

export type { ItemRanking };

export interface Ranking {
  id: string;
  lead_id: string;
  consulta: string;
  posicao: number | null;
  total: number;
  resultados: ItemRanking[];
  criado_em: string;
  em_cache?: boolean;
}

export const consultarRanking = (leadId: string, termo: string, atualizar = false) =>
  chamarFuncao<Ranking>('ranking', { lead_id: leadId, termo, ...(atualizar ? { atualizar: true } : {}) });

/** Última consulta salva do lead (null se nunca consultou ou se a tabela ainda não existe) */
export async function ultimoRanking(leadId: string): Promise<Ranking | null> {
  const { data, error } = await supabase
    .from('rankings')
    .select('*')
    .eq('lead_id', leadId)
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data as Ranking | null;
}

/** "hamburgueria em Campinas - SP" → termo e local para os textos */
export function partesConsulta(consulta: string): { termo: string; local: string } {
  const i = consulta.lastIndexOf(' em ');
  return i > 0 ? { termo: consulta.slice(0, i), local: consulta.slice(i + 4) } : { termo: consulta, local: '' };
}

const ordinal = (n: number) => `${n}º`;
const nota = (r: number | null) => (r == null ? '' : r.toFixed(1).replace('.', ','));

/** Linhas mostradas na imagem: os primeiros colocados, "…" e a empresa do lead (com quem está logo antes) */
export function linhasImagem(r: Ranking, placeId: string, topo = 5): (ItemRanking | 'reticencias')[] {
  const itens = r.resultados;
  const pos = r.posicao;
  if (!pos) return itens.slice(0, topo + 1);
  if (pos <= topo + 2) return itens.slice(0, Math.max(topo, pos));
  const doLead = itens.find((i) => i.place_id === placeId)!;
  const anterior = itens[pos - 2];
  const linhas: (ItemRanking | 'reticencias')[] = itens.slice(0, topo);
  if (anterior.posicao > topo + 1) linhas.push('reticencias');
  linhas.push(anterior, doLead);
  return linhas;
}

/** Mensagem que acompanha a imagem (dados reais da consulta; editável antes de enviar) */
export function textoRanking(r: Ranking, nome: string, negocio: string, link?: string): string {
  const { termo, local } = partesConsulta(r.consulta);
  const busca = `"${termo}"${local ? ` em ${local.replace(/ - [A-Z]{2}$/, '')}` : ''}`;
  const linhas: string[] = [];
  if (r.posicao && r.posicao > 1) {
    linhas.push(`Oi! Pesquisei ${busca} no Google e a ${nome} aparece em ${ordinal(r.posicao)} lugar. ${r.posicao - 1 === 1 ? '1 concorrente aparece' : `${r.posicao - 1} concorrentes aparecem`} antes de vocês (te mandei o print).`);
  } else if (r.posicao === 1) {
    linhas.push(`Oi! Pesquisei ${busca} no Google e a ${nome} aparece em 1º lugar. Parabéns! Dá para aproveitar ainda mais esse destaque.`);
  } else {
    linhas.push(`Oi! Pesquisei ${busca} no Google e a ${nome} não aparece entre as ${r.total} primeiras empresas (te mandei o print com quem aparece).`);
  }
  linhas.push('Um site próprio ajuda o Google a entender o que vocês fazem e mostrar a empresa para mais gente da região.');
  if (link) linhas.push(`Montei uma prévia de como ficaria: ${link}`);
  linhas.push('Posso te explicar como funciona?');
  if (negocio) linhas.push(`— ${negocio}`);
  return linhas.join('\n');
}

// ---------- Imagem (canvas) ----------

const L = 1080; // largura (formato retrato, bom para o WhatsApp)
const FONTE = '"DM Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

function cortar(ctx: CanvasRenderingContext2D, texto: string, max: number): string {
  if (ctx.measureText(texto).width <= max) return texto;
  let t = texto;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

/** Quebra o texto em até `maxLinhas` linhas que cabem em `max` px (a última é cortada com …) */
function quebrar(ctx: CanvasRenderingContext2D, texto: string, max: number, maxLinhas = 2): string[] {
  const palavras = texto.split(/\s+/);
  const linhas: string[] = [];
  let atual = '';
  for (const p of palavras) {
    const teste = atual ? `${atual} ${p}` : p;
    if (ctx.measureText(teste).width <= max || !atual) atual = teste;
    else {
      linhas.push(atual);
      atual = p;
    }
  }
  if (atual) linhas.push(atual);
  if (linhas.length > maxLinhas) {
    const resto = linhas.slice(maxLinhas - 1).join(' ');
    return [...linhas.slice(0, maxLinhas - 1), cortar(ctx, resto, max)];
  }
  return linhas.map((l) => cortar(ctx, l, max));
}

function retangulo(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function estrela(ctx: CanvasRenderingContext2D, cx: number, cy: number, raio: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? raio * 0.45 : raio;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    ctx[i ? 'lineTo' : 'moveTo'](cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  ctx.closePath();
  ctx.fill();
}

/** Desenha a imagem "posição no Google" e devolve um PNG */
export async function gerarImagemRanking(r: Ranking, placeId: string, nome: string, negocio: string): Promise<Blob> {
  await document.fonts?.ready.catch(() => undefined);
  const linhas = linhasImagem(r, placeId);
  const ALT_LINHA = 118;
  const encontrado = !!r.posicao;
  const titulo = encontrado
    ? `${nome} aparece em ${ordinal(r.posicao!)} lugar`
    : `${nome} não aparece nas ${r.total} primeiras`;

  const c = document.createElement('canvas');
  c.width = L;
  const ctx = c.getContext('2d')!;
  ctx.font = `600 44px ${FONTE}`;
  const linhasTitulo = quebrar(ctx, titulo, L - 128);
  const extraTitulo = (linhasTitulo.length - 1) * 54;
  const extraFora = encontrado ? 0 : 150;
  const A = 470 + extraTitulo + linhas.length * ALT_LINHA + extraFora + 170;
  c.height = A; // redimensionar limpa o canvas e o estado: tudo é desenhado depois daqui

  // Fundo
  ctx.fillStyle = '#f1f3f4';
  ctx.fillRect(0, 0, L, A);

  // Cabeçalho neutro (é um levantamento com dados do Google, não um print da tela do Google)
  ctx.fillStyle = '#5f6368';
  ctx.font = `600 30px ${FONTE}`;
  ctx.fillText('BUSCA NO GOOGLE MAPS', 64, 104);

  retangulo(ctx, 64, 146, L - 128, 88, 44);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#dadce0';
  ctx.lineWidth = 2;
  ctx.stroke();
  // lupa
  ctx.strokeStyle = '#5f6368';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(118, 186, 15, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(129, 197);
  ctx.lineTo(143, 211);
  ctx.stroke();
  ctx.fillStyle = '#202124';
  ctx.font = `400 34px ${FONTE}`;
  ctx.fillText(cortar(ctx, r.consulta, L - 280), 166, 202);

  // Título (até 2 linhas)
  ctx.fillStyle = '#202124';
  ctx.font = `600 44px ${FONTE}`;
  linhasTitulo.forEach((t, i) => ctx.fillText(t, 64, 318 + i * 54));
  ctx.fillStyle = '#5f6368';
  ctx.font = `400 30px ${FONTE}`;
  const sub = encontrado && r.posicao! > 1
    ? `${r.posicao! - 1} ${r.posicao! - 1 === 1 ? 'concorrente aparece' : 'concorrentes aparecem'} antes de você`
    : encontrado
      ? 'Sua empresa está no topo desta busca'
      : 'Veja quem os clientes encontram primeiro';
  ctx.fillText(sub, 64, 366 + extraTitulo);

  // Lista
  let y = 410 + extraTitulo;
  for (const item of linhas) {
    if (item === 'reticencias') {
      ctx.fillStyle = '#9aa0a6';
      ctx.font = `600 40px ${FONTE}`;
      ctx.textAlign = 'center';
      ctx.fillText('• • •', L / 2, y + 62);
      ctx.textAlign = 'left';
      y += ALT_LINHA;
      continue;
    }
    const ehLead = item.place_id === placeId;
    retangulo(ctx, 64, y, L - 128, ALT_LINHA - 18, 22);
    ctx.fillStyle = ehLead ? '#fdecea' : '#ffffff';
    ctx.fill();
    ctx.strokeStyle = ehLead ? '#d93025' : '#e3e5e8';
    ctx.lineWidth = ehLead ? 5 : 2;
    ctx.stroke();

    // posição
    ctx.beginPath();
    ctx.arc(128, y + 50, 32, 0, Math.PI * 2);
    ctx.fillStyle = ehLead ? '#d93025' : item.posicao <= 3 ? '#1e8e3e' : '#5f6368';
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `600 ${item.posicao >= 10 ? 28 : 32}px ${FONTE}`;
    ctx.textAlign = 'center';
    ctx.fillText(String(item.posicao), 128, y + 61);
    ctx.textAlign = 'left';

    // nome + selo
    const maxNome = ehLead ? L - 128 - 150 - 230 : L - 128 - 150 - 40;
    ctx.fillStyle = '#202124';
    ctx.font = `${ehLead ? 600 : 500} 34px ${FONTE}`;
    ctx.fillText(cortar(ctx, item.nome, maxNome), 186, y + 46);
    if (ehLead) {
      ctx.font = `600 22px ${FONTE}`;
      const selo = 'SUA EMPRESA';
      const w = ctx.measureText(selo).width + 32;
      retangulo(ctx, L - 64 - 24 - w, y + 18, w, 40, 20);
      ctx.fillStyle = '#d93025';
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(selo, L - 64 - 24 - w + 16, y + 46);
    }

    // nota
    if (item.rating != null) {
      ctx.fillStyle = '#5f6368';
      ctx.font = `400 28px ${FONTE}`;
      const t = nota(item.rating);
      ctx.fillText(t, 186, y + 86);
      const wn = ctx.measureText(t).width;
      ctx.fillStyle = '#fbbc04';
      estrela(ctx, 186 + wn + 20, y + 77, 13);
      ctx.fillStyle = '#5f6368';
      ctx.fillText(`(${item.reviews.toLocaleString('pt-BR')} avaliações)`, 186 + wn + 42, y + 86);
    } else {
      ctx.fillStyle = '#9aa0a6';
      ctx.font = `400 28px ${FONTE}`;
      ctx.fillText('Sem avaliações', 186, y + 86);
    }
    y += ALT_LINHA;
  }

  if (!encontrado) {
    retangulo(ctx, 64, y, L - 128, 120, 22);
    ctx.fillStyle = '#fdecea';
    ctx.fill();
    ctx.strokeStyle = '#d93025';
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.fillStyle = '#d93025';
    ctx.font = `600 32px ${FONTE}`;
    ctx.fillText(cortar(ctx, nome, L - 200), 100, y + 52);
    ctx.fillStyle = '#5f6368';
    ctx.font = `400 28px ${FONTE}`;
    ctx.fillText(`Não aparece entre as ${r.total} primeiras empresas desta busca`, 100, y + 94);
    y += 150;
  }

  // Rodapé
  const data = new Date(r.criado_em).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  ctx.fillStyle = '#5f6368';
  ctx.font = `400 26px ${FONTE}`;
  ctx.fillText(`Dados: Google Maps, busca feita em ${data}.`, 64, y + 44);
  ctx.fillText('A ordem pode variar conforme a localização de quem pesquisa.', 64, y + 82);
  if (negocio) {
    ctx.fillStyle = '#202124';
    ctx.font = `600 26px ${FONTE}`;
    ctx.fillText(`Levantamento: ${negocio}`, 64, y + 128);
  }

  return new Promise((ok, erro) => c.toBlob((b) => (b ? ok(b) : erro(new Error('Não foi possível gerar a imagem'))), 'image/png'));
}
