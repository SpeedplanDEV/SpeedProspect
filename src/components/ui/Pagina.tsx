import type { ReactNode } from 'react';

/** Cabeçalho + conteúdo padrão das páginas do painel */
export function Pagina({ titulo, descricao, acoes, children }: {
  titulo: string;
  descricao?: string;
  acoes?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium">{titulo}</h1>
          {descricao && <p className="mt-0.5 text-sm text-suave">{descricao}</p>}
        </div>
        {acoes && <div className="flex items-center gap-2">{acoes}</div>}
      </div>
      {children}
    </div>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return <div className="px-4 py-10 text-center text-sm text-suave">{children}</div>;
}

export function Erro({ erro }: { erro: unknown }) {
  const msg = erro instanceof Error ? erro.message : String(erro);
  return (
    <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600">
      Erro ao carregar: {msg}
    </div>
  );
}

export function Badge({ children, cor = 'cinza' }: { children: ReactNode; cor?: 'cinza' | 'verde' | 'vermelho' | 'azul' | 'amarelo' }) {
  const cores = {
    cinza: 'bg-elevado text-suave',
    verde: 'bg-emerald-500/15 text-emerald-600',
    vermelho: 'bg-red-500/15 text-red-600',
    azul: 'bg-marca/10 text-marca',
    amarelo: 'bg-amber-500/15 text-amber-600',
  };
  return <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ${cores[cor]}`}>{children}</span>;
}

export function CampoErro({ msg }: { msg?: string }) {
  return msg ? <p className="mt-1 text-xs text-red-500">{msg}</p> : null;
}
