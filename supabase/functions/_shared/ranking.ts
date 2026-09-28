// Posição no Google — lógica pura (usada pela Edge Function `ranking` e pelos testes)

export interface ItemRanking {
  posicao: number;
  place_id: string;
  nome: string;
  rating: number | null;
  reviews: number;
  endereco: string | null;
}

/** Monta a consulta igual à coleta: "termo em Cidade - UF" */
export function consultaRanking(termo: string, cidade: string, uf: string): string {
  return `${termo.trim()} em ${cidade.trim()}${uf ? ` - ${uf.trim()}` : ''}`;
}

/** Converte os places das páginas (na ordem do Google) em itens numerados */
export function itensDoRanking(
  places: { id: string; displayName?: { text?: string }; rating?: number; userRatingCount?: number; formattedAddress?: string }[],
): ItemRanking[] {
  const vistos = new Set<string>();
  const out: ItemRanking[] = [];
  for (const p of places) {
    if (!p.id || vistos.has(p.id)) continue;
    vistos.add(p.id);
    out.push({
      posicao: out.length + 1,
      place_id: p.id,
      nome: p.displayName?.text?.trim() || 'Sem nome',
      rating: typeof p.rating === 'number' ? Math.round(p.rating * 10) / 10 : null,
      reviews: p.userRatingCount ?? 0,
      endereco: p.formattedAddress ?? null,
    });
  }
  return out;
}

export const posicaoDe = (itens: ItemRanking[], placeId: string): number | null =>
  itens.find((i) => i.place_id === placeId)?.posicao ?? null;
