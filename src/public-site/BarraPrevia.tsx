interface Props {
  empresa: string;
  negocioNome: string;
  negocioWhatsapp: string;
  negocioLogo?: string | null;
  demo?: boolean;
  aoQuerer?: () => void;
}

export const ALTURA_BARRA = 48;

/** Barra fixa que deixa claro que a página é uma prévia feita pela agência (não é o site oficial da empresa) */
/** Iniciais do nome da agência (usadas quando não há logo) */
const iniciais = (nome: string) =>
  nome
    .split(/\s+/)
    .filter((p) => p.length > 2 || /^[A-ZÀ-Ú]/.test(p))
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('') || nome.slice(0, 1).toUpperCase();

export function BarraPrevia({ empresa, negocioNome, negocioWhatsapp, negocioLogo, demo, aoQuerer }: Props) {
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
        {negocioLogo ? (
          <span className="flex h-8 shrink-0 items-center rounded-md bg-white px-1.5">
            <img src={negocioLogo} alt={negocioNome} className="h-6 w-auto max-w-[96px] object-contain sm:max-w-[120px]" />
          </span>
        ) : (
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/15 text-[11px] font-[700] tracking-wide"
            aria-hidden
          >
            {iniciais(negocioNome)}
          </span>
        )}
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
