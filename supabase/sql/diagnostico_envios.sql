-- Diagnóstico: por que os leads aprovados não aparecem em Envios (só leitura, não altera nada)
select
  l.nome,
  l.status_funil                                  as status_lead,
  (s.id is not null)                              as tem_previa,
  coalesce(m.status, '(sem mensagem)')            as status_mensagem,
  m.agendada_para,
  (now() at time zone 'America/Sao_Paulo')::date  as hoje_sp,
  m.motivo_pulo,
  (select string_agg(email, ', ') from operadores) as operadores
from leads l
left join sites s on s.lead_id = l.id
left join mensagens m on m.lead_id = l.id and m.tipo = 'primeiro_contato'
where l.status_funil in ('aprovado', 'previa_gerada', 'enviado')
   or m.id is not null
order by l.atualizado_em desc
limit 30;
