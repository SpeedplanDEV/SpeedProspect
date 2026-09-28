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
    // Trava a rolagem da página por trás (principalmente no celular)
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', aoTeclar);
      document.body.style.overflow = antes;
    };
  }, [aberto, aoFechar]);

  if (!aberto) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={aoFechar} />
      <div role="dialog" aria-modal className={`relative flex h-[100dvh] w-full ${largura} flex-col border-l border-borda bg-superficie shadow-xl`}>
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-borda px-4 sm:px-5" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="min-w-0 truncate text-[15px] font-medium">{titulo}</div>
          <button onClick={aoFechar} className="btn-fantasma -mr-1 shrink-0 p-1.5" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5">{children}</div>
        {rodape && (
          <div
            className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-borda px-4 py-3 sm:px-5 [&>*]:flex-1 sm:[&>*]:flex-none"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
            {rodape}
          </div>
        )}
      </div>
    </div>
  );
}
