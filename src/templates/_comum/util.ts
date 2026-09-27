import type { ConteudoLP } from '../types';

const digitos = (v: string) => v.replace(/\D/g, '');

export const linkWhatsApp = (e164: string, texto: string) =>
  `https://wa.me/${digitos(e164)}?text=${encodeURIComponent(texto)}`;

/** Contato principal da empresa: WhatsApp (celular) ou telefone (fixo) */
export function contatoEmpresa(c: ConteudoLP): { href: string; tipo: 'whatsapp' | 'telefone' } | null {
  if (c.empresa.whatsapp_e164) {
    return { href: linkWhatsApp(c.empresa.whatsapp_e164, 'Olá! Vi o site e quero mais informações'), tipo: 'whatsapp' };
  }
  const tel = digitos(c.empresa.telefone_exibicao);
  return tel ? { href: `tel:+55${tel}`, tipo: 'telefone' } : null;
}

export const linkTelefone = (c: ConteudoLP) => {
  const tel = digitos(c.empresa.telefone_exibicao);
  return tel ? `tel:+55${tel}` : '';
};

const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const diaDeHoje = () => DIAS_SEMANA[new Date().getDay()];

export const notaBR = (n: number | null) => (n == null ? '' : n.toFixed(1).replace('.', ','));
export const numeroBR = (n: number) => n.toLocaleString('pt-BR');

/** "Rua X, 100 - Bairro, Cidade - SP, 15000-000, Brasil" → sem o ", Brasil" final */
export const enderecoCurto = (e: string) => e.replace(/,\s*Brasil$/i, '');

export const iniciais = (nome: string) =>
  nome
    .replace(/[^\p{L}\s]/gu, ' ')
    .split(/\s+/)
    .filter((p) => p.length > 2)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('') || nome.slice(0, 1).toUpperCase();

export const idSecao = { servicos: 'servicos', avaliacoes: 'avaliacoes', contato: 'contato', faq: 'duvidas' } as const;

/** Colunas da grade de serviços sem "órfãos" (4 itens → 2×2 ou 4 lado a lado) */
export const colunasServicos = (n: number) =>
  n === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : n <= 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3';
