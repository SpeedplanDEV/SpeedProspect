import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ExternalLink, XCircle } from 'lucide-react';
import type { NivelSaude, SaudeConta } from '@/lib/ads';
import { ErroFuncao } from '@/lib/funcoes';

const ICONE: Record<NivelSaude, typeof CheckCircle2> = { ok: CheckCircle2, aviso: AlertTriangle, erro: XCircle };
const COR: Record<NivelSaude, string> = { ok: 'text-emerald-600', aviso: 'text-amber-600', erro: 'text-red-600' };

export function IconeNivel({ nivel, tamanho = 14 }: { nivel: NivelSaude; tamanho?: number }) {
  const I = ICONE[nivel];
  return <I size={tamanho} className={`shrink-0 ${COR[nivel]}`} aria-label={nivel === 'ok' ? 'ok' : nivel === 'aviso' ? 'atenção' : 'problema'} />;
}

/** Indicadores de saúde da conta: status, pagamento, WhatsApp, pixel e Instagram (ícone + texto, nunca só cor) */
export function IndicadoresSaude({ saude, compacto }: { saude: SaudeConta | null; compacto?: boolean }) {
  if (!saude) return <p className="text-xs text-fraco">Saúde ainda não verificada.</p>;
  const itens: [string, SaudeConta['status']][] = [
    ['Conta', saude.status],
    ['Pagamento', saude.pagamento],
    ['WhatsApp', saude.whatsapp],
    ['Pixel', saude.pixel],
    ['Instagram', saude.instagram],
  ];
  return (
    <ul className={`grid gap-x-4 gap-y-1.5 ${compacto ? '' : 'sm:grid-cols-2'}`}>
      {itens.map(([rotulo, item]) => (
        <li key={rotulo} className="flex items-start gap-1.5 text-xs">
          <span className="mt-px"><IconeNivel nivel={item.nivel} /></span>
          <span className="min-w-0">
            <span className="text-suave">{rotulo}: </span>
            <span className={item.nivel === 'erro' ? 'text-red-600' : ''}>{item.texto}</span>
            {item.dica && item.nivel !== 'ok' && <span className="block text-fraco">{item.dica}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Erro vindo das Edge Functions da Meta, com a orientação do que corrigir */
export function AvisoErroMeta({ erro, titulo = 'Não foi possível falar com a Meta' }: { erro: unknown; titulo?: string }) {
  const msg = erro instanceof Error ? erro.message : String(erro);
  const orientacao = erro instanceof ErroFuncao ? erro.orientacao : undefined;
  const naoPublicada = /não respondeu|já foi publicada/i.test(msg);
  return (
    <div className="rounded-md border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm">
      <div className="flex items-start gap-2">
        <XCircle size={16} className="mt-0.5 shrink-0 text-red-600" />
        <div className="min-w-0">
          <p className="font-medium">{titulo}</p>
          <p className="mt-0.5 text-red-700 dark:text-red-400">{msg}</p>
          {orientacao && <p className="mt-2 text-suave"><span className="font-medium text-texto">O que fazer: </span>{orientacao}</p>}
          {naoPublicada && (
            <p className="mt-2 text-suave">
              Publique as funções <code>meta-ativos</code> e <code>meta-sync</code> no Supabase (Edge Functions → Deploy a new function → Via Editor).
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

const PASSOS: { titulo: string; texto: string; link?: { url: string; rotulo: string } }[] = [
  {
    titulo: 'Business Manager com forma de pagamento',
    texto: 'Tenha um Business Manager (Portfólio empresarial) da agência. Em cada conta de anúncios, cadastre o cartão ou saldo em Gerenciador de Anúncios → Faturamento. A API não cadastra cartão.',
    link: { url: 'https://business.facebook.com/settings', rotulo: 'Abrir configurações do negócio' },
  },
  {
    titulo: 'App do tipo Business com Marketing API',
    texto: 'Em Meta for Developers → Meus apps → Criar app → tipo "Business" (Empresa), vinculado ao seu Business Manager. Adicione o produto "Marketing API". Anote o ID do app e a Chave secreta (Configurações → Básico).',
    link: { url: 'https://developers.facebook.com/apps', rotulo: 'Abrir Meta for Developers' },
  },
  {
    titulo: 'Usuário do sistema (System User) e token',
    texto: 'Configurações do negócio → Usuários → Usuários do sistema → Adicionar (função Administrador). Clique em "Atribuir ativos" e dê controle total às contas de anúncio, Páginas, pixels e Instagram. Depois "Gerar novo token": escolha o app, validade "Nunca" e marque ads_management, ads_read, business_management, pages_show_list, pages_read_engagement e pages_manage_ads (e leads_retrieval e instagram_basic se for usar formulários/Instagram).',
  },
  {
    titulo: 'Secrets no Supabase',
    texto: 'Supabase → Edge Functions → Secrets → adicione: META_API_VERSION = v26.0 · META_SYSTEM_USER_TOKEN = o token gerado · META_APP_ID = ID do app · META_APP_SECRET = chave secreta do app. O token nunca vai para o navegador.',
    link: { url: 'https://supabase.com/dashboard/project/ruseutthqcknhkqpqmyj/functions/secrets', rotulo: 'Abrir Secrets do Supabase' },
  },
  {
    titulo: 'Contas dos clientes no seu Business Manager',
    texto: 'Peça ao cliente para adicionar a conta de anúncios e a Página dele como parceiro do seu Business Manager (ou crie a conta dentro do seu BM). Depois atribua esses ativos ao System User.',
  },
  {
    titulo: 'WhatsApp conectado à Página',
    texto: 'Para anúncios de conversa, o número do WhatsApp Business precisa estar conectado à Página (Configurações da Página → WhatsApp).',
  },
  {
    titulo: 'Pixel (Dataset) e domínio',
    texto: 'Crie um pixel por cliente (ou um da agência para as prévias) no Gerenciador de Eventos e instale no site. Recomendado: verificar o domínio em Configurações do negócio → Segurança da marca → Domínios.',
    link: { url: 'https://business.facebook.com/events_manager2', rotulo: 'Abrir Gerenciador de Eventos' },
  },
];

/** Checklist dos pré-requisitos na Meta (seção 3 do módulo), em linguagem simples */
export function ChecklistMeta({ abertoInicial = false }: { abertoInicial?: boolean }) {
  const [aberto, setAberto] = useState(abertoInicial);
  return (
    <section className="card">
      <button
        className="flex w-full items-center justify-between px-4 sm:px-5 py-3 text-left text-sm font-medium"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
      >
        Passo a passo na Meta (feito uma vez)
        <ChevronDown size={16} className={`transition-transform ${aberto ? 'rotate-180' : ''}`} />
      </button>
      {aberto && (
        <ol className="space-y-3 border-t border-borda px-4 sm:px-5 py-4 text-sm">
          {PASSOS.map((p, i) => (
            <li key={p.titulo} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-marca/10 text-xs font-medium text-marca">{i + 1}</span>
              <div className="min-w-0">
                <p className="font-medium">{p.titulo}</p>
                <p className="mt-0.5 text-suave">{p.texto}</p>
                {p.link && (
                  <a href={p.link.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-marca hover:underline">
                    {p.link.rotulo} <ExternalLink size={12} />
                  </a>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
