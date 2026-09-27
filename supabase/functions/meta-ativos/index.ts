// Edge Function `meta-ativos` — o que o System User da Meta acessa, e a saúde das contas conectadas.
// POST { acao: 'diagnostico' }                 → token, versão e permissões
// POST { acao: 'listar' }                      → contas de anúncio e Páginas (com Instagram e WhatsApp)
// POST { acao: 'pixels', ad_account_id }       → pixels/datasets da conta
// POST { acao: 'saude', conta_id? }            → atualiza contas_ads.saude (uma conta ou todas as ativas)
// Somente operador logado ou service role. O token da Meta nunca sai daqui.
import { z } from 'npm:zod@3';
import { admin, autorizarAdmin, cors, json } from '../_shared/supabase.ts';
import { Execucao } from '../_shared/log.ts';
import {
  criarClienteMeta, erroParaResposta, ErroMeta, idContaAnuncio, lerConfigMeta, PERMISSOES_NECESSARIAS,
  PERMISSOES_OPCIONAIS, type ClienteMeta,
} from '../_shared/meta.ts';
import {
  avaliarSaude, STATUS_CONTA_META, type ContaMetaBruta, type PaginaMetaBruta, type PixelMetaBruto,
} from '../_shared/meta-mapa.ts';

const Entrada = z.discriminatedUnion('acao', [
  z.object({ acao: z.literal('diagnostico') }),
  z.object({ acao: z.literal('listar') }),
  z.object({ acao: z.literal('pixels'), ad_account_id: z.string().trim().regex(/^(act_)?\d+$/, 'ad_account_id inválido') }),
  z.object({ acao: z.literal('saude'), conta_id: z.string().uuid().optional() }),
]);

const PRAZO_MS = 120_000;
const CAMPOS_CONTA = 'id,account_id,name,currency,account_status,disable_reason,timezone_name,business{id,name},amount_spent,spend_cap,min_daily_budget';
const CAMPOS_PAGAMENTO = 'funding_source,funding_source_details';
const CAMPOS_PAGINA = 'id,name,category,picture{url},instagram_business_account{id,username},tasks';
const CAMPOS_WHATSAPP = 'whatsapp_number,has_whatsapp_number,has_whatsapp_business_number';
const CAMPOS_PIXEL = 'id,name,last_fired_time,is_unavailable,creation_time';

/** Lê com campos opcionais; se a Meta recusar esses campos (permissão), repete sem eles e marca como indisponível */
async function comCamposOpcionais<T>(
  ler: (campos: string) => Promise<T>,
  base: string,
  opcionais: string,
): Promise<{ dados: T; indisponivel: boolean }> {
  try {
    return { dados: await ler(`${base},${opcionais}`), indisponivel: false };
  } catch (e) {
    if (e instanceof ErroMeta && ['parametro', 'permissao'].includes(e.info.categoria)) {
      return { dados: await ler(base), indisponivel: true };
    }
    throw e;
  }
}

async function diagnostico(meta: ClienteMeta, cfg: ReturnType<typeof lerConfigMeta>) {
  const eu = await meta.get<{ id: string; name?: string }>('me', { fields: 'id,name' });
  let concedidas: string[] = [];
  let token: { tipo?: string; expira_em?: string | null; valido?: boolean } = {};
  const avisos: string[] = [];

  // debug_token (com o token do app) informa tipo e validade; /me/permissions é o plano B
  if (cfg.appId && cfg.appSecret) {
    try {
      const d = await meta.get<{ data?: { type?: string; is_valid?: boolean; expires_at?: number; scopes?: string[] } }>('debug_token', {
        input_token: cfg.token,
        access_token: `${cfg.appId}|${cfg.appSecret}`,
      });
      concedidas = d.data?.scopes ?? [];
      token = {
        tipo: d.data?.type,
        valido: d.data?.is_valid,
        expira_em: d.data?.expires_at ? new Date(d.data.expires_at * 1000).toISOString() : null,
      };
    } catch (e) {
      avisos.push(`Não foi possível ler os detalhes do token (${e instanceof Error ? e.message : e}).`);
    }
  }
  if (!concedidas.length) {
    try {
      const p = await meta.get<{ data?: { permission: string; status: string }[] }>('me/permissions');
      concedidas = (p.data ?? []).filter((x) => x.status === 'granted').map((x) => x.permission);
    } catch (e) {
      avisos.push(`Não foi possível listar as permissões (${e instanceof Error ? e.message : e}).`);
    }
  }
  if (token.tipo && token.tipo !== 'SYSTEM_USER') {
    avisos.push('O token não é de um System User: tokens de usuário comum expiram e quebram a automação.');
  }
  if (!cfg.appSecret) avisos.push('Sem META_APP_SECRET: as chamadas vão sem appsecret_proof (recomendado configurar).');
  const faltando = concedidas.length ? PERMISSOES_NECESSARIAS.filter((p) => !concedidas.includes(p)) : [];
  return {
    ok: !faltando.length,
    versao: cfg.versao,
    usuario: { id: eu.id, nome: eu.name ?? null },
    token,
    permissoes: {
      concedidas,
      faltando,
      opcionais_faltando: concedidas.length ? PERMISSOES_OPCIONAIS.filter((p) => !concedidas.includes(p)) : [],
    },
    avisos,
  };
}

interface ContaBruta extends ContaMetaBruta {
  id: string;
  account_id?: string;
  name?: string;
  currency?: string;
  timezone_name?: string;
  business?: { id?: string; name?: string };
  amount_spent?: string;
  spend_cap?: string;
  min_daily_budget?: number;
}
interface PaginaBruta extends PaginaMetaBruta {
  id: string;
  category?: string;
  picture?: { data?: { url?: string } };
  tasks?: string[];
}

async function listar(meta: ClienteMeta, conectadas: Set<string>) {
  const { dados: contas, indisponivel: semPagamento } = await comCamposOpcionais(
    async (campos) => (await meta.paginar<ContaBruta>('me/adaccounts', { fields: campos }, 500)).itens,
    CAMPOS_CONTA,
    CAMPOS_PAGAMENTO,
  );
  const { dados: paginas, indisponivel: semWhatsapp } = await comCamposOpcionais(
    async (campos) => (await meta.paginar<PaginaBruta>('me/accounts', { fields: campos }, 500)).itens,
    CAMPOS_PAGINA,
    CAMPOS_WHATSAPP,
  );
  return {
    contas: contas.map((c) => {
      const s = STATUS_CONTA_META[c.account_status ?? 0];
      return {
        id: idContaAnuncio(c.id),
        nome: c.name ?? c.id,
        moeda: c.currency ?? 'BRL',
        fuso: c.timezone_name ?? null,
        status: c.account_status ?? null,
        status_rotulo: s?.rotulo ?? `Status ${c.account_status}`,
        status_nivel: s?.nivel ?? 'aviso',
        business: c.business?.id ? { id: c.business.id, nome: c.business.name ?? null } : null,
        pagamento: semPagamento ? null : !!(c.funding_source || c.funding_source_details?.id),
        pagamento_texto: c.funding_source_details?.display_string ?? null,
        orcamento_minimo_centavos: c.min_daily_budget ?? null,
        conectada: conectadas.has(idContaAnuncio(c.id)),
      };
    }),
    paginas: paginas.map((p) => ({
      id: p.id,
      nome: p.name ?? p.id,
      categoria: p.category ?? null,
      foto: p.picture?.data?.url ?? null,
      instagram: p.instagram_business_account?.id
        ? { id: p.instagram_business_account.id, usuario: p.instagram_business_account.username ?? null }
        : null,
      whatsapp: semWhatsapp
        ? null
        : { conectado: !!(p.has_whatsapp_business_number || p.has_whatsapp_number || p.whatsapp_number), numero: p.whatsapp_number ?? null },
      pode_anunciar: !p.tasks || p.tasks.includes('ADVERTISE') || p.tasks.includes('MANAGE'),
    })),
  };
}

interface ContaLocal {
  id: string;
  nome: string;
  meta_ad_account_id: string;
  meta_page_id: string | null;
  meta_pixel_id: string | null;
  whatsapp_numero: string | null;
  saude: { geral?: string } | null;
}

/** Verifica a saúde de uma ou todas as contas ativas (em lote: até 3 leituras por conta) */
async function saude(meta: ClienteMeta, db: ReturnType<typeof admin>, contaId?: string) {
  let q = db.from('contas_ads').select('id,nome,meta_ad_account_id,meta_page_id,meta_pixel_id,whatsapp_numero,saude');
  q = contaId ? q.eq('id', contaId) : q.eq('ativa', true);
  const { data: contas, error } = await q;
  if (error) throw new Error(error.message);
  if (!contas?.length) return { verificadas: 0, contas: [] };

  const ex = await new Execucao(db, 'meta-saude').iniciar();
  const ops: { conta: number; tipo: 'conta' | 'pagina' | 'pixel'; campos: string; caminho: string }[] = [];
  (contas as ContaLocal[]).forEach((c, i) => {
    ops.push({ conta: i, tipo: 'conta', caminho: c.meta_ad_account_id, campos: `account_status,disable_reason,${CAMPOS_PAGAMENTO}` });
    if (c.meta_page_id) ops.push({ conta: i, tipo: 'pagina', caminho: c.meta_page_id, campos: `id,name,instagram_business_account{id,username},${CAMPOS_WHATSAPP}` });
    if (c.meta_pixel_id) ops.push({ conta: i, tipo: 'pixel', caminho: c.meta_pixel_id, campos: 'id,name,last_fired_time,is_unavailable' });
  });
  const r1 = await meta.lote(ops.map((o) => ({ metodo: 'GET' as const, caminho: o.caminho, params: { fields: o.campos } })));

  // Campos de pagamento/WhatsApp podem ser recusados por permissão: relê sem eles
  const releituras: number[] = [];
  r1.forEach((r, i) => {
    if (!r.ok && ops[i].tipo !== 'pixel' && ['parametro', 'permissao'].includes(r.erro.info.categoria)) releituras.push(i);
  });
  const r2 = releituras.length
    ? await meta.lote(releituras.map((i) => ({
      metodo: 'GET' as const,
      caminho: ops[i].caminho,
      params: { fields: ops[i].tipo === 'conta' ? 'account_status,disable_reason' : 'id,name,instagram_business_account{id,username}' },
    })))
    : [];
  releituras.forEach((i, j) => {
    const r = r2[j];
    if (r?.ok) {
      r1[i] = { ok: true, dados: { ...(r.dados as object), [ops[i].tipo === 'conta' ? 'pagamento_indisponivel' : 'whatsapp_indisponivel']: true } };
    }
  });

  const resultado: { conta_id: string; nome: string; saude: ReturnType<typeof avaliarSaude> }[] = [];
  for (const [i, c] of (contas as ContaLocal[]).entries()) {
    const deConta = ops.map((o, j) => ({ o, r: r1[j] })).filter((x) => x.o.conta === i);
    const pegar = (tipo: string) => deConta.find((x) => x.o.tipo === tipo)?.r;
    const rc = pegar('conta'), rp = pegar('pagina'), rx = pegar('pixel');
    const s = avaliarSaude({
      conta: rc?.ok ? (rc.dados as ContaMetaBruta) : null,
      pagina: rp?.ok ? (rp.dados as PaginaMetaBruta) : null,
      pixel: rx?.ok ? (rx.dados as PixelMetaBruto) : null,
      temPagina: !!c.meta_page_id,
      temPixel: !!c.meta_pixel_id,
      whatsappConfigurado: c.whatsapp_numero,
      erros: {
        conta: rc && !rc.ok ? rc.erro.message : undefined,
        pagina: rp && !rp.ok ? rp.erro.message : undefined,
        pixel: rx && !rx.ok ? rx.erro.message : undefined,
      },
    });
    // Instagram/Página podem ter mudado na Meta: mantém nomes atualizados
    const pagina = rp?.ok ? (rp.dados as PaginaMetaBruta) : null;
    const extra = pagina
      ? {
        meta_page_nome: pagina.name ?? undefined,
        meta_instagram_id: pagina.instagram_business_account?.id ?? null,
        meta_instagram_usuario: pagina.instagram_business_account?.username ?? null,
      }
      : {};
    const { error: eUp } = await db.from('contas_ads').update({ saude: s, saude_em: s.verificado_em, ...extra }).eq('id', c.id);
    if (eUp) ex.log('erro', `Falha ao gravar a saúde de ${c.nome}`, { erro: eUp.message });
    if (s.geral === 'erro' && c.saude?.geral !== 'erro') {
      const problemas = [s.status, s.pagamento, s.whatsapp, s.pixel].filter((x) => x.nivel === 'erro').map((x) => x.texto);
      await db.from('notificacoes').insert({
        tipo: 'conta_ads_problema',
        titulo: `Problema na conta de anúncios ${c.nome}`,
        corpo: problemas.join(' · '),
        ref: { conta_id: c.id },
      });
    }
    ex.log(s.geral === 'erro' ? 'aviso' : 'info', `${c.nome}: ${s.geral}`, { conta_id: c.id, geral: s.geral });
    resultado.push({ conta_id: c.id, nome: c.nome, saude: s });
    ex.itens++;
  }
  ex.chamadas = ops.length + releituras.length;
  await ex.finalizar();
  return { verificadas: resultado.length, contas: resultado };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ erro: 'Use POST' }, 405);
  const db = admin();
  const quem = await autorizarAdmin(req, db);
  if (!quem) return json({ erro: 'Não autorizado' }, 401);

  let entrada: z.infer<typeof Entrada>;
  try {
    entrada = Entrada.parse(await req.json());
  } catch (e) {
    return json({ erro: 'Entrada inválida', detalhe: e instanceof z.ZodError ? e.issues.map((i) => i.message).join('; ') : String(e) }, 400);
  }

  try {
    const cfg = lerConfigMeta();
    const meta = criarClienteMeta({ ...cfg, prazo: Date.now() + PRAZO_MS });
    switch (entrada.acao) {
      case 'diagnostico':
        return json(await diagnostico(meta, cfg));
      case 'listar': {
        const { data } = await db.from('contas_ads').select('meta_ad_account_id');
        return json(await listar(meta, new Set((data ?? []).map((x) => x.meta_ad_account_id as string))));
      }
      case 'pixels': {
        const r = await meta.paginar<{ id: string; name?: string; last_fired_time?: string; is_unavailable?: boolean; creation_time?: string }>(
          `${idContaAnuncio(entrada.ad_account_id)}/adspixels`,
          { fields: CAMPOS_PIXEL },
          200,
        );
        return json({
          pixels: r.itens.map((p) => ({
            id: p.id,
            nome: p.name ?? p.id,
            ultimo_evento: p.last_fired_time ?? null,
            indisponivel: !!p.is_unavailable,
          })),
        });
      }
      case 'saude':
        return json(await saude(meta, db, entrada.conta_id));
    }
  } catch (e) {
    const r = erroParaResposta(e);
    // Erros de configuração/token/permissão são do setup (400); instabilidade da Meta é 502
    const status = e instanceof ErroMeta && (e.info.temporario || e.info.categoria === 'desconhecido') ? 502 : 400;
    return json(r, status);
  }
});
