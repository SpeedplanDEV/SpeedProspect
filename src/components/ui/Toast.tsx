import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';

type Tipo = 'sucesso' | 'erro';
interface Aviso { id: number; tipo: Tipo; texto: string }

const Ctx = createContext<(texto: string, tipo?: Tipo) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);

  const mostrar = useCallback((texto: string, tipo: Tipo = 'sucesso') => {
    const id = Date.now() + Math.random();
    setAvisos((a) => [...a, { id, tipo, texto }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), 4000);
  }, []);

  return (
    <Ctx.Provider value={mostrar}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
        {avisos.map((a) => (
          <div
            key={a.id}
            role="status"
            className="pointer-events-auto flex items-center gap-2 rounded-md border border-borda bg-superficie px-4 py-2.5 text-sm shadow-lg"
          >
            {a.tipo === 'sucesso' ? (
              <CheckCircle2 size={16} className="text-emerald-500" />
            ) : (
              <XCircle size={16} className="text-red-500" />
            )}
            {a.texto}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
