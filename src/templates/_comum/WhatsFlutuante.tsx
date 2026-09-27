import { Phone } from 'lucide-react';
import { IconeWhatsApp } from './Icone';

interface Props {
  href: string;
  tipo: 'whatsapp' | 'telefone';
  aoClicar?: () => void;
  className?: string;
}

/** Botão flutuante de contato (WhatsApp ou telefone) */
export function WhatsFlutuante({ href, tipo, aoClicar, className = '' }: Props) {
  const whats = tipo === 'whatsapp';
  return (
    <a
      href={href}
      target={whats ? '_blank' : undefined}
      rel="noopener noreferrer"
      onClick={aoClicar}
      aria-label={whats ? 'Falar no WhatsApp' : 'Ligar'}
      className={`fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-[0_10px_30px_-5px_rgba(0,0,0,.35)] transition-transform hover:scale-105 active:scale-95 ${className}`}
      style={{ backgroundColor: whats ? '#25d366' : '#0f172a' }}
    >
      {whats ? <IconeWhatsApp className="h-7 w-7" /> : <Phone className="h-6 w-6" aria-hidden />}
    </a>
  );
}
