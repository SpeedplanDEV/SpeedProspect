import { describe, expect, it } from 'vitest';
import { linkPrevia, primeiroNomeOuEmpresa, textoMensagem, variacao } from '../supabase/functions/_shared/mensagens';

const base = {
  lead_id: 'abc', nome: 'Clínica Sorriso', rating: 4.8, reviews_count: 230, status_site: 'sem_site',
  link: 'https://app.com/p/clinica?k=t', negocio_nome: 'Speed Agência', preco_texto: 'a partir de R$ 497',
};

describe('mensagens', () => {
  it('primeiro contato sem site cita nota e link', () => {
    const t = textoMensagem('primeiro_contato', base);
    expect(t).toContain('4,8★ com 230 avaliações');
    expect(t).toContain(base.link);
    expect(t).toContain('— Speed Agência');
    expect(t).not.toMatch(/\{\w+\}/);
  });
  it('site fraco troca o argumento', () => {
    const t = textoMensagem('primeiro_contato', { ...base, status_site: 'site_fraco' });
    expect(t).toContain('não abre bem no celular');
    expect(t).not.toContain('ainda não têm site');
  });
  it('sem nota suficiente não inventa números', () => {
    const t = textoMensagem('primeiro_contato', { ...base, rating: null, reviews_count: 0 });
    expect(t).not.toContain('★');
    expect(t).toContain('ainda não têm site');
  });
  it('variação estável e aberturas diferentes', () => {
    expect(variacao('abc', 3)).toBe(variacao('abc', 3));
    const aberturas = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => textoMensagem('primeiro_contato', { ...base, lead_id: id }).split('\n')[0]));
    expect(aberturas.size).toBeGreaterThan(1);
  });
  it('follow-ups, preço e link', () => {
    expect(textoMensagem('followup_1', { ...base, abriu: true })).toContain('deu uma olhada');
    expect(textoMensagem('followup_1', { ...base, abriu: false })).toContain(base.link);
    expect(textoMensagem('followup_2', { ...base, data_limite: '30/10/2026' })).toContain('30/10/2026');
    expect(textoMensagem('resposta_preco', base)).toContain('a partir de R$ 497');
    expect(linkPrevia('https://app.com/', 's', 'k')).toBe('https://app.com/p/s?k=k');
    expect(primeiroNomeOuEmpresa('Dra. Ana Souza')).toBe('Ana');
  });

  it('usa o modelo personalizado quando preenchido', () => {
    const modelos = { primeiro_contato: 'Olá {primeiro_nome_ou_empresa}! {frase_google}\nVeja: {link}\n— {negocio_nome}' };
    const t = textoMensagem('primeiro_contato', base, modelos);
    expect(t.startsWith('Olá ')).toBe(true);
    expect(t).toContain(base.link);
    expect(t).toContain('avaliações no Google');
    expect(t).not.toMatch(/\{\w+\}/);
  });
  it('modelo vazio volta ao padrão', () => {
    expect(textoMensagem('primeiro_contato', base, { primeiro_contato: '   ' })).toBe(textoMensagem('primeiro_contato', base));
  });
  it('follow-ups personalizados e data limite', () => {
    const m = { followup_1_abriu: 'Curtiu, {nome}?', followup_2: 'Até {data_limite}, {nome}.' };
    expect(textoMensagem('followup_1', { ...base, abriu: true }, m)).toBe(`Curtiu, ${base.nome}?`);
    expect(textoMensagem('followup_2', { ...base, data_limite: '01/11/2026' }, m)).toBe(`Até 01/11/2026, ${base.nome}.`);
  });
});
