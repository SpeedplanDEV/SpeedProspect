import { Sparkles } from 'lucide-react';

interface Props {
  empresa: string;
  negocioNome: string;
  negocioWhatsapp: string;
  demo?: boolean;
  aoQuerer?: () => void;
}

export const ALTURA_BARRA = 48;

/** Barra fixa que deixa claro que a página é uma prévia feita pela agência (não é o site oficial da empresa) */
export function BarraPrevia({ empresa, negocioNome, negocioWhatsapp, demo, aoQuerer }: Props) {
  const digitos = negocioWhatsapp.replace(/\D/g, '');
  const texto = `Olá! Vi a prévia do site da ${empresa} e quero colocar no ar`;
  const href = digitos ? `https://wa.me/${digitos}?text=${encodeURIComponent(texto)}` : '';
  return (
    <div
      className="fixed inset-x-0 top-0 z-50 flex items-center justify-between gap-3 bg-[#0b1220] px-3 text-white shadow-[0_4px_20px_rgba(0,0,0,.25)] sm:px-5"
      style={{ height: ALTURA_BARRA, fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' }}
      role="banner"
    >
      <p className="flex min-w-0 items-center gap-2 text-[12.5px] leading-tight sm:text-sm">
        <Sparkles className="h-4 w-4 shrink-0 text-amber-300" aria-hidden />
        {demo ? (
          <span className="truncate">Modelo de demonstração · dados fictícios · {negocioNome}</span>
        ) : (
          <span className="truncate">
            <span className="sm:hidden">Prévia para </span>
            <span className="hidden sm:inline">Prévia criada especialmente para </span>
            <strong className="font-[700]">{empresa}</strong>
            <span className="hidden md:inline"> por {negocioNome}</span>
          </span>
        )}
      </p>
      {!demo && href && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={aoQuerer}
          className="shrink-0 rounded-full bg-[#25d366] px-3.5 py-1.5 text-[12.5px] font-[700] text-[#062b14] transition hover:brightness-110 sm:px-4 sm:text-sm"
        >
          Quero esse site
        </a>
      )}
    </div>
  );
}
