// Template SAÚDE — clínicas, consultórios, dentistas. Identidade: limpa, acolhedora, transmite confiança.
import type { CSSProperties, ReactNode } from 'react';
import { LinkContato } from '../_comum/Botao';
import { ArrowRight, CheckCircle2, Clock, MapPin, Navigation, Phone, ShieldCheck, Star } from 'lucide-react';
import type { PropsTemplate } from '../types';
import { comContraste, corValida, misturar, textoSobre } from '../_comum/cores';
import { colunasServicos, contatoEmpresa, diaDeHoje, enderecoCurto, idSecao, iniciais, linkTelefone, notaBR, numeroBR } from '../_comum/util';
import { useFontes } from '../_comum/useFontes';
import { AvaliacoesGoogle } from '../_comum/AvaliacoesGoogle';
import { avaliacoesParaExibir } from '../_comum/avaliacoes';
import { Mapa } from '../_comum/Mapa';
import { Galeria } from '../_comum/Galeria';
import { Foto } from '../_comum/Foto';
import { Estrelas } from '../_comum/Estrelas';
import { Faq } from '../_comum/Faq';
import { Icone, IconeWhatsApp } from '../_comum/Icone';
import { InfoLegal } from '../_comum/Rodape';
import { WhatsFlutuante } from '../_comum/WhatsFlutuante';

const FONTE = 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap';

export default function TemplateSaude({ conteudo: c, fotos, atribuicoes, avaliacoes = [], previa, aoContatar }: PropsTemplate) {
  useFontes(FONTE);
  const listaAvaliacoes = avaliacoesParaExibir(c.depoimentos, avaliacoes);
  const cor = corValida(c.tema.cor_primaria, '#0f766e');
  const corTexto = comContraste(cor, '#ffffff', 4.5);
  const sobreCor = textoSobre(cor);
  const suave = misturar(cor, '#ffffff', 0.93);
  const raio = c.tema.estilo === 'bold' ? 'rounded-xl' : 'rounded-3xl';
  const contato = contatoEmpresa(c);
  const tel = linkTelefone(c);
  const hoje = diaDeHoje();
  const horarioHoje = c.horarios.find((h) => h.dia === hoje)?.horario;
  const fotoHero = fotos[c.hero.foto_index] ?? fotos[0];
  const temNota = c.prova_social.rating != null && c.prova_social.reviews_count > 0;

  const vars = { '--cor': cor, '--cor-texto': corTexto, '--sobre': sobreCor, '--suave': suave } as CSSProperties;

  const classeBotao = (grande?: boolean) =>
    `inline-flex items-center justify-center gap-2 bg-[var(--cor)] font-[700] text-[var(--sobre)] shadow-[0_12px_30px_-12px_var(--cor)] transition hover:brightness-110 active:scale-[.98] ${
      grande ? 'rounded-full px-7 py-4 text-base' : 'rounded-full px-5 py-2.5 text-sm'
    }`;

  return (
    <div style={{ ...vars, fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" }} className="bg-white text-base text-slate-800 antialiased">
      {/* Cabeçalho */}
      <header className="sticky top-[var(--barra,0px)] z-30 border-b border-slate-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
          <a href="#topo" className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--cor)] text-sm font-[800] text-[var(--sobre)]">
              {iniciais(c.empresa.nome)}
            </span>
            <span className="truncate text-[15px] font-[800] tracking-tight text-slate-900">{c.empresa.nome}</span>
          </a>
          <nav className="hidden items-center gap-7 text-sm font-[600] text-slate-600 md:flex">
            <a href={`#${idSecao.servicos}`} className="hover:text-[var(--cor-texto)]">Serviços</a>
            {listaAvaliacoes.length > 0 && <a href={`#${idSecao.avaliacoes}`} className="hover:text-[var(--cor-texto)]">Avaliações</a>}
            <a href={`#${idSecao.contato}`} className="hover:text-[var(--cor-texto)]">Localização</a>
          </nav>
          <LinkContato contato={contato} aoContatar={aoContatar} className={classeBotao()}>
            <span className="hidden sm:inline">{c.hero.cta_primario}</span>
            <span className="sm:hidden">Contato</span>
          </LinkContato>
        </div>
      </header>

      {/* Hero */}
      <section id="topo" className="relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 -z-0 h-[520px] bg-[radial-gradient(ellipse_at_top_left,var(--suave),transparent_65%)]" aria-hidden />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-5 pb-16 pt-10 md:grid-cols-[1.05fr_.95fr] md:pb-24 md:pt-16">
          <div>
            {(c.empresa.bairro || c.empresa.cidade) && (
              <p className="mb-5 inline-flex items-center gap-1.5 rounded-full bg-[var(--suave)] px-3.5 py-1.5 text-xs font-[700] text-[var(--cor-texto)]">
                <MapPin className="h-3.5 w-3.5" aria-hidden />
                {[c.empresa.bairro, c.empresa.cidade].filter(Boolean).join(' · ')}
              </p>
            )}
            <h1 className="text-[2.15rem] font-[800] leading-[1.08] tracking-tight text-slate-900 sm:text-5xl">{c.hero.titulo}</h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600">{c.hero.subtitulo}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <LinkContato contato={contato} aoContatar={aoContatar} className={classeBotao(true)}>{c.hero.cta_primario}</LinkContato>
              <a href={`#${idSecao.servicos}`} className="inline-flex items-center justify-center gap-1.5 rounded-full px-6 py-4 font-[700] text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50">
                {c.hero.cta_secundario} <ArrowRight className="h-4 w-4" aria-hidden />
              </a>
            </div>
            {temNota && (
              <div className="mt-8 flex items-center gap-3 text-sm text-slate-600">
                <Estrelas nota={c.prova_social.rating!} />
                <span>{c.prova_social.frase}</span>
              </div>
            )}
          </div>
          <div className="relative">
            <Foto
              src={fotoHero}
              alt={`Foto de ${c.empresa.nome}`}
              prioridade
              cor={cor}
              className={`aspect-[4/3] w-full ${raio} shadow-[0_30px_60px_-25px_rgba(15,23,42,.35)] md:aspect-[4/4.2]`}
            />
            {temNota && (
              <div className="absolute -bottom-5 left-4 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-[0_18px_40px_-15px_rgba(15,23,42,.35)] sm:left-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-50">
                  <Star className="h-5 w-5 fill-amber-400 text-amber-400" aria-hidden />
                </span>
                <div className="leading-tight">
                  <p className="text-lg font-[800] text-slate-900">{notaBR(c.prova_social.rating)}</p>
                  <p className="text-xs text-slate-500">{numeroBR(c.prova_social.reviews_count)} avaliações no Google</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Faixa de confiança */}
      <section className="border-y border-slate-100 bg-slate-50/60">
        <div className="mx-auto grid max-w-6xl gap-6 px-5 py-7 sm:grid-cols-3">
          <Destaque icone={<ShieldCheck className="h-5 w-5" />} titulo="Atendimento próximo" texto={c.empresa.bairro ? `No ${c.empresa.bairro}, ${c.empresa.cidade}` : c.empresa.cidade} />
          <Destaque
            icone={<Clock className="h-5 w-5" />}
            titulo={horarioHoje ? `Hoje: ${horarioHoje}` : 'Horários'}
            texto={c.horarios.length ? 'Confira todos os horários abaixo' : 'Consulte pelo WhatsApp'}
          />
          <Destaque
            icone={contato?.tipo === 'whatsapp' ? <IconeWhatsApp className="h-5 w-5" /> : <Phone className="h-5 w-5" />}
            titulo={contato?.tipo === 'whatsapp' ? 'Agendamento pelo WhatsApp' : 'Fale com a recepção'}
            texto={c.empresa.telefone_exibicao || 'Contato rápido'}
          />
        </div>
      </section>

      {/* Serviços */}
      <section id={idSecao.servicos} className="mx-auto max-w-6xl scroll-mt-28 px-5 py-20">
        <Titulo sobre="Serviços" titulo="Como podemos cuidar de você" />
        <div className={`mt-12 grid gap-5 ${colunasServicos(c.servicos.length)}`}>
          {c.servicos.map((s, i) => (
            <article key={i} className={`group ${raio} border border-slate-100 bg-white p-7 shadow-[0_1px_2px_rgba(15,23,42,.04)] transition hover:-translate-y-0.5 hover:border-[var(--suave)] hover:shadow-[0_20px_40px_-20px_rgba(15,23,42,.25)]`}>
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--suave)] text-[var(--cor-texto)]">
                <Icone nome={s.icone} className="h-6 w-6" />
              </span>
              <h3 className="mt-5 text-lg font-[700] text-slate-900">{s.titulo}</h3>
              <p className="mt-2 leading-relaxed text-slate-600">{s.descricao}</p>
            </article>
          ))}
        </div>
      </section>

      <Galeria fotos={fotos} nome={c.empresa.nome} cor={misturar(cor, '#ffffff', 0.3)} escuro={false} />

      {/* Diferenciais */}
      <section className="bg-[var(--suave)]">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 md:grid-cols-2">
          <Foto src={fotos[1] ?? fotos[0]} alt={`Ambiente de ${c.empresa.nome}`} cor={misturar(cor, '#ffffff', 0.35)} className={`aspect-[5/4] w-full ${raio}`} />
          <div>
            <Titulo sobre="Por que nos escolher" titulo={c.empresa.tagline} esquerda />
            <ul className="mt-8 space-y-6">
              {c.diferenciais.map((d, i) => (
                <li key={i} className="flex gap-4">
                  <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-[var(--cor-texto)]" aria-hidden />
                  <div>
                    <h3 className="font-[700] text-slate-900">{d.titulo}</h3>
                    <p className="mt-1 leading-relaxed text-slate-600">{d.descricao}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Avaliações reais do Google */}
      <AvaliacoesGoogle
        conteudo={c}
        avaliacoes={listaAvaliacoes}
        id={idSecao.avaliacoes}
        sobre="Avaliações reais no Google"
        titulo="O que dizem nossos pacientes"
        escuro={false}
        cor={corTexto}
        raio={raio}
        classeTitulo="font-[800] tracking-tight"
      />

      {/* Localização e horários */}
      <section id={idSecao.contato} className="scroll-mt-28 bg-slate-900 text-slate-100">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 md:grid-cols-2">
          <div>
            <p className="text-sm font-[700] uppercase tracking-[.14em] text-[color:var(--suave)]">Onde estamos</p>
            <h2 className="mt-3 text-3xl font-[800] tracking-tight text-white">Venha nos visitar</h2>
            {c.empresa.endereco && (
              <p className="mt-5 flex gap-3 leading-relaxed text-slate-300">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /> {enderecoCurto(c.empresa.endereco)}
              </p>
            )}
            {c.empresa.telefone_exibicao && tel && (
              <a href={tel} className="mt-3 flex items-center gap-3 text-slate-300 hover:text-white">
                <Phone className="h-5 w-5 shrink-0" aria-hidden /> {c.empresa.telefone_exibicao}
              </a>
            )}
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkContato contato={contato} aoContatar={aoContatar} className={classeBotao()}>{c.hero.cta_primario}</LinkContato>
              {c.empresa.maps_url && (
                <a href={c.empresa.maps_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-[700] text-white ring-1 ring-white/25 hover:bg-white/10">
                  <Navigation className="h-4 w-4" aria-hidden /> Como chegar
                </a>
              )}
            </div>
          </div>
          {c.horarios.length > 0 && (
            <div className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
              <h3 className="flex items-center gap-2 font-[700] text-white">
                <Clock className="h-5 w-5" aria-hidden /> Horário de atendimento
              </h3>
              <dl className="mt-4 divide-y divide-white/10">
                {c.horarios.map((h) => (
                  <div key={h.dia} className={`flex justify-between gap-4 py-2.5 text-sm ${h.dia === hoje ? 'font-[700] text-white' : 'text-slate-300'}`}>
                    <dt>{h.dia}{h.dia === hoje && <span className="ml-2 rounded-full bg-[var(--cor)] px-2 py-0.5 text-[10px] text-[var(--sobre)]">hoje</span>}</dt>
                    <dd className="text-right">{h.horario}</dd>
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
        <section id={idSecao.faq} className="mx-auto max-w-3xl scroll-mt-28 px-5 py-20">
          <Titulo sobre="Dúvidas" titulo="Perguntas frequentes" />
          <div className="mt-10">
            <Faq
              itens={c.faq}
              corIcone={corTexto}
              classeItem={`${raio} border border-slate-100 bg-white px-6 py-5 open:shadow-[0_12px_30px_-20px_rgba(15,23,42,.3)]`}
              classePergunta="font-[700] text-slate-900"
              classeResposta="mt-3 leading-relaxed text-slate-600"
            />
          </div>
        </section>
      )}

      {/* CTA final */}
      <section className="px-5 pb-20">
        <div className={`mx-auto max-w-6xl overflow-hidden ${raio} bg-[var(--cor)] px-7 py-14 text-center text-[var(--sobre)] sm:px-14`}>
          <h2 className="text-3xl font-[800] tracking-tight sm:text-4xl">{c.cta_final.titulo}</h2>
          <p className="mx-auto mt-4 max-w-xl text-lg opacity-90">{c.cta_final.texto}</p>
          <LinkContato
            contato={contato}
            aoContatar={aoContatar}
            classeIcone="h-5 w-5 text-[#25d366]"
            className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-7 py-4 font-[800] text-slate-900 shadow-lg transition hover:scale-[1.02] sm:w-auto"
          >
            {c.cta_final.botao}
          </LinkContato>
        </div>
      </section>

      <footer className="border-t border-slate-100 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-10 text-slate-600 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-[800] text-slate-900">{c.empresa.nome}</p>
            <p className="mt-1 text-sm">{c.empresa.tagline}</p>
          </div>
          <InfoLegal previa={previa} atribuicoes={atribuicoes} />
        </div>
      </footer>

      {contato && <WhatsFlutuante href={contato.href} tipo={contato.tipo} aoClicar={aoContatar} />}
    </div>
  );
}

function Titulo({ sobre, titulo, esquerda }: { sobre: string; titulo: string; esquerda?: boolean }) {
  return (
    <div className={esquerda ? '' : 'mx-auto max-w-2xl text-center'}>
      <p className="text-sm font-[700] uppercase tracking-[.14em] text-[var(--cor-texto)]">{sobre}</p>
      <h2 className="mt-3 text-3xl font-[800] leading-tight tracking-tight text-slate-900 sm:text-[2.5rem]">{titulo}</h2>
    </div>
  );
}

function Destaque({ icone, titulo, texto }: { icone: ReactNode; titulo: string; texto: string }) {
  return (
    <div className="flex items-center gap-4">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-[var(--cor-texto)] shadow-sm ring-1 ring-slate-100">{icone}</span>
      <div className="min-w-0">
        <p className="truncate font-[700] text-slate-900">{titulo}</p>
        <p className="truncate text-sm text-slate-500">{texto}</p>
      </div>
    </div>
  );
}
