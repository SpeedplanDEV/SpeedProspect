import { describe, expect, it } from 'vitest';
import {
  calcularScore, classificarFalha, classificarResposta, ehFranquia, hostFraco, motivoDescarte, preClassificar,
} from '../supabase/functions/_shared/qualificacao';

const htmlBom = `<!doctype html><html><head><meta name="viewport" content="width=device-width"><title>Clínica Sorriso</title></head><body>${'x'.repeat(6000)}</body></html>`;

describe('classificação do site', () => {
  it('sem site', () => {
    expect(preClassificar(null)?.status).toBe('sem_site');
    expect(preClassificar('  ')?.status).toBe('sem_site');
  });
  it('rede social / link na bio = site fraco', () => {
    expect(preClassificar('https://www.instagram.com/clinica')?.status).toBe('site_fraco');
    expect(preClassificar('linktr.ee/clinica')?.status).toBe('site_fraco');
    expect(preClassificar('https://wa.me/5517999999999')?.status).toBe('site_fraco');
    expect(preClassificar('https://www.ifood.com.br/delivery/x')?.status).toBe('site_fraco');
    expect(preClassificar('https://clinicasorriso.com.br')).toBeNull();
  });
  it('hostFraco não confunde domínios parecidos', () => {
    expect(hostFraco('box.com')).toBe(false);
    expect(hostFraco('m.facebook.com')).toBe(true);
  });
  it('site ok: https + viewport + título + tamanho', () => {
    const r = classificarResposta('https://a.com.br', { status: 200, urlFinal: 'https://a.com.br/', html: htmlBom, tempoMs: 300 });
    expect(r.status).toBe('site_ok');
    expect(r.detalhe.viewport).toBe(true);
    expect(r.detalhe.titulo).toBe('Clínica Sorriso');
  });
  it('http sem redirect para https = fraco', () => {
    const r = classificarResposta('http://a.com.br', { status: 200, urlFinal: 'http://a.com.br/', html: htmlBom, tempoMs: 300 });
    expect(r.status).toBe('site_fraco');
    expect(r.detalhe.motivo).toMatch(/HTTPS/);
  });
  it('sem viewport, pequeno, em construção ou erro = fraco', () => {
    const semViewport = htmlBom.replace(/<meta[^>]+>/, '');
    expect(classificarResposta('https://a.com', { status: 200, urlFinal: 'https://a.com', html: semViewport, tempoMs: 1 }).status).toBe('site_fraco');
    expect(classificarResposta('https://a.com', { status: 200, urlFinal: 'https://a.com', html: '<title>Oi</title><meta name="viewport">', tempoMs: 1 }).status).toBe('site_fraco');
    const construcao = htmlBom.replace('Clínica Sorriso', 'Site em construção');
    expect(classificarResposta('https://a.com', { status: 200, urlFinal: 'https://a.com', html: construcao, tempoMs: 1 }).status).toBe('site_fraco');
    expect(classificarResposta('https://a.com', { status: 500, urlFinal: 'https://a.com', html: '', tempoMs: 1 }).status).toBe('site_fraco');
    expect(classificarFalha('https://a.com', 'The signal has been aborted', 8000).detalhe.motivo).toMatch(/8 segundos/);
  });
});

describe('score', () => {
  it('segue a fórmula', () => {
    const { score, parcelas } = calcularScore({
      status_site: 'sem_site', rating: 4.8, reviews_count: 230, telefone: '+5517999999999', telefone_celular: true, horarios: ['seg'],
    });
    // 40 + 20 + min(20, round(log10(231)*8)=19) + 15 + 5 = 99
    expect(score).toBe(99);
    expect(parcelas).toHaveLength(5);
  });
  it('faixas de nota e limite 100', () => {
    expect(calcularScore({ status_site: 'site_ok', rating: 4.2, reviews_count: 0, telefone: '+551733334444', telefone_celular: false, horarios: null }).score).toBe(5 + 12 + 0 + 5);
    expect(calcularScore({ status_site: 'site_fraco', rating: 3.5, reviews_count: 9, telefone: null, telefone_celular: false, horarios: [] }).score).toBe(30 + 4 + 8);
    expect(calcularScore({ status_site: 'sem_site', rating: 5, reviews_count: 1e9, telefone: '+5517999999999', telefone_celular: true, horarios: ['x'] }).score).toBe(100);
  });
});

describe('descarte', () => {
  const base = { nome: 'Clínica X', status_negocio: 'OPERATIONAL', status_site: 'sem_site' as const, rating: 4.5, reviews_count: 10, telefone: '+5517999999999', telefone_celular: true, horarios: null };
  const cfg = { score_minimo: 50, prospectar_site_ok: false };
  it('motivos', () => {
    expect(motivoDescarte(base, 80, cfg)).toBeNull();
    expect(motivoDescarte({ ...base, status_negocio: 'CLOSED_PERMANENTLY' }, 80, cfg)).toBe('fechado_definitivamente');
    expect(motivoDescarte({ ...base, telefone: null }, 80, cfg)).toBe('sem_telefone');
    expect(motivoDescarte({ ...base, nome: "McDonald's Centro" }, 80, cfg)).toBe('franquia_rede');
    expect(motivoDescarte({ ...base, status_site: 'site_ok' }, 80, cfg)).toBe('ja_tem_site');
    expect(motivoDescarte({ ...base, status_site: 'site_ok' }, 80, { ...cfg, prospectar_site_ok: true })).toBeNull();
    expect(motivoDescarte(base, 40, cfg)).toBe('score_baixo');
  });
  it('franquias sem acento', () => {
    expect(ehFranquia('O Boticário - Shopping')).toBe(true);
    expect(ehFranquia('Padaria do João')).toBe(false);
  });
});
