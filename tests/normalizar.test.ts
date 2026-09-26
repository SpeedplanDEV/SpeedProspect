import { describe, expect, it } from 'vitest';
import {
  ehCelular, extrairBairro, extrairCidade, montarConsultas, semAcento, telefoneE164,
} from '../supabase/functions/_shared/normalizar';

describe('telefoneE164', () => {
  it('normaliza formatos comuns', () => {
    expect(telefoneE164('+55 17 99999-9999')).toBe('+5517999999999');
    expect(telefoneE164('(17) 99999-9999')).toBe('+5517999999999');
    expect(telefoneE164('(17) 3333-4444')).toBe('+551733334444');
    expect(telefoneE164('017 3333-4444')).toBe('+551733334444');
    expect(telefoneE164('5511987654321')).toBe('+5511987654321');
  });
  it('rejeita números inválidos', () => {
    expect(telefoneE164('')).toBeNull();
    expect(telefoneE164(null)).toBeNull();
    expect(telefoneE164('0800 123 4567')).toBeNull();
    expect(telefoneE164('12345')).toBeNull();
  });
});

describe('ehCelular', () => {
  it('9 dígitos começando com 9', () => {
    expect(ehCelular('+5517999999999')).toBe(true);
    expect(ehCelular('+551733334444')).toBe(false);
    expect(ehCelular(null)).toBe(false);
  });
});

describe('endereço', () => {
  const comps = [
    { longText: 'Redentora', types: ['sublocality_level_1', 'sublocality', 'political'] },
    { longText: 'São José do Rio Preto', types: ['administrative_area_level_2', 'political'] },
  ];
  it('extrai bairro e cidade', () => {
    expect(extrairBairro(comps)).toBe('Redentora');
    expect(extrairCidade(comps)).toBe('São José do Rio Preto');
    expect(extrairBairro([])).toBeNull();
  });
  it('compara cidades sem acento', () => {
    expect(semAcento('São José do Rio Preto')).toBe(semAcento('sao jose do  rio preto'));
  });
});

describe('montarConsultas', () => {
  it('gera termo + cidade e termo + bairro + cidade', () => {
    expect(
      montarConsultas({ termos_busca: ['dentista'], bairros: ['Centro'], cidade: 'Rio Preto', uf: 'SP' }),
    ).toEqual(['dentista em Rio Preto - SP', 'dentista Centro Rio Preto - SP']);
  });
});
