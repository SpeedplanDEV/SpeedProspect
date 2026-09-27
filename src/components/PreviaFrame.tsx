import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Monitor, RotateCw, Smartphone } from 'lucide-react';

const LARGURA_DESKTOP = 1280;
const LARGURA_CELULAR = 390;

/** Prévia da landing page em iframe, com alternância celular/computador (computador em escala) */
export function PreviaFrame({ src, altura = 620, recarregar = 0 }: { src: string; altura?: number; recarregar?: number }) {
  const [modo, setModo] = useState<'celular' | 'desktop'>('celular');
  const [giro, setGiro] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const caixa = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(600);

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setLargura(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => setCarregando(true), [src, recarregar, giro]);

  const escala = modo === 'desktop' ? Math.min(1, largura / LARGURA_DESKTOP) : 1;
  const larguraFrame = modo === 'desktop' ? LARGURA_DESKTOP : Math.min(LARGURA_CELULAR, largura);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center gap-1">
        <div className="inline-flex rounded-md border border-borda p-0.5" role="group" aria-label="Tamanho da prévia">
          {(['celular', 'desktop'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setModo(m)}
              aria-pressed={modo === m}
              className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs ${modo === m ? 'bg-marca/10 font-medium text-marca' : 'text-suave hover:text-texto'}`}
            >
              {m === 'celular' ? <Smartphone size={13} /> : <Monitor size={13} />}
              {m === 'celular' ? 'Celular' : 'Computador'}
            </button>
          ))}
        </div>
        <button type="button" className="btn-fantasma ml-auto px-2 py-1 text-xs" onClick={() => setGiro((g) => g + 1)} title="Recarregar prévia">
          <RotateCw size={13} /> Recarregar
        </button>
        <a href={src} target="_blank" rel="noopener noreferrer" className="btn-fantasma px-2 py-1 text-xs">
          <ExternalLink size={13} /> Nova aba
        </a>
      </div>
      <div ref={caixa} className="relative flex-1 overflow-hidden rounded-lg border border-borda bg-elevado" style={{ height: altura }}>
        {carregando && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-suave">Carregando prévia…</div>
        )}
        <div
          className={`relative mx-auto h-full ${modo === 'celular' ? 'border-x border-borda bg-white' : ''}`}
          style={{ width: modo === 'desktop' ? LARGURA_DESKTOP * escala : larguraFrame }}
        >
          <iframe
            key={`${src}-${recarregar}-${giro}`}
            src={src}
            title="Prévia da página"
            onLoad={() => setCarregando(false)}
            className="absolute left-0 top-0 origin-top-left border-0 bg-white"
            style={{ width: larguraFrame, height: altura / escala, transform: `scale(${escala})` }}
          />
        </div>
      </div>
    </div>
  );
}
