import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type Tema = 'light' | 'dark' | 'night';
export const TEMAS: Tema[] = ['light', 'dark', 'night'];
const CHAVE = 'sp-tema';

interface TemaCtx {
  tema: Tema;
  setTema: (t: Tema) => void;
  alternar: () => void;
}

const Ctx = createContext<TemaCtx | null>(null);

function temaInicial(): Tema {
  try {
    const salvo = localStorage.getItem(CHAVE);
    if (salvo === 'light' || salvo === 'dark' || salvo === 'night') return salvo;
  } catch {
    /* armazenamento indisponível */
  }
  return 'light';
}

export function TemaProvider({ children }: { children: ReactNode }) {
  const [tema, setTemaEstado] = useState<Tema>(temaInicial);

  useEffect(() => {
    const raiz = document.documentElement;
    if (tema === 'light') delete raiz.dataset.tema;
    else raiz.dataset.tema = tema;
    try {
      localStorage.setItem(CHAVE, tema);
    } catch {
      /* ignora */
    }
  }, [tema]);

  const alternar = useCallback(() => {
    setTemaEstado((t) => TEMAS[(TEMAS.indexOf(t) + 1) % TEMAS.length]);
  }, []);

  return <Ctx.Provider value={{ tema, setTema: setTemaEstado, alternar }}>{children}</Ctx.Provider>;
}

export function useTema() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useTema fora do TemaProvider');
  return c;
}
