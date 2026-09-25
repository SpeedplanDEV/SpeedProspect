import { Pagina } from '@/components/ui/Pagina';

export default function EmBreve({ titulo, fase }: { titulo: string; fase: number }) {
  return (
    <Pagina titulo={titulo}>
      <div className="card px-6 py-12 text-center text-sm text-suave">
        Esta página será entregue na Fase {fase}.
      </div>
    </Pagina>
  );
}
