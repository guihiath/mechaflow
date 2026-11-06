-- =============================================================================
-- MechaFlow - Fase 7 - 01 painel do dono e contas a receber (F7-A1)
--
-- Ordem das migracoes da Fase 7:
--   01_fase7_painel -> 02_fase7_historico -> 03_fase7_pdf_preco -> 04_fase7_fecha_desfazer
--
-- Formulas, com status, coluna de data, valor e o que fica de fora: ARQUITETURA
-- "14. Fase 7", secao 14.2. Cada formula existe em UMA funcao private.* e tanto o
-- numero quanto a lista que abre com o toque saem dela: a soma da lista e o numero.
--
--   * Valor sempre de vw_os_totais: a mesma conta da tela da OS.
--   * SECURITY INVOKER: a RLS continua valendo por baixo da conferencia de papel.
--     (Por isso a conferencia usa private.meu_papel(): private.exigir_papel nao tem
--     EXECUTE para authenticated.)
--   * Oficina sempre da sessao, nunca de parametro.
--   * Corte do mes em oficinas.fuso_horario, nunca no fuso do servidor.
--   * So leitura: nenhuma funcao daqui escreve.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Indices
-- -----------------------------------------------------------------------------
create index ordens_servico_entregue_idx on public.ordens_servico (oficina_id, entregue_em)
  where status = 'entregue';
create index os_comercial_pago_idx on public.os_comercial (oficina_id, pago_em)
  where pago_em is not null;

-- -----------------------------------------------------------------------------
-- 2) Internas
-- -----------------------------------------------------------------------------

-- Inicio (inclusive) e fim (exclusive) do mes no fuso da oficina de quem chama.
create or replace function private.janela_mes(
  p_ano integer,
  p_mes integer,
  out inicio timestamptz,
  out fim timestamptz,
  out fuso text
)
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_ano is null or p_mes is null or p_ano not between 2000 and 2100 or p_mes not between 1 and 12 then
    raise exception 'mes_invalido';
  end if;
  select f.fuso_horario into fuso from public.oficinas f where f.id = private.minha_oficina_id();
  if fuso is null then
    raise exception 'acesso_negado' using errcode = '42501';
  end if;
  inicio := make_timestamptz(p_ano, p_mes, 1, 0, 0, 0, fuso);
  fim    := make_timestamptz(case when p_mes = 12 then p_ano + 1 else p_ano end,
                             case when p_mes = 12 then 1 else p_mes + 1 end,
                             1, 0, 0, 0, fuso);
end;
$$;

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
  select o.id, o.numero, o.cliente_id, o.veiculo_id, o.mecanico_id, o.entregue_em,
         t.total_centavos, t.total_servicos_centavos, t.total_pecas_centavos
    from public.ordens_servico o
   cross join lateral (select tt.* from public.vw_os_totais tt where tt.os_id = o.id) t
   where o.oficina_id = (select private.minha_oficina_id())
     and o.status = 'entregue'
     and o.entregue_em >= p_inicio
     and o.entregue_em <  p_fim
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
  select o.id, o.numero, o.cliente_id, o.veiculo_id, o.entregue_em, c.pago_em, c.forma_pagamento, t.total_centavos
    from public.os_comercial c
    join public.ordens_servico o on o.id = c.os_id
   cross join lateral (select tt.* from public.vw_os_totais tt where tt.os_id = o.id) t
   where c.oficina_id = (select private.minha_oficina_id())
     and o.status = 'entregue'
     and c.pago_em >= p_inicio
     and c.pago_em <  p_fim
$$;

-- "A receber" (de hoje, somando todos os meses): entregue, sem pagamento e com valor.
-- OS entregue com total 0 (entregar_os aceita OS sem itens) nao e divida.
create or replace function private.os_a_receber()
returns table (
  os_id           uuid,
  numero          integer,
  cliente_id      uuid,
  veiculo_id      uuid,
  entregue_em     timestamptz,
  forma_pagamento public.forma_pagamento,
  total_centavos  bigint
)
language sql
stable
set search_path = ''
as $$
  select o.id, o.numero, o.cliente_id, o.veiculo_id, o.entregue_em, c.forma_pagamento, t.total_centavos
    from public.ordens_servico o
    left join public.os_comercial c on c.os_id = o.id
   cross join lateral (select tt.* from public.vw_os_totais tt where tt.os_id = o.id) t
   where o.oficina_id = (select private.minha_oficina_id())
     and o.status = 'entregue'
     and c.pago_em is null
     and t.total_centavos > 0
$$;

revoke all on function private.janela_mes(integer, integer) from public;
revoke all on function private.os_entregues_no_mes(timestamptz, timestamptz) from public;
revoke all on function private.os_recebidas_no_mes(timestamptz, timestamptz) from public;
revoke all on function private.os_a_receber() from public;
grant execute on function private.janela_mes(integer, integer) to authenticated, service_role;
grant execute on function private.os_entregues_no_mes(timestamptz, timestamptz) to authenticated, service_role;
grant execute on function private.os_recebidas_no_mes(timestamptz, timestamptz) to authenticated, service_role;
grant execute on function private.os_a_receber() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3) painel_mes: os numeros que mudam com o seletor. So o dono.
-- -----------------------------------------------------------------------------
create or replace function public.painel_mes(p_ano integer, p_mes integer)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_j record;
  v_r jsonb;
begin
  if private.meu_papel() is distinct from 'dono' then
    raise exception 'acesso_negado' using errcode = '42501';
  end if;
  v_j := private.janela_mes(p_ano, p_mes);

  select jsonb_build_object(
    'ano',    p_ano,
    'mes',    p_mes,
    'fuso',   v_j.fuso,
    'inicio', v_j.inicio,
    'fim',    v_j.fim,
    'entregues', (
      select jsonb_build_object(
        'qtd_os',            count(*)::integer,
        'total_centavos',    coalesce(sum(e.total_centavos), 0)::bigint,
        'servicos_centavos', coalesce(sum(e.total_servicos_centavos), 0)::bigint,
        'pecas_centavos',    coalesce(sum(e.total_pecas_centavos), 0)::bigint)
        from private.os_entregues_no_mes(v_j.inicio, v_j.fim) e),
    'recebido', (
      select jsonb_build_object(
        'qtd_os',         count(*)::integer,
        'total_centavos', coalesce(sum(r.total_centavos), 0)::bigint)
        from private.os_recebidas_no_mes(v_j.inicio, v_j.fim) r),
    -- Uma OS conta uma vez por servico, mesmo com o servico lancado duas vezes.
    -- Catalogo pelo id, com o nome de hoje; avulsos juntos e sempre por ultimo.
    'servicos', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'servico_id', s.servico_id,
               'nome',       coalesce(c.nome, 'Fora do catálogo'),
               'qtd_os',     s.qtd_os)
             order by (s.servico_id is null), s.qtd_os desc, c.nome), '[]'::jsonb)
        from (select i.servico_id, count(distinct i.os_id)::integer as qtd_os
                from private.os_entregues_no_mes(v_j.inicio, v_j.fim) e
                join public.os_itens i on i.os_id = e.os_id
               where i.tipo = 'servico'
               group by i.servico_id) s
        left join public.catalogo_servicos c on c.id = s.servico_id),
    -- Credito inteiro ao responsavel na entrega; "sem mecanico" sempre por ultimo.
    'produtividade', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'mecanico_id',       p.mecanico_id,
               'nome',              case when p.mecanico_id is not null then coalesce(private.nome_membro(p.mecanico_id), '—') end,
               'qtd_os',            p.qtd_os,
               'servicos_centavos', p.servicos_centavos)
             order by (p.mecanico_id is null), p.servicos_centavos desc, p.qtd_os desc), '[]'::jsonb)
        from (select e.mecanico_id, count(*)::integer as qtd_os,
                     coalesce(sum(e.total_servicos_centavos), 0)::bigint as servicos_centavos
                from private.os_entregues_no_mes(v_j.inicio, v_j.fim) e
               group by e.mecanico_id) p)
  ) into v_r;

  return v_r;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4) painel_lista_os: as OS atras de cada numero. So o dono.
--    recorte           p_chave      valor_centavos                       detalhe
--    entregues         -            total da OS                          -
--    recebido          -            total da OS                          -
--    servico           servico_id   total da OS (o numero e contagem)    -
--    fora_catalogo     -            total da OS (o numero e contagem)    descricoes digitadas
--    mecanico          perfil_id    so os servicos da OS                 -
--    sem_mecanico      -            so os servicos da OS                 -
--    Ordem de calendario: do dia 1 ao fim do mes (recebido: pela data do pagamento).
--    Devolve a lista inteira do mes: a tela pagina de 30 em 30 sobre ela.
-- -----------------------------------------------------------------------------
create or replace function public.painel_lista_os(
  p_ano     integer,
  p_mes     integer,
  p_recorte text,
  p_chave   uuid default null
)
returns table (
  os_id           uuid,
  numero          integer,
  placa           text,
  cliente_nome    text,
  entregue_em     timestamptz,
  pago_em         timestamptz,
  forma_pagamento public.forma_pagamento,
  valor_centavos  bigint,
  detalhe         text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_j record;
begin
  if private.meu_papel() is distinct from 'dono' then
    raise exception 'acesso_negado' using errcode = '42501';
  end if;
  if p_recorte is null
     or p_recorte not in ('entregues', 'recebido', 'servico', 'fora_catalogo', 'mecanico', 'sem_mecanico')
     or (p_recorte in ('servico', 'mecanico') and p_chave is null) then
    raise exception 'recorte_invalido';
  end if;
  v_j := private.janela_mes(p_ano, p_mes);

  if p_recorte = 'recebido' then
    return query
      select r.os_id, r.numero, v.placa, private.nome_cliente(r.cliente_id),
             r.entregue_em, r.pago_em, r.forma_pagamento, r.total_centavos, null::text
        from private.os_recebidas_no_mes(v_j.inicio, v_j.fim) r
        join public.veiculos v on v.id = r.veiculo_id
       order by r.pago_em, r.numero;
    return;
  end if;

  return query
    select e.os_id, e.numero, v.placa, private.nome_cliente(e.cliente_id),
           e.entregue_em, c.pago_em, c.forma_pagamento,
           case when p_recorte in ('mecanico', 'sem_mecanico') then e.total_servicos_centavos
                else e.total_centavos end,
           case when p_recorte = 'fora_catalogo' then (
             select string_agg(i.descricao, ' · ' order by i.criado_em, i.id)
               from public.os_itens i
              where i.os_id = e.os_id and i.tipo = 'servico' and i.servico_id is null) end
      from private.os_entregues_no_mes(v_j.inicio, v_j.fim) e
      join public.veiculos v on v.id = e.veiculo_id
      left join public.os_comercial c on c.os_id = e.os_id
     where p_recorte = 'entregues'
        or (p_recorte = 'servico' and exists (
              select 1 from public.os_itens i
               where i.os_id = e.os_id and i.tipo = 'servico' and i.servico_id = p_chave))
        or (p_recorte = 'fora_catalogo' and exists (
              select 1 from public.os_itens i
               where i.os_id = e.os_id and i.tipo = 'servico' and i.servico_id is null))
        or (p_recorte = 'mecanico' and e.mecanico_id = p_chave)
        or (p_recorte = 'sem_mecanico' and e.mecanico_id is null)
     order by e.entregue_em, e.numero;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5) painel_hoje: o que NAO muda com o seletor. So o dono.
--    hoje/ano/mes: o mes padrao da tela, calculado no fuso da oficina.
--    primeiro_registro_em: menor data entre entregas e pagamentos (o seletor vai
--    dele ate hoje); null = a oficina nunca entregou nada ("primeira vez").
-- -----------------------------------------------------------------------------
create or replace function public.painel_hoje()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_fuso text;
  v_hoje date;
  v_r    jsonb;
begin
  if private.meu_papel() is distinct from 'dono' then
    raise exception 'acesso_negado' using errcode = '42501';
  end if;
  select f.fuso_horario into v_fuso from public.oficinas f where f.id = private.minha_oficina_id();
  v_hoje := (now() at time zone v_fuso)::date;

  select jsonb_build_object(
    'hoje', v_hoje,
    'ano',  extract(year from v_hoje)::integer,
    'mes',  extract(month from v_hoje)::integer,
    'fuso', v_fuso,
    'primeiro_registro_em', least(
      (select min(o.entregue_em) from public.ordens_servico o
        where o.oficina_id = (select private.minha_oficina_id()) and o.status = 'entregue'),
      (select min(c.pago_em) from public.os_comercial c
         join public.ordens_servico o on o.id = c.os_id
        where c.oficina_id = (select private.minha_oficina_id()) and o.status = 'entregue')),
    'a_receber', (
      select jsonb_build_object(
        'total_centavos', coalesce(sum(a.total_centavos), 0)::bigint,
        'qtd_os',         count(*)::integer,
        'qtd_clientes',   count(distinct a.cliente_id)::integer,
        'mais_antiga_em', min(a.entregue_em))
        from private.os_a_receber() a),
    'abertas', (
      select jsonb_build_object(
        'total',                count(*)::integer,
        'aguardando_orcamento', (count(*) filter (where o.status = 'aguardando_orcamento'))::integer,
        'orcamento_enviado',    (count(*) filter (where o.status = 'orcamento_enviado'))::integer,
        'aprovada',             (count(*) filter (where o.status = 'aprovada'))::integer,
        'em_andamento',         (count(*) filter (where o.status = 'em_andamento'))::integer,
        'pronta',               (count(*) filter (where o.status = 'pronta'))::integer)
        from public.ordens_servico o
       where o.oficina_id = (select private.minha_oficina_id())
         and o.status not in ('entregue', 'cancelada'))
  ) into v_r;

  return v_r;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6) contas_a_receber: quem deve, para cobrar e dar baixa. Dono e atendente.
--    Uma linha por OS, ja na ordem da tela: cliente com a divida mais antiga
--    primeiro e, dentro dele, a OS mais antiga primeiro. Sem custo.
--    Dar baixa: a RPC de sempre, registrar_pagamento.
-- -----------------------------------------------------------------------------
create or replace function public.contas_a_receber()
returns table (
  os_id                 uuid,
  numero                integer,
  cliente_id            uuid,
  cliente_nome          text,
  cliente_telefone      text,
  placa                 text,
  entregue_em           timestamptz,
  dias                  integer,
  forma_pagamento       public.forma_pagamento,
  total_centavos        bigint,
  cliente_total_centavos bigint,
  cliente_qtd_os        integer
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_fuso text;
begin
  if private.meu_papel() is null or private.meu_papel() not in ('dono', 'atendente') then
    raise exception 'acesso_negado' using errcode = '42501';
  end if;
  select f.fuso_horario into v_fuso from public.oficinas f where f.id = private.minha_oficina_id();

  return query
    select a.os_id, a.numero, a.cliente_id, c.nome, c.telefone, v.placa, a.entregue_em,
           ((now() at time zone v_fuso)::date - (a.entregue_em at time zone v_fuso)::date)::integer,
           a.forma_pagamento, a.total_centavos,
           (sum(a.total_centavos) over w)::bigint,
           (count(*) over w)::integer
      from private.os_a_receber() a
      join public.clientes c on c.id = a.cliente_id
      join public.veiculos v on v.id = a.veiculo_id
    window w as (partition by a.cliente_id)
     order by min(a.entregue_em) over w, a.cliente_id, a.entregue_em, a.numero;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7) Permissoes: so logado (o papel e conferido dentro). anon nao ganha nada.
-- -----------------------------------------------------------------------------
revoke all on function public.painel_mes(integer, integer) from public, anon;
revoke all on function public.painel_lista_os(integer, integer, text, uuid) from public, anon;
revoke all on function public.painel_hoje() from public, anon;
revoke all on function public.contas_a_receber() from public, anon;
grant execute on function public.painel_mes(integer, integer) to authenticated;
grant execute on function public.painel_lista_os(integer, integer, text, uuid) to authenticated;
grant execute on function public.painel_hoje() to authenticated;
grant execute on function public.contas_a_receber() to authenticated;
