import { useParams } from 'react-router-dom';

// Rota pública da prévia. Renderização dos templates por nicho chega na Fase 4.
export default function PaginaPrevia() {
  const { slug } = useParams();
  return (
    <div className="flex min-h-screen items-center justify-center bg-white p-6 text-center text-slate-600">
      <p>Prévia “{slug}” em preparação.</p>
    </div>
  );
}
