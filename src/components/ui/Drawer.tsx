import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface Props {
  aberto: boolean;
  aoFechar: () => void;
  titulo: ReactNode;
  children: ReactNode;
  rodape?: ReactNode;
  largura?: string;
}

/** Painel lateral deslizante (drawer) */
export function Drawer({ aberto, aoFechar, titulo, children, rodape, largura = 'max-w-xl' }: Props) {
  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar();
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aberto, aoFechar]);

  if (!aberto) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={aoFechar} />
      <div role="dialog" aria-modal className={`relative flex h-full w-full ${largura} flex-col border-l border-borda bg-superficie shadow-xl`}>
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-borda px-5">
          <div className="text-[15px] font-medium">{titulo}</div>
          <button onClick={aoFechar} className="btn-fantasma p-1.5" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {rodape && <div className="flex shrink-0 justify-end gap-2 border-t border-borda px-5 py-3">{rodape}</div>}
      </div>
    </div>
  );
}
