import { ROTULO_DESCARTE } from '@shared/qualificacao';

export { calcularScore, ROTULO_DESCARTE } from '@shared/qualificacao';

/** Texto legível do detalhe da checagem do site (tooltip da tabela) */
export function resumoDetalheSite(d: Record<string, unknown> | null): string | undefined {
  if (!d) return undefined;
  const partes = [String(d.motivo ?? '')];
  if (d.host) partes.push(`Host: ${d.host}`);
  if (d.status_http != null) partes.push(`HTTP ${d.status_http}${d.tempo_ms != null ? ` em ${d.tempo_ms} ms` : ''}`);
  if (d.status_http != null) partes.push(`HTTPS: ${d.https ? 'sim' : 'não'} · Celular (viewport): ${d.viewport ? 'sim' : 'não'}`);
  if (d.titulo) partes.push(`Título: ${d.titulo}`);
  return partes.filter(Boolean).join('\n');
}

export const rotuloDescarte = (m: string | null) => (m ? ROTULO_DESCARTE[m] ?? m : null);
