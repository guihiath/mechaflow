-- =============================================================================
-- MechaFlow - F8-P1 - painel_mes com volume: total das OS de uma vez, nao por OS
--
-- Problema (staging, 3.000 OS, outubro/2026 com 388 entregues, dono):
--   painel_mes 1,7 s e painel_lista_os 0,5 s, enquanto vw_os_totais INTEIRA sai em
--   12 ms. Causa: private.os_entregues_no_mes e private.os_recebidas_no_mes pegam o
--   total por "cross join lateral vw_os_totais where os_id = o.id": a view (GROUP BY
--   + RLS de 4 tabelas, com subconsulta da RLS de os_itens em ordens_servico) e
--   reexecutada UMA VEZ POR OS, ~1 ms cada. painel_mes chama os_entregues_no_mes 3
--   vezes (entregues, servicos, produtividade) + os_recebidas_no_mes 1 vez:
--   ~3 x 388 + ~380 execucoes da view = ~1,7 s. painel_lista_os: 1 x 388 = ~0,5 s.
--   (As funcoes SQL com SET search_path nao sao "inlined", e o plano delas e
--   generico: o planner nao sabe que a janela tem centenas de OS e escolhe o laco.)
--
-- Correcao: as duas funcoes separam as OS da janela primeiro (CTE materializada) e
-- pedem os totais de todas de uma vez a private.os_totais(uuid[]), que le
-- vw_os_totais com "os_id = any(lista)" (uma execucao da view, filtrada pela chave).
--
-- O que NAO muda:
--   * o valor continua vindo de vw_os_totais (a mesma conta da tela da OS);
--   * mesmas assinaturas, mesmas colunas, mesmas linhas: painel_mes, painel_lista_os,
--     painel_hoje e contas_a_receber nao foram tocadas e devolvem o mesmo jsonb/tabela;
--   * SECURITY INVOKER (RLS de quem chama), oficina so da sessao, papel conferido
--     nas funcoes publicas como antes; mecanico continua recebendo 0 linhas da view;
--   * private.os_a_receber fica como esta (staging: 40 ms com 803 linhas).
-- =============================================================================

-- Totais de uma lista de OS, numa execucao so de vw_os_totais.
create or replace function private.os_totais(p_os_ids uuid[])
returns table (
  os_id                   uuid,
  total_centavos          bigint,
  total_servicos_centavos bigint,
  total_pecas_centavos    bigint
)
language sql
stable
set search_path = ''
as $$
  select tt.os_id, tt.total_centavos, tt.total_servicos_centavos, tt.total_pecas_centavos
    from public.vw_os_totais tt
   where tt.os_id = any (p_os_ids)
$$;

revoke all on function private.os_totais(uuid[]) from public;
grant execute on function private.os_totais(uuid[]) to authenticated, service_role;

-- "Servicos entregues no mes": status entregue + entregue_em dentro do mes.
create or replace function private.os_entregues_no_mes(p_inicio timestamptz, p_fim timestamptz)
returns table (
  os_id                   uuid,
  numero                  integer,
  cliente_id              uuid,
  veiculo_id              uuid,
  mecanico_id             uuid,
  entregue_em             timestamptz,
  total_centavos          bigint,
  total_servicos_centavos bigint,
  total_pecas_centavos    bigint
)
language sql
stable
set search_path = ''
as $$
  with e as materialized (
    select o.id, o.numero, o.cliente_id, o.veiculo_id, o.mecanico_id, o.entregue_em
      from public.ordens_servico o
     where o.oficina_id = (select private.minha_oficina_id())
       and o.status = 'entregue'
       and o.entregue_em >= p_inicio
       and o.entregue_em <  p_fim
  )
  select e.id, e.numero, e.cliente_id, e.veiculo_id, e.mecanico_id, e.entregue_em,
         t.total_centavos, t.total_servicos_centavos, t.total_pecas_centavos
    from e
    join private.os_totais(array(select e2.id from e e2)) t on t.os_id = e.id
$$;

-- "Dinheiro recebido no mes": status entregue + pago_em dentro do mes.
create or replace function private.os_recebidas_no_mes(p_inicio timestamptz, p_fim timestamptz)
returns table (
  os_id           uuid,
  numero          integer,
  cliente_id      uuid,
  veiculo_id      uuid,
  entregue_em     timestamptz,
  pago_em         timestamptz,
  forma_pagamento public.forma_pagamento,
  total_centavos  bigint
)
language sql
stable
set search_path = ''
as $$
  with r as materialized (
    select o.id, o.numero, o.cliente_id, o.veiculo_id, o.entregue_em, c.pago_em, c.forma_pagamento
      from public.os_comercial c
      join public.ordens_servico o on o.id = c.os_id
     where c.oficina_id = (select private.minha_oficina_id())
       and o.status = 'entregue'
       and c.pago_em >= p_inicio
       and c.pago_em <  p_fim
  )
  select r.id, r.numero, r.cliente_id, r.veiculo_id, r.entregue_em, r.pago_em, r.forma_pagamento, t.total_centavos
    from r
    join private.os_totais(array(select r2.id from r r2)) t on t.os_id = r.id
$$;

-- create or replace mantem os GRANTs; repetidos aqui so por clareza.
revoke all on function private.os_entregues_no_mes(timestamptz, timestamptz) from public;
revoke all on function private.os_recebidas_no_mes(timestamptz, timestamptz) from public;
grant execute on function private.os_entregues_no_mes(timestamptz, timestamptz) to authenticated, service_role;
grant execute on function private.os_recebidas_no_mes(timestamptz, timestamptz) to authenticated, service_role;
