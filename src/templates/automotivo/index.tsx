// Template AUTOMOTIVO — oficinas, auto centers, funilarias, borracharias. Identidade: escura, forte, direta.
import type { CSSProperties, ReactNode } from 'react';
import { ArrowUpRight, Clock, MapPin, MessageCircle, Navigation, Phone, Star, Timer, Wrench } from 'lucide-react';
import type { PropsTemplate } from '../types';
import { comContraste, corValida, misturar, textoSobre } from '../_comum/cores';
import { colunasServicos, contatoEmpresa, diaDeHoje, enderecoCurto, idSecao, linkTelefone, notaBR, numeroBR } from '../_comum/util';
import { useFontes } from '../_comum/useFontes';
import { AvaliacoesGoogle } from '../_comum/AvaliacoesGoogle';
import { avaliacoesParaExibir } from '../_comum/avaliacoes';
import { Mapa } from '../_comum/Mapa';
import { Galeria } from '../_comum/Galeria';
import { Foto } from '../_comum/Foto';
import { Faq } from '../_comum/Faq';
import { Icone } from '../_comum/Icone';
import { InfoLegal } from '../_comum/Rodape';
import { LinkContato } from '../_comum/Botao';
import { WhatsFlutuante } from '../_comum/WhatsFlutuante';

const FONTE = 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Barlow:wght@400;500;600&display=swap';
const FUNDO = '#0c0e12';
const PAINEL = '#15181e';
const condensada = { fontFamily: "'Barlow Condensed', 'Arial Narrow', Impact, sans-serif" } as CSSProperties;

export default function TemplateAutomotivo({ conteudo: c, fotos, atribuicoes, avaliacoes = [], previa, aoContatar }: PropsTemplate) {
  useFontes(FONTE);
  const listaAvaliacoes = avaliacoesParaExibir(c.depoimentos, avaliacoes);
  // No fundo escuro a cor de destaque precisa ser clara o bastante
  const cor = comContraste(corValida(c.tema.cor_primaria, '#f59e0b'), FUNDO, 5);
  const sobreCor = textoSobre(cor);
  const contato = contatoEmpresa(c);
  const tel = linkTelefone(c);
  const hoje = diaDeHoje();
  const horarioHoje = c.horarios.find((h) => h.dia === hoje)?.horario;
  const temNota = c.prova_social.rating != null && c.prova_social.reviews_count > 0;
  const fotoHero = fotos[c.hero.foto_index] ?? fotos[0];
  const vars = { '--cor': cor, '--sobre': sobreCor, '--fundo': FUNDO, '--painel': PAINEL } as CSSProperties;
  const botao = 'inline-flex items-center justify-center gap-2 bg-[var(--cor)] font-[700] uppercase tracking-wide text-[var(--sobre)] transition hover:brightness-110 active:translate-y-px';
  const passos = [
    { icone: MessageCircle, titulo: contato?.tipo === 'whatsapp' ? 'Chame no WhatsApp' : 'Entre em contato', texto: 'Conte o que o seu veículo está apresentando.' },
    { icone: Timer, titulo: 'Combine o atendimento', texto: 'Defina com a equipe o melhor dia e horário.' },
    { icone: Wrench, titulo: 'Traga o veículo', texto: c.empresa.bairro ? `Estamos no ${c.empresa.bairro}, em ${c.empresa.cidade}.` : `Estamos em ${c.empresa.cidade}.` },
  ];

  return (
    <div style={{ ...vars, fontFamily: "'Barlow', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" }} className="bg-[var(--fundo)] text-base text-zinc-300 antialiased">
      <header className="sticky top-[var(--barra,0px)] z-30 border-b border-white/5 bg-[rgba(12,14,18,.88)] backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
          <span className="flex min-w-0 items-center gap-2 text-xl font-[800] uppercase tracking-wide text-white" style={condensada}>
            <span className="h-6 w-1.5 shrink-0 -skew-x-12 bg-[var(--cor)]" aria-hidden />
            <span className="truncate">{c.empresa.nome}</span>
          </span>
          <LinkContato contato={contato} aoContatar={aoContatar} classeIcone="h-4 w-4" className={`${botao} shrink-0 px-4 py-2 text-sm`}>
            Orçamento
          </LinkContato>
        </div>
      </header>

      {/* Hero */}
      <section id="topo" className="relative overflow-hidden">
        <div className="absolute inset-y-0 right-0 hidden w-[55%] md:block">
          <Foto src={fotoHero} alt={`Foto de ${c.empresa.nome}`} prioridade cor={misturar(cor, FUNDO, 0.7)} className="h-full w-full [clip-path:polygon(18%_0,100%_0,100%_100%,0_100%)]" />
          <div className="absolute inset-0 bg-gradient-to-r from-[var(--fundo)] via-transparent to-transparent" aria-hidden />
        </div>
        <div className="relative mx-auto max-w-6xl px-5 pb-16 pt-12 md:py-28">
          <div className="md:max-w-[52%]">
            <p className="inline-flex items-center gap-2 text-sm font-[600] uppercase tracking-[.2em] text-[var(--cor)]">
              <MapPin className="h-4 w-4" aria-hidden /> {[c.empresa.bairro, c.empresa.cidade].filter(Boolean).join(' · ')}
            </p>
            <h1 className="mt-4 text-[3rem] font-[800] uppercase leading-[.92] text-white sm:text-7xl" style={condensada}>
              {c.hero.titulo}
            </h1>
            <div className="mt-5 h-1.5 w-20 -skew-x-12 bg-[var(--cor)]" aria-hidden />
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-zinc-400">{c.hero.subtitulo}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <LinkContato contato={contato} aoContatar={aoContatar} className={`${botao} px-7 py-4 text-base [clip-path:polygon(0_0,100%_0,94%_100%,0_100%)] sm:pr-10`}>
                {c.hero.cta_primario}
              </LinkContato>
              <a href={`#${idSecao.servicos}`} className="inline-flex items-center justify-center gap-2 border border-white/15 px-7 py-4 font-[700] uppercase tracking-wide text-white transition hover:border-white/40">
                {c.hero.cta_secundario} <ArrowUpRight className="h-4 w-4" aria-hidden />
              </a>
            </div>
          </div>
          {/* Foto no celular */}
          <Foto src={fotoHero} alt="" cor={misturar(cor, FUNDO, 0.7)} className="mt-10 aspect-[16/10] w-full md:hidden" />
        </div>
      </section>

      {/* Números */}
      <section className="border-y border-white/5 bg-[var(--painel)]">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-px bg-white/5 md:grid-cols-4">
          {temNota && <Numero valor={notaBR(c.prova_social.rating)} rotulo="Nota no Google" icone={<Star className="h-4 w-4 fill-current" aria-hidden />} />}
          {temNota && <Numero valor={numeroBR(c.prova_social.reviews_count)} rotulo="Avaliações de clientes" />}
          <Numero valor={horarioHoje ?? 'Consulte'} rotulo="Horário de hoje" icone={<Clock className="h-4 w-4" aria-hidden />} pequeno />
          <Numero valor={c.empresa.bairro || c.empresa.cidade} rotulo="Localização" icone={<MapPin className="h-4 w-4" aria-hidden />} pequeno />
        </div>
      </section>

      {/* Serviços */}
      <section id={idSecao.servicos} className="mx-auto max-w-6xl scroll-mt-24 px-5 py-20">
        <Cabecalho sobre="Serviços" titulo="O que fazemos pelo seu veículo" />
        <div className={`mt-12 grid gap-px overflow-hidden bg-white/5 ${colunasServicos(c.servicos.length)}`}>
          {c.servicos.map((s, i) => (
            <article key={i} className="group relative bg-[var(--fundo)] p-7 transition hover:bg-[var(--painel)]">
              <span data-n={String(i + 1).padStart(2, '0')} className="absolute right-6 top-5 text-4xl font-[800] text-white/5 before:content-[attr(data-n)]" style={condensada} aria-hidden />
              <Icone nome={s.icone} className="h-8 w-8 text-[var(--cor)]" />
              <h3 className="mt-5 text-2xl font-[700] uppercase text-white" style={condensada}>{s.titulo}</h3>
              <p className="mt-2 leading-relaxed text-zinc-400">{s.descricao}</p>
              <span className="absolute bottom-0 left-0 h-0.5 w-0 bg-[var(--cor)] transition-all duration-300 group-hover:w-full" aria-hidden />
            </article>
          ))}
        </div>
      </section>

      <Galeria fotos={fotos} nome={c.empresa.nome} cor={misturar(cor, FUNDO, 0.6)} escuro={true} estiloTitulo={condensada} />

      {/* Diferenciais */}
      <section className="bg-[var(--painel)]">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 md:grid-cols-[.9fr_1.1fr]">
          <div>
            <Cabecalho sobre="Por que confiar" titulo={c.empresa.tagline} />
            {fotos[1] && <Foto src={fotos[1]} alt={`Oficina ${c.empresa.nome}`} cor={misturar(cor, FUNDO, 0.7)} className="mt-8 hidden aspect-[4/3] w-full md:block" />}
          </div>
          <div className="space-y-4">
            {c.diferenciais.map((d, i) => (
              <div key={i} className="flex gap-5 border-l-2 border-[var(--cor)] bg-[var(--fundo)] p-6">
                <span className="text-3xl font-[800] text-[var(--cor)]" style={condensada}>{String(i + 1).padStart(2, '0')}</span>
                <div>
                  <h3 className="text-xl font-[700] uppercase text-white" style={condensada}>{d.titulo}</h3>
                  <p className="mt-1.5 leading-relaxed text-zinc-400">{d.descricao}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Como funciona */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <Cabecalho sobre="Simples assim" titulo="Como funciona" />
        <ol className="mt-12 grid gap-6 md:grid-cols-3">
          {passos.map((p, i) => (
            <li key={i} className="relative border border-white/10 p-7">
              <span className="absolute -top-4 left-6 bg-[var(--cor)] px-3 py-1 text-sm font-[800] text-[var(--sobre)]" style={condensada}>PASSO {i + 1}</span>
              <p.icone className="mt-2 h-7 w-7 text-white" aria-hidden />
              <h3 className="mt-4 text-xl font-[700] uppercase text-white" style={condensada}>{p.titulo}</h3>
              <p className="mt-1.5 text-zinc-400">{p.texto}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Avaliações reais do Google */}
      <AvaliacoesGoogle
        conteudo={c}
        avaliacoes={listaAvaliacoes}
        id={idSecao.avaliacoes}
        sobre="Avaliações reais no Google"
        titulo="Quem já passou por aqui"
        escuro={true}
        cor={cor}
        raio={'rounded-none'}
        estiloTitulo={condensada} classeTitulo="font-[800] uppercase"
      />

      {/* Localização */}
      <section id={idSecao.contato} className="mx-auto grid max-w-6xl scroll-mt-24 gap-10 px-5 py-20 md:grid-cols-2">
        <div>
          <Cabecalho sobre="Onde estamos" titulo="Traga seu veículo" />
          {c.empresa.endereco && (
            <p className="mt-6 flex gap-3 leading-relaxed">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[var(--cor)]" aria-hidden /> {enderecoCurto(c.empresa.endereco)}
            </p>
          )}
          {c.empresa.telefone_exibicao && tel && (
            <a href={tel} className="mt-3 flex items-center gap-3 hover:text-white">
              <Phone className="h-5 w-5 text-[var(--cor)]" aria-hidden /> {c.empresa.telefone_exibicao}
            </a>
          )}
          <div className="mt-8 flex flex-wrap gap-3">
            <LinkContato contato={contato} aoContatar={aoContatar} className={`${botao} px-6 py-3 text-sm`}>{c.hero.cta_primario}</LinkContato>
            {c.empresa.maps_url && (
              <a href={c.empresa.maps_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 border border-white/15 px-6 py-3 text-sm font-[700] uppercase tracking-wide text-white hover:border-white/40">
                <Navigation className="h-4 w-4" aria-hidden /> Como chegar
              </a>
            )}
          </div>
        </div>
        {c.horarios.length > 0 && (
          <div className="bg-[var(--painel)] p-7">
            <h3 className="flex items-center gap-2 text-xl font-[700] uppercase text-white" style={condensada}>
              <Clock className="h-5 w-5 text-[var(--cor)]" aria-hidden /> Horário de funcionamento
            </h3>
            <dl className="mt-4">
              {c.horarios.map((h) => (
                <div key={h.dia} className={`flex justify-between gap-4 border-b border-white/5 py-2.5 text-sm ${h.dia === hoje ? 'font-[600] text-[var(--cor)]' : ''}`}>
                  <dt>{h.dia}</dt>
                  <dd className="text-right">{h.horario}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </section>

      {c.empresa.endereco && (
        <div className="mx-auto max-w-6xl px-5 pt-16">
          <Mapa endereco={c.empresa.endereco} nome={c.empresa.nome} className="h-72 rounded-2xl ring-1 ring-white/10 sm:h-80" />
        </div>
      )}

      {/* FAQ */}
      {c.faq.length > 0 && (
        <section id={idSecao.faq} className="mx-auto max-w-3xl scroll-mt-24 px-5 pb-20">
          <Cabecalho sobre="Dúvidas" titulo="Perguntas frequentes" />
          <div className="mt-10">
            <Faq
              itens={c.faq}
              corIcone={cor}
              classeItem="border border-white/10 bg-[var(--painel)] px-6 py-5"
              classePergunta="text-lg font-[600] text-white"
              classeResposta="mt-3 leading-relaxed text-zinc-400"
            />
          </div>
        </section>
      )}

      {/* CTA final */}
      <section className="bg-[var(--cor)] text-[var(--sobre)]">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-8 px-5 py-16 md:flex-row md:items-center">
          <div>
            <h2 className="text-5xl font-[800] uppercase leading-none" style={condensada}>{c.cta_final.titulo}</h2>
            <p className="mt-3 max-w-xl text-lg opacity-85">{c.cta_final.texto}</p>
          </div>
          <LinkContato
            contato={contato}
            aoContatar={aoContatar}
            classeIcone="h-5 w-5 text-[#25d366]"
            className="inline-flex w-full shrink-0 items-center justify-center gap-2 bg-[var(--fundo)] px-8 py-4 font-[700] uppercase tracking-wide text-white transition hover:bg-black md:w-auto"
          >
            {c.cta_final.botao}
          </LinkContato>
        </div>
      </section>

      <footer className="bg-black">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-10 text-zinc-400 sm:flex-row sm:items-end sm:justify-between">
          <p className="text-2xl font-[800] uppercase text-white" style={condensada}>{c.empresa.nome}</p>
          <InfoLegal previa={previa} atribuicoes={atribuicoes} />
        </div>
      </footer>

      {contato && <WhatsFlutuante href={contato.href} tipo={contato.tipo} aoClicar={aoContatar} />}
    </div>
  );
}

function Cabecalho({ sobre, titulo }: { sobre: string; titulo: string }) {
  return (
    <div>
      <p className="text-sm font-[600] uppercase tracking-[.2em] text-[var(--cor)]">{sobre}</p>
      <h2 className="mt-2 text-4xl font-[800] uppercase leading-none text-white sm:text-5xl" style={condensada}>{titulo}</h2>
    </div>
  );
}

function Numero({ valor, rotulo, icone, pequeno }: { valor: string; rotulo: string; icone?: ReactNode; pequeno?: boolean }) {
  return (
    <div className="bg-[var(--painel)] px-5 py-7">
      <p className={`flex items-center gap-2 font-[800] uppercase text-white ${pequeno ? 'text-2xl' : 'text-4xl'}`} style={condensada}>
        {icone && <span className="text-[var(--cor)]">{icone}</span>}
        <span className="truncate">{valor}</span>
      </p>
      <p className="mt-1 text-xs uppercase tracking-wider text-zinc-400">{rotulo}</p>
    </div>
  );
}
