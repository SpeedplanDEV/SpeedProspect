import { Star } from 'lucide-react';

export function Estrelas({ nota, className = 'h-4 w-4', cor = '#f59e0b' }: { nota: number; className?: string; cor?: string }) {
  const cheias = Math.round(nota);
  return (
    <span role="img" className="inline-flex items-center gap-0.5" aria-label={`Nota ${nota.toFixed(1).replace('.', ',')} de 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className={className} fill={i < cheias ? cor : 'transparent'} stroke={cor} strokeWidth={1.5} aria-hidden />
      ))}
    </span>
  );
}
