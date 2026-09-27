import { Suspense, useEffect, useState, type CSSProperties, type MouseEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { TEMPLATES, templateDoNicho } from '@/templates/registry';
import { DEMOS, DEMO_AVALIACOES } from '@/templates/demo';
import { ContextoNicho } from '@/templates/_comum/contexto';
import type { NichoLP } from '@/templates/types';
import { aplicarSeo } from './api';
import { ALTURA_BARRA, BarraPrevia } from './BarraPrevia';

const ROTULOS: Record<NichoLP, string> = { saude: 'Saúde', alimentacao: 'Alimentação', automotivo: 'Automotivo', beleza: 'Beleza', servicos: 'Serviços' };

// Rota /demo/:nicho — mostra cada modelo com dados fictícios (para o operador conhecer os templates)
export default function PaginaDemo() {
  const { nicho = 'saude' } = useParams();
  const chave = (nicho in DEMOS ? nicho : 'saude') as NichoLP;
  const conteudo = DEMOS[chave];
  const Template = templateDoNicho(chave);
  const [aviso, setAviso] = useState(false);

  useEffect(() => aplicarSeo(`Modelo ${ROTULOS[chave]} · demonstração`, 'Modelo de demonstração'), [chave]);

  // Na demonstração os botões de contato não abrem nada (os dados são fictícios)
  const interceptar = (e: MouseEvent) => {
    const a = (e.target as HTMLElement).closest('a');
    if (a && /wa\.me|^tel:|maps\.google/.test(a.getAttribute('href') ?? '')) {
      e.preventDefault();
      setAviso(true);
      setTimeout(() => setAviso(false), 2500);
    }
  };

  return (
    <div style={{ '--barra': `${ALTURA_BARRA}px`, paddingTop: ALTURA_BARRA } as CSSProperties} onClickCapture={interceptar}>
      <BarraPrevia empresa={conteudo.empresa.nome} negocioNome="SpeedProspect" negocioWhatsapp="" demo />
      <nav className="flex gap-1 overflow-x-auto bg-slate-900 px-3 py-2" style={{ fontFamily: 'system-ui, sans-serif' }}>
        {(Object.keys(TEMPLATES) as NichoLP[]).map((n) => (
          <Link key={n} to={`/demo/${n}`} className={`shrink-0 rounded-full px-3 py-1 text-xs font-[600] ${n === chave ? 'bg-white text-slate-900' : 'text-slate-300 hover:text-white'}`}>
            {ROTULOS[n]}
          </Link>
        ))}
      </nav>
      <ContextoNicho.Provider value={chave}>
      <Suspense fallback={<div className="min-h-screen bg-white" />}>
        <Template
          avaliacoes={DEMO_AVALIACOES}
          key={chave}
          conteudo={conteudo}
          fotos={[]}
          atribuicoes={[]}
          previa={{ negocioNome: 'SpeedProspect', negocioWhatsapp: '', slug: 'demo', token: null, tokenOptout: null, demo: true }}
        />
      </Suspense>
      </ContextoNicho.Provider>
      {aviso && (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-sm text-white shadow-lg" style={{ fontFamily: 'system-ui, sans-serif' }}>
          Demonstração: na prévia real, este botão abre o contato da empresa.
        </div>
      )}
    </div>
  );
}
