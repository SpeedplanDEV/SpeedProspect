-- Fase 4 — prévias (landing pages), tracking e opt-out (idempotente)

-- Token público do link "Não quero receber propostas" (separado do token do link enviado)
alter table sites add column if not exists token_optout text unique default encode(gen_random_bytes(8), 'hex');
update sites set token_optout = encode(gen_random_bytes(8), 'hex') where token_optout is null;
alter table sites alter column token_optout set not null;

alter table sites add column if not exists atualizado_em timestamptz not null default now();
alter table sites add column if not exists instrucao_extra text;

-- Tentativas de geração que falharam (leads com 2 falhas saem do lote automático)
alter table leads add column if not exists falhas_previa int not null default 0;

-- Uma prévia por lead (regenerar cria nova versão na mesma linha, mantendo slug e links)
create unique index if not exists sites_lead_unico on sites (lead_id);

-- Deduplicação de visitas por sessão/dia
create index if not exists eventos_site_sessao_idx on eventos (site_id, sessao, tipo, criado_em desc);

-- No máximo uma mensagem de primeiro contato por lead
create unique index if not exists mensagens_primeiro_contato_unico on mensagens (lead_id) where tipo = 'primeiro_contato';

-- Leitura pública da prévia: publicada, ou não publicada quando o token do link confere (uso interno do operador)
drop function if exists get_site_publico(text);
create or replace function get_site_publico(p_slug text, p_token text default null) returns jsonb
language sql security definer stable set search_path = public as $$
  select jsonb_build_object(
    'site_id', s.id,
    'slug', s.slug,
    'template', s.template,
    'conteudo', s.conteudo,
    'versao', s.versao,
    'publicado', s.publicado,
    'token_optout', s.token_optout,
    'fotos', coalesce((
      select jsonb_agg(jsonb_build_object('name', f->>'name', 'atribuicao', f->>'atribuicao', 'atribuicao_uri', f->>'atribuicao_uri'))
      from jsonb_array_elements(l.fotos) f
    ), '[]'::jsonb),
    'negocio_nome', c.negocio_nome,
    'negocio_whatsapp', c.negocio_whatsapp
  )
  from sites s
  join leads l on l.id = s.lead_id
  cross join configuracoes c
  where s.slug = p_slug
    and c.id = 1
    and l.status_funil <> 'nao_contatar'
    and (s.publicado = true or (p_token is not null and s.token_acesso = p_token));
$$;
revoke all on function get_site_publico(text, text) from public;
grant execute on function get_site_publico(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
