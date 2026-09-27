import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

// Code-splitting: as páginas públicas (prévia, opt-out, demonstração) não carregam o painel nem o supabase-js
const PaginaPrevia = lazy(() => import('@/public-site/PaginaPrevia'));
const PaginaOptout = lazy(() => import('@/public-site/PaginaOptout'));
const PaginaDemo = lazy(() => import('@/public-site/PaginaDemo'));
const AdminApp = lazy(() => import('./AdminApp'));

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/p/:slug" element={<PaginaPrevia />} />
          <Route path="/optout/:token" element={<PaginaOptout />} />
          <Route path="/demo/:nicho?" element={<PaginaDemo />} />
          <Route path="/*" element={<AdminApp />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
