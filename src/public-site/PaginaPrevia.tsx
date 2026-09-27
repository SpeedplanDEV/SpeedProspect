import { Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { urlFoto } from '@/lib/config';
import { templateDoNicho } from '@/templates/registry';
import { aplicarSeo, buscarSite, idSessao, rastrear, type SitePublico } from './api';
import { ALTURA_BARRA, BarraPrevia } from './BarraPrevia';

type Estado = { tipo: 'carregando' } | { tipo: 'erro' } | { tipo: 'nao_encontrada' } | { tipo: 'ok'; site: SitePublico };

// Rota pública /p/:slug?k=<token>  (interno=1: visualização do operador, sem rastreio)
export default function PaginaPrevia() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const token = params.get('k');
  const interno = params.get('interno') === '1';
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });
  const sessao = useMemo(() => idSessao(), []);
  const visitou = useRef(false);

  useEffect(() => {
    let ativo = true;
    buscarSite(slug, token)
      .then((site) => ativo && setEstado(site ? { tipo: 'ok', site } : { tipo: 'nao_encontrada' }))
      .catch(() => ativo && setEstado({ tipo: 'erro' }));
    return () => {
      ativo = false;
    };
  }, [slug, token]);

  const site = estado.tipo === 'ok' ? estado.site : null;

  useEffect(() => {
    if (!site) return;
    aplicarSeo(site.conteudo.seo.title || site.conteudo.empresa.nome, site.conteudo.seo.description);
    if (!interno && site.publicado && !visitou.current) {
      visitou.current = true;
      rastrear(slug, token, 'visita', sessao);
    }
  }, [site, interno, slug, token, sessao]);

  if (estado.tipo === 'carregando') return <Carregando />;
  if (estado.tipo !== 'ok') return <Aviso erro={estado.tipo === 'erro'} />;

  const s = estado.site;
  const Template = templateDoNicho(s.template);
  const registrar = (tipo: 'clique_whatsapp' | 'clique_quero') => {
    if (!interno && s.publicado) rastrear(slug, token, tipo, sessao);
  };

  return (
    <div style={{ '--barra': `${ALTURA_BARRA}px`, paddingTop: ALTURA_BARRA } as CSSProperties}>
      <BarraPrevia
        empresa={s.conteudo.empresa.nome}
        negocioNome={s.negocio_nome}
        negocioWhatsapp={s.negocio_whatsapp}
        aoQuerer={() => registrar('clique_quero')}
      />
      {!s.publicado && (
        <div className="bg-amber-100 px-4 py-2 text-center text-xs font-[600] text-amber-900" style={{ fontFamily: 'system-ui, sans-serif' }}>
          Rascunho (versão {s.versao}) — visível só com o link do operador até ser aprovado.
        </div>
      )}
      <Suspense fallback={<Carregando />}>
        <Template
          conteudo={s.conteudo}
          fotos={s.fotos.map((f) => urlFoto(f.name, 1200))}
          atribuicoes={s.fotos.map((f) => f.atribuicao ?? '')}
          previa={{
            negocioNome: s.negocio_nome,
            negocioWhatsapp: s.negocio_whatsapp,
            slug,
            token,
            tokenOptout: s.token_optout,
          }}
          aoContatar={() => registrar('clique_whatsapp')}
        />
      </Suspense>
    </div>
  );
}

function Carregando() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-500" aria-label="Carregando" />
    </div>
  );
}

function Aviso({ erro }: { erro: boolean }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-center" style={{ fontFamily: 'system-ui, sans-serif' }}>
      <div className="max-w-sm">
        <p className="text-lg font-[700] text-slate-900">{erro ? 'Não foi possível carregar a prévia' : 'Prévia não encontrada'}</p>
        <p className="mt-2 text-sm text-slate-600">
          {erro ? 'Verifique sua conexão e tente novamente.' : 'Este link não está mais disponível. Ele pode ter expirado ou sido removido.'}
        </p>
      </div>
    </div>
  );
}
