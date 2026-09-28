import { describe, expect, it } from 'vitest';
import { consultaRanking, itensDoRanking, posicaoDe } from '../supabase/functions/_shared/ranking';
import { linhasImagem, partesConsulta, textoRanking, type Ranking } from '../src/lib/ranking';

const places = Array.from({ length: 20 }, (_, i) => ({ id: `p${i + 1}`, displayName: { text: `Empresa ${i + 1}` }, rating: 4.5, userRatingCount: 10 * i }));
const itens = itensDoRanking([...places, places[3]]); // duplicado é ignorado
const base = (posicao: number | null): Ranking => ({
  id: 'r', lead_id: 'l', consulta: 'hamburgueria em Campinas - SP', posicao, total: itens.length, resultados: itens, criado_em: '2026-09-28T12:00:00Z',
});

describe('posição no Google', () => {
  it('numera na ordem do Google e ignora repetidos', () => {
    expect(itens).toHaveLength(20);
    expect(posicaoDe(itens, 'p14')).toBe(14);
    expect(posicaoDe(itens, 'x')).toBeNull();
    expect(consultaRanking(' dentista ', 'Campinas', 'SP')).toBe('dentista em Campinas - SP');
  });

  it('imagem mostra os 5 primeiros, reticências, o anterior e o lead', () => {
    const l = linhasImagem(base(14), 'p14');
    expect(l.map((x) => (x === 'reticencias' ? '…' : x.posicao))).toEqual([1, 2, 3, 4, 5, '…', 13, 14]);
  });

  it('lead perto do topo: lista contínua; fora do ranking: só os primeiros', () => {
    expect(linhasImagem(base(7), 'p7').map((x) => (x === 'reticencias' ? '…' : x.posicao))).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(linhasImagem(base(null), 'zz')).toHaveLength(6);
  });

  it('mensagem usa só dados reais da consulta', () => {
    const t = textoRanking(base(14), 'Karioka Lanches', 'Speed Sites', 'https://x/p/a?k=1');
    expect(t).toContain('"hamburgueria" em Campinas');
    expect(t).toContain('14º lugar');
    expect(t).toContain('13 concorrentes aparecem antes');
    expect(t).toContain('https://x/p/a?k=1');
    expect(textoRanking(base(null), 'X', '')).toContain('não aparece entre as 20 primeiras');
    expect(partesConsulta('dentista em São José do Rio Preto - SP')).toEqual({ termo: 'dentista', local: 'São José do Rio Preto - SP' });
  });
});
