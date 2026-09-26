import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigurado = Boolean(url && chave);
export const supabaseUrl = url || '(não configurada)';

if (!supabaseConfigurado) {
  console.warn('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY não configurados — veja .env.example');
}

// Placeholder evita erro na inicialização quando o .env ainda não existe
export const supabase = createClient(url || 'http://localhost:54321', chave || 'sem-chave', {
  auth: { persistSession: true, autoRefreshToken: true },
});
