// Formatadores pt-BR usados em todo o painel

const moedaFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const numeroFmt = new Intl.NumberFormat('pt-BR');

function paraData(valor: string | Date | null | undefined): Date | null {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

const dois = (n: number) => String(n).padStart(2, '0');

/** dd/MM/yyyy */
export function formatarData(valor: string | Date | null | undefined): string {
  const d = paraData(valor);
  if (!d) return '—';
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** dd/MM/yyyy HH:mm */
export function formatarDataHora(valor: string | Date | null | undefined): string {
  const d = paraData(valor);
  if (!d) return '—';
  return `${formatarData(d)} ${dois(d.getHours())}:${dois(d.getMinutes())}`;
}

/** R$ 1.234,56 (casas decimais configuráveis para custos pequenos, ex.: R$ 0,0123) */
export function formatarMoeda(valor: number | string | null | undefined, casas = 2): string {
  const n = Number(valor ?? 0);
  if (casas === 2) return moedaFmt.format(n);
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  }).format(n);
}

/** 1.234 / 1.234,5 */
export function formatarNumero(valor: number | string | null | undefined, casas?: number): string {
  const n = Number(valor ?? 0);
  if (casas === undefined) return numeroFmt.format(n);
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }).format(n);
}

/** Duração entre duas datas: "850 ms", "12 s", "3 min 20 s" */
export function formatarDuracao(inicio: string | Date | null | undefined, fim: string | Date | null | undefined): string {
  const a = paraData(inicio);
  const b = paraData(fim);
  if (!a || !b) return '—';
  const ms = b.getTime() - a.getTime();
  if (ms < 1000) return `${ms} ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const min = Math.floor(s / 60);
  return `${min} min ${s % 60} s`;
}

/** Apenas dígitos */
export function somenteDigitos(valor: string | null | undefined): string {
  return (valor ?? '').replace(/\D/g, '');
}

/**
 * Formata telefone brasileiro para exibição: (17) 99999-9999 / (17) 3333-4444.
 * Aceita E.164 (+5517999999999) ou número nacional.
 */
export function formatarTelefone(valor: string | null | undefined): string {
  if (!valor) return '—';
  let d = somenteDigitos(valor);
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.startsWith('0')) d = d.replace(/^0+/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return valor;
}

/** Converte para E.164 (+55DDDNÚMERO). Retorna null se não for um número BR válido. */
export function paraE164(valor: string | null | undefined): string | null {
  let d = somenteDigitos(valor);
  if (!d) return null;
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
  d = d.replace(/^0+/, '');
  if (d.length !== 10 && d.length !== 11) return null;
  return `+55${d}`;
}
