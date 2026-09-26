// Funções puras de normalização (sem dependências do Deno — testadas com Vitest)

/** Apenas dígitos */
export function somenteDigitos(v: string | null | undefined): string {
  return (v ?? '').replace(/\D/g, '');
}

// DDDs válidos no Brasil
const DDDS = new Set(
  ('11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 ' +
    '51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99')
    .split(' '),
);

/**
 * Normaliza telefone brasileiro para E.164 (+55DDDNÚMERO).
 * Aceita "+55 17 99999-9999", "(17) 99999-9999", "017 3333-4444", "5517999999999".
 * Retorna null quando não é possível obter DDD + número (10 ou 11 dígitos).
 */
export function telefoneE164(v: string | null | undefined): string | null {
  let d = somenteDigitos(v);
  if (!d) return null;
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
  d = d.replace(/^0+/, '');
  // Remove código de operadora em números como 0 15 17 99999-9999
  if (d.length === 13 && /^\d{2}[1-9]{2}9/.test(d)) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  if (!DDDS.has(d.slice(0, 2))) return null; // descarta 0800, 0300 etc.
  return `+55${d}`;
}

/** Celular = número local com 9 dígitos começando com 9 */
export function ehCelular(e164: string | null | undefined): boolean {
  if (!e164) return false;
  const local = somenteDigitos(e164).replace(/^55/, '').slice(2);
  return local.length === 9 && local.startsWith('9');
}

/** Minúsculas e sem acentos, para comparar nomes de cidades */
export function semAcento(v: string | null | undefined): string {
  return (v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export interface ComponenteEndereco {
  longText?: string;
  shortText?: string;
  types?: string[];
}

/** Bairro a partir de addressComponents (sublocality_level_1 ou sublocality) */
export function extrairBairro(componentes: ComponenteEndereco[] | undefined): string | null {
  if (!componentes?.length) return null;
  const c =
    componentes.find((x) => x.types?.includes('sublocality_level_1')) ??
    componentes.find((x) => x.types?.includes('sublocality'));
  return c?.longText?.trim() || null;
}

/** Cidade a partir de addressComponents (no Brasil costuma vir em administrative_area_level_2) */
export function extrairCidade(componentes: ComponenteEndereco[] | undefined): string | null {
  if (!componentes?.length) return null;
  const c =
    componentes.find((x) => x.types?.includes('locality')) ??
    componentes.find((x) => x.types?.includes('administrative_area_level_2'));
  return c?.longText?.trim() || null;
}

/** Consultas de uma campanha: "termo em cidade - UF" e, por bairro, "termo bairro cidade - UF" */
export function montarConsultas(c: { termos_busca: string[]; bairros: string[]; cidade: string; uf: string }): string[] {
  const out: string[] = [];
  for (const termo of c.termos_busca) {
    const t = termo.trim();
    if (!t) continue;
    out.push(`${t} em ${c.cidade} - ${c.uf}`);
    for (const b of c.bairros) {
      if (b.trim()) out.push(`${t} ${b.trim()} ${c.cidade} - ${c.uf}`);
    }
  }
  return [...new Set(out)];
}
