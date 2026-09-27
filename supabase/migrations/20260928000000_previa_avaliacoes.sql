-- Prévia: inclui as avaliações positivas reais do Google (nota >= 4, com texto) — idempotente
create or replace function get_site_publico(p_slug text, p_token text default null) returns jsonb
language sql security definer stable set search_path = public as $$
  select jsonb_build_object(
    'site_id', s.id, 'slug', s.slug, 'template', s.template, 'conteudo', s.conteudo,
    'versao', s.versao, 'publicado', s.publicado, 'token_optout', s.token_optout,
    'fotos', coalesce((select jsonb_agg(jsonb_build_object('name', f->>'name', 'atribuicao', f->>'atribuicao', 'atribuicao_uri', f->>'atribuicao_uri'))
      from jsonb_array_elements(l.fotos) f), '[]'::jsonb),
    'avaliacoes', coalesce((select jsonb_agg(jsonb_build_object('autor', a->>'autor', 'nota', (a->>'nota')::numeric, 'texto', a->>'texto', 'data', a->>'data'))
      from jsonb_array_elements(l.avaliacoes) a
      where coalesce((a->>'nota')::numeric, 0) >= 4 and length(coalesce(a->>'texto', '')) >= 15), '[]'::jsonb),
    'negocio_nome', c.negocio_nome, 'negocio_whatsapp', c.negocio_whatsapp)
  from sites s join leads l on l.id = s.lead_id cross join configuracoes c
  where s.slug = p_slug and c.id = 1 and l.status_funil <> 'nao_contatar'
    and (s.publicado = true or (p_token is not null and s.token_acesso = p_token));
$$;
revoke all on function get_site_publico(text, text) from public;
grant execute on function get_site_publico(text, text) to anon, authenticated;
notify pgrst, 'reload schema';
