// Template BELEZA — salões, barbearias, estética, manicure. Identidade: elegante, delicada, com ar editorial.
import type { CSSProperties } from 'react';
import { Clock, MapPin, Navigation, Phone, Sparkles } from 'lucide-react';
import type { PropsTemplate } from '../types';
import { comContraste, corValida, misturar, textoSobre } from '../_comum/cores';
import { contatoEmpresa, diaDeHoje, enderecoCurto, idSecao, linkTelefone, notaBR, numeroBR } from '../_comum/util';
import { useFontes } from '../_comum/useFontes';
import { AvaliacoesGoogle } from '../_comum/AvaliacoesGoogle';
import { avaliacoesParaExibir } from '../_comum/avaliacoes';
import { Mapa } from '../_comum/Mapa';
import { Foto } from '../_comum/Foto';
import { Estrelas } from '../_comum/Estrelas';
import { Faq } from '../_comum/Faq';
import { Icone } from '../_comum/Icone';
import { InfoLegal } from '../_comum/Rodape';
import { LinkContato } from '../_comum/Botao';
import { WhatsFlutuante } from '../_comum/WhatsFlutuante';

const FONTE =
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Jost:wght@300;400;500&display=swap';
const NUDE = '#fbf6f2';
const TINTA = '#3b2a30';
const serif = { fontFamily: "'Cormorant Garamond', 'Times New Roman', Georgia, serif" } as CSSProperties;

export default function TemplateBeleza({ conteudo: c, fotos, atribuicoes, avaliacoes = [], previa, aoContatar }: PropsTemplate) {
  useFontes(FONTE);
  const listaAvaliacoes = avaliacoesParaExibir(c.depoimentos, avaliacoes);
  const cor = corValida(c.tema.cor_primaria, '#9f4a67');
  const sobreCor = textoSobre(cor);
  const rosado = misturar(cor, NUDE, 0.86);
  // Legível tanto no fundo nude quanto no rosado (o mais escuro dos dois)
  const corTexto = comContraste(cor, rosado, 4.5);
  const contato = contatoEmpresa(c);
  const tel = linkTelefone(c);
  const hoje = diaDeHoje();
  const temNota = c.prova_social.rating != null && c.prova_social.reviews_count > 0;
  const fotoHero = fotos[c.hero.foto_index] ?? fotos[0];
  const galeria = fotos.filter((f) => f !== fotoHero).slice(0, 5);
  const vars = { '--cor': cor, '--cor-texto': corTexto, '--sobre': sobreCor, '--nude': NUDE, '--tinta': TINTA, '--rosado': rosado } as CSSProperties;
  const botao = 'inline-flex items-center justify-center gap-2 rounded-full bg-[var(--cor)] px-6 py-4 text-sm font-[500] uppercase tracking-[.12em] text-[var(--sobre)] transition hover:brightness-110 sm:px-8 sm:tracking-[.18em]';

  return (
    <div style={{ ...vars, fontFamily: "'Jost', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" }} className="bg-[var(--nude)] text-base font-[300] text-[var(--tinta)] antialiased">
      <header className="sticky top-[var(--barra,0px)] z-30 bg-[rgba(251,246,242,.9)] backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
          <span className="truncate text-2xl font-[600] italic" style={serif}>{c.empresa.nome}</span>
          <LinkContato contato={contato} aoContatar={aoContatar} classeIcone="h-4 w-4" className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[var(--cor-texto)] px-4 py-2 text-xs font-[500] uppercase tracking-[.16em] text-[var(--cor-texto)] transition hover:bg-[var(--cor)] hover:text-[var(--sobre)]">
            Agendar
          </LinkContato>
        </div>
      </header>

      {/* Hero */}
      <section id="topo" className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-8 md:grid-cols-2 md:pt-14">
        <div className="text-center md:text-left">
          <p className="inline-flex items-center gap-3 text-xs font-[500] uppercase tracking-[.3em] text-[var(--cor-texto)]">
            <span className="h-px w-8 bg-current" aria-hidden /> {c.empresa.bairro || c.empresa.cidade}
          </p>
          <h1 className="mt-6 text-[2.9rem] font-[500] leading-[1] sm:text-7xl" style={serif}>{c.hero.titulo}</h1>
          <p className="mx-auto mt-6 max-w-md text-lg leading-relaxed text-[rgba(59,42,48,.75)] md:mx-0">{c.hero.subtitulo}</p>
          <div className="mt-9 flex flex-col items-center gap-4 sm:flex-row md:justify-start">
            <LinkContato contato={contato} aoContatar={aoContatar} classeIcone="h-4 w-4" className={botao}>{c.hero.cta_primario}</LinkContato>
            <a href={`#${idSecao.servicos}`} className="text-sm font-[500] uppercase tracking-[.18em] underline decoration-[var(--cor)] underline-offset-8">
              {c.hero.cta_secundario}
            </a>
          </div>
          {temNota && (
            <div className="mt-10 flex items-center justify-center gap-3 md:justify-start">
              <Estrelas nota={c.prova_social.rating!} cor={corTexto} />
              <span className="text-sm text-[rgba(59,42,48,.7)]">{notaBR(c.prova_social.rating)} · {numeroBR(c.prova_social.reviews_count)} avaliações no Google</span>
            </div>
          )}
        </div>
        <div className="relative mx-auto w-full max-w-md">
          <div className="absolute -inset-3 rounded-t-full border border-[var(--cor)] opacity-40" aria-hidden />
          <Foto src={fotoHero} alt={`Foto de ${c.empresa.nome}`} prioridade cor={misturar(cor, NUDE, 0.35)} className="relative aspect-[3/4] w-full rounded-t-full" />
          <span className="absolute -bottom-6 left-1/2 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full bg-[var(--cor)] text-[var(--sobre)] shadow-lg">
            <Sparkles className="h-6 w-6" aria-hidden />
          </span>
        </div>
      </section>

      {/* Serviços */}
      <section id={idSecao.servicos} className="scroll-mt-24 bg-white">
        <div className="mx-auto max-w-5xl px-5 py-20">
          <Titulo sobre="Nossos serviços" titulo="Cuidado em cada detalhe" />
          <div className="mt-14 grid gap-x-14 md:grid-cols-2">
            {c.servicos.map((s, i) => (
              <article key={i} className="flex gap-5 border-t border-[rgba(59,42,48,.12)] py-7">
                <Icone nome={s.icone} className="mt-1 h-6 w-6 shrink-0 text-[var(--cor-texto)]" strokeWidth={1.3} />
                <div>
                  <h3 className="text-[1.7rem] font-[600] leading-tight" style={serif}>{s.titulo}</h3>
                  <p className="mt-2 leading-relaxed text-[rgba(59,42,48,.72)]">{s.descricao}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Galeria */}
      {galeria.length > 1 && (
        <section aria-label="Galeria" className="mx-auto max-w-6xl px-5 py-20">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {galeria.slice(0, 4).map((f, i) => (
              <Foto key={f} src={f} alt={`Trabalho ${i + 1} de ${c.empresa.nome}`} cor={misturar(cor, NUDE, 0.5)} className={`w-full ${i % 2 ? 'aspect-[3/4] md:mt-10' : 'aspect-[3/4] rounded-t-full'}`} />
            ))}
          </div>
        </section>
      )}

      {/* Diferenciais */}
      <section className="bg-[var(--rosado)]">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <Titulo sobre="Por que nos escolher" titulo={c.empresa.tagline} />
          <div className={`mt-14 grid gap-10 text-center ${c.diferenciais.length > 3 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3'}`}>
            {c.diferenciais.map((d, i) => (
              <div key={i}>
                <span className="text-5xl italic text-[var(--cor-texto)]" style={serif}>{['i', 'ii', 'iii', 'iv'][i]}</span>
                <h3 className="mt-3 text-2xl font-[600]" style={serif}>{d.titulo}</h3>
                <p className="mt-2 leading-relaxed text-[rgba(59,42,48,.72)]">{d.descricao}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Avaliações reais do Google */}
      <AvaliacoesGoogle
        conteudo={c}
        avaliacoes={listaAvaliacoes}
        id={idSecao.avaliacoes}
        sobre="Avaliações no Google"
        titulo="Palavras de quem confia"
        escuro={false}
        cor={corTexto}
        raio={'rounded-[1.75rem]'}
        estiloTitulo={serif} classeTitulo="font-[500]"
      />

      {/* Contato */}
      <section id={idSecao.contato} className="scroll-mt-24 bg-[var(--tinta)] text-[var(--nude)]">
        <div className="mx-auto grid max-w-5xl gap-12 px-5 py-20 md:grid-cols-2">
          <div>
            <h2 className="text-5xl font-[500] italic" style={serif}>Visite-nos</h2>
            {c.empresa.endereco && (
              <p className="mt-6 flex gap-3 leading-relaxed text-[rgba(251,246,242,.8)]">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={1.5} aria-hidden /> {enderecoCurto(c.empresa.endereco)}
              </p>
            )}
            {c.empresa.telefone_exibicao && tel && (
              <a href={tel} className="mt-3 flex items-center gap-3 text-[rgba(251,246,242,.8)] hover:text-white">
                <Phone className="h-5 w-5" strokeWidth={1.5} aria-hidden /> {c.empresa.telefone_exibicao}
              </a>
            )}
            {c.empresa.maps_url && (
              <a href={c.empresa.maps_url} target="_blank" rel="noopener noreferrer" className="mt-8 inline-flex items-center gap-2 text-sm font-[500] uppercase tracking-[.18em] underline underline-offset-8">
                <Navigation className="h-4 w-4" aria-hidden /> Como chegar
              </a>
            )}
          </div>
          {c.horarios.length > 0 && (
            <div>
              <h3 className="flex items-center gap-2 text-sm font-[500] uppercase tracking-[.2em]"><Clock className="h-4 w-4" aria-hidden /> Horários</h3>
              <dl className="mt-5 space-y-2.5 text-[rgba(251,246,242,.8)]">
                {c.horarios.map((h) => (
                  <div key={h.dia} className={`flex items-baseline gap-3 ${h.dia === hoje ? 'font-[500] text-white' : ''}`}>
                    <dt>{h.dia}</dt>
                    <span className="flex-1 border-b border-dotted border-[rgba(251,246,242,.25)]" aria-hidden />
                    <dd>{h.horario}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      </section>

      {c.empresa.endereco && (
        <div className="mx-auto max-w-6xl px-5 pt-16">
          <Mapa endereco={c.empresa.endereco} nome={c.empresa.nome} className="h-72 rounded-2xl ring-1 ring-black/5 sm:h-80" />
        </div>
      )}

      {/* FAQ */}
      {c.faq.length > 0 && (
        <section id={idSecao.faq} className="mx-auto max-w-3xl scroll-mt-24 px-5 py-20">
          <Titulo sobre="Dúvidas" titulo="Perguntas frequentes" />
          <div className="mt-12">
            <Faq
              itens={c.faq}
              corIcone={corTexto}
              classeItem="border-b border-[rgba(59,42,48,.15)] pb-5"
              classePergunta="text-2xl font-[600] [font-family:'Cormorant_Garamond',Georgia,serif]"
              classeResposta="mt-3 leading-relaxed text-[rgba(59,42,48,.75)]"
            />
          </div>
        </section>
      )}

      {/* CTA final */}
      <section className="px-5 pb-20">
        <div className="mx-auto max-w-5xl rounded-[2.5rem] bg-[var(--rosado)] px-7 py-16 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-[var(--cor-texto)]" strokeWidth={1.3} aria-hidden />
          <h2 className="mt-5 text-5xl font-[500] leading-tight" style={serif}>{c.cta_final.titulo}</h2>
          <p className="mx-auto mt-4 max-w-lg text-lg text-[rgba(59,42,48,.75)]">{c.cta_final.texto}</p>
          <LinkContato contato={contato} aoContatar={aoContatar} classeIcone="h-4 w-4" className={`${botao} mt-9`}>{c.cta_final.botao}</LinkContato>
        </div>
      </section>

      <footer className="border-t border-[rgba(59,42,48,.1)]">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-10 sm:flex-row sm:items-end sm:justify-between">
          <p className="text-3xl font-[600] italic" style={serif}>{c.empresa.nome}</p>
          <InfoLegal previa={previa} atribuicoes={atribuicoes} />
        </div>
      </footer>

      {contato && <WhatsFlutuante href={contato.href} tipo={contato.tipo} aoClicar={aoContatar} />}
    </div>
  );
}

function Titulo({ sobre, titulo }: { sobre: string; titulo: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-xs font-[500] uppercase tracking-[.3em] text-[var(--cor-texto)]">{sobre}</p>
      <h2 className="mt-4 text-[2.6rem] font-[500] leading-[1.05] sm:text-5xl" style={serif}>{titulo}</h2>
    </div>
  );
}
