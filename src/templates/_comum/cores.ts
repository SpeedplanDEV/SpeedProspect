// Utilitários de cor para manter contraste acessível com qualquer cor escolhida pela IA

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const hex = (c: number[]) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;

export function misturar(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  return hex(x.map((v, i) => v + (y[i] - v) * t));
}

export function luminancia(h: string): number {
  const [r, g, b] = rgb(h).map((v) => v / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contraste(a: string, b: string): number {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((m, n) => n - m);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Texto legível sobre a cor (branco ou quase preto) */
export const textoSobre = (fundo: string) => (contraste(fundo, '#ffffff') >= 3 ? '#ffffff' : '#111111');

/** Escurece (fundo claro) ou clareia (fundo escuro) a cor até atingir o contraste mínimo */
export function comContraste(cor: string, fundo: string, minimo = 4.5): string {
  if (contraste(cor, fundo) >= minimo) return cor;
  const alvo = luminancia(fundo) > 0.4 ? '#000000' : '#ffffff';
  for (let t = 0.05; t <= 1; t += 0.05) {
    const c = misturar(cor, alvo, t);
    if (contraste(c, fundo) >= minimo) return c;
  }
  return alvo;
}

export const corValida = (v: string | undefined, padrao: string) => (v && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : padrao);
