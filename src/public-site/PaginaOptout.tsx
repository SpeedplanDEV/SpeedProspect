import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, ShieldOff } from 'lucide-react';
import { aplicarSeo, chamarOptout } from './api';

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'confirmar'; nome: string }
  | { tipo: 'enviando'; nome: string }
  | { tipo: 'feito'; nome: string }
  | { tipo: 'erro'; msg: string };

// Rota pública /optout/:token — "Não quero receber propostas" (LGPD).
// A remoção exige um clique de confirmação para que robôs de pré-visualização de links não a disparem sozinhos.
export default function PaginaOptout() {
  const { token = '' } = useParams();
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });

  useEffect(() => {
    aplicarSeo('Não receber propostas', 'Remoção de contato');
    chamarOptout(token, false)
      .then((r) => setEstado(r.ja_removido ? { tipo: 'feito', nome: r.nome ?? '' } : { tipo: 'confirmar', nome: r.nome ?? '' }))
      .catch((e: Error) => setEstado({ tipo: 'erro', msg: e.message }));
  }, [token]);

  const confirmar = (nome: string) => {
    setEstado({ tipo: 'enviando', nome });
    chamarOptout(token, true)
      .then(() => setEstado({ tipo: 'feito', nome }))
      .catch((e: Error) => setEstado({ tipo: 'erro', msg: e.message }));
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-5" style={{ fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' }}>
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-[0_20px_50px_-25px_rgba(15,23,42,.35)]">
        {estado.tipo === 'carregando' && <p className="text-slate-500">Carregando…</p>}

        {(estado.tipo === 'confirmar' || estado.tipo === 'enviando') && (
          <>
            <ShieldOff className="mx-auto h-10 w-10 text-slate-400" aria-hidden />
            <h1 className="mt-4 text-xl font-[700] text-slate-900">Não quer receber propostas?</h1>
            <p className="mt-2 text-slate-600">
              Ao confirmar, a prévia criada para <strong>{estado.nome}</strong> sai do ar e seus dados de contato não serão mais usados
              para enviar propostas.
            </p>
            <button
              onClick={() => confirmar(estado.nome)}
              disabled={estado.tipo === 'enviando'}
              className="mt-6 w-full rounded-xl bg-slate-900 px-5 py-3 font-[700] text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {estado.tipo === 'enviando' ? 'Processando…' : 'Confirmar: não quero receber propostas'}
            </button>
          </>
        )}

        {estado.tipo === 'feito' && (
          <>
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" aria-hidden />
            <h1 className="mt-4 text-xl font-[700] text-slate-900">Pronto, pedido registrado</h1>
            <p className="mt-2 text-slate-600">
              {estado.nome ? <>A <strong>{estado.nome}</strong> não receberá mais propostas nossas.</> : 'Você não receberá mais propostas nossas.'} A prévia foi
              retirada do ar. Desculpe o incômodo.
            </p>
          </>
        )}

        {estado.tipo === 'erro' && (
          <>
            <h1 className="text-xl font-[700] text-slate-900">Link inválido</h1>
            <p className="mt-2 text-slate-600">{estado.msg}</p>
          </>
        )}
      </div>
    </div>
  );
}
