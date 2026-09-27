import { useState, type CSSProperties } from 'react';
import { ExternalLink } from 'lucide-react';
import type { AvaliacaoPublica, ConteudoLP } from '../types';
import { Estrelas } from './Estrelas';
import { notaBR, numeroBR } from './util';

interface Props {
  conteudo: ConteudoLP;
  avaliacoes: AvaliacaoPublica[];
  id: string;
  sobre: string;
  titulo: string;
  escuro?: boolean;
  cor: string;
  raio?: string;
  estiloTitulo?: CSSProperties;
  classeTitulo?: string;
}

/** Logo "G" do Google (SVG oficial simplificado) */
export function LogoGoogle({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

const CORES_AVATAR = ['#1a73e8', '#e8710a', '#188038', '#d93025', '#9334e6', '#007b83'];

/** Seção de avaliações reais do Google: resumo (nota, total) + cartões das avaliações positivas */
export function AvaliacoesGoogle({ conteudo: c, avaliacoes, id, sobre, titulo, escuro, cor, raio = 'rounded-2xl', estiloTitulo, classeTitulo = '' }: Props) {
  const [abertas, setAbertas] = useState<Record<number, boolean>>({});
  if (!avaliacoes.length) return null;
  const temNota = c.prova_social.rating != null && c.prova_social.reviews_count > 0;
  const card = escuro ? 'bg-white/[.04] ring-1 ring-white/10 text-zinc-200' : 'bg-white ring-1 ring-black/[.06] text-slate-700 shadow-[0_1px_3px_rgba(15,23,42,.06)]';
  const fraco = escuro ? 'text-zinc-400' : 'text-slate-500';
  const forte = escuro ? 'text-white' : 'text-slate-900';

  return (
    <section id={id} className="scroll-mt-24 px-5 py-20">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <p className="text-sm font-[700] uppercase tracking-[.16em]" style={{ color: cor }}>{sobre}</p>
          <h2 className={`mt-3 text-3xl leading-tight sm:text-[2.5rem] ${forte} ${classeTitulo}`} style={estiloTitulo}>{titulo}</h2>
        </div>

        <div className="mt-12 grid gap-5 lg:grid-cols-[300px_1fr]">
          {/* Resumo */}
          <div className={`flex flex-col items-center justify-center gap-3 p-8 text-center ${raio} ${card}`}>
            <span className="flex items-center gap-2 text-sm font-[600]"><LogoGoogle /> Avaliações no Google</span>
            {temNota ? (
              <>
                <span className={`text-6xl font-[700] leading-none ${forte}`}>{notaBR(c.prova_social.rating)}</span>
                <Estrelas nota={c.prova_social.rating!} className="h-5 w-5" />
                <span className={`text-sm ${fraco}`}>{numeroBR(c.prova_social.reviews_count)} avaliações</span>
              </>
            ) : (
              <span className={`text-sm ${fraco}`}>Avaliações de clientes</span>
            )}
            {c.empresa.maps_url && (
              <a href={c.empresa.maps_url} target="_blank" rel="noopener noreferrer" className={`mt-2 inline-flex items-center gap-1.5 text-sm font-[600] underline underline-offset-4 ${forte}`}>
                Ver todas no Google <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            )}
          </div>

          {/* Cartões */}
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {avaliacoes.map((a, i) => {
              const longo = a.texto.length > 220;
              const aberto = abertas[i];
              return (
                <figure key={i} className={`flex flex-col p-6 ${raio} ${card}`}>
                  <figcaption className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-[700] text-white" style={{ backgroundColor: CORES_AVATAR[i % CORES_AVATAR.length] }}>
                      {a.autor.trim().charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1 text-sm leading-tight">
                      <span className={`block truncate font-[700] ${forte}`}>{a.autor}</span>
                      <span className={fraco}>{a.data}</span>
                    </span>
                    <LogoGoogle className="h-4 w-4 shrink-0" />
                  </figcaption>
                  <Estrelas nota={a.nota} className="mt-4 h-4 w-4" />
                  <blockquote className={`mt-3 flex-1 leading-relaxed ${longo && !aberto ? 'line-clamp-5' : ''}`}>{a.texto}</blockquote>
                  {longo && (
                    <button type="button" onClick={() => setAbertas((s) => ({ ...s, [i]: !aberto }))} className={`mt-2 self-start text-sm font-[600] underline underline-offset-4 ${forte}`}>
                      {aberto ? 'Mostrar menos' : 'Ler mais'}
                    </button>
                  )}
                </figure>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
