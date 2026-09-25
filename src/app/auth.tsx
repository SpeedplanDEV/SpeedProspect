import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Navigate, useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

interface AuthCtx {
  sessao: Session | null;
  carregando: boolean;
  sair: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => setSessao(data.session))
      .finally(() => setCarregando(false));
    const { data } = supabase.auth.onAuthStateChange((_evento, s) => setSessao(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const sair = async () => {
    await supabase.auth.signOut();
  };

  return <Ctx.Provider value={{ sessao, carregando, sair }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth fora do AuthProvider');
  return c;
}

/** Bloqueia rotas do painel para quem não está logado */
export function RotaProtegida({ children }: { children: ReactNode }) {
  const { sessao, carregando } = useAuth();
  const local = useLocation();
  if (carregando) {
    return <div className="flex h-screen items-center justify-center text-sm text-suave">Carregando…</div>;
  }
  if (!sessao) return <Navigate to="/login" replace state={{ de: local.pathname }} />;
  return <>{children}</>;
}
