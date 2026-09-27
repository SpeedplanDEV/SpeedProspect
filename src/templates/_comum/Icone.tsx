import {
  Calendar, Car, Check, Clock, Coffee, Droplet, Hammer, Heart, Home, Leaf, MapPin, Phone, Scissors, Shield, Smile,
  Sparkles, Star, Stethoscope, Truck, Utensils, Wrench, Zap, type LucideProps,
} from 'lucide-react';
import type { ComponentType } from 'react';
import type { IconeLP } from '../types';

const MAPA: Record<IconeLP, ComponentType<LucideProps>> = {
  stethoscope: Stethoscope, utensils: Utensils, wrench: Wrench, scissors: Scissors, hammer: Hammer, sparkles: Sparkles,
  shield: Shield, clock: Clock, 'map-pin': MapPin, star: Star, heart: Heart, smile: Smile, car: Car, coffee: Coffee,
  truck: Truck, check: Check, phone: Phone, calendar: Calendar, zap: Zap, droplet: Droplet, leaf: Leaf, home: Home,
};

export function Icone({ nome, ...props }: { nome: string } & LucideProps) {
  const C = MAPA[nome as IconeLP] ?? Sparkles;
  return <C aria-hidden {...props} />;
}

/** Ícone oficial do WhatsApp (SVG leve, sem dependência) */
export function IconeWhatsApp({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.21 3.08.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35M12.05 21.5h-.01a9.43 9.43 0 0 1-4.8-1.32l-.35-.2-3.57.93.96-3.48-.23-.36a9.4 9.4 0 0 1-1.44-5.03c0-5.2 4.24-9.44 9.45-9.44 2.52 0 4.9.99 6.68 2.77a9.37 9.37 0 0 1 2.76 6.68c0 5.21-4.24 9.45-9.45 9.45m8.04-17.49A11.3 11.3 0 0 0 12.04.7C5.78.7.68 5.8.68 12.06c0 2 .52 3.96 1.52 5.68L.58 23.7l6.1-1.6a11.33 11.33 0 0 0 5.37 1.37h.01c6.26 0 11.36-5.1 11.36-11.36 0-3.04-1.18-5.89-3.33-8.03" />
    </svg>
  );
}
