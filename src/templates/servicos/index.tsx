// Template SERVIÇOS — encanadores, eletricistas, chaveiros, reformas, assistências. Identidade: confiável e ágil.
import type { CSSProperties, ReactNode } from 'react';
import { BadgeCheck, CheckCircle2, Clock, MapPin, MessageSquareText, Navigation, Phone, ShieldCheck, Star, Wrench } from 'lucide-react';
import type { PropsTemplate } from '../types';
import { comContraste, corValida, misturar, textoSobre } from '../_comum/cores';
import { colunasServicos, contatoEmpresa, diaDeHoje, enderecoCurto, idSecao, iniciais, linkTelefone, notaBR, numeroBR } from '../_comum/util';
import { useFontes } from '../_comum/useFontes';
import { Foto } from '../_comum/Foto';
import { Estrelas } from '../_comum/Estrelas';
import { Faq } from '../_comum/Faq';
import { Icone } from '../_comum/Icone';
import { InfoLegal } from '../_comum/Rodape';
import { LinkContato } from '../_comum/Botao';

const FONTE = 'https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&display=swap';
const TINTA = '#0b1b33';

export default function TemplateServicos({ conteudo: c, fotos, atribuicoes, previa, aoContatar }: PropsTemplate) {
  useFontes(FONTE);
  const cor = corValida(c.tema.cor_primaria, '#1d4ed8');
  const corTexto = comContraste(cor, '#ffffff', 4.5);
  const sobreCor = textoSobre(cor);
  const suave = misturar(cor, '#ffffff', 0.92);
  const contato = contatoEmpresa(c);
  const tel = linkTelefone(c);
  const hoje = diaDeHoje();
  const horarioHoje = c.horarios.find((h) => h.dia === hoje)?.horario;
  const temNota = c.prova_social.rating != null && c.prova_social.reviews_count > 0;
  const fotoHero = fotos[c.hero.foto_index] ?? fotos[0];
  const vars = { '--cor': cor, '--cor-texto': corTexto, '--sobre': sobreCor, '--suave': suave, '--tinta': TINTA } as CSSProperties;
  const botao = 'inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--cor)] font-[800] text-[var(--sobre)] shadow-[0_14px_30px_-14px_var(--cor)] transition hover:brightness-110 active:scale-[.98]';
  const passos = [
    { icone: MessageSquareText, titulo: contato?.tipo === 'whatsapp' ? 'Chame no WhatsApp' : 'Entre em contato', texto: 'Explique o que precisa, se quiser mande fotos.' },
    { icone: Clock, titulo: 'Combine o atendimento', texto: 'Acerte com a equipe o melhor dia e horário.' },
    { icone: Wrench, titulo: 'Problema resolvido', texto: temNota ? 'Serviço feito por quem é bem avaliado pelos clientes.' : 'Atendimento combinado direto com a equipe.' },
  ];

  return (
    <div style={{ ...vars, fontFamily: "'Manrope', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" }} className="bg-white pb-20 text-base text-slate-700 antialiased md:pb-0">
      <header className="sticky top-[var(--barra,0px)] z-30 border-b border-slate-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
          <span className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--tinta)] text-sm font-[800] text-white">{iniciais(c.empresa.nome)}</span>
            <span className="truncate font-[800] text-[var(--tinta)]">{c.empresa.nome}</span>
          </span>
          <div className="hidden items-center gap-3 md:flex">
            {c.empresa.telefone_exibicao && tel && (
              <a href={tel} className="flex items-center gap-2 text-sm font-[700] text-[var(--tinta)]">
                <Phone className="h-4 w-4 text-[var(--cor-texto)]" aria-hidden /> {c.empresa.telefone_exibicao}
              </a>
            )}
            <LinkContato contato={contato} aoContatar={aoContatar} classeIcone="h-4 w-4" className={`${botao} px-4 py-2.5 text-sm`}>{c.hero.cta_primario}</LinkContato>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section id="topo" className="relative overflow-hidden bg-[var(--tinta)] text-white">
        <div className="absolute inset-0 opacity-[.07] [background-image:linear-gradient(white_1px,transparent_1px),linear-gradient(90deg,white_1px,transparent_1px)] [background-size:36px_36px]" aria-hidden />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-5 py-14 md:grid-cols-[1.1fr_.9fr] md:py-20">
          <div>
            <div className="flex flex-wrap gap-2">
              <Selo icone={<MapPin className="h-3.5 w-3.5" />}>{[c.empresa.bairro, c.empresa.cidade].filter(Boolean).join(', ')}</Selo>
              {horarioHoje && <Selo icone={<Clock className="h-3.5 w-3.5" />}>Hoje: {horarioHoje}</Selo>}
            </div>
            <h1 className="mt-6 text-[2.3rem] font-[800] leading-[1.05] tracking-tight sm:text-[3.4rem]">{c.hero.titulo}</h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-300">{c.hero.subtitulo}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <LinkContato contato={contato} aoContatar={aoContatar} className={`${botao} px-7 py-4 text-base`}>{c.hero.cta_primario}</LinkContato>
              {tel && contato?.tipo === 'whatsapp' && (
                <a href={tel} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 px-7 py-4 font-[700] ring-1 ring-white/20 transition hover:bg-white/15">
                  <Phone className="h-5 w-5" aria-hidden /> Ligar agora
                </a>
              )}
            </div>
            {temNota && (
              <div className="mt-8 flex items-center gap-3">
                <Estrelas nota={c.prova_social.rating!} />
                <span className="text-sm text-slate-300">{c.prova_social.frase}</span>
              </div>
            )}
          </div>
          <div className="relative">
            <Foto src={fotoHero} alt={`Foto de ${c.empresa.nome}`} prioridade cor={misturar(cor, TINTA, 0.4)} className="aspect-[4/3] w-full rounded-2xl ring-1 ring-white/10" />
            <div className="absolute -bottom-4 -left-2 flex items-center gap-3 rounded-xl bg-white px-4 py-3 text-slate-800 shadow-xl sm:-left-5">
              <ShieldCheck className="h-8 w-8 text-[var(--cor-texto)]" aria-hidden />
              <div className="leading-tight">
                <p className="text-sm font-[800]">{temNota ? `${notaBR(c.prova_social.rating)} no Google` : 'Atendimento local'}</p>
                <p className="text-xs text-slate-500">{temNota ? `${numeroBR(c.prova_social.reviews_count)} avaliações` : c.empresa.cidade}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Serviços */}
      <section id={idSecao.servicos} className="mx-auto max-w-6xl scroll-mt-24 px-5 py-20">
        <Titulo sobre="Serviços" titulo="Do que você precisa hoje?" />
        <div className={`mt-12 grid gap-4 ${colunasServicos(c.servicos.length)}`}>
          {c.servicos.map((s, i) => (
            <article key={i} className="rounded-2xl border border-slate-200 p-6 transition hover:border-[var(--cor)] hover:shadow-[0_18px_40px_-24px_var(--cor)]">
              <div className="flex items-center gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--suave)] text-[var(--cor-texto)]">
                  <Icone nome={s.icone} className="h-6 w-6" />
                </span>
                <h3 className="text-lg font-[800] leading-snug text-[var(--tinta)]">{s.titulo}</h3>
              </div>
              <p className="mt-4 leading-relaxed text-slate-600">{s.descricao}</p>
              <LinkContato contato={contato} aoContatar={aoContatar} classeIcone="h-4 w-4" className="mt-5 inline-flex items-center gap-1.5 text-sm font-[800] text-[var(--cor-texto)] hover:underline">
                Solicitar
              </LinkContato>
            </article>
          ))}
        </div>
      </section>

      {/* Como funciona */}
      <section className="bg-slate-50">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <Titulo sobre="Sem complicação" titulo="Como funciona o atendimento" />
          <ol className="mt-12 grid gap-6 md:grid-cols-3">
            {passos.map((p, i) => (
              <li key={i} className="relative rounded-2xl bg-white p-7 shadow-[0_1px_2px_rgba(15,23,42,.06)]">
                <span className="text-sm font-[800] text-[var(--cor-texto)]">0{i + 1}</span>
                <p.icone className="mt-3 h-8 w-8 text-[var(--tinta)]" aria-hidden />
                <h3 className="mt-4 text-lg font-[800] text-[var(--tinta)]">{p.titulo}</h3>
                <p className="mt-1.5 text-slate-600">{p.texto}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Diferenciais */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 md:grid-cols-2">
        <div>
          <Titulo sobre="Por que escolher" titulo={c.empresa.tagline} esquerda />
          <ul className="mt-8 space-y-5">
            {c.diferenciais.map((d, i) => (
              <li key={i} className="flex gap-4">
                <BadgeCheck className="mt-0.5 h-6 w-6 shrink-0 text-[var(--cor-texto)]" aria-hidden />
                <div>
                  <h3 className="font-[800] text-[var(--tinta)]">{d.titulo}</h3>
                  <p className="mt-1 leading-relaxed text-slate-600">{d.descricao}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <Foto src={fotos[1] ?? fotoHero} alt={`Trabalho de ${c.empresa.nome}`} cor={misturar(cor, '#ffffff', 0.3)} className="aspect-[4/3.4] w-full rounded-2xl" />
      </section>

      {/* Depoimentos */}
      {c.depoimentos.length > 0 && (
        <section id={idSecao.avaliacoes} className="scroll-mt-24 bg-[var(--suave)]">
          <div className="mx-auto max-w-6xl px-5 py-20">
            <Titulo sobre="Avaliações reais no Google" titulo="Clientes que recomendam" />
            <div className={`mt-12 grid gap-5 ${c.depoimentos.length > 2 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
              {c.depoimentos.map((d, i) => (
                <figure key={i} className="flex flex-col rounded-2xl bg-white p-7 shadow-[0_1px_2px_rgba(15,23,42,.06)]">
                  <div className="flex items-center justify-between">
                    <Estrelas nota={d.nota} />
                    <Star className="h-5 w-5 text-slate-200" aria-hidden />
                  </div>
                  <blockquote className="mt-4 flex-1 leading-relaxed text-slate-700">“{d.texto}”</blockquote>
                  <figcaption className="mt-6 text-sm">
                    <span className="font-[800] text-[var(--tinta)]">{d.autor}</span>
                    <span className="text-slate-500">{d.data ? ` · ${d.data}` : ''}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Contato */}
      <section id={idSecao.contato} className="mx-auto grid max-w-6xl scroll-mt-24 gap-8 px-5 py-20 md:grid-cols-2">
        <div className="rounded-2xl bg-[var(--tinta)] p-8 text-white">
          <h2 className="text-3xl font-[800] tracking-tight">Fale com a gente</h2>
          <ul className="mt-6 space-y-4 text-slate-300">
            {c.empresa.endereco && (
              <li className="flex gap-3"><MapPin className="mt-0.5 h-5 w-5 shrink-0 text-white" aria-hidden /> {enderecoCurto(c.empresa.endereco)}</li>
            )}
            {c.empresa.telefone_exibicao && tel && (
              <li><a href={tel} className="flex gap-3 hover:text-white"><Phone className="h-5 w-5 text-white" aria-hidden /> {c.empresa.telefone_exibicao}</a></li>
            )}
          </ul>
          <div className="mt-8 flex flex-wrap gap-3">
            <LinkContato contato={contato} aoContatar={aoContatar} className={`${botao} px-6 py-3 text-sm`}>{c.hero.cta_primario}</LinkContato>
            {c.empresa.maps_url && (
              <a href={c.empresa.maps_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-[700] ring-1 ring-white/25 hover:bg-white/10">
                <Navigation className="h-4 w-4" aria-hidden /> Como chegar
              </a>
            )}
          </div>
        </div>
        {c.horarios.length > 0 && (
          <div className="rounded-2xl border border-slate-200 p-8">
            <h3 className="flex items-center gap-2 text-lg font-[800] text-[var(--tinta)]"><Clock className="h-5 w-5 text-[var(--cor-texto)]" aria-hidden /> Horário de atendimento</h3>
            <dl className="mt-4 divide-y divide-slate-100">
              {c.horarios.map((h) => (
                <div key={h.dia} className={`flex justify-between gap-4 py-2.5 text-sm ${h.dia === hoje ? 'font-[800] text-[var(--cor-texto)]' : ''}`}>
                  <dt>{h.dia}</dt>
                  <dd className="text-right">{h.horario}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </section>

      {/* FAQ */}
      {c.faq.length > 0 && (
        <section id={idSecao.faq} className="mx-auto max-w-3xl scroll-mt-24 px-5 pb-20">
          <Titulo sobre="Dúvidas" titulo="Perguntas frequentes" />
          <div className="mt-10">
            <Faq
              itens={c.faq}
              corIcone={corTexto}
              classeItem="rounded-2xl border border-slate-200 px-6 py-5"
              classePergunta="font-[800] text-[var(--tinta)]"
              classeResposta="mt-3 leading-relaxed text-slate-600"
            />
          </div>
        </section>
      )}

      {/* CTA final */}
      <section className="bg-[var(--cor)] text-[var(--sobre)]">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-5 py-14 md:flex-row md:items-center">
          <div>
            <h2 className="text-3xl font-[800] tracking-tight sm:text-4xl">{c.cta_final.titulo}</h2>
            <p className="mt-2 max-w-xl text-lg opacity-90">{c.cta_final.texto}</p>
          </div>
          <LinkContato contato={contato} aoContatar={aoContatar} classeIcone="h-5 w-5 text-[#25d366]" className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-7 py-4 font-[800] text-[var(--tinta)] shadow-lg transition hover:scale-[1.02] md:w-auto">
            {c.cta_final.botao}
          </LinkContato>
        </div>
      </section>

      <footer className="bg-[var(--tinta)] text-slate-300">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-10 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-[800] text-white">{c.empresa.nome}</p>
            <p className="mt-1 flex items-center gap-1.5 text-sm"><CheckCircle2 className="h-4 w-4" aria-hidden /> {c.empresa.tagline}</p>
          </div>
          <InfoLegal previa={previa} atribuicoes={atribuicoes} />
        </div>
      </footer>

      {/* Barra de ação fixa no celular */}
      {contato && (
        <div className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-2 gap-2 border-t border-slate-200 bg-white/95 p-3 backdrop-blur md:hidden">
          {tel ? (
            <a href={tel} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 py-3.5 font-[800] text-[var(--tinta)]">
              <Phone className="h-5 w-5" aria-hidden /> Ligar
            </a>
          ) : <span />}
          <LinkContato contato={contato} aoContatar={aoContatar} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#15803d] py-3.5 font-[800] text-white">
            {contato.tipo === 'whatsapp' ? 'WhatsApp' : 'Contato'}
          </LinkContato>
        </div>
      )}
    </div>
  );
}

function Titulo({ sobre, titulo, esquerda }: { sobre: string; titulo: string; esquerda?: boolean }) {
  return (
    <div className={esquerda ? '' : 'mx-auto max-w-2xl text-center'}>
      <p className="text-sm font-[800] uppercase tracking-[.14em] text-[var(--cor-texto)]">{sobre}</p>
      <h2 className="mt-3 text-3xl font-[800] leading-tight tracking-tight text-[var(--tinta)] sm:text-[2.4rem]">{titulo}</h2>
    </div>
  );
}

function Selo({ icone, children }: { icone: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-[700] text-white ring-1 ring-white/15">
      {icone}
      {children}
    </span>
  );
}
