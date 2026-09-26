import { createClient } from '@supabase/supabase-js';

// Projeto padrão. A chave "anon" é pública por definição (vai para o navegador) e o acesso
// aos dados é protegido por RLS. Variáveis de ambiente, quando definidas, têm prioridade.
const URL_PADRAO = 'https://ruseutthqcknhkqpqmyj.supabase.co';
const CHAVE_PADRAO =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1c2V1dHRocWNrbmhrcXBxbXlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0MjM2NTQsImV4cCI6MjEwNTk5OTY1NH0.JlBT3-kgulo-SSGk2Vs_Z7qvFGmT7fvO4u0bbUiOujs';

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || URL_PADRAO;
const chave = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || CHAVE_PADRAO;

export const supabaseConfigurado = Boolean(url && chave);
export const supabaseUrl = url;

export const supabase = createClient(url, chave, {
  auth: { persistSession: true, autoRefreshToken: true },
});
