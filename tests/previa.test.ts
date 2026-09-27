import { describe, expect, it } from 'vitest';
import {
  ajustarConteudoIA, avaliacoesBoas, fraseProvaSocial, gerarSlugBase, horariosDoGoogle, montarConteudoLP,
  proximoSlugLivre, telefoneExibicao, truncarPalavra, type LeadParaPrevia,
} from '../supabase/functions/_shared/previa';
import { ConteudoIASchema, ConteudoLPSchema, INPUT_SCHEMA_TOOL } from '../supabase/functions/_shared/schemas';

const lead: LeadParaPrevia = {
  id: 'l1', nome: 'Clínica Sorriso & Cia', nicho: 'saude', cidade: 'São José do Rio Preto', bairro: 'Jardim América',
  endereco: 'Rua A, 100', telefone: '+5517999999999', telefone_celular: true, google_maps_url: 'https://maps.google.com/?cid=1',
  rating: 4.8, reviews_count: 231, tipos: ['dentist'], tipo_principal: 'dentist',
  horarios: ['segunda-feira: 08:00–18:00', 'sábado: 08:00–12:00', 'domingo: Fechado'],
  avaliacoes: [
    { autor: 'Maria', nota: 5, texto: 'Atendimento excelente, muito cuidadosos comigo.', data: 'há 2 meses' },
    { autor: 'João', nota: 3, texto: 'Demorou um pouco mas foi ok no geral.', data: 'há 1 mês' },
    { autor: 'Ana', nota: 4, texto: 'Ok', data: 'há 1 ano' },
  ],
  fotos: [{ name: 'places/x/photos/y' }], status_site: 'sem_site',
};

const iaValida = {
  tagline: 'Cuidado odontológico no Jardim América',
  hero: { titulo: 'Seu sorriso bem cuidado no Jardim América', subtitulo: 'Atendimento atencioso com nota 4,8 no Google.', cta_primario: 'Agendar pelo WhatsApp', cta_secundario: 'Ver serviços' },
  servicos: Array.from({ length: 5 }, (_, i) => ({ titulo: `Serviço ${i}`, descricao: 'Descrição do serviço.', icone: 'smile' })),
  diferenciais: Array.from({ length: 3 }, (_, i) => ({ titulo: `Diferencial ${i}`, descricao: 'Texto.' })),
  depoimentos: [{ indice_avaliacao: 0, texto: 'Atendimento excelente e cuidadoso.' }, { indice_avaliacao: 1, texto: 'Inventado a partir de nota 3' }],
  faq: Array.from({ length: 3 }, (_, i) => ({ pergunta: `Pergunta ${i}?`, resposta: 'Resposta.' })),
  cta_final: { titulo: 'Agende sua consulta', texto: 'Fale com a gente pelo WhatsApp.', botao: 'Chamar no WhatsApp' },
  seo: { title: 'Clínica Sorriso | Rio Preto', description: 'Clínica odontológica no Jardim América.' },
  tema: { cor_primaria: '#0F766E', estilo: 'clean' },
};

describe('slug', () => {
  it('normaliza nome + bairro', () => {
    expect(gerarSlugBase('Clínica Sorriso & Cia', 'Jardim América')).toBe('clinica-sorriso-e-cia-jardim-america');
    expect(gerarSlugBase('!!!', null)).toBe('previa');
    expect(gerarSlugBase('A'.repeat(90), null).length).toBeLessThanOrEqual(60);
  });
  it('sufixo numérico quando colide', () => {
    expect(proximoSlugLivre('x', [])).toBe('x');
    expect(proximoSlugLivre('x', ['x', 'x-2'])).toBe('x-3');
  });
});

describe('dados factuais', () => {
  it('horários do Google', () => {
    expect(horariosDoGoogle(lead.horarios)).toEqual([
      { dia: 'Segunda', horario: '08:00–18:00' },
      { dia: 'Sábado', horario: '08:00–12:00' },
      { dia: 'Domingo', horario: 'Fechado' },
    ]);
    expect(horariosDoGoogle(['sexta-feira: Atendimento 24 horas'])[0].horario).toBe('Aberto 24 horas');
  });
  it('frase de prova social nunca aumenta números', () => {
    expect(fraseProvaSocial(4.8, 231)).toBe('Nota 4,8 no Google com mais de 230 avaliações');
    expect(fraseProvaSocial(4.5, 2759)).toBe('Nota 4,5 no Google com mais de 2.700 avaliações');
    expect(fraseProvaSocial(5, 8)).toBe('Nota 5,0 no Google com 8 avaliações');
    expect(fraseProvaSocial(4.2, 250)).toBe('Nota 4,2 no Google com 250 avaliações');
    expect(fraseProvaSocial(null, 10)).toBe('');
  });
  it('telefone e avaliações boas', () => {
    expect(telefoneExibicao('+5517999999999')).toBe('(17) 99999-9999');
    expect(avaliacoesBoas(lead.avaliacoes).map((a) => a.indice)).toEqual([0]);
  });
});

describe('conteúdo da IA', () => {
  it('JSON Schema da tool: todo objeto fechado e com required', () => {
    const verificar = (s: Record<string, unknown>) => {
      if (s.type === 'object') {
        expect(s.additionalProperties).toBe(false);
        expect(s.required).toEqual(Object.keys(s.properties as object));
        Object.values(s.properties as object).forEach(verificar);
      }
      if (s.type === 'array') verificar(s.items as Record<string, unknown>);
    };
    verificar(INPUT_SCHEMA_TOOL as Record<string, unknown>);
  });
  it('valida conteúdo correto e rejeita faltas', () => {
    expect(ConteudoIASchema.safeParse(iaValida).success).toBe(true);
    const r = ConteudoIASchema.safeParse({ ...iaValida, servicos: iaValida.servicos.slice(0, 2) });
    expect(r.success).toBe(false);
    expect(ConteudoIASchema.safeParse({ ...iaValida, hero: { ...iaValida.hero, titulo: 'x'.repeat(80) } }).success).toBe(false);
  });
  it('ajustes: corta excesso de itens e, na última tentativa, textos longos', () => {
    const muitos = { ...iaValida, servicos: Array.from({ length: 9 }, () => iaValida.servicos[0]), hero: { ...iaValida.hero, titulo: 'palavra '.repeat(15) } };
    const semTruncar = ajustarConteudoIA(muitos) as typeof iaValida;
    expect(semTruncar.servicos).toHaveLength(6);
    expect(ConteudoIASchema.safeParse(semTruncar).success).toBe(false);
    const truncado = ajustarConteudoIA(muitos, true) as typeof iaValida;
    expect(truncado.hero.titulo.length).toBeLessThanOrEqual(60);
    expect(ConteudoIASchema.safeParse(truncado).success).toBe(true);
    expect(truncarPalavra('um dois três quatro', 9)).toBe('um dois');
  });
  it('monta o ConteudoLP só com fatos reais', () => {
    const ia = ConteudoIASchema.parse(iaValida);
    const { conteudo, avisos } = montarConteudoLP(lead, ia);
    expect(conteudo.empresa.nome).toBe(lead.nome);
    expect(conteudo.empresa.whatsapp_e164).toBe('+5517999999999');
    expect(conteudo.depoimentos).toEqual([{ autor: 'Maria', nota: 5, texto: 'Atendimento excelente e cuidadoso.', data: 'há 2 meses' }]);
    expect(avisos.some((a) => a.includes('avaliação 1'))).toBe(true);
    expect(conteudo.tema.cor_primaria).toBe('#0f766e');
    expect(conteudo.prova_social).toEqual({ rating: 4.8, reviews_count: 231, frase: 'Nota 4,8 no Google com mais de 230 avaliações' });
    expect(ConteudoLPSchema.safeParse(conteudo).success).toBe(true);
  });
  it('cor inválida ou clara demais cai na cor do nicho', () => {
    const ia = ConteudoIASchema.parse({ ...iaValida, tema: { cor_primaria: '#fafafa', estilo: 'bold' } });
    expect(montarConteudoLP(lead, ia).conteudo.tema.cor_primaria).toBe('#0f766e');
    const ia2 = ConteudoIASchema.parse({ ...iaValida, tema: { cor_primaria: 'azul', estilo: 'bold' } });
    expect(montarConteudoLP({ ...lead, nicho: 'beleza' }, ia2).conteudo.tema.cor_primaria).toBe('#9f4a67');
  });
});
