import { useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Configuracoes } from '@/lib/types';
import { useToast } from '@/components/ui/Toast';

const LARGURA_MAX = 480;
const ALTURA_MAX = 160;

/** Reduz a imagem (mantendo a transparência) para um data URL leve, próprio para a barra das prévias */
async function reduzirImagem(arquivo: File): Promise<string> {
  if (!arquivo.type.startsWith('image/')) throw new Error('Escolha um arquivo de imagem (PNG, JPG, SVG ou WebP).');
  if (arquivo.size > 8 * 1024 * 1024) throw new Error('Imagem muito grande (máximo 8 MB).');
  const url = URL.createObjectURL(arquivo);
  try {
    const img = await new Promise<HTMLImageElement>((ok, erro) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => erro(new Error('Não foi possível ler a imagem.'));
      i.src = url;
    });
    const larguraOriginal = img.naturalWidth || 300;
    const alturaOriginal = img.naturalHeight || 100;
    const escala = Math.min(1, LARGURA_MAX / larguraOriginal, ALTURA_MAX / alturaOriginal);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(larguraOriginal * escala));
    canvas.height = Math.max(1, Math.round(alturaOriginal * escala));
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const webp = canvas.toDataURL('image/webp', 0.9);
    return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Logo da agência exibida no topo das prévias (no lugar das iniciais) */
export function LogoAgencia({ logo, nome }: { logo: string | null; nome: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const campo = useRef<HTMLInputElement>(null);

  const salvar = useMutation({
    mutationFn: async (valor: string | null) => {
      const { data, error } = await supabase
        .from('configuracoes')
        .update({ negocio_logo: valor, atualizado_em: new Date().toISOString() })
        .eq('id', 1)
        .select()
        .single();
      if (error) {
        if (/negocio_logo/.test(error.message) && /column|schema cache/i.test(error.message)) {
          throw new Error('Rode antes o SQL 20260930000000_logo_agencia.sql no Supabase.');
        }
        throw error;
      }
      return data as Configuracoes;
    },
    onSuccess: (c, valor) => {
      qc.setQueryData(['configuracoes'], c);
      toast(valor ? 'Logo salva — já aparece nas prévias' : 'Logo removida');
    },
    onError: (e: Error) => toast(e.message, 'erro'),
  });

  const escolher = async (arquivo: File | undefined) => {
    if (!arquivo) return;
    try {
      salvar.mutate(await reduzirImagem(arquivo));
    } catch (e) {
      toast((e as Error).message, 'erro');
    } finally {
      if (campo.current) campo.current.value = '';
    }
  };

  return (
    <div>
      <span className="label">Logo da agência</span>
      <div className="flex flex-wrap items-center gap-3">
        {/* Mesma aparência da barra do topo das prévias */}
        <div className="flex h-12 min-w-[180px] items-center gap-2 rounded-md bg-[#0b1220] px-3 text-xs text-white">
          {logo ? (
            <span className="flex h-8 items-center rounded-md bg-white px-1.5">
              <img src={logo} alt="Logo da agência" className="h-6 w-auto max-w-[120px] object-contain" />
            </span>
          ) : (
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white/15 text-[11px] font-medium">
              {(nome || '?').slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="opacity-80">Prévia criada por {nome || 'sua agência'}</span>
        </div>
        <input
          ref={campo}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          onChange={(e) => escolher(e.target.files?.[0])}
        />
        <button type="button" className="btn-secundario" onClick={() => campo.current?.click()} disabled={salvar.isPending}>
          {salvar.isPending ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
          {logo ? 'Trocar logo' : 'Enviar logo'}
        </button>
        {logo && (
          <button type="button" className="btn-fantasma" onClick={() => salvar.mutate(null)} disabled={salvar.isPending}>
            <Trash2 size={15} /> Remover
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-fraco">
        Aparece no topo de todas as prévias. Use PNG com fundo transparente ou SVG; a imagem é reduzida automaticamente.
      </p>
    </div>
  );
}
