-- Modelos de mensagem do WhatsApp editáveis em Configurações → Mensagens do WhatsApp.
-- Vazio = usa o texto padrão. Os follow-ups automáticos passam a usar os modelos salvos.
alter table configuracoes add column if not exists modelos_mensagem jsonb not null default '{}'::jsonb;

-- Modelo em uso (personalizado ou padrão) — os padrões espelham supabase/functions/_shared/mensagens.ts
create or replace function sp_modelo_mensagem(p_chave text) returns text
language sql stable set search_path = public as $$
  select coalesce(
    nullif(btrim((select modelos_mensagem ->> p_chave from configuracoes where id = 1)), ''),
    case p_chave
      when 'followup_1' then 'Oi! Só reforçando: montei uma prévia de site para a {nome}. Dá uma olhada quando puder: {link}'
      when 'followup_1_abriu' then 'Oi! Vi que deu uma olhada na prévia do site da {nome}. O que achou? Posso ajustar o que quiser antes de colocar no ar.'
      when 'followup_2' then 'Última mensagem, prometo. A prévia da {nome} fica no ar até {data_limite}. Se fizer sentido, é só me chamar. Obrigado!'
      else ''
    end)
$$;

-- Preenche os {campos} do modelo com os dados do lead
create or replace function sp_preencher_mensagem(p_modelo text, p_lead_id uuid, p_data_limite text default '') returns text
language plpgsql stable set search_path = public as $$
declare
  l leads%rowtype;
  c configuracoes%rowtype;
  v_nota text;
  v_aval text;
  v_texto text := coalesce(p_modelo, '');
  v_primeiro text;
begin
  select * into l from leads where id = p_lead_id;
  select * into c from configuracoes where id = 1;
  v_nota := case when l.rating is null then '' else replace(to_char(l.rating, 'FM0.0'), '.', ',') end;
  v_aval := replace(to_char(coalesce(l.reviews_count, 0), 'FM999G999G999'), ',', '.');
  v_primeiro := coalesce(substring(l.nome from '^(?:[Dd]ra?\.?|[Dd]outora?|[Pp]rof\.?)\s+([A-ZÀ-Ú][a-zà-ú]+)'), l.nome);

  v_texto := replace(v_texto, '{saudacao}', 'Oi, tudo bem? Falo com a equipe da ' || l.nome || '?');
  v_texto := replace(v_texto, '{frase_google}',
    case when l.rating is not null and coalesce(l.reviews_count, 0) >= 5
      then 'Vi que vocês têm ' || v_nota || '★ com ' || v_aval || ' avaliações no Google, mas ainda não têm site.'
      else 'Encontrei vocês no Google Maps e vi que ainda não têm site.' end);
  v_texto := replace(v_texto, '{primeiro_nome_ou_empresa}', v_primeiro);
  v_texto := replace(v_texto, '{nome}', l.nome);
  v_texto := replace(v_texto, '{rating}', v_nota);
  v_texto := replace(v_texto, '{reviews_count}', v_aval);
  v_texto := replace(v_texto, '{link}', link_previa_lead(p_lead_id));
  v_texto := replace(v_texto, '{negocio_nome}', coalesce(c.negocio_nome, ''));
  v_texto := replace(v_texto, '{preco_texto}', coalesce(c.preco_texto, ''));
  v_texto := replace(v_texto, '{data_limite}', coalesce(p_data_limite, ''));
  return btrim(v_texto);
end $$;

-- Agenda follow-ups usando os modelos (restante igual à Fase 6)
create or replace function agendar_followups() returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_pulados int; v_f1 int; v_f2 int; v_perdidos int; v_despublicados int; v_total int;
  v_limite text := to_char(hoje_sp() + 35, 'DD/MM/YYYY');
begin
  perform pg_advisory_xact_lock(hashtext('sp_agendar_followups'));

  -- Follow-ups pendentes de quem já avançou (respondeu, negociando, fechado) ou saiu do funil
  update mensagens m set status = 'pulada', motivo_pulo = 'lead avançou no funil'
  from leads l
  where l.id = m.lead_id and m.status = 'pendente' and m.tipo in ('followup_1', 'followup_2')
    and l.status_funil not in ('enviado', 'abriu');
  get diagnostics v_pulados = row_count;

  -- Follow-up 1: 2 dias após o primeiro contato
  insert into mensagens (lead_id, tipo, texto, agendada_para)
  select l.id, 'followup_1',
    sp_preencher_mensagem(
      sp_modelo_mensagem(case when l.status_funil = 'abriu' then 'followup_1_abriu' else 'followup_1' end), l.id, v_limite),
    hoje_sp()
  from leads l
  join mensagens p on p.lead_id = l.id and p.tipo = 'primeiro_contato' and p.status = 'enviada'
  where l.status_funil in ('enviado', 'abriu')
    and p.enviada_em <= now() - interval '2 days'
    and not exists (select 1 from mensagens f where f.lead_id = l.id and f.tipo = 'followup_1')
  on conflict do nothing;
  get diagnostics v_f1 = row_count;

  -- Follow-up 2: 3 dias após o follow-up 1 (enviado ou pulado)
  insert into mensagens (lead_id, tipo, texto, agendada_para)
  select l.id, 'followup_2',
    sp_preencher_mensagem(sp_modelo_mensagem('followup_2'), l.id, v_limite),
    hoje_sp()
  from leads l
  join mensagens f on f.lead_id = l.id and f.tipo = 'followup_1' and f.status in ('enviada', 'pulada')
  where l.status_funil in ('enviado', 'abriu')
    and coalesce(f.enviada_em, f.criado_em) <= now() - interval '3 days'
    and not exists (select 1 from mensagens g where g.lead_id = l.id and g.tipo = 'followup_2')
  on conflict do nothing;
  get diagnostics v_f2 = row_count;

  -- Sem resposta 5 dias após o follow-up 2 → perdido
  update leads l set status_funil = 'perdido', motivo_descarte = 'sem_resposta', atualizado_em = now()
  from mensagens g
  where g.lead_id = l.id and g.tipo = 'followup_2' and g.status in ('enviada', 'pulada')
    and l.status_funil in ('enviado', 'abriu')
    and coalesce(g.enviada_em, g.criado_em) <= now() - interval '5 days';
  get diagnostics v_perdidos = row_count;

  -- Prévias de leads perdidos saem do ar 30 dias depois
  update sites s set publicado = false
  from leads l
  where l.id = s.lead_id and s.publicado and l.status_funil = 'perdido' and l.perdido_em <= now() - interval '30 days';
  get diagnostics v_despublicados = row_count;

  v_total := v_f1 + v_f2 + v_perdidos + v_despublicados;
  if v_total > 0 then
    insert into execucoes (etapa, finalizado_em, sucesso, itens_processados, log)
    values ('followups', now(), true, v_total, jsonb_build_array(jsonb_build_object(
      'em', now(), 'nivel', 'info',
      'msg', format('%s follow-up 1, %s follow-up 2, %s perdido(s), %s prévia(s) despublicada(s)', v_f1, v_f2, v_perdidos, v_despublicados))));
  end if;

  return jsonb_build_object('followup_1', v_f1, 'followup_2', v_f2, 'perdidos', v_perdidos,
    'despublicados', v_despublicados, 'pulados', v_pulados);
end $$;

do $$ begin
  grant execute on function agendar_followups() to service_role;
exception when undefined_object or undefined_function then null; end $$;
