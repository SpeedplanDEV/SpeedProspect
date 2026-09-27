// Rate limit simples em memória por IP (por instância da Edge Function)
const janelas = new Map<string, { inicio: number; n: number }>();

export function ipDe(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('cf-connecting-ip') || 'desconhecido';
}

/** true quando o IP passou de `limite` requisições no último minuto */
export function excedeuLimite(ip: string, limite = 60): boolean {
  const agora = Date.now();
  const j = janelas.get(ip);
  if (!j || agora - j.inicio > 60_000) {
    if (janelas.size > 10_000) janelas.clear();
    janelas.set(ip, { inicio: agora, n: 1 });
    return false;
  }
  j.n++;
  return j.n > limite;
}
