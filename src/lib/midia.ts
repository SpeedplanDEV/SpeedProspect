// Mídias dos anúncios: leitura de dimensões, validação (regras da Meta) e envio ao Storage (bucket ads-midia).
// Arquivos pequenos vão em uma requisição; grandes (vídeos) vão em partes de 6 MB pelo protocolo TUS do Supabase.
import { supabase } from './supabase';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config';

export const BUCKET_MIDIA = 'ads-midia';
export type Proporcao = '1x1' | '4x5' | '9x16';

export interface InfoMidia {
  tipo: 'imagem' | 'video';
  mime: string;
  largura: number;
  altura: number;
  proporcao: Proporcao | null;
  duracao_s: number | null;
  tamanho: number;
}

const PROPORCOES: { valor: Proporcao; razao: number }[] = [
  { valor: '1x1', razao: 1 },
  { valor: '4x5', razao: 4 / 5 },
  { valor: '9x16', razao: 9 / 16 },
];
export const ROTULO_PROPORCAO: Record<Proporcao, string> = { '1x1': '1:1 (Feed)', '4x5': '4:5 (Feed)', '9x16': '9:16 (Stories/Reels)' };

const TIPOS_IMAGEM = ['image/jpeg', 'image/png', 'image/webp'];
const TIPOS_VIDEO = ['video/mp4', 'video/quicktime'];
export const ACEITOS = [...TIPOS_IMAGEM, ...TIPOS_VIDEO].join(',');

const MB = 1024 * 1024;
const LIMITE_IMAGEM = 30 * MB; // limite da Meta para imagens
const LIMITE_VIDEO = 4 * 1024 * MB; // 4 GB
const PARTE_TUS = 6 * MB; // o Supabase exige partes de 6 MB no upload retomável

/** Proporção reconhecida (tolerância de 2%) ou null */
export function detectarProporcao(largura: number, altura: number): Proporcao | null {
  if (!largura || !altura) return null;
  const r = largura / altura;
  return PROPORCOES.find((p) => Math.abs(r - p.razao) / p.razao <= 0.02)?.valor ?? null;
}

/** Lê largura, altura e duração do arquivo no navegador (sem enviar nada) */
export async function lerInfoMidia(arquivo: File): Promise<InfoMidia> {
  const url = URL.createObjectURL(arquivo);
  try {
    if (arquivo.type.startsWith('image/')) {
      const img = await new Promise<HTMLImageElement>((ok, erro) => {
        const i = new Image();
        i.onload = () => ok(i);
        i.onerror = () => erro(new Error('Não foi possível ler a imagem.'));
        i.src = url;
      });
      return {
        tipo: 'imagem', mime: arquivo.type, largura: img.naturalWidth, altura: img.naturalHeight,
        proporcao: detectarProporcao(img.naturalWidth, img.naturalHeight), duracao_s: null, tamanho: arquivo.size,
      };
    }
    if (arquivo.type.startsWith('video/')) {
      const v = await new Promise<HTMLVideoElement>((ok, erro) => {
        const el = document.createElement('video');
        el.preload = 'metadata';
        el.muted = true;
        el.onloadedmetadata = () => ok(el);
        el.onerror = () => erro(new Error('Não foi possível ler o vídeo (formatos aceitos: MP4 e MOV).'));
        el.src = url;
      });
      return {
        tipo: 'video', mime: arquivo.type, largura: v.videoWidth, altura: v.videoHeight,
        proporcao: detectarProporcao(v.videoWidth, v.videoHeight),
        duracao_s: Number.isFinite(v.duration) ? Math.round(v.duration * 100) / 100 : null, tamanho: arquivo.size,
      };
    }
    throw new Error('Formato não aceito. Use JPG, PNG, WebP, MP4 ou MOV.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Regras: imagem ≥ 1080 px de largura, vídeo ≤ 4 GB, proporções 1:1, 4:5 ou 9:16 */
export function validarMidia(info: InfoMidia): { erros: string[]; avisos: string[] } {
  const erros: string[] = [];
  const avisos: string[] = [];
  const dims = `${info.largura}×${info.altura}`;
  if (info.tipo === 'imagem') {
    if (!TIPOS_IMAGEM.includes(info.mime)) erros.push('Imagem deve ser JPG, PNG ou WebP.');
    if (info.largura < 1080) erros.push(`Imagem com ${dims} px: a largura mínima é 1080 px.`);
    if (info.tamanho > LIMITE_IMAGEM) erros.push('Imagem acima de 30 MB (limite da Meta).');
  } else {
    if (!TIPOS_VIDEO.includes(info.mime)) erros.push('Vídeo deve ser MP4 ou MOV.');
    if (info.tamanho > LIMITE_VIDEO) erros.push('Vídeo acima de 4 GB (limite da Meta).');
    if (info.largura && info.largura < 1080) avisos.push(`Vídeo com ${dims} px: o ideal é 1080 px de largura.`);
    if (info.duracao_s && info.duracao_s > 60) avisos.push('Vídeos de 15 a 30 s costumam render mais em anúncios locais.');
  }
  if (!info.proporcao) {
    erros.push(`Proporção ${dims} não aceita: use 1:1 (1080×1080), 4:5 (1080×1350) ou 9:16 (1080×1920).`);
  }
  return { erros, avisos };
}

const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)));

/** Mensagem clara para os erros de envio mais comuns */
function traduzirErroUpload(status: number, texto: string): string {
  if (status === 413 || /maximum allowed size|payload too large|exceeded/i.test(texto)) {
    return 'O arquivo passa do limite de upload do seu Supabase (no plano gratuito, 50 MB por arquivo). Comprima o vídeo ou aumente o limite em Storage → Settings.';
  }
  if (status === 403 || /row-level security|unauthorized/i.test(texto)) {
    return 'Sem permissão para enviar: rode o SQL da Fase 8 (bucket ads-midia) e confira se você é operador.';
  }
  if (/bucket not found/i.test(texto)) return 'O bucket ads-midia não existe: rode o SQL da Fase 8 no Supabase.';
  if (/already exists|duplicate/i.test(texto)) return 'Já existe um arquivo com esse nome.';
  return `Falha no envio (${status || 'rede'}): ${texto.slice(0, 200)}`;
}

/**
 * Envia para o Storage. Até 6 MB: upload simples. Acima: upload retomável (TUS) em partes de 6 MB,
 * com progresso (0 a 1). Em caso de falha no meio, basta reenviar.
 */
export async function enviarArquivo(caminho: string, arquivo: File, aoProgredir?: (p: number) => void): Promise<void> {
  if (arquivo.size <= PARTE_TUS) {
    const { error } = await supabase.storage.from(BUCKET_MIDIA).upload(caminho, arquivo, { contentType: arquivo.type, upsert: false });
    if (error) throw new Error(traduzirErroUpload(Number((error as { statusCode?: string }).statusCode) || 0, error.message));
    aoProgredir?.(1);
    return;
  }

  const { data: sessao } = await supabase.auth.getSession();
  const token = sessao.session?.access_token;
  if (!token) throw new Error('Sessão expirada: entre de novo no sistema.');
  const cabecalhos = { authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY, 'tus-resumable': '1.0.0' };

  const criar = await fetch(`${SUPABASE_URL}/storage/v1/upload/resumable`, {
    method: 'POST',
    headers: {
      ...cabecalhos,
      'upload-length': String(arquivo.size),
      'upload-metadata': [
        `bucketName ${b64(BUCKET_MIDIA)}`,
        `objectName ${b64(caminho)}`,
        `contentType ${b64(arquivo.type)}`,
        `cacheControl ${b64('3600')}`,
      ].join(','),
      'x-upsert': 'false',
    },
  });
  if (criar.status !== 201) throw new Error(traduzirErroUpload(criar.status, await criar.text()));
  const local = criar.headers.get('location');
  if (!local) throw new Error('O Storage não informou o endereço do envio (cabeçalho Location).');

  let offset = 0;
  while (offset < arquivo.size) {
    const parte = arquivo.slice(offset, Math.min(offset + PARTE_TUS, arquivo.size));
    let resp: Response | null = null;
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      try {
        resp = await fetch(local, {
          method: 'PATCH',
          headers: { ...cabecalhos, 'upload-offset': String(offset), 'content-type': 'application/offset+octet-stream' },
          body: parte,
        });
        if (resp.status === 204) break;
      } catch {
        resp = null;
      }
      await new Promise((r) => setTimeout(r, 1000 * 2 ** tentativa));
    }
    if (!resp || resp.status !== 204) throw new Error(traduzirErroUpload(resp?.status ?? 0, resp ? await resp.text() : 'sem resposta'));
    offset = Number(resp.headers.get('upload-offset') ?? offset + parte.size);
    aoProgredir?.(offset / arquivo.size);
  }
}

/** Nome de arquivo seguro para o Storage: conta/aaaa-mm/uuid-nome.ext */
export function caminhoMidia(contaId: string, nomeOriginal: string): string {
  const ext = (nomeOriginal.split('.').pop() ?? 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const base = nomeOriginal
    .replace(/\.[^.]+$/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'midia';
  const mes = new Date().toISOString().slice(0, 7);
  return `${contaId}/${mes}/${crypto.randomUUID().slice(0, 8)}-${base}.${ext}`;
}

export const formatarTamanho = (bytes: number) =>
  bytes >= 1024 * MB ? `${(bytes / (1024 * MB)).toFixed(1).replace('.', ',')} GB`
    : bytes >= MB ? `${(bytes / MB).toFixed(1).replace('.', ',')} MB`
      : `${Math.max(1, Math.round(bytes / 1024))} KB`;
