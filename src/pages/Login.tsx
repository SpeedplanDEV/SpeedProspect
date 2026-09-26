import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Navigate, useLocation } from 'react-router-dom';
import { Zap } from 'lucide-react';
import { supabase, supabaseConfigurado, supabaseUrl } from '@/lib/supabase';
import { useAuth } from '@/app/auth';
import { CampoErro } from '@/components/ui/Pagina';

const schema = z.object({
  email: z.string().trim().email('E-mail inválido'),
  senha: z.string().min(6, 'Mínimo de 6 caracteres'),
});
type Form = z.infer<typeof schema>;

export default function Login() {
  const { sessao } = useAuth();
  const local = useLocation();
  const [erro, setErro] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<Form>({ resolver: zodResolver(schema) });

  if (sessao) {
    const destino = (local.state as { de?: string } | null)?.de ?? '/';
    return <Navigate to={destino} replace />;
  }

  const entrar = async (dados: Form) => {
    setErro(null);
    const { error } = await supabase.auth.signInWithPassword({ email: dados.email, password: dados.senha });
    if (error) setErro(traduzirErro(error.message));
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={handleSubmit(entrar)} className="card w-full max-w-sm space-y-4 p-6" noValidate>
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-marca text-white">
            <Zap size={18} />
          </span>
          <div>
            <div className="text-base font-medium">SpeedProspect</div>
            <div className="text-xs text-suave">Acesso do operador</div>
          </div>
        </div>
        {!supabaseConfigurado && (
          <p className="rounded-md bg-amber-500/15 px-3 py-2 text-xs text-amber-700">
            Supabase não configurado. Preencha o <code>.env</code> a partir do <code>.env.example</code>.
          </p>
        )}
        <div>
          <label className="label" htmlFor="email">E-mail</label>
          <input id="email" type="email" autoComplete="email" className="input" {...register('email')} />
          <CampoErro msg={formState.errors.email?.message} />
        </div>
        <div>
          <label className="label" htmlFor="senha">Senha</label>
          <input id="senha" type="password" autoComplete="current-password" className="input" {...register('senha')} />
          <CampoErro msg={formState.errors.senha?.message} />
        </div>
        {erro && <p className="text-sm text-red-500">{erro}</p>}
        <button type="submit" className="btn-primario w-full" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}

// Mensagens do Supabase Auth em pt-BR, com dica de correção
function traduzirErro(msg: string): string {
  if (msg === 'Invalid login credentials') return 'E-mail ou senha incorretos.';
  if (msg === 'Email not confirmed') return 'E-mail ainda não confirmado. Confirme o usuário no Supabase (Authentication → Users).';
  if (/email logins are disabled/i.test(msg))
    return 'Login por e-mail está desativado no Supabase. Ative em Authentication → Sign In / Providers → Email.';
  if (/failed to fetch|networkerror|load failed/i.test(msg))
    return `Não foi possível conectar ao Supabase (${supabaseUrl}). Verifique VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY e refaça o build/deploy.`;
  return msg;
}
