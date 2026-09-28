// "Posição no Google": consulta oficial (Places API), imagem com os concorrentes à frente e envio ao lead
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Copy, Download, Loader2, MessageCircle, RefreshCw, Search, Share2 } from 'lucide-react';
import { linkPrevia } from '@shared/mensagens';
import { supabase } from '@/lib/supabase';
import { appUrlDe, carregarConfigMensagem, linkWhatsApp } from '@/lib/fila';
import { consultarRanking, gerarImagemRanking, partesConsulta, textoRanking, ultimoRanking, type Ranking } from '@/lib/ranking';
import { formatarDataHora, paraE164 } from '@/lib/format';
import { Drawer } from '@/components/ui/Drawer';
import { useToast } from '@/components/ui/Toast';

export interface LeadRanking {
  id: string;
  nome: string;
  place_id: string;
  telefone: string | null;
  campanha_id: string | null;
}

/** Botão que abre o painel (usado em Leads, Aprovação e Envios) */
export function BotaoRanking({ lead, className = 'btn-secundario' }: { lead: LeadRanking; className?: string }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setAberto(true)} title="Ver a posição da empresa na busca do Google e enviar o print">
        <Search size={15} /> Posição no Google
      </button>
      {aberto && <RankingGoogle lead={lead} aoFechar={() => setAberto(false)} />}
    </>
  );
}

function RankingGoogle({ lead, aoFechar }: { lead: LeadRanking; aoFechar: () => void }) {
  const toast = useToast();

  const extras = useQuery({
    queryKey: ['ranking-extras', lead.id],
    queryFn: async () => {
      const [camp, site, cfg, ultimo] = await Promise.all([
        lead.campanha_id
          ? supabase.from('campanhas').select('termos_busca').eq('id', lead.campanha_id).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from('sites').select('slug,token_acesso,publicado').eq('lead_id', lead.id).maybeSingle(),
        carregarConfigMensagem(),
        ultimoRanking(lead.id),
      ]);
      const termos = ((camp.data as { termos_busca?: string[] } | null)?.termos_busca ?? []).filter(Boolean);
      const s = site.data as { slug: string; token_acesso: string; publicado: boolean } | null;
      // Só inclui o link se a prévia já foi aprovada (publicada); senão o lead abriria uma página fora do ar
      const link = s?.publicado ? linkPrevia(appUrlDe(cfg), s.slug, s.token_acesso) : undefined;
      return { termos, link, negocio: cfg.negocio_nome, ultimo };
    },
  });

  const [termo, setTermo] = useState('');
  const [ranking, setRanking] = useState<Ranking | null>(null);
  const [texto, setTexto] = useState('');
  const [imagem, setImagem] = useState<{ blob: Blob; url: string } | null>(null);

  // Termo inicial: o da última consulta ou o primeiro termo da campanha
  useEffect(() => {
    if (!extras.data || termo) return;
    const ultimo = extras.data.ultimo;
    setTermo(ultimo ? partesConsulta(ultimo.consulta).termo : extras.data.termos[0] ?? '');
    if (ultimo) setRanking(ultimo);
  }, [extras.data, termo]);

  const consultar = useMutation({
    mutationFn: (atualizar: boolean) => consultarRanking(lead.id, termo.trim(), atualizar),
    onSuccess: (r) => {
      setRanking(r);
      if (r.em_cache) toast('Consulta feita nos últimos 7 dias reaproveitada (não gastou busca)');
    },
    onError: (e: Error) => toast(e.message, 'erro'),
  });

  // Gera a imagem e o texto sempre que chega um resultado
  useEffect(() => {
    if (!ranking || !extras.data) return undefined;
    let cancelado = false;
    let url = '';
    setTexto(textoRanking(ranking, lead.nome, extras.data.negocio, extras.data.link));
    gerarImagemRanking(ranking, lead.place_id, lead.nome, extras.data.negocio)
      .then((blob) => {
        if (cancelado) return;
        url = URL.createObjectURL(blob);
        setImagem({ blob, url });
      })
      .catch((e: Error) => toast(e.message, 'erro'));
    return () => {
      cancelado = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [ranking, extras.data, lead.nome, lead.place_id, toast]);

  const nomeArquivo = useMemo(
    () => `posicao-google-${lead.nome.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.png`,
    [lead.nome],
  );
  const arquivo = imagem ? new File([imagem.blob], nomeArquivo, { type: 'image/png' }) : null;
  const podeCompartilhar = !!arquivo && typeof navigator.canShare === 'function' && navigator.canShare({ files: [arquivo] });
  const e164 = paraE164(lead.telefone);

  const compartilhar = async () => {
    if (!arquivo) return;
    try {
      await navigator.share({ files: [arquivo], text: texto });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast('Não foi possível compartilhar. Use "Baixar imagem".', 'erro');
    }
  };
  const baixar = () => {
    if (!imagem) return;
    const a = document.createElement('a');
    a.href = imagem.url;
    a.download = nomeArquivo;
    a.click();
  };
  const copiarImagem = async () => {
    if (!imagem) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': imagem.blob })]);
      toast('Imagem copiada: cole na conversa do WhatsApp (Ctrl+V)');
    } catch {
      toast('Este navegador não copia imagens. Use "Baixar imagem".', 'erro');
    }
  };
  const copiarTexto = () =>
    navigator.clipboard?.writeText(texto).then(() => toast('Mensagem copiada'), () => toast('Não foi possível copiar', 'erro'));

  const termos = extras.data?.termos ?? [];

  return (
    <Drawer aberto aoFechar={aoFechar} titulo={`Posição no Google · ${lead.nome}`} largura="max-w-2xl">
      <div className="space-y-5">
        <p className="text-sm text-suave">
          Consulta a busca oficial do Google (a mesma da coleta) e mostra em que posição a empresa aparece e quem está na frente.
          Cada consulta usa até 3 buscas do limite diário. Consultas dos últimos 7 dias são reaproveitadas de graça.
        </p>

        {/* Termo */}
        <div>
          <label className="label" htmlFor="termo-ranking">O que os clientes da empresa pesquisariam no Google</label>
          <div className="flex gap-2">
            <input
              id="termo-ranking"
              className="input"
              list="termos-ranking"
              placeholder="ex.: hamburgueria"
              value={termo}
              maxLength={80}
              onChange={(e) => setTermo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && termo.trim().length >= 2) consultar.mutate(false);
              }}
            />
            <datalist id="termos-ranking">{termos.map((t) => <option key={t} value={t} />)}</datalist>
            <button className="btn-primario shrink-0" onClick={() => consultar.mutate(false)} disabled={consultar.isPending || termo.trim().length < 2}>
              {consultar.isPending ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
              <span className="hidden sm:inline">Ver posição</span>
            </button>
          </div>
          {termos.length > 1 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {termos.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTermo(t)}
                  className={`rounded-full border px-2.5 py-1 text-xs ${t === termo ? 'border-marca bg-marca/10 text-marca' : 'border-borda text-suave hover:text-texto'}`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>

        {extras.isLoading && <p className="text-sm text-suave">Carregando…</p>}
        {extras.error && <p className="text-sm text-red-600">Erro ao carregar os dados do lead: {(extras.error as Error).message}</p>}

        {ranking && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-borda bg-elevado/50 px-3 py-2 text-sm">
              <span>
                {ranking.posicao ? (
                  <><b className="font-medium">{ranking.posicao}º lugar</b> em “{ranking.consulta}”</>
                ) : (
                  <>Fora das <b className="font-medium">{ranking.total}</b> primeiras em “{ranking.consulta}”</>
                )}
                <span className="text-fraco"> · {formatarDataHora(ranking.criado_em)}</span>
              </span>
              <button className="inline-flex items-center gap-1 text-xs text-marca hover:underline disabled:opacity-50" onClick={() => consultar.mutate(true)} disabled={consultar.isPending}>
                <RefreshCw size={12} /> Consultar de novo
              </button>
            </div>

            {ranking.posicao && ranking.posicao <= 3 && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                A empresa já aparece bem nesta busca. Experimente outro termo; esse argumento funciona melhor quando há concorrentes à frente.
              </p>
            )}

            {/* Imagem */}
            <div className="overflow-hidden rounded-lg border border-borda bg-elevado">
              {imagem ? (
                <img src={imagem.url} alt={`Posição de ${lead.nome} na busca do Google`} className="mx-auto block max-h-[70vh] w-auto max-w-full" />
              ) : (
                <div className="py-16 text-center text-sm text-suave">Gerando imagem…</div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              {podeCompartilhar && (
                <button className="btn col-span-2 bg-emerald-600 text-white hover:bg-emerald-700" onClick={compartilhar}>
                  <Share2 size={15} /> Compartilhar (WhatsApp…)
                </button>
              )}
              <button className="btn-secundario" onClick={baixar} disabled={!imagem}><Download size={15} /> Baixar imagem</button>
              <button className="btn-secundario" onClick={copiarImagem} disabled={!imagem}><Copy size={15} /> Copiar imagem</button>
            </div>

            {/* Mensagem */}
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="label mb-0" htmlFor="texto-ranking">Mensagem para acompanhar a imagem</label>
                <button className="text-xs text-marca hover:underline" onClick={copiarTexto}>Copiar texto</button>
              </div>
              <textarea id="texto-ranking" className="input min-h-[150px] leading-relaxed sm:text-[13px]" value={texto} onChange={(e) => setTexto(e.target.value)} />
              {e164 ? (
                <a href={linkWhatsApp(e164, texto)} target="_blank" rel="noopener noreferrer" className="btn mt-2 w-full border border-emerald-600/40 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400 sm:w-auto">
                  <MessageCircle size={15} /> Abrir conversa com a mensagem
                </a>
              ) : (
                <p className="mt-2 text-xs text-fraco">Lead sem telefone válido: copie a mensagem e a imagem.</p>
              )}
              <p className="mt-2 text-xs text-fraco">
                O WhatsApp não aceita imagem pelo link. No celular, use “Compartilhar” (envia imagem e texto juntos). No computador,
                abra a conversa, depois cole a imagem copiada (Ctrl+V). Nada é enviado sozinho.
              </p>
            </div>
          </>
        )}
      </div>
    </Drawer>
  );
}
