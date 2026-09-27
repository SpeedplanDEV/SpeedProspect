import { ENDERECO_FUNCOES, enderecoFuncao } from '@shared/enderecos';

// Configuração pública do Supabase (a chave "anon" é pública por definição; o acesso é protegido por RLS)
const URL_PADRAO = 'https://ruseutthqcknhkqpqmyj.supabase.co';
const CHAVE_PADRAO =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1c2V1dHRocWNrbmhrcXBxbXlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0MjM2NTQsImV4cCI6MjEwNTk5OTY1NH0.JlBT3-kgulo-SSGk2Vs_Z7qvFGmT7fvO4u0bbUiOujs';

export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || URL_PADRAO;
export const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || CHAVE_PADRAO;
export const FUNCOES_URL = `${SUPABASE_URL}/functions/v1`;

/** URL pública da foto do Google: /api/foto (Vercel) → Edge Function `foto` → 302 para o Google (nunca expõe a API key) */
export const urlFoto = (name: string, w = 800) => `/api/foto?name=${encodeURIComponent(name)}&w=${w}`;

/** Endereço real de cada Edge Function (compartilhado com o pipeline) */
export { ENDERECO_FUNCOES, enderecoFuncao };

export const fetchFuncao = (nome: string, init: RequestInit) => fetch(`${FUNCOES_URL}/${enderecoFuncao(nome)}`, init);
