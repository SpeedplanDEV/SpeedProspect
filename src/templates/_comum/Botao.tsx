import type { ReactNode } from 'react';
import { Phone } from 'lucide-react';
import { IconeWhatsApp } from './Icone';

interface Props {
  contato: { href: string; tipo: 'whatsapp' | 'telefone' } | null;
  aoContatar?: () => void;
  className: string;
  classeIcone?: string;
  children: ReactNode;
}

/** Link de contato com a empresa (WhatsApp em nova aba ou ligação) */
export function LinkContato({ contato, aoContatar, className, classeIcone = 'h-5 w-5', children }: Props) {
  if (!contato) return null;
  const whats = contato.tipo === 'whatsapp';
  return (
    <a href={contato.href} target={whats ? '_blank' : undefined} rel="noopener noreferrer" onClick={aoContatar} className={className}>
      {whats ? <IconeWhatsApp className={classeIcone} /> : <Phone className={classeIcone} aria-hidden />}
      {children}
    </a>
  );
}
