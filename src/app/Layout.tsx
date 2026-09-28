import { Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity, Building2, CheckSquare, Columns3, LayoutDashboard, LayoutTemplate, LogOut, Megaphone, Menu, Moon, Send, Settings,
  Sun, SunMoon, Users, X, Zap,
} from 'lucide-react';
import { useAuth } from './auth';
import { useTema } from './tema';
import { supabase } from '@/lib/supabase';
import { ErroTela } from '@/components/ErroTela';

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

/** Módulo SpeedProspect Ads (Meta Ads) — as demais páginas entram nas próximas fases */
const ITENS_ADS = [{ para: '/ads/contas', rotulo: 'Contas de anúncio', icone: Building2 }];

const classeLink = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm lg:py-2 transition-colors ${
    isActive ? 'bg-marca/10 font-medium text-marca' : 'text-suave hover:bg-elevado hover:text-texto'
  }`;

/** Pendências mostradas no menu: prévias para aprovar e mensagens na fila de hoje */
function useContadores() {
  return useQuery({
    queryKey: ['contadores'],
    refetchInterval: 60_000,
    queryFn: async () => {
      const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
      const [aprovacao, envios] = await Promise.all([
        supabase.from('leads').select('id', { count: 'exact', head: true }).eq('status_funil', 'previa_gerada'),
        supabase.from('mensagens').select('id', { count: 'exact', head: true }).eq('status', 'pendente').lte('agendada_para', hoje),
      ]);
      return { aprovacao: aprovacao.count ?? 0, envios: envios.count ?? 0 } as Record<string, number>;
    },
  });
}

const ROTULO_TEMA = { light: 'Claro', dark: 'Escuro', night: 'Noite' } as const;
const ICONE_TEMA = { light: Sun, dark: Moon, night: SunMoon } as const;

/** Atalhos da barra inferior no celular (o restante fica no menu ☰) */
const ITENS_BARRA = ['/', '/leads', '/aprovacao', '/envios', '/funil'];

/** Título da página atual (barra superior do celular) */
function tituloDe(pathname: string): string {
  const todos = [...ITENS, ...ITENS_ADS];
  const achado = todos
    .filter((i) => (i.para === '/' ? pathname === '/' : pathname === i.para || pathname.startsWith(`${i.para}/`)))
    .sort((a, b) => b.para.length - a.para.length)[0];
  if (achado) return achado.rotulo;
  return pathname.startsWith('/ads') ? 'Meta Ads' : 'SpeedProspect';
}

function Contador({ n, className = '' }: { n?: number; className?: string }) {
  if (!n) return null;
  return (
    <span className={`rounded-full bg-marca px-1.5 py-px text-[11px] font-medium tabular-nums leading-4 text-white ${className}`}>
      {n > 99 ? '99+' : n}
    </span>
  );
}

function Marca() {
  return (
    <>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-marca text-white">
        <Zap size={16} />
      </span>
      <span className="text-[15px] font-medium">SpeedProspect</span>
    </>
  );
}

export default function Layout() {
  const { sessao, sair } = useAuth();
  const { tema, alternar } = useTema();
  const IconeTema = ICONE_TEMA[tema];
  const { data: contadores } = useContadores();
  const { pathname } = useLocation();
  const [menuAberto, setMenuAberto] = useState(false);

  // Fecha o menu do celular ao trocar de página
  useEffect(() => {
    setMenuAberto(false);
  }, [pathname]);

  // Menu aberto: trava a rolagem do fundo e fecha com Esc
  useEffect(() => {
    if (!menuAberto) return undefined;
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuAberto(false);
    };
    window.addEventListener('keydown', aoTeclar);
    return () => {
      document.body.style.overflow = antes;
      window.removeEventListener('keydown', aoTeclar);
    };
  }, [menuAberto]);

  const pendencias = (contadores?.aprovacao ?? 0) + (contadores?.envios ?? 0);

  return (
    <div className="min-h-screen">
      {/* Barra superior (celular e tablet) */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-borda bg-superficie/95 px-2 backdrop-blur lg:hidden" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <button
          onClick={() => setMenuAberto(true)}
          className="relative flex h-10 w-10 items-center justify-center rounded-md text-suave hover:bg-elevado hover:text-texto"
          aria-label="Abrir menu"
          aria-expanded={menuAberto}
          aria-controls="menu-lateral"
        >
          <Menu size={20} />
          {pendencias > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-marca" />}
        </button>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-marca text-white"><Zap size={16} /></span>
        <span className="truncate text-[15px] font-medium">{tituloDe(pathname)}</span>
        <button onClick={alternar} className="ml-auto flex h-10 w-10 items-center justify-center rounded-md text-suave hover:bg-elevado hover:text-texto" aria-label={`Tema: ${ROTULO_TEMA[tema]}`}>
          <IconeTema size={18} />
        </button>
      </header>

      {/* Fundo escurecido do menu no celular */}
      {menuAberto && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setMenuAberto(false)} aria-hidden="true" />}

      <aside
        id="menu-lateral"
        className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-borda bg-superficie shadow-xl transition-transform duration-200 lg:z-30 lg:w-56 lg:translate-x-0 lg:shadow-none ${
          menuAberto ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Menu principal"
      >
        <div className="flex h-14 items-center gap-2 border-b border-borda px-4">
          <Marca />
          <button onClick={() => setMenuAberto(false)} className="-mr-2 ml-auto flex h-10 w-10 items-center justify-center rounded-md text-suave hover:bg-elevado lg:hidden" aria-label="Fechar menu">
            <X size={18} />
          </button>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {ITENS.map(({ para, rotulo, icone: Icone, fim, contador }) => (
            <NavLink key={para} to={para} end={fim} className={classeLink}>
              <Icone size={16} />
              {rotulo}
              {contador && <Contador n={contadores?.[contador]} className="ml-auto" />}
            </NavLink>
          ))}
          <p className="px-3 pb-1 pt-4 text-[11px] font-medium uppercase tracking-wide text-fraco">Meta Ads</p>
          {ITENS_ADS.map(({ para, rotulo, icone: Icone }) => (
            <NavLink key={para} to={para} className={classeLink}>
              <Icone size={16} />
              {rotulo}
            </NavLink>
          ))}
          <p className="px-3 pb-1 pt-4 text-[11px] font-medium uppercase tracking-wide text-fraco">Recursos</p>
          <a href="/demo/saude" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm text-suave transition-colors hover:bg-elevado hover:text-texto lg:py-2">
            <LayoutTemplate size={16} />
            Modelos de página
          </a>
        </nav>
        <div className="space-y-1 border-t border-borda p-2" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
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

      <main className="min-h-screen pb-[calc(4rem+env(safe-area-inset-bottom))] lg:ml-56 lg:pb-0">
        <ErroTela chave={pathname}>
          <Suspense fallback={<div className="p-6 text-sm text-suave">Carregando…</div>}>
            <Outlet />
          </Suspense>
        </ErroTela>
      </main>

      {/* Barra inferior (celular e tablet): atalhos das telas do dia a dia */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-borda bg-superficie/95 backdrop-blur lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Atalhos"
      >
        {ITENS.filter((i) => ITENS_BARRA.includes(i.para)).map(({ para, rotulo, icone: Icone, fim, contador }) => (
          <NavLink
            key={para}
            to={para}
            end={fim}
            className={({ isActive }) =>
              `relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] ${isActive ? 'font-medium text-marca' : 'text-suave'}`
            }
          >
            <span className="relative">
              <Icone size={20} />
              {contador && <Contador n={contadores?.[contador]} className="absolute -right-3 -top-1.5 px-1 text-[10px]" />}
            </span>
            {rotulo}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
