// Configurações → Mensagens do WhatsApp: modelos editáveis com campos automáticos e prévia ao vivo
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, MessageCircle, RotateCcw, Save } from 'lucide-react';
import {
  CAMPOS_MODELO, MODELOS_PADRAO, linkPrevia, modeloDe, preencher,
  type ChaveModelo, type DadosMensagem, type ModelosMensagem as Modelos,
} from '@shared/mensagens';
import { supabase } from '@/lib/supabase';
import type { Configuracoes } from '@/lib/types';
import { useToast } from '@/components/ui/Toast';

const MAX_CARACTERES = 1000;

const MODELOS: { chave: ChaveModelo; rotulo: string; quando: string }[] = [
  { chave: 'primeiro_contato', rotulo: 'Primeiro contato', quando: 'Empresas sem site. Criada ao aprovar a prévia.' },
  { chave: 'primeiro_contato_site_fraco', rotulo: 'Primeiro contato (site fraco)', quando: 'Empresas com site ruim no celular. Criada ao aprovar a prévia.' },
  { chave: 'followup_1', rotulo: 'Follow-up 1', quando: '2 dias após o primeiro contato, se o lead não abriu a prévia.' },
  { chave: 'followup_1_abriu', rotulo: 'Follow-up 1 (abriu)', quando: '2 dias após o primeiro contato, se o lead já abriu a prévia.' },
  { chave: 'followup_2', rotulo: 'Follow-up 2', quando: '3 dias após o follow-up 1. Última mensagem.' },
];

/** Campos que fazem sentido em cada modelo (os demais continuam funcionando, só não aparecem como atalho) */
const CAMPOS_POR_MODELO: Record<ChaveModelo, string[]> = {
  primeiro_contato: ['saudacao', 'nome', 'primeiro_nome_ou_empresa', 'frase_google', 'rating', 'reviews_count', 'link', 'negocio_nome', 'preco_texto'],
  primeiro_contato_site_fraco: ['saudacao', 'nome', 'primeiro_nome_ou_empresa', 'rating', 'reviews_count', 'link', 'negocio_nome', 'preco_texto'],
  followup_1: ['nome', 'primeiro_nome_ou_empresa', 'link', 'negocio_nome'],
  followup_1_abriu: ['nome', 'primeiro_nome_ou_empresa', 'link', 'negocio_nome'],
  followup_2: ['nome', 'primeiro_nome_ou_empresa', 'link', 'negocio_nome', 'data_limite'],
};

/** Campos que não podem faltar (sem eles a mensagem perde o sentido) */
const OBRIGATORIOS: Partial<Record<ChaveModelo, string[]>> = {
  primeiro_contato: ['link'],
  primeiro_contato_site_fraco: ['link'],
  followup_1: ['link'],
};

const CAMPOS_VALIDOS = new Set(CAMPOS_MODELO.map((c) => c.campo));

function problemas(chave: ChaveModelo, texto: string): string[] {
  const lista: string[] = [];
  if (!texto.trim()) return lista; // vazio = volta ao padrão
  for (const campo of OBRIGATORIOS[chave] ?? []) {
    if (!texto.includes(`{${campo}}`)) lista.push(`Falta o campo {${campo}}: sem ele o lead não recebe o link da prévia.`);
  }
  const desconhecidos = [...texto.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((c) => !CAMPOS_VALIDOS.has(c));
  if (desconhecidos.length) lista.push(`Campo desconhecido: ${[...new Set(desconhecidos)].map((c) => `{${c}}`).join(', ')} (vai aparecer do jeito que está).`);
  if (texto.length > MAX_CARACTERES) lista.push(`Texto longo demais (${texto.length}/${MAX_CARACTERES}).`);
  return lista;
}

const textosDe = (m: Modelos) =>
  Object.fromEntries(MODELOS.map(({ chave }) => [chave, modeloDe(chave, m)])) as Record<ChaveModelo, string>;

export function ModelosMensagem({ config }: { config: Configuracoes }) {
  const qc = useQueryClient();
  const toast = useToast();
  const disponivel = 'modelos_mensagem' in config;
  const salvos = useMemo<Modelos>(() => config.modelos_mensagem ?? {}, [config.modelos_mensagem]);

  const [textos, setTextos] = useState(() => textosDe(salvos));
  const [atual, setAtual] = useState<ChaveModelo>('primeiro_contato');
  const campo = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setTextos(textosDe(salvos));
  }, [salvos]);

  const texto = textos[atual];
  const personalizado = (c: ChaveModelo) => textos[c].trim() !== MODELOS_PADRAO[c];
  const alterado = MODELOS.some(({ chave }) => textos[chave].trim() !== modeloDe(chave, salvos));
  const erros = problemas(atual, texto);
  const bloqueado = MODELOS.some(({ chave }) => problemas(chave, textos[chave]).some((p) => !p.startsWith('Campo desconhecido')));

  const mudar = (valor: string) => setTextos((t) => ({ ...t, [atual]: valor }));

  /** Insere {campo} na posição do cursor */
  const inserir = (nome: string) => {
    const el = campo.current;
    const marcador = `{${nome}}`;
    if (!el) return mudar(texto + marcador);
    const ini = el.selectionStart ?? texto.length;
    const fim = el.selectionEnd ?? texto.length;
    mudar(texto.slice(0, ini) + marcador + texto.slice(fim));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(ini + marcador.length, ini + marcador.length);
    });
  };

  const salvar = useMutation({
    mutationFn: async () => {
      // Guarda só o que difere do padrão (vazio = padrão)
      const modelos: Modelos = {};
      for (const { chave } of MODELOS) {
        const t = textos[chave].trim();
        if (t && t !== MODELOS_PADRAO[chave]) modelos[chave] = t;
      }
      const { data, error } = await supabase
        .from('configuracoes')
        .update({ modelos_mensagem: modelos, atualizado_em: new Date().toISOString() })
        .eq('id', 1)
        .select()
        .single();
      if (error) throw error;
      return data as Configuracoes;
    },
    onSuccess: (c) => {
      qc.setQueryData(['configuracoes'], c);
      toast('Modelos de mensagem salvos');
    },
    onError: (e: Error) => toast(`Erro ao salvar: ${e.message}`, 'erro'),
  });

  // Dados de exemplo para a prévia
  const exemplo: DadosMensagem = {
    lead_id: 'exemplo',
    nome: 'Karioka Lanches',
    rating: 4.8,
    reviews_count: 231,
    status_site: atual === 'primeiro_contato_site_fraco' ? 'site_fraco' : 'sem_site',
    link: linkPrevia(config.app_url || window.location.origin, 'karioka-lanches', 'a1b2c3'),
    negocio_nome: config.negocio_nome || 'Seu negócio',
    preco_texto: config.preco_texto || 'a partir de R$ 497',
    data_limite: new Date(Date.now() + 35 * 864e5).toLocaleDateString('pt-BR'),
  };
  const previa = preencher(texto.trim() || MODELOS_PADRAO[atual], exemplo);
  const info = MODELOS.find((m) => m.chave === atual)!;

  return (
    <section id="mensagens" className="card max-w-3xl scroll-mt-20">
      <header className="flex flex-wrap items-center gap-2 border-b border-borda px-4 py-3 sm:px-5">
        <MessageCircle size={15} className="text-emerald-600" />
        <h2 className="text-sm font-medium">Mensagens do WhatsApp</h2>
        <button
          type="button"
          className="btn-primario ml-auto"
          onClick={() => salvar.mutate()}
          disabled={!disponivel || !alterado || bloqueado || salvar.isPending}
          title={bloqueado ? 'Corrija os avisos em vermelho antes de salvar' : undefined}
        >
          <Save size={15} /> {salvar.isPending ? 'Salvando…' : 'Salvar mensagens'}
        </button>
      </header>

      {!disponivel ? (
        <p className="flex items-start gap-2 px-4 py-4 text-sm text-amber-700 sm:px-5 dark:text-amber-400">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>
            Para editar as mensagens, rode no Supabase (SQL Editor) o arquivo{' '}
            <code className="rounded bg-elevado px-1 text-xs">supabase/migrations/20261005000000_modelos_mensagem.sql</code> e recarregue a página.
          </span>
        </p>
      ) : (
        <div className="space-y-4 p-4 sm:p-5">
          <p className="text-xs text-suave">
            Estes textos são usados nas mensagens novas. As que já estão na fila de Envios não mudam, mas você pode editar cada
            uma lá antes de enviar. Nada é enviado sozinho.
          </p>

          {/* Escolha do modelo */}
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="tablist" aria-label="Modelo">
            {MODELOS.map((m) => (
              <button
                key={m.chave}
                type="button"
                role="tab"
                aria-selected={atual === m.chave}
                onClick={() => setAtual(m.chave)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs ${
                  atual === m.chave ? 'border-marca bg-marca/10 font-medium text-marca' : 'border-borda text-suave hover:text-texto'
                }`}
              >
                {m.rotulo}
                {personalizado(m.chave) && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" title="Personalizado" />}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
            <div className="min-w-0">
              <div className="mb-1 flex items-center justify-between gap-2">
                <label className="label mb-0" htmlFor="modelo-texto">{info.rotulo}</label>
                {personalizado(atual) ? (
                  <button type="button" className="inline-flex items-center gap-1 text-xs text-marca hover:underline" onClick={() => mudar(MODELOS_PADRAO[atual])}>
                    <RotateCcw size={12} /> Restaurar padrão
                  </button>
                ) : (
                  <span className="text-xs text-fraco">Texto padrão</span>
                )}
              </div>
              <p className="mb-2 text-xs text-fraco">{info.quando}</p>
              <textarea
                id="modelo-texto"
                ref={campo}
                className="input min-h-[200px] font-mono leading-relaxed sm:text-[13px]"
                value={texto}
                onChange={(e) => mudar(e.target.value)}
                spellCheck
              />
              <div className="mt-1 flex justify-end text-[11px] tabular-nums text-fraco">{texto.length}/{MAX_CARACTERES}</div>
              {erros.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-xs text-red-600">
                  {erros.map((p) => <li key={p}>{p}</li>)}
                </ul>
              )}

              <p className="mb-1.5 mt-3 text-xs font-medium text-suave">Inserir campo automático</p>
              <div className="flex flex-wrap gap-1.5">
                {CAMPOS_MODELO.filter((c) => CAMPOS_POR_MODELO[atual].includes(c.campo)).map((c) => (
                  <button
                    key={c.campo}
                    type="button"
                    onClick={() => inserir(c.campo)}
                    title={c.descricao}
                    className="rounded border border-borda bg-elevado px-2 py-1 font-mono text-[11px] text-suave hover:border-marca hover:text-marca"
                  >
                    {`{${c.campo}}`}
                  </button>
                ))}
              </div>
              <details className="mt-2 text-xs text-suave">
                <summary className="cursor-pointer">O que cada campo mostra</summary>
                <ul className="mt-1.5 space-y-1">
                  {CAMPOS_MODELO.filter((c) => CAMPOS_POR_MODELO[atual].includes(c.campo)).map((c) => (
                    <li key={c.campo}><code className="font-mono text-texto">{`{${c.campo}}`}</code> — {c.descricao}</li>
                  ))}
                </ul>
              </details>
            </div>

            {/* Prévia no estilo do WhatsApp */}
            <div className="min-w-0">
              <p className="label">Prévia (exemplo: Karioka Lanches, nota 4,8 com 231 avaliações)</p>
              <div className="rounded-lg bg-[#efeae2] p-3 dark:bg-[#0b141a]">
                <div className="ml-auto max-w-[92%] whitespace-pre-wrap break-words rounded-lg rounded-tr-none bg-[#d9fdd3] px-3 py-2 text-[13px] leading-relaxed text-[#111b21] shadow-sm dark:bg-[#005c4b] dark:text-[#e9edef]">
                  {previa}
                  <div className="mt-1 text-right text-[10px] text-[#667781] dark:text-[#8696a0]">09:41 ✓✓</div>
                </div>
              </div>
              {(atual === 'primeiro_contato' || atual === 'primeiro_contato_site_fraco') && texto.includes('{saudacao}') && (
                <p className="mt-2 text-xs text-fraco">
                  A saudação muda entre 3 versões de um lead para outro, para as mensagens não parecerem disparo em massa.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
