-- Posição no Google: consulta a busca oficial (Places API) e guarda a posição do lead e dos concorrentes.
-- Usado para montar a imagem "sua empresa aparece em Xº lugar" enviada ao lead.
create table if not exists rankings (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  consulta text not null,                 -- ex.: "hamburgueria em Campinas - SP"
  posicao int,                            -- null = fora das posições consultadas
  total int not null default 0,           -- quantas empresas a busca trouxe (até 60)
  resultados jsonb not null default '[]', -- [{posicao, place_id, nome, rating, reviews, endereco}]
  criado_em timestamptz not null default now()
);
create index if not exists rankings_lead_idx on rankings (lead_id, criado_em desc);

alter table rankings enable row level security;
do $$ begin
  if to_regprocedure('public.sp_eh_operador()') is null then
    execute 'create function public.sp_eh_operador() returns boolean language sql stable as ''select true''';
  end if;
  execute 'drop policy if exists operador_total on rankings';
  execute 'create policy operador_total on rankings for all to authenticated using ((select sp_eh_operador())) with check ((select sp_eh_operador()))';
end $$;
