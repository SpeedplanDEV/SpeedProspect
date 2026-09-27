// Edge Function `gerar-previa` — gera o conteúdo da landing page com a Claude API (tool use + validação zod),
// cria/atualiza a prévia em `sites` e move o lead para "previa_gerada" (ou "aprovado" com auto-aprovação).
// Sem lead_id: processa leads "qualificado" sem prévia, por score, até o limite diário.
// Com lead_id: gera para aquele lead; com regenerar=true cria uma nova versão da prévia existente.
import { z } from 'npm:zod@3';
import { admin, autorizarAdmin, cors, inicioDoDiaSP, json } from '../_shared/supabase.ts';
import {
  chamarClaude, custoUSD, ehHaiku, ErroClaude, type BlocoConteudo, type RespostaClaude,
} from '../_shared/anthropic.ts';
import { ConteudoIASchema, errosZod, INPUT_SCHEMA_TOOL, NOME_TOOL } from '../_shared/schemas.ts';
import { mensagemUsuario, SYSTEM_PROMPT } from '../_shared/prompt.ts';
import {
  ajustarConteudoIA, gerarSlugBase, montarConteudoLP, montarEntradaIA, proximoSlugLivre, type LeadParaPrevia,
} from '../_shared/previa.ts';
import { ehNichoLP } from '../_shared/conteudo.ts';
import { linkPrevia, textoMensagem } from '../_shared/mensagens.ts';
import { paraReais } from '../_shared/custos.ts';
import { Execucao } from '../_shared/log.ts';

const Entrada = z
  .object({
    lead_id: z.string().uuid().optional(),
    regenerar: z.boolean().optional(),
    instrucao_extra: z.string().trim().max(600).optional(),
    limite: z.number().int().min(1).max(20).optional(),
  })
  .strict();

const CONCORRENCIA = 2;
const MAX_POR_CHAMADA = 6;
const INICIAR_ATE_MS = 55_000; // não começa lead novo depois disso (limite de tempo da Edge Function)
const PRAZO_TOTAL_MS = 140_000; // a Edge Function é encerrada em ~150 s
const TENTATIVAS = 2;
const MAX_TOKENS = 8000;
const FALHAS_MAX_AUTOMATICO = 2; // leads que falharam 2× saem do lote automático (ainda dá para gerar manualmente)

const CAMPOS_LEAD =
  'id,nome,nicho,cidade,bairro,endereco,telefone,telefone_celular,google_maps_url,rating,reviews_count,tipos,tipo_principal,horarios,avaliacoes,fotos,status_site,status_funil,place_id,falhas_previa';

type Lead = LeadParaPrevia & { status_funil: string; place_id: string; falhas_previa: number };
type Config = {
  negocio_nome: string; app_url: string; limite_geracoes_dia: number; auto_aprovar: boolean; modelo_ia: string; preco_texto: string;
};
type Db = ReturnType<typeof admin>;

const TOOL = {
  name: NOME_TOOL,
  description:
    'Registra o conteúdo final da landing page da empresa. Chame exatamente uma vez, com todos os campos preenchidos conforme as regras.',
  input_schema: INPUT_SCHEMA_TOOL,
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ erro: 'Use POST' }, 405);

  const db = admin();
  const quem = await autorizarAdmin(req, db);
  if (!quem) return json({ erro: 'Não autorizado' }, 401);

  let entrada: z.infer<typeof Entrada>;
  try {
    const texto = await req.text();
    entrada = Entrada.parse(texto ? JSON.parse(texto) : {});
  } catch (e) {
    return json({ erro: 'Entrada inválida', detalhe: (e as Error).message }, 400);
  }

  const { data: cfg, error: eCfg } = await db
    .from('configuracoes')
    .select('negocio_nome,app_url,limite_geracoes_dia,auto_aprovar,modelo_ia,preco_texto')
    .eq('id', 1)
    .single<Config>();
  if (eCfg) return json({ erro: eCfg.message }, 500);

  // Limite diário: cada lead processado (com sucesso ou não) conta 1 geração
  const { data: hoje, error: eHoje } = await db
    .from('execucoes')
    .select('chamadas_api')
    .eq('etapa', 'gerar')
    .gte('iniciado_em', inicioDoDiaSP());
  if (eHoje) return json({ erro: eHoje.message }, 500);
  const usadas = (hoje ?? []).reduce((s, x) => s + (x.chamadas_api ?? 0), 0);
  const restanteHoje = Math.max(0, cfg.limite_geracoes_dia - usadas);
  if (restanteHoje <= 0) {
    return json({ ok: true, gerados: 0, falhas: 0, restantes: null, limite_atingido: true, resultados: [] });
  }

  // Seleção dos leads
  let fila: Lead[] = [];
  const sitesExistentes = new Map<string, { id: string; versao: number; slug: string }>();
  if (entrada.lead_id) {
    const { data: lead, error } = await db.from('leads').select(CAMPOS_LEAD).eq('id', entrada.lead_id).maybeSingle<Lead>();
    if (error) return json({ erro: error.message }, 500);
    if (!lead) return json({ erro: 'Lead não encontrado' }, 404);
    if (['nao_contatar', 'descartado', 'novo'].includes(lead.status_funil)) {
      return json({ erro: `Lead com status "${lead.status_funil}" não pode receber prévia. Qualifique-o antes.` }, 409);
    }
    const { data: site } = await db.from('sites').select('id,versao,slug').eq('lead_id', lead.id).maybeSingle();
    if (site && !entrada.regenerar) return json({ erro: 'Este lead já tem prévia. Use "Regenerar" para criar uma nova versão.' }, 409);
    if (site) sitesExistentes.set(lead.id, site);
    fila = [lead];
  } else {
    const limite = Math.min(restanteHoje, entrada.limite ?? MAX_POR_CHAMADA);
    const { data: candidatos, error } = await db
      .from('leads')
      .select(CAMPOS_LEAD)
      .eq('status_funil', 'qualificado')
      .lt('falhas_previa', FALHAS_MAX_AUTOMATICO)
      .order('score', { ascending: false })
      .limit(limite + 20);
    if (error) return json({ erro: error.message }, 500);
    const ids = (candidatos ?? []).map((l) => l.id);
    const { data: comSite } = ids.length ? await db.from('sites').select('lead_id').in('lead_id', ids) : { data: [] };
    const jaTem = new Set((comSite ?? []).map((s) => s.lead_id));
    fila = ((candidatos ?? []) as Lead[]).filter((l) => !jaTem.has(l.id)).slice(0, limite);
  }
  if (!fila.length) return json({ ok: true, gerados: 0, falhas: 0, restantes: 0, limite_atingido: false, resultados: [] });

  const ex = await new Execucao(db, 'gerar').iniciar();
  ex.log('info', entrada.lead_id ? (entrada.regenerar ? 'Regeneração manual' : 'Geração manual') : `Gerando ${fila.length} prévia(s)`, {
    por: quem,
    modelo: cfg.modelo_ia,
    restante_hoje: restanteHoje,
  });

  const inicio = Date.now();
  const resultados: Record<string, unknown>[] = [];
  let gerados = 0;
  let falhas = 0;

  const trabalhar = async () => {
    while (fila.length && Date.now() - inicio < INICIAR_ATE_MS) {
      const lead = fila.shift()!;
      ex.chamadas++; // conta no limite diário mesmo se falhar
      const t0 = Date.now();
      try {
        const r = await gerarParaLead(db, cfg, lead, sitesExistentes.get(lead.id) ?? null, entrada.instrucao_extra ?? null, inicio + PRAZO_TOTAL_MS);
        ex.custo += r.custoBRL;
        ex.itens++;
        gerados++;
        ex.log('info', `Prévia gerada: ${lead.nome}`, {
          lead_id: lead.id, slug: r.slug, versao: r.versao, tentativas: r.tentativas, segundos: Math.round((Date.now() - t0) / 100) / 10,
          tokens_entrada: r.tokensEntrada, tokens_saida: r.tokensSaida, custo_brl: r.custoBRL, avisos: r.avisos,
        });
        resultados.push({ lead_id: lead.id, nome: lead.nome, ok: true, slug: r.slug, versao: r.versao, aprovado: r.aprovado });
      } catch (e) {
        const msg = (e as Error).message;
        const custo = (e as { custoBRL?: number }).custoBRL ?? 0;
        ex.custo += custo;
        falhas++;
        ex.log('erro', `Falha ao gerar prévia: ${lead.nome}`, { lead_id: lead.id, erro: msg, custo_brl: custo });
        resultados.push({ lead_id: lead.id, nome: lead.nome, ok: false, erro: msg });
        await db.from('leads').update({ falhas_previa: (lead.falhas_previa ?? 0) + 1 }).eq('id', lead.id);
        // Erros de configuração (chave, saldo, modelo) valem para todos: interrompe o lote
        if (e instanceof ErroClaude && !e.tentarDeNovo) fila.length = 0;
      }
      await ex.salvarParcial();
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCORRENCIA, fila.length) }, trabalhar));

  const { count: restantes } = await db
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('status_funil', 'qualificado')
    .lt('falhas_previa', FALHAS_MAX_AUTOMATICO);

  const erroGeral = gerados === 0 && falhas > 0 ? String(resultados.find((r) => !r.ok)?.erro ?? 'Falha na geração') : undefined;
  ex.log('info', 'Fim da geração', { gerados, falhas, custo_brl: Math.round(ex.custo * 10000) / 10000 });
  await ex.finalizar(erroGeral);

  return json({
    ok: !erroGeral,
    erro: erroGeral,
    execucao_id: ex.id,
    gerados,
    falhas,
    restantes: entrada.lead_id ? 0 : restantes ?? 0,
    limite_atingido: restanteHoje - ex.chamadas <= 0,
    custo_brl: Math.round(ex.custo * 10000) / 10000,
    resultados,
  });
});

async function gerarParaLead(
  db: Db,
  cfg: Config,
  lead: Lead,
  siteAtual: { id: string; versao: number; slug: string } | null,
  instrucao: string | null,
  prazo: number,
) {
  const modelo = cfg.modelo_ia || 'claude-sonnet-5';
  let tokensEntrada = 0;
  let tokensSaida = 0;
  let custoUSDTotal = 0;
  const falhar = (msg: string): never => {
    const err = new Error(msg) as Error & { custoBRL: number };
    err.custoBRL = paraReais(custoUSDTotal);
    throw err;
  };

  const messages: { role: string; content: unknown }[] = [
    { role: 'user', content: mensagemUsuario(montarEntradaIA(lead), instrucao) },
  ];
  let strict = true;
  let maxTokens = MAX_TOKENS;
  let ultimosErros: string[] = [];

  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    const restante = prazo - Date.now() - 5_000;
    if (restante < 20_000) falhar('Tempo esgotado nesta execução. Tente gerar de novo.');
    const corpo: Record<string, unknown> = {
      model: modelo,
      max_tokens: maxTokens,
      // System estável com cache: tools + system são iguais para todos os leads
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      tools: [strict ? { ...TOOL, strict: true } : TOOL],
      tool_choice: { type: 'tool', name: NOME_TOOL },
      messages,
    };
    // Sonnet 5 pensa (adaptive) por padrão; esforço médio equilibra qualidade e tempo. Haiku 4.5 não aceita effort.
    if (!ehHaiku(modelo)) corpo.output_config = { effort: 'medium' };

    let resp: RespostaClaude;
    try {
      resp = await chamarClaude(corpo, Math.min(80_000, restante));
    } catch (e) {
      // Se a conta/modelo não aceitar strict tool use, tenta sem (a validação zod continua garantindo o formato)
      if (e instanceof ErroClaude && e.status === 400 && strict && /strict/i.test(e.message)) {
        strict = false;
        tentativa--;
        continue;
      }
      const erro = (e instanceof Error ? e : new Error(String(e))) as Error & { custoBRL?: number };
      erro.custoBRL = paraReais(custoUSDTotal);
      throw erro;
    }

    tokensEntrada += resp.usage.input_tokens + (resp.usage.cache_creation_input_tokens ?? 0) + (resp.usage.cache_read_input_tokens ?? 0);
    tokensSaida += resp.usage.output_tokens;
    custoUSDTotal += custoUSD(modelo, resp.usage);

    if (resp.stop_reason === 'refusal') falhar('A IA recusou gerar o conteúdo deste lead.');
    const bloco = resp.content.find((b: BlocoConteudo) => b.type === 'tool_use' && b.name === NOME_TOOL);
    if (!bloco || resp.stop_reason === 'max_tokens') {
      ultimosErros = [resp.stop_reason === 'max_tokens' ? 'resposta cortada (limite de tokens)' : 'a IA não chamou a ferramenta'];
      maxTokens = Math.min(maxTokens * 2, 16000);
      continue; // repete a mesma pergunta
    }

    const ultima = tentativa === TENTATIVAS;
    const validado = ConteudoIASchema.safeParse(ajustarConteudoIA(bloco.input, ultima));
    if (validado.success) {
      const { conteudo, avisos } = montarConteudoLP(lead, validado.data);
      const salvo = await salvarPrevia(db, cfg, lead, siteAtual, {
        conteudo, modelo, tokensEntrada, tokensSaida, custoBRL: paraReais(custoUSDTotal), instrucao,
      });
      return { ...salvo, tentativas: tentativa, tokensEntrada, tokensSaida, custoBRL: paraReais(custoUSDTotal), avisos };
    }

    // Devolve os erros para a IA corrigir (mantém o histórico completo, inclusive blocos de raciocínio)
    ultimosErros = errosZod(validado.error);
    messages.push(
      { role: 'assistant', content: resp.content },
      {
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: bloco.id,
          is_error: true,
          content: `O conteúdo não passou na validação. Corrija estes pontos e chame ${NOME_TOOL} novamente com o conteúdo completo:\n- ${ultimosErros.join('\n- ')}`,
        }],
      },
    );
  }
  return falhar(`Conteúdo inválido após ${TENTATIVAS} tentativas: ${ultimosErros.join('; ')}`);
}

async function salvarPrevia(
  db: Db,
  cfg: Config,
  lead: Lead,
  siteAtual: { id: string; versao: number; slug: string } | null,
  g: { conteudo: unknown; modelo: string; tokensEntrada: number; tokensSaida: number; custoBRL: number; instrucao: string | null },
) {
  const template = ehNichoLP(lead.nicho) ? lead.nicho : 'servicos';
  const dados = {
    template,
    conteudo: g.conteudo,
    modelo_ia: g.modelo,
    tokens_entrada: g.tokensEntrada,
    tokens_saida: g.tokensSaida,
    custo_estimado: g.custoBRL,
    instrucao_extra: g.instrucao,
    atualizado_em: new Date().toISOString(),
  };

  // Regeneração: nova versão na mesma linha (slug e links continuam valendo)
  if (siteAtual) {
    const { error } = await db.from('sites').update({ ...dados, versao: siteAtual.versao + 1 }).eq('id', siteAtual.id);
    if (error) throw new Error(`Erro ao salvar nova versão: ${error.message}`);
    await db.from('leads').update({ falhas_previa: 0 }).eq('id', lead.id);
    return { slug: siteAtual.slug, versao: siteAtual.versao + 1, aprovado: false };
  }

  const base = gerarSlugBase(lead.nome, lead.bairro);
  let site: { id: string; slug: string; token_acesso: string } | null = null;
  for (let i = 0; i < 4 && !site; i++) {
    const { data: usados } = await db.from('sites').select('slug').like('slug', `${base}%`);
    const slug = proximoSlugLivre(base, (usados ?? []).map((u) => u.slug));
    const { data, error } = await db.from('sites').insert({ ...dados, lead_id: lead.id, slug }).select('id,slug,token_acesso').single();
    if (!error) site = data;
    else if (error.code === '23505' && /lead/.test(error.message)) throw new Error('Este lead já tem prévia (gerada em paralelo).');
    else if (error.code !== '23505') throw new Error(`Erro ao salvar prévia: ${error.message}`);
  }
  if (!site) throw new Error('Não foi possível reservar um endereço (slug) para a prévia.');

  // Auto-aprovação: publica, cria a mensagem de primeiro contato e marca "aprovado"
  const podeAprovar = cfg.auto_aprovar && lead.status_funil === 'qualificado';
  let aprovado = false;
  if (podeAprovar) {
    const appUrl = cfg.app_url || Deno.env.get('APP_URL') || '';
    await db.from('sites').update({ publicado: true, publicado_em: new Date().toISOString() }).eq('id', site.id);
    if (appUrl) {
      const texto = textoMensagem('primeiro_contato', {
        lead_id: lead.id,
        nome: lead.nome,
        rating: lead.rating,
        reviews_count: lead.reviews_count,
        status_site: lead.status_site,
        link: linkPrevia(appUrl, site.slug, site.token_acesso),
        negocio_nome: cfg.negocio_nome,
        preco_texto: cfg.preco_texto,
      });
      const { error: eMsg } = await db.from('mensagens').insert({ lead_id: lead.id, tipo: 'primeiro_contato', texto });
      if (eMsg && eMsg.code !== '23505') throw new Error(`Erro ao criar a mensagem: ${eMsg.message}`);
    }
    aprovado = true;
  }

  const novoStatus = aprovado ? 'aprovado' : lead.status_funil === 'qualificado' ? 'previa_gerada' : lead.status_funil;
  await db.from('leads').update({ status_funil: novoStatus, falhas_previa: 0 }).eq('id', lead.id);
  return { slug: site.slug, versao: 1, aprovado };
}
