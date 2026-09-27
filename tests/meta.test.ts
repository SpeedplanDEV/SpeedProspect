import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  classificarErro, criarClienteMeta, ErroMeta, lerConfigMeta, minutosParaLiberar, paraParametros, idContaAnuncio,
} from '../supabase/functions/_shared/meta';
import {
  avaliarSaude, criativoDeAnuncio, motivoReprovacao, objetivoLocal, statusLocal, telefoneBR,
} from '../supabase/functions/_shared/meta-mapa';

type Chamada = { url: string; init?: RequestInit };

/** fetch simulado: responde em sequência com as respostas dadas */
function fetchFalso(respostas: (() => Response)[]) {
  const chamadas: Chamada[] = [];
  let i = 0;
  const f = (async (url: string, init?: RequestInit) => {
    chamadas.push({ url: String(url), init });
    const r = respostas[Math.min(i, respostas.length - 1)];
    i++;
    return r();
  }) as unknown as typeof fetch;
  return { f, chamadas };
}
const json = (corpo: unknown, status = 200, headers: Record<string, string> = {}) => () =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json', ...headers } });
const semEspera = async () => {};

describe('configuração', () => {
  it('exige versão e token, com orientação clara', () => {
    expect(() => lerConfigMeta(() => undefined)).toThrowError(/META_API_VERSION e META_SYSTEM_USER_TOKEN/);
    try {
      lerConfigMeta((n) => (n === 'META_API_VERSION' ? '26' : 'tok'));
    } catch (e) {
      expect((e as ErroMeta).info.categoria).toBe('config');
      expect((e as ErroMeta).info.orientacao).toMatch(/v26\.0/);
    }
    const cfg = lerConfigMeta((n) => ({ META_API_VERSION: 'v26.0', META_SYSTEM_USER_TOKEN: 'tok', META_APP_SECRET: 'seg' })[n]);
    expect(cfg).toMatchObject({ versao: 'v26.0', token: 'tok', appSecret: 'seg' });
  });

  it('parâmetros: objetos viram JSON e nulos somem', () => {
    const p = paraParametros({ fields: 'id,name', limit: 100, targeting: { age_min: 25 }, vazio: null });
    expect(p.get('targeting')).toBe('{"age_min":25}');
    expect(p.has('vazio')).toBe(false);
    expect(idContaAnuncio('123')).toBe('act_123');
    expect(idContaAnuncio('act_9')).toBe('act_9');
  });
});

describe('classificação de erros da Meta', () => {
  const erro = (code: number, sub?: number, msg = 'x') => ({ error: { code, error_subcode: sub, message: msg, type: 'OAuthException' } });
  it('token, permissão, acesso, limite, versão, parâmetro', () => {
    expect(classificarErro(400, erro(190, 463)).info.categoria).toBe('token');
    expect(classificarErro(403, erro(200)).info.categoria).toBe('permissao');
    expect(classificarErro(400, erro(100, 33)).info.categoria).toBe('acesso');
    expect(classificarErro(400, erro(80004)).info).toMatchObject({ categoria: 'limite', temporario: true });
    expect(classificarErro(400, erro(613, 1487742)).info.temporario).toBe(true);
    expect(classificarErro(400, erro(2635)).info.categoria).toBe('versao');
    expect(classificarErro(400, erro(100, undefined, 'Invalid parameter')).info.categoria).toBe('parametro');
    expect(classificarErro(400, erro(100, undefined, 'API calls from the server require an appsecret_proof argument')).info.categoria).toBe('config');
    expect(classificarErro(502, '<html>').info).toMatchObject({ categoria: 'temporario', temporario: true });
  });

  it('mensagem do usuário da Meta e orientação em pt-BR', () => {
    const e = classificarErro(400, { error: { code: 190, message: 'Error validating access token', error_user_msg: 'Sessão expirada' } });
    expect(e.message).toBe('Token da Meta inválido ou expirado: Sessão expirada');
    expect(e.info.orientacao).toMatch(/Usuários do sistema/);
  });

  it('lê o tempo de espera dos cabeçalhos de uso', () => {
    const h = new Headers({ 'x-business-use-case-usage': JSON.stringify({ '123': [{ type: 'ads_management', estimated_time_to_regain_access: 7 }] }) });
    expect(minutosParaLiberar(h)).toBe(7);
    const e = classificarErro(400, { error: { code: 80004, message: 'too many' } }, h);
    expect(e.message).toMatch(/cerca de 7 min/);
  });
});

describe('cliente da Graph API', () => {
  const cfg = { versao: 'v26.0', token: 'TOKEN', appSecret: 'SEGREDO', base: 'https://graph.test', espera: semEspera };

  it('GET com token e appsecret_proof (HMAC-SHA256)', async () => {
    const { f, chamadas } = fetchFalso([json({ id: '1', name: 'Eu' })]);
    const meta = criarClienteMeta({ ...cfg, fetch: f });
    expect(await meta.get('me', { fields: 'id,name' })).toEqual({ id: '1', name: 'Eu' });
    const u = new URL(chamadas[0].url);
    expect(u.pathname).toBe('/v26.0/me');
    expect(u.searchParams.get('access_token')).toBe('TOKEN');
    // HMAC-SHA256(chave = app secret, mensagem = token), calculado de forma independente
    expect(u.searchParams.get('appsecret_proof')).toBe(createHmac('sha256', 'SEGREDO').update('TOKEN').digest('hex'));
  });

  it('respeita outro token informado na chamada (token do app no debug_token)', async () => {
    const { f, chamadas } = fetchFalso([json({ data: { type: 'SYSTEM_USER', is_valid: true } })]);
    const meta = criarClienteMeta({ ...cfg, fetch: f });
    await meta.get('debug_token', { input_token: 'TOKEN', access_token: 'APP|SEG' });
    const u = new URL(chamadas[0].url);
    expect(u.searchParams.get('access_token')).toBe('APP|SEG');
    expect(u.searchParams.get('appsecret_proof')).toBe(createHmac('sha256', 'SEGREDO').update('APP|SEG').digest('hex'));
  });

  it('POST vai como formulário, sem token na URL', async () => {
    const { f, chamadas } = fetchFalso([json({ id: 'c1' })]);
    const meta = criarClienteMeta({ ...cfg, fetch: f });
    await meta.post('act_1/campaigns', { name: 'X', special_ad_categories: [], status: 'PAUSED' });
    expect(chamadas[0].url).toBe('https://graph.test/v26.0/act_1/campaigns');
    const corpo = new URLSearchParams(String(chamadas[0].init?.body));
    expect(corpo.get('special_ad_categories')).toBe('[]');
    expect(corpo.get('status')).toBe('PAUSED');
    expect(corpo.get('access_token')).toBe('TOKEN');
  });

  it('repete em limite de chamadas e depois funciona', async () => {
    const { f, chamadas } = fetchFalso([json({ error: { code: 613, message: 'Calls limit' } }, 400), json({ data: [] })]);
    const meta = criarClienteMeta({ ...cfg, fetch: f });
    expect(await meta.get('act_1/campaigns')).toEqual({ data: [] });
    expect(chamadas).toHaveLength(2);
  });

  it('não repete erro de token e informa o que fazer', async () => {
    const { f, chamadas } = fetchFalso([json({ error: { code: 190, message: 'Invalid OAuth access token' } }, 400)]);
    const meta = criarClienteMeta({ ...cfg, fetch: f });
    await expect(meta.get('me')).rejects.toMatchObject({ info: { categoria: 'token' } });
    expect(chamadas).toHaveLength(1);
  });

  it('erro de rede nunca expõe o token (a mensagem do Deno traz a URL completa)', async () => {
    const f = (async (url: string) => {
      throw new TypeError(`error sending request for url (${url}): connection reset`);
    }) as unknown as typeof fetch;
    const meta = criarClienteMeta({ ...cfg, token: 'EAAGsegredoDoTokenMuitoLongo123456', fetch: f });
    const erro = await meta.get('me').catch((e) => e as ErroMeta);
    expect(erro.message).not.toMatch(/EAAGsegredo/);
    expect(erro.message).toMatch(/access_token=\*\*\*/);
    expect(erro.message).not.toMatch(/appsecret_proof=[0-9a-f]/);
  });

  it('desiste após 3 tentativas temporárias', async () => {
    const { f, chamadas } = fetchFalso([json({ error: { code: 2, message: 'Service temporarily unavailable' } }, 500)]);
    const meta = criarClienteMeta({ ...cfg, fetch: f });
    await expect(meta.get('me')).rejects.toBeInstanceOf(ErroMeta);
    expect(chamadas).toHaveLength(3);
  });

  it('não espera quando a Meta pede minutos (reprocessa na próxima execução)', async () => {
    const h = { 'x-business-use-case-usage': JSON.stringify({ '1': [{ estimated_time_to_regain_access: 15 }] }) };
    const { f, chamadas } = fetchFalso([json({ error: { code: 80004, message: 'too many' } }, 400, h)]);
    const meta = criarClienteMeta({ ...cfg, fetch: f });
    await expect(meta.get('act_1/ads')).rejects.toMatchObject({ info: { categoria: 'limite', esperarMinutos: 15 } });
    expect(chamadas).toHaveLength(1);
  });

  it('pagina seguindo o cursor after', async () => {
    const { f, chamadas } = fetchFalso([
      json({ data: [{ id: '1' }, { id: '2' }], paging: { cursors: { after: 'A' }, next: 'https://graph/next' } }),
      json({ data: [{ id: '3' }], paging: { cursors: { after: 'B' } } }),
    ]);
    const meta = criarClienteMeta({ ...cfg, fetch: f });
    const r = await meta.paginar<{ id: string }>('me/adaccounts', { fields: 'id' });
    expect(r.itens.map((x) => x.id)).toEqual(['1', '2', '3']);
    expect(new URL(chamadas[1].url).searchParams.get('after')).toBe('A');
  });

  it('lote: divide em grupos de 50 e repete itens temporários', async () => {
    const ops = Array.from({ length: 120 }, (_, i) => ({ metodo: 'GET' as const, caminho: `${i}`, params: { fields: 'status' } }));
    let primeira = true;
    const respostas = (corpo: string) => {
      const batch = JSON.parse(new URLSearchParams(corpo).get('batch')!) as { relative_url: string }[];
      return batch.map((b, j) => {
        if (primeira && j === 0 && b.relative_url.startsWith('0?')) {
          primeira = false;
          return null; // item sem resposta (tempo esgotado) → repetir
        }
        if (b.relative_url.startsWith('7?')) return { code: 400, body: JSON.stringify({ error: { code: 100, error_subcode: 33, message: 'Unsupported get request' } }) };
        return { code: 200, body: JSON.stringify({ id: b.relative_url.split('?')[0], status: 'PAUSED' }) };
      });
    };
    const chamadas: string[] = [];
    const f = (async (_url: string, init?: RequestInit) => {
      chamadas.push(String(init?.body));
      return new Response(JSON.stringify(respostas(String(init?.body))), { status: 200 });
    }) as unknown as typeof fetch;
    const meta = criarClienteMeta({ ...cfg, fetch: f });
    const r = await meta.lote<{ id: string }>(ops);
    expect(chamadas).toHaveLength(4); // 50 + 50 + 20 + repetição do item 0
    expect(r[0]).toMatchObject({ ok: true, dados: { id: '0' } });
    expect(r[7]).toMatchObject({ ok: false, erro: { info: { categoria: 'acesso' } } });
    expect(r.filter((x) => x.ok)).toHaveLength(119);
  });
});

describe('tradução Meta → sistema', () => {
  it('status', () => {
    expect(statusLocal('ACTIVE', 'ACTIVE')).toBe('ativo');
    expect(statusLocal('CAMPAIGN_PAUSED', 'ACTIVE')).toBe('pausado');
    expect(statusLocal('DISAPPROVED', 'ACTIVE')).toBe('erro');
    expect(statusLocal('ARCHIVED', 'PAUSED')).toBe('encerrado');
    expect(statusLocal('PENDING_REVIEW', 'ACTIVE')).toBe('ativo');
    expect(statusLocal('IN_PROCESS', 'PAUSED')).toBe('pausado');
  });

  it('objetivos', () => {
    expect(objetivoLocal('OUTCOME_ENGAGEMENT', 'WHATSAPP')).toBe('conversas_whatsapp');
    expect(objetivoLocal('OUTCOME_ENGAGEMENT', 'ON_POST')).toBe('outro');
    expect(objetivoLocal('OUTCOME_LEADS', 'ON_AD')).toBe('formulario');
    expect(objetivoLocal('OUTCOME_LEADS', 'WEBSITE')).toBe('leads_site');
    expect(objetivoLocal('OUTCOME_TRAFFIC')).toBe('trafego_site');
    expect(objetivoLocal('OUTCOME_SALES')).toBe('vendas');
    expect(objetivoLocal('OUTCOME_APP_PROMOTION')).toBe('outro');
  });

  it('criativo importado e reprovação', () => {
    const c = criativoDeAnuncio({
      object_story_spec: { link_data: { message: 'Texto', name: 'Título', link: 'https://x', call_to_action: { type: 'WHATSAPP_MESSAGE' } } },
    });
    expect(c).toMatchObject({ formato: 'imagem_1x1', texto_primario: 'Texto', titulo: 'Título', cta: 'WHATSAPP_MESSAGE', link_destino: 'https://x' });
    expect(criativoDeAnuncio({ video_id: 'v1', body: 'b' }).formato).toBe('video_9x16');
    expect(motivoReprovacao({ global: { PROMESSA: 'Anúncio promete resultado garantido' } })).toBe('Anúncio promete resultado garantido');
    expect(motivoReprovacao(null)).toBeNull();
    expect(telefoneBR('+5517999998888')).toBe('(17) 99999-8888');
  });
});

describe('saúde da conta', () => {
  const agora = new Date('2026-09-27T12:00:00Z');
  it('tudo certo', () => {
    const s = avaliarSaude({
      conta: { account_status: 1, funding_source: '9', funding_source_details: { id: '9', display_string: 'Visa *1234' } },
      pagina: { has_whatsapp_business_number: true, whatsapp_number: '+5517999998888', instagram_business_account: { id: 'ig', username: 'loja' } },
      pixel: { last_fired_time: '2026-09-27T10:00:00Z' },
      temPagina: true,
      temPixel: true,
      whatsappConfigurado: '+5517999998888',
      agora,
    });
    expect(s.geral).toBe('ok');
    expect(s.status.texto).toBe('Ativa');
    expect(s.pagamento.texto).toBe('Visa *1234');
    expect(s.whatsapp.texto).toBe('Conectado: (17) 99999-8888');
    expect(s.instagram.texto).toBe('@loja');
  });

  it('sem pagamento, conta desativada, WhatsApp e pixel com problema', () => {
    const s = avaliarSaude({
      conta: { account_status: 2, disable_reason: 3 },
      pagina: { has_whatsapp_number: false },
      pixel: { last_fired_time: '2026-09-01T00:00:00Z' },
      temPagina: true,
      temPixel: true,
      agora,
    });
    expect(s.geral).toBe('erro');
    expect(s.status.texto).toBe('Desativada (risco de pagamento)');
    expect(s.pagamento).toMatchObject({ nivel: 'erro', texto: 'Sem forma de pagamento' });
    expect(s.whatsapp.nivel).toBe('aviso');
    expect(s.pixel.texto).toBe('Último evento há 26 dias');
  });

  it('WhatsApp da Página diferente do cadastrado vira aviso', () => {
    const s = avaliarSaude({
      conta: { account_status: 1, funding_source: '1' },
      pagina: { has_whatsapp_business_number: true, whatsapp_number: '+5517999998888' },
      temPagina: true,
      temPixel: false,
      whatsappConfigurado: '+5511911112222',
      agora,
    });
    expect(s.whatsapp.nivel).toBe('aviso');
    expect(s.pixel.texto).toBe('Nenhum vinculado');
  });
});
