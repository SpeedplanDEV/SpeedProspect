import type { CSSProperties } from 'react';
import {
  Car, Coffee, Droplet, Hammer, Heart, Home, Leaf, Scissors, Shield, Smile, Sparkles, Stethoscope, Utensils, Wrench, Zap,
  type LucideIcon,
} from 'lucide-react';
import type { NichoLP } from '../types';

const ICONES: Record<NichoLP, LucideIcon[]> = {
  saude: [Stethoscope, Heart, Smile, Shield],
  alimentacao: [Utensils, Coffee, Leaf, Heart],
  automotivo: [Car, Wrench, Zap, Shield],
  beleza: [Scissors, Sparkles, Heart, Droplet],
  servicos: [Wrench, Hammer, Zap, Home],
};

/** Ilustração vetorial do nicho, usada quando a empresa não tem foto (nada é apresentado como foto real) */
export function Ilustracao({ nicho, cor, className = '', style, rotulo }: { nicho: NichoLP; cor: string; className?: string; style?: CSSProperties; rotulo: string }) {
  const [Principal, A, B, C] = ICONES[nicho] ?? ICONES.servicos;
  return (
    <div
      role="img"
      aria-label={rotulo}
      className={`relative overflow-hidden ${className}`}
      style={{
        ...style,
        backgroundColor: cor,
        backgroundImage: `radial-gradient(circle at 18% 22%, rgba(255,255,255,.28), transparent 42%), radial-gradient(circle at 85% 80%, rgba(0,0,0,.28), transparent 48%), linear-gradient(135deg, rgba(255,255,255,.12), rgba(0,0,0,.18))`,
      }}
    >
      <div className="absolute inset-0 opacity-[.18] [background-image:radial-gradient(white_1.2px,transparent_1.2px)] [background-size:18px_18px]" aria-hidden />
      <div className="absolute -right-10 -top-10 h-44 w-44 rounded-full border-[18px] border-white/10" aria-hidden />
      <div className="absolute -bottom-14 -left-8 h-52 w-52 rounded-full bg-white/10" aria-hidden />
      <div className="absolute inset-0 flex items-center justify-center" aria-hidden>
        <div className="flex h-28 w-28 items-center justify-center rounded-full bg-white/15 ring-8 ring-white/10 backdrop-blur-sm sm:h-32 sm:w-32">
          <Principal className="h-12 w-12 text-white sm:h-14 sm:w-14" strokeWidth={1.4} />
        </div>
      </div>
      <A className="absolute left-[14%] top-[18%] h-7 w-7 rotate-[-12deg] text-white/35" strokeWidth={1.5} aria-hidden />
      <B className="absolute bottom-[18%] right-[16%] h-8 w-8 rotate-[10deg] text-white/35" strokeWidth={1.5} aria-hidden />
      <C className="absolute right-[24%] top-[14%] h-5 w-5 text-white/30" strokeWidth={1.5} aria-hidden />
    </div>
  );
}
