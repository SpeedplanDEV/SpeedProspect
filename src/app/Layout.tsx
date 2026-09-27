import { NavLink, Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity, CheckSquare, Columns3, LayoutDashboard, LayoutTemplate, LogOut, Megaphone, Moon, Send, Settings, Sun,
  SunMoon, Users, Zap,
} from 'lucide-react';
import { useAuth } from './auth';
import { useTema } from './tema';
import { supabase } from '@/lib/supabase';

const ITENS = [
  { para: '/', rotulo: 'Dashboard', icone: LayoutDashboard, fim: true },
  { para: '/campanhas', rotulo: 'Campanhas', icone: Megaphone },
  { para: '/leads', rotulo: 'Leads', icone: Users },
  { para: '/aprovacao', rotulo: 'Aprovação', icone: CheckSquare, contador: 'aprovacao' },
  { para: '/envios', rotulo: 'Envios', icone: Send, contador: 'envios' },
  { para: '/funil', rotulo: 'Funil', icone: Columns3 },
  { para: '/execucoes', rotulo: 'Execuções', icone: Activity },
  { para: '/configuracoes', rotulo: 'Configurações', icone: Settings },
];

/** Pendências mostradas no menu: prévias para aprovar e mensagens na fila de hoje */
function useContadores() {
  return useQuery({
    queryKey: ['contadores'],
    refetchInterval: 60_000,
    queryFn: async () => {
      const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
      const [aprovacao, envios] = await Promise.all([
        supabase.from('leads').select('id', { count: 'exact', head: true }).eq('status_funil', 'previa_gerada'),
        supabase
          .from('mensagens')
          .select('id, lead:leads!inner(id)', { count: 'exact', head: true })
          .eq('status', 'pendente')
          .lte('agendada_para', hoje)
          .not('lead.status_funil', 'in', '(nao_contatar,descartado,perdido)'),
      ]);
      return { aprovacao: aprovacao.count ?? 0, envios: envios.count ?? 0 } as Record<string, number>;
    },
  });
}

const ROTULO_TEMA = { light: 'Claro', dark: 'Escuro', night: 'Noite' } as const;
const ICONE_TEMA = { light: Sun, dark: Moon, night: SunMoon } as const;

export default function Layout() {
  const { sessao, sair } = useAuth();
  const { tema, alternar } = useTema();
  const IconeTema = ICONE_TEMA[tema];
  const { data: contadores } = useContadores();

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 flex w-56 flex-col border-r border-borda bg-superficie">
        <div className="flex h-14 items-center gap-2 border-b border-borda px-4">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-marca text-white">
            <Zap size={16} />
          </span>
          <span className="text-[15px] font-medium">SpeedProspect</span>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {ITENS.map(({ para, rotulo, icone: Icone, fim, contador }) => (
            <NavLink
              key={para}
              to={para}
              end={fim}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                  isActive ? 'bg-marca/10 font-medium text-marca' : 'text-suave hover:bg-elevado hover:text-texto'
                }`
              }
            >
              <Icone size={16} />
              {rotulo}
              {contador && !!contadores?.[contador] && (
                <span className="ml-auto rounded-full bg-marca px-1.5 py-px text-[11px] font-medium tabular-nums text-white">
                  {contadores[contador]}
                </span>
              )}
            </NavLink>
          ))}
          <a href="/demo/saude" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-suave transition-colors hover:bg-elevado hover:text-texto">
            <LayoutTemplate size={16} />
            Modelos de página
          </a>
        </nav>
        <div className="space-y-1 border-t border-borda p-2">
          <button onClick={alternar} className="btn-fantasma w-full justify-start" title="Alternar tema">
            <IconeTema size={16} /> Tema: {ROTULO_TEMA[tema]}
          </button>
          <div className="truncate px-3 py-1 text-xs text-fraco" title={sessao?.user.email}>
            {sessao?.user.email}
          </div>
          <button onClick={sair} className="btn-fantasma w-full justify-start">
            <LogOut size={16} /> Sair
          </button>
        </div>
      </aside>
      <main className="ml-56 min-h-screen">
        <Outlet />
      </main>
    </div>
  );
}
