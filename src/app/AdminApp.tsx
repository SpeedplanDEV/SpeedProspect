import { lazy, useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, RotaProtegida } from './auth';
import { TemaProvider } from './tema';
import { ToastProvider } from '@/components/ui/Toast';
import Layout from './Layout';
import '@/index.css';

const Login = lazy(() => import('@/pages/Login'));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Campanhas = lazy(() => import('@/pages/Campanhas'));
const Configuracoes = lazy(() => import('@/pages/Configuracoes'));
const Execucoes = lazy(() => import('@/pages/Execucoes'));
const Leads = lazy(() => import('@/pages/Leads'));
const Aprovacao = lazy(() => import('@/pages/Aprovacao'));
const Envios = lazy(() => import('@/pages/Envios'));
const Funil = lazy(() => import('@/pages/Funil'));

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } },
});

const FONTE_PAINEL = 'https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500&display=swap';

/** Painel administrativo (carregado só fora das rotas públicas) */
export default function AdminApp() {
  useEffect(() => {
    if (document.head.querySelector(`link[href="${FONTE_PAINEL}"]`)) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = FONTE_PAINEL;
    document.head.appendChild(l);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TemaProvider>
        <AuthProvider>
          <ToastProvider>
            <Routes>
              <Route path="login" element={<Login />} />
              <Route
                element={
                  <RotaProtegida>
                    <Layout />
                  </RotaProtegida>
                }
              >
                <Route index element={<Dashboard />} />
                <Route path="campanhas" element={<Campanhas />} />
                <Route path="leads" element={<Leads />} />
                <Route path="aprovacao" element={<Aprovacao />} />
                <Route path="envios" element={<Envios />} />
                <Route path="funil" element={<Funil />} />
                <Route path="execucoes" element={<Execucoes />} />
                <Route path="configuracoes" element={<Configuracoes />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </ToastProvider>
        </AuthProvider>
      </TemaProvider>
    </QueryClientProvider>
  );
}
