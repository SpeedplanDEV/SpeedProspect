import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { formatarNumero } from '@/lib/format';
import { Pagina } from '@/components/ui/Pagina';

// Versão inicial: contadores simples. O dashboard completo (funil, custos, gráficos) chega na Fase 6.
async function contar(tabela: string, filtro?: (q: ReturnType<typeof base>) => ReturnType<typeof base>) {
  let q = base(tabela);
  if (filtro) q = filtro(q);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}
const base = (tabela: string) => supabase.from(tabela).select('*', { count: 'exact', head: true });

export default function Dashboard() {
  const { data } = useQuery({
    queryKey: ['dashboard-basico'],
    queryFn: async () => {
      const [campanhasAtivas, leads, execucoesErro] = await Promise.all([
        contar('campanhas', (q) => q.eq('ativa', true)),
        contar('leads'),
        contar('execucoes', (q) => q.eq('sucesso', false)),
      ]);
      return { campanhasAtivas, leads, execucoesErro };
    },
  });

  const cards = [
    { rotulo: 'Campanhas ativas', valor: data?.campanhasAtivas, link: '/campanhas' },
    { rotulo: 'Leads na base', valor: data?.leads, link: '/leads' },
    { rotulo: 'Execuções com erro', valor: data?.execucoesErro, link: '/execucoes' },
  ];

  return (
    <Pagina titulo="Dashboard" descricao="Visão geral da prospecção">
      <div className="grid gap-3 sm:grid-cols-3">
        {cards.map((c) => (
          <Link key={c.rotulo} to={c.link} className="card p-4 hover:border-marca/50">
            <div className="text-xs text-suave">{c.rotulo}</div>
            <div className="mt-1 text-2xl font-medium">{c.valor === undefined ? '—' : formatarNumero(c.valor)}</div>
          </Link>
        ))}
      </div>
    </Pagina>
  );
}
