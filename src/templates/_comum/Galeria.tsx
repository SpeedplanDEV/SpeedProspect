import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Foto } from './Foto';

interface Props {
  fotos: string[];
  nome: string;
  cor: string;
  raio?: string;
  titulo?: string;
  escuro?: boolean;
  estiloTitulo?: CSSProperties;
}

/** Galeria com as fotos reais do Google e visualização ampliada (lightbox) */
export function Galeria({ fotos, nome, cor, raio = 'rounded-2xl', titulo = 'Conheça o espaço', escuro, estiloTitulo }: Props) {
  const [aberta, setAberta] = useState<number | null>(null);
  const fechar = useCallback(() => setAberta(null), []);
  const mover = useCallback((d: number) => setAberta((i) => (i == null ? i : (i + d + fotos.length) % fotos.length)), [fotos.length]);

  useEffect(() => {
    if (aberta == null) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fechar();
      if (e.key === 'ArrowRight') mover(1);
      if (e.key === 'ArrowLeft') mover(-1);
    };
    window.addEventListener('keydown', tecla);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', tecla);
      document.body.style.overflow = '';
    };
  }, [aberta, fechar, mover]);

  if (fotos.length < 2) return null;
  const lista = fotos.slice(0, 10);

  return (
    <section aria-label="Galeria de fotos" className="px-5 py-16">
      <div className="mx-auto max-w-6xl">
        <h2 className={`text-center text-3xl leading-tight sm:text-4xl ${escuro ? 'text-white' : 'text-slate-900'}`} style={{ fontWeight: 700, ...estiloTitulo }}>{titulo}</h2>
        <div className="mt-10 grid auto-rows-[150px] grid-cols-2 gap-3 sm:auto-rows-[190px] md:grid-cols-4">
          {lista.map((f, i) => (
            <button
              key={f}
              type="button"
              onClick={() => setAberta(i)}
              aria-label={`Ampliar foto ${i + 1} de ${nome}`}
              className={`group relative overflow-hidden ${raio} ${i === 0 ? 'col-span-2 row-span-2' : ''}`}
            >
              <Foto src={f} alt={`Foto ${i + 1} de ${nome}`} cor={cor} className="h-full w-full transition duration-500 group-hover:scale-105" />
            </button>
          ))}
        </div>
      </div>

      {aberta != null && (
        <div role="dialog" aria-modal aria-label="Foto ampliada" className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4" onClick={fechar}>
          <img src={lista[aberta]} alt={`Foto ${aberta + 1} de ${nome}`} className="max-h-[85vh] max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
          <button type="button" onClick={fechar} aria-label="Fechar" className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"><X className="h-6 w-6" /></button>
          <button type="button" onClick={(e) => { e.stopPropagation(); mover(-1); }} aria-label="Foto anterior" className="absolute left-3 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"><ChevronLeft className="h-7 w-7" /></button>
          <button type="button" onClick={(e) => { e.stopPropagation(); mover(1); }} aria-label="Próxima foto" className="absolute right-3 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"><ChevronRight className="h-7 w-7" /></button>
          <span className="absolute bottom-4 text-sm text-white/70">{aberta + 1} / {lista.length}</span>
        </div>
      )}
    </section>
  );
}
