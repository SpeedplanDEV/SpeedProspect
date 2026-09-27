// Template ALIMENTAÇÃO — restaurantes, lanchonetes, cafés, pizzarias. Identidade: calorosa, apetitosa, fotos em destaque.
import type { CSSProperties } from 'react';
import { Clock, MapPin, Navigation, Phone, Quote, Star } from 'lucide-react';
import type { PropsTemplate } from '../types';
import { comContraste, corValida, misturar, textoSobre } from '../_comum/cores';
import { contatoEmpresa, diaDeHoje, enderecoCurto, idSecao, linkTelefone, notaBR, numeroBR } from '../_comum/util';
import { useFontes } from '../_comum/useFontes';
import { Foto } from '../_comum/Foto';
import { Estrelas } from '../_comum/Estrelas';
import { Faq } from '../_comum/Faq';
import { Icone } from '../_comum/Icone';
import { InfoLegal } from '../_comum/Rodape';
import { LinkContato } from '../_comum/Botao';
import { WhatsFlutuante } from '../_comum/WhatsFlutuante';

const FONTE =
  'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,700;1,9..144,500&family=Nunito+Sans:opsz,wght@6..12,400;6..12,600;6..12,700&display=swap';
const CREME = '#fff8ef';
const MARROM = '#2a1a12';
const serif = { fontFamily: "'Fraunces', Georgia, 'Times New Roman', serif" } as CSSProperties;

export default function TemplateAlimentacao({ conteudo: c, fotos, atribuicoes, previa, aoContatar }: PropsTemplate) {
  useFontes(FONTE);
  const cor = corValida(c.tema.cor_primaria, '#c2410c');
  const corTexto = comContraste(cor, CREME, 4.5);
  const sobreCor = textoSobre(cor);
  const contato = contatoEmpresa(c);
  const tel = linkTelefone(c);
  const hoje = diaDeHoje();
  const temNota = c.prova_social.rating != null && c.prova_social.reviews_count > 0;
  const fotoHero = fotos[c.hero.foto_index] ?? fotos[0];
  const galeria = fotos.filter((f) => f !== fotoHero).slice(0, 6);
  const vars = { '--cor': cor, '--cor-texto': corTexto, '--sobre': sobreCor, '--creme': CREME, '--marrom': MARROM } as CSSProperties;
  const botao = 'inline-flex items-center justify-center gap-2 rounded-full bg-[var(--cor)] font-[700] text-[var(--sobre)] transition hover:brightness-110 active:scale-[.98]';

  return (
    <div style={{ ...vars, fontFamily: "'Nunito Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" }} className="bg-[var(--creme)] text-base text-[var(--marrom)] antialiased">
      {/* Hero em tela cheia com foto */}
      <section id="topo" className="relative flex min-h-[88svh] flex-col overflow-hidden text-white">
        <Foto src={fotoHero} alt={`Foto de ${c.empresa.nome}`} prioridade cor={misturar(cor, '#1a0f0a', 0.55)} className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/35 to-black/80" aria-hidden />
        <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-5">
          <span className="truncate text-xl" style={serif}>{c.empresa.nome}</span>
          <LinkContato contato={contato} aoContatar={aoContatar} classeIcone="h-4 w-4" className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-[700] backdrop-blur transition hover:bg-white/25">
            Pedir agora
          </LinkContato>
        </header>
        <div className="relative z-10 mx-auto mt-auto w-full max-w-6xl px-5 pb-14 pt-24">
          <p className="text-sm font-[700] uppercase tracking-[.2em] text-white/80">{c.empresa.tagline}</p>
          <h1 className="mt-4 max-w-3xl text-[2.6rem] leading-[1.02] sm:text-6xl" style={serif}>
            {c.hero.titulo}
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-white/85">{c.hero.subtitulo}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <LinkContato contato={contato} aoContatar={aoContatar} className={`${botao} px-7 py-4 text-base shadow-[0_15px_35px_-12px_var(--cor)]`}>
              {c.hero.cta_primario}
            </LinkContato>
            <a href={`#${idSecao.servicos}`} className="inline-flex items-center justify-center rounded-full px-7 py-4 font-[700] ring-1 ring-white/40 backdrop-blur transition hover:bg-white/10">
              {c.hero.cta_secundario}
            </a>
          </div>
          {temNota && (
            <p className="mt-8 inline-flex items-center gap-2 rounded-full bg-black/35 px-4 py-2 text-sm backdrop-blur">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden />
              <strong className="font-[700]">{notaBR(c.prova_social.rating)}</strong>
              <span className="text-white/80">· {numeroBR(c.prova_social.reviews_count)} avaliações no Google</span>
            </p>
          )}
        </div>
      </section>

      {/* Galeria */}
      {galeria.length > 1 && (
        <section aria-label="Fotos" className="py-8">
          <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2 [scrollbar-width:none] sm:justify-center">
            {galeria.map((f, i) => (
              <Foto key={f} src={f} alt={`Foto ${i + 2} de ${c.empresa.nome}`} cor={misturar(cor, CREME, 0.5)} className={`h-56 w-44 shrink-0 snap-start rounded-2xl sm:h-64 sm:w-52 ${i % 2 ? 'sm:mt-8' : ''}`} />
            ))}
          </div>
        </section>
      )}

      {/* Destaques */}
      <section id={idSecao.servicos} className="mx-auto max-w-6xl scroll-mt-24 px-5 py-16">
        <div className="text-center">
          <p className="text-sm font-[700] uppercase tracking-[.2em] text-[var(--cor-texto)]">Destaques da casa</p>
          <h2 className="mt-3 text-4xl sm:text-5xl" style={serif}>O que você encontra aqui</h2>
        </div>
        <div className="mt-12 grid gap-x-10 gap-y-2 md:grid-cols-2">
          {c.servicos.map((s, i) => (
            <article key={i} className="flex gap-5 border-b border-[rgba(42,26,18,.1)] py-6">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--cor)] text-[var(--sobre)]">
                <Icone nome={s.icone} className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-2xl leading-snug" style={serif}>{s.titulo}</h3>
                <p className="mt-1.5 leading-relaxed text-[rgba(42,26,18,.75)]">{s.descricao}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Diferenciais */}
      <section className="bg-[var(--marrom)] text-[var(--creme)]">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <h2 className="max-w-2xl text-4xl leading-tight sm:text-5xl" style={serif}>
            Por que <em className="text-[color:var(--destaque)]" style={{ '--destaque': comContraste(cor, MARROM, 4.5) } as CSSProperties}>{c.empresa.nome}</em> conquista quem prova
          </h2>
          <div className={`mt-14 grid gap-10 ${c.diferenciais.length > 3 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3'}`}>
            {c.diferenciais.map((d, i) => (
              <div key={i}>
                <span className="text-5xl text-[rgba(255,248,239,.45)]" style={serif}>{String(i + 1).padStart(2, '0')}</span>
                <h3 className="mt-3 text-xl font-[700]">{d.titulo}</h3>
                <p className="mt-2 leading-relaxed text-[rgba(255,248,239,.7)]">{d.descricao}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Depoimentos */}
      {c.depoimentos.length > 0 && (
        <section id={idSecao.avaliacoes} className="mx-auto max-w-6xl scroll-mt-24 px-5 py-20">
          <div className="text-center">
            <p className="text-sm font-[700] uppercase tracking-[.2em] text-[var(--cor-texto)]">Avaliações no Google</p>
            <h2 className="mt-3 text-4xl sm:text-5xl" style={serif}>Quem vem, recomenda</h2>
          </div>
          <div className="mt-12 flex snap-x snap-mandatory gap-5 overflow-x-auto pb-3 [scrollbar-width:none] md:grid md:grid-cols-3 md:overflow-visible">
            {c.depoimentos.map((d, i) => (
              <figure key={i} className="w-[85%] shrink-0 snap-center rounded-3xl bg-white p-8 shadow-[0_20px_45px_-30px_rgba(42,26,18,.45)] md:w-auto">
                <Quote className="h-8 w-8 text-[var(--cor-texto)]" aria-hidden />
                <blockquote className="mt-4 text-xl leading-snug" style={serif}>{d.texto}</blockquote>
                <figcaption className="mt-6 flex items-center justify-between gap-3 text-sm">
                  <span className="font-[700]">{d.autor}</span>
                  <Estrelas nota={d.nota} className="h-3.5 w-3.5" />
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {/* Visite */}
      <section id={idSecao.contato} className="scroll-mt-24 px-5 pb-20">
        <div className="mx-auto grid max-w-6xl overflow-hidden rounded-[2rem] bg-white shadow-[0_30px_60px_-40px_rgba(42,26,18,.5)] md:grid-cols-2">
          <Foto src={galeria[0] ?? fotoHero} alt={`Fachada ou ambiente de ${c.empresa.nome}`} cor={misturar(cor, CREME, 0.3)} className="min-h-[260px] w-full" />
          <div className="p-8 sm:p-12">
            <h2 className="text-4xl" style={serif}>Venha nos visitar</h2>
            {c.empresa.endereco && (
              <p className="mt-5 flex gap-3 leading-relaxed text-[rgba(42,26,18,.8)]">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[var(--cor-texto)]" aria-hidden /> {enderecoCurto(c.empresa.endereco)}
              </p>
            )}
            {c.empresa.telefone_exibicao && tel && (
              <a href={tel} className="mt-3 flex items-center gap-3 text-[rgba(42,26,18,.8)] hover:text-[var(--marrom)]">
                <Phone className="h-5 w-5 text-[var(--cor-texto)]" aria-hidden /> {c.empresa.telefone_exibicao}
              </a>
            )}
            {c.horarios.length > 0 && (
              <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
                {c.horarios.map((h) => (
                  <div key={h.dia} className={`contents ${h.dia === hoje ? 'font-[700] text-[var(--cor-texto)]' : ''}`}>
                    <dt className="flex items-center gap-1.5">{h.dia === hoje && <Clock className="h-3.5 w-3.5" aria-hidden />}{h.dia}</dt>
                    <dd>{h.horario}</dd>
                  </div>
                ))}
              </dl>
            )}
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkContato contato={contato} aoContatar={aoContatar} className={`${botao} px-6 py-3 text-sm`}>
                {c.hero.cta_primario}
              </LinkContato>
              {c.empresa.maps_url && (
                <a href={c.empresa.maps_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-[700] ring-1 ring-[rgba(42,26,18,.2)] hover:bg-[var(--creme)]">
                  <Navigation className="h-4 w-4" aria-hidden /> Como chegar
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      {c.faq.length > 0 && (
        <section id={idSecao.faq} className="mx-auto max-w-3xl scroll-mt-24 px-5 pb-20">
          <h2 className="text-center text-4xl" style={serif}>Perguntas frequentes</h2>
          <div className="mt-10">
            <Faq
              itens={c.faq}
              corIcone={corTexto}
              classeItem="border-b border-[rgba(42,26,18,.15)] pb-5"
              classePergunta="text-lg font-[700]"
              classeResposta="mt-3 leading-relaxed text-[rgba(42,26,18,.75)]"
            />
          </div>
        </section>
      )}

      {/* CTA final */}
      <section className="bg-[var(--cor)] text-[var(--sobre)]">
        <div className="mx-auto max-w-4xl px-5 py-20 text-center">
          <h2 className="text-4xl leading-tight sm:text-5xl" style={serif}>{c.cta_final.titulo}</h2>
          <p className="mx-auto mt-4 max-w-xl text-lg">{c.cta_final.texto}</p>
          <LinkContato
            contato={contato}
            aoContatar={aoContatar}
            classeIcone="h-5 w-5 text-[#25d366]"
            className="mt-9 inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-8 py-4 font-[700] text-[var(--marrom)] shadow-xl transition hover:scale-[1.02] sm:w-auto"
          >
            {c.cta_final.botao}
          </LinkContato>
        </div>
      </section>

      <footer className="bg-[var(--marrom)] text-[var(--creme)]">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-10 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-2xl" style={serif}>{c.empresa.nome}</p>
            <p className="mt-1 text-sm opacity-70">{[c.empresa.bairro, c.empresa.cidade].filter(Boolean).join(' · ')}</p>
          </div>
          <InfoLegal previa={previa} atribuicoes={atribuicoes} />
        </div>
      </footer>

      {contato && <WhatsFlutuante href={contato.href} tipo={contato.tipo} aoClicar={aoContatar} />}
    </div>
  );
}
