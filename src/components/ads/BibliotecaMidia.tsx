import { useRef, useState, type DragEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Film, ImageIcon, Loader2, Trash2, Upload } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { ContaAds, MidiaAds } from '@/lib/ads';
import {
  ACEITOS, BUCKET_MIDIA, ROTULO_PROPORCAO, caminhoMidia, enviarArquivo, formatarTamanho, lerInfoMidia, validarMidia,
} from '@/lib/midia';
import { formatarData } from '@/lib/format';
import { Drawer } from '@/components/ui/Drawer';
import { Erro } from '@/components/ui/Pagina';
import { useToast } from '@/components/ui/Toast';
import { IconeNivel } from './ComumAds';

type EstadoEnvio = 'lendo' | 'invalido' | 'enviando' | 'ok' | 'erro';
interface Envio {
  id: string;
  nome: string;
  estado: EstadoEnvio;
  progresso: number;
  mensagens: string[];
}

const ROTULO_ORIGEM = { cliente: 'Do cliente', agencia: 'Da agência', print_previa: 'Print da prévia' } as const;

/** Biblioteca de mídia da conta (bucket privado ads-midia). Fotos do Google Maps nunca entram aqui. */
export function BibliotecaMidia({ conta, aoFechar }: { conta: ContaAds | null; aoFechar: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const entrada = useRef<HTMLInputElement>(null);
  const [origem, setOrigem] = useState<'cliente' | 'agencia'>('cliente');
  const [envios, setEnvios] = useState<Envio[]>([]);
  const [arrastando, setArrastando] = useState(false);
  const [confirmar, setConfirmar] = useState<string | null>(null);

  const midias = useQuery({
    queryKey: ['midias-ads', conta?.id],
    enabled: !!conta,
    queryFn: async () => {
      const { data, error } = await supabase.from('midias_ads').select('*').eq('conta_id', conta!.id).order('criado_em', { ascending: false });
      if (error) throw new Error(/does not exist|schema cache/i.test(error.message) ? 'Rode o SQL da Fase 8 no Supabase (tabela midias_ads).' : error.message);
      const lista = data as MidiaAds[];
      const urls = new Map<string, string>();
      if (lista.length) {
        const { data: assinadas } = await supabase.storage.from(BUCKET_MIDIA).createSignedUrls(lista.map((m) => m.storage_path), 3600);
        for (const a of assinadas ?? []) if (a.signedUrl && a.path) urls.set(a.path, a.signedUrl);
      }
      return lista.map((m) => ({ ...m, url: urls.get(m.storage_path) ?? null }));
    },
  });

  const mudar = (id: string, p: Partial<Envio>) => setEnvios((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)));

  async function processar(arquivos: FileList | File[]) {
    if (!conta) return;
    const lista = Array.from(arquivos);
    const novos = lista.map((f) => ({ id: crypto.randomUUID(), nome: f.name, estado: 'lendo' as EstadoEnvio, progresso: 0, mensagens: [] }));
    setEnvios((l) => [...novos, ...l]);
    // Um arquivo por vez (vídeos grandes disputariam a banda)
    for (const [i, arquivo] of lista.entries()) {
      const id = novos[i].id;
      try {
        const info = await lerInfoMidia(arquivo);
        const { erros, avisos } = validarMidia(info);
        if (erros.length) {
          mudar(id, { estado: 'invalido', mensagens: erros });
          continue;
        }
        mudar(id, { estado: 'enviando', mensagens: avisos });
        const caminho = caminhoMidia(conta.id, arquivo.name);
        await enviarArquivo(caminho, arquivo, (p) => mudar(id, { progresso: p }));
        const { error } = await supabase.from('midias_ads').insert({
          conta_id: conta.id,
          storage_path: caminho,
          nome_original: arquivo.name.slice(0, 200),
          tipo: info.tipo,
          mime: info.mime,
          largura: info.largura,
          altura: info.altura,
          proporcao: info.proporcao,
          duracao_s: info.duracao_s,
          tamanho_bytes: info.tamanho,
          origem,
        });
        if (error) {
          await supabase.storage.from(BUCKET_MIDIA).remove([caminho]);
          throw new Error(error.message);
        }
        mudar(id, { estado: 'ok', progresso: 1 });
        qc.invalidateQueries({ queryKey: ['midias-ads', conta.id] });
      } catch (e) {
        mudar(id, { estado: 'erro', mensagens: [e instanceof Error ? e.message : String(e)] });
      }
    }
  }

  const excluir = useMutation({
    mutationFn: async (m: MidiaAds) => {
      const { error: e1 } = await supabase.storage.from(BUCKET_MIDIA).remove([m.storage_path]);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from('midias_ads').delete().eq('id', m.id);
      if (e2) throw e2;
    },
    onSuccess: () => {
      setConfirmar(null);
      toast('Mídia excluída');
      qc.invalidateQueries({ queryKey: ['midias-ads', conta?.id] });
    },
    onError: (e: Error) => toast(e.message, 'erro'),
  });

  const aoSoltar = (ev: DragEvent) => {
    ev.preventDefault();
    setArrastando(false);
    if (ev.dataTransfer.files.length) processar(ev.dataTransfer.files);
  };

  return (
    <Drawer aberto={!!conta} aoFechar={aoFechar} titulo={conta ? `Mídias · ${conta.nome}` : 'Mídias'} largura="max-w-3xl">
      <div className="space-y-5 text-sm">
        <p className="text-suave">
          Fotos e vídeos do cliente ou artes da agência para os anúncios. Imagem com pelo menos 1080 px de largura; vídeo até 4 GB;
          proporções 1:1, 4:5 ou 9:16. <span className="font-medium text-texto">Fotos do Google Maps não podem ser usadas em anúncios</span> (a licença não permite).
        </p>

        <div
          onDragOver={(ev) => {
            ev.preventDefault();
            setArrastando(true);
          }}
          onDragLeave={() => setArrastando(false)}
          onDrop={aoSoltar}
          className={`rounded-lg border-2 border-dashed px-4 py-6 text-center ${arrastando ? 'border-marca bg-marca/5' : 'border-borda'}`}
        >
          <Upload size={22} className="mx-auto text-fraco" />
          <p className="mt-2">Arraste os arquivos para cá ou</p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            <button className="btn-primario" onClick={() => entrada.current?.click()}>Escolher arquivos</button>
            <select className="input w-auto" value={origem} onChange={(ev) => setOrigem(ev.target.value as 'cliente' | 'agencia')} aria-label="Origem da mídia">
              <option value="cliente">Mídia do cliente</option>
              <option value="agencia">Arte da agência</option>
            </select>
          </div>
          <p className="mt-2 text-xs text-fraco">JPG, PNG, WebP, MP4 ou MOV</p>
          <input
            ref={entrada}
            type="file"
            multiple
            accept={ACEITOS}
            className="hidden"
            onChange={(ev) => {
              if (ev.target.files?.length) processar(ev.target.files);
              ev.target.value = '';
            }}
          />
        </div>

        {envios.length > 0 && (
          <ul className="space-y-2">
            {envios.map((x) => (
              <li key={x.id} className="rounded-md border border-borda px-3 py-2">
                <div className="flex items-center gap-2">
                  {x.estado === 'ok' ? <IconeNivel nivel="ok" /> : x.estado === 'invalido' || x.estado === 'erro' ? <IconeNivel nivel="erro" /> : <Loader2 size={14} className="animate-spin text-marca" />}
                  <span className="min-w-0 flex-1 truncate">{x.nome}</span>
                  <span className="shrink-0 text-xs text-suave">
                    {x.estado === 'lendo' ? 'Verificando…' : x.estado === 'enviando' ? `${Math.round(x.progresso * 100)}%` : x.estado === 'ok' ? 'Enviado' : x.estado === 'invalido' ? 'Recusado' : 'Falhou'}
                  </span>
                </div>
                {x.estado === 'enviando' && (
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-elevado">
                    <div className="h-full rounded-full bg-marca transition-all" style={{ width: `${Math.max(3, x.progresso * 100)}%` }} />
                  </div>
                )}
                {x.mensagens.map((m) => (
                  <p key={m} className={`mt-1 text-xs ${x.estado === 'invalido' || x.estado === 'erro' ? 'text-red-600' : 'text-amber-600'}`}>{m}</p>
                ))}
              </li>
            ))}
          </ul>
        )}

        {midias.error ? (
          <Erro erro={midias.error} />
        ) : midias.isLoading ? (
          <p className="text-suave">Carregando mídias…</p>
        ) : !midias.data?.length ? (
          <p className="rounded-md border border-dashed border-borda px-4 py-6 text-center text-suave">Nenhuma mídia ainda.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {midias.data.map((m) => (
              <li key={m.id} className="overflow-hidden rounded-lg border border-borda">
                <div className="relative flex aspect-square items-center justify-center bg-elevado">
                  {m.url ? (
                    m.tipo === 'imagem' ? (
                      <img src={m.url} alt={m.nome_original ?? 'Mídia'} className="h-full w-full object-contain" loading="lazy" />
                    ) : (
                      <video src={m.url} className="h-full w-full object-contain" preload="metadata" muted playsInline controls />
                    )
                  ) : m.tipo === 'imagem' ? <ImageIcon className="text-fraco" /> : <Film className="text-fraco" />}
                  {m.proporcao && (
                    <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-px text-[10px] font-medium text-white">{ROTULO_PROPORCAO[m.proporcao]}</span>
                  )}
                </div>
                <div className="space-y-0.5 px-2.5 py-2 text-xs">
                  <p className="truncate font-medium" title={m.nome_original ?? undefined}>{m.nome_original ?? m.storage_path}</p>
                  <p className="text-suave">
                    {m.largura}×{m.altura} · {formatarTamanho(m.tamanho_bytes)}{m.duracao_s ? ` · ${Math.round(m.duracao_s)} s` : ''}
                  </p>
                  <p className="text-fraco">{ROTULO_ORIGEM[m.origem]} · {formatarData(m.criado_em)}</p>
                  {confirmar === m.id ? (
                    <div className="flex gap-1 pt-1">
                      <button className="btn-perigo px-2 py-0.5 text-xs" onClick={() => excluir.mutate(m)} disabled={excluir.isPending}>Excluir</button>
                      <button className="btn-fantasma px-2 py-0.5 text-xs" onClick={() => setConfirmar(null)}>Cancelar</button>
                    </div>
                  ) : (
                    <button className="inline-flex items-center gap-1 pt-1 text-fraco hover:text-red-600" onClick={() => setConfirmar(m.id)}>
                      <Trash2 size={12} /> Excluir
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Drawer>
  );
}
