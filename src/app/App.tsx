import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, RotaProtegida } from './auth';
import { TemaProvider } from './tema';
import { ToastProvider } from '@/components/ui/Toast';
import Layout from './Layout';

// Code-splitting: a prévia pública não carrega o bundle do painel (e vice-versa)
const Login = lazy(() => import('@/pages/Login'));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Campanhas = lazy(() => import('@/pages/Campanhas'));
const Configuracoes = lazy(() => import('@/pages/Configuracoes'));
const Execucoes = lazy(() => import('@/pages/Execucoes'));
const EmBreve = lazy(() => import('@/pages/EmBreve'));
const PaginaPrevia = lazy(() => import('@/public-site/PaginaPrevia'));
const PaginaOptout = lazy(() => import('@/public-site/PaginaOptout'));

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={null}>
        <Routes>
          {/* Rotas públicas — sem layout admin e sem tema do painel */}
          <Route path="/p/:slug" element={<PaginaPrevia />} />
          <Route path="/optout/:token" element={<PaginaOptout />} />

          {/* Painel */}
          <Route
            path="/*"
            element={
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
                        <Route path="leads" element={<EmBreve titulo="Leads" fase={2} />} />
                        <Route path="aprovacao" element={<EmBreve titulo="Aprovação" fase={5} />} />
                        <Route path="envios" element={<EmBreve titulo="Envios" fase={5} />} />
                        <Route path="funil" element={<EmBreve titulo="Funil" fase={6} />} />
                        <Route path="execucoes" element={<Execucoes />} />
                        <Route path="configuracoes" element={<Configuracoes />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                      </Route>
                    </Routes>
                  </ToastProvider>
                </AuthProvider>
              </TemaProvider>
            }
          />
        </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
