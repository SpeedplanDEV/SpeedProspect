import { Component, type ErrorInfo, type ReactNode } from 'react';

const CHAVE_RECARGA = 'sp-recarregou-versao';

/** Erro de arquivo de uma versão anterior do sistema (a aba ficou aberta durante uma atualização) */
export const ehErroDeVersao = (e: unknown) =>
  /dynamically imported module|Importing a module script failed|Unable to preload CSS|Failed to fetch dynamically|ChunkLoadError|error loading dynamically/i.test(
    e instanceof Error ? `${e.name} ${e.message}` : String(e),
  );

/** Recarrega a página uma única vez (evita laço de recarga se o erro persistir) */
export function recarregarUmaVez(): boolean {
  try {
    const ultima = Number(sessionStorage.getItem(CHAVE_RECARGA) ?? 0);
    if (Date.now() - ultima < 30_000) return false;
    sessionStorage.setItem(CHAVE_RECARGA, String(Date.now()));
  } catch {
    /* sem sessionStorage: recarrega mesmo assim */
  }
  window.location.reload();
  return true;
}

interface Props {
  children: ReactNode;
  /** Muda a cada navegação: limpa o erro ao trocar de página */
  chave?: string;
}
interface Estado { erro: Error | null; chave?: string; componentes?: string }

/** Mostra uma mensagem no lugar da tela branca quando algo falha ao desenhar a página */
export class ErroTela extends Component<Props, Estado> {
  state: Estado = { erro: null, chave: this.props.chave };

  static getDerivedStateFromProps(props: Props, estado: Estado): Estado | null {
    return props.chave !== estado.chave ? { erro: null, chave: props.chave, componentes: undefined } : null;
  }

  static getDerivedStateFromError(erro: Error): Partial<Estado> {
    return { erro };
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    console.error('Erro na tela:', erro, info.componentStack);
    this.setState({ componentes: info.componentStack ?? undefined });
    if (ehErroDeVersao(erro)) recarregarUmaVez();
  }

  render() {
    const { erro } = this.state;
    if (!erro) return this.props.children;
    const versao = ehErroDeVersao(erro);
    // Detalhes para o suporte localizar o erro no código publicado (arquivo:linha:coluna)
    const detalhes = [
      `Mensagem: ${erro.message}`,
      `Página: ${window.location.pathname}${window.location.search}`,
      `Quando: ${new Date().toLocaleString('pt-BR')}`,
      'Pilha:',
      ...(erro.stack ?? '').split('\n').slice(0, 8).map((l) => l.trim().replace(window.location.origin, '')),
      'Componentes:',
      ...(this.state.componentes ?? '').split('\n').map((l) => l.trim().replace(window.location.origin, '')).filter(Boolean).slice(0, 8),
    ].join('\n');
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6" style={{ fontFamily: 'system-ui, sans-serif' }}>
        <div className="max-w-lg rounded-lg border border-red-500/30 bg-red-500/5 p-6 text-sm">
          <h2 className="text-base font-medium">{versao ? 'O sistema foi atualizado' : 'Algo deu errado ao abrir esta tela'}</h2>
          <p className="mt-2 opacity-80">
            {versao
              ? 'Esta aba estava com a versão anterior. Recarregue a página para usar a versão nova.'
              : 'Recarregue a página. Se continuar, envie o texto abaixo para o suporte.'}
          </p>
          {!versao && (
            <>
              <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-black/5 p-2 text-xs">{erro.message}</pre>
              <details className="mt-2 text-xs" open>
                <summary className="cursor-pointer opacity-80">Detalhes técnicos (envie para o suporte)</summary>
                <pre className="mt-1 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded bg-black/5 p-2 text-[11px]">{detalhes}</pre>
                <button
                  className="mt-1 underline opacity-80 hover:opacity-100"
                  onClick={() => navigator.clipboard?.writeText(detalhes)}
                >
                  Copiar detalhes
                </button>
              </details>
            </>
          )}
          <button
            className="mt-4 rounded-md bg-[#2563eb] px-3 py-1.5 text-sm font-medium text-white hover:brightness-110"
            onClick={() => window.location.reload()}
          >
            Recarregar página
          </button>
        </div>
      </div>
    );
  }
}
