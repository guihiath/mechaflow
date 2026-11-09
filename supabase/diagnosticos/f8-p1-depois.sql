-- =============================================================================
-- MechaFlow - F8-P1 - DEPOIS: a migracao 20261108000001_f8_painel_desempenho
-- aplicada dentro da transacao, com antes x depois (alvo: < 40 s no total)
--
-- O QUE FAZ:
--   1. A mesma carga do f8-p1-painel-volume.sql (oficina descartavel, 3.000 OS, ~8 s).
--   2. ANTES, como o DONO: tempo de painel_mes (2 chamadas) e de painel_lista_os
--      ('entregues'), e guarda as saidas: painel_mes do mes mais cheio, de marco/2026
--      e de um mes vazio (set/2025); painel_lista_os nos 6 recortes do mes mais cheio;
--      painel_hoje(); contas_a_receber() inteira, na ordem.
--   3. Aplica a migracao (o MESMO texto do arquivo em supabase/migrations), como postgres.
--   4. DEPOIS: os mesmos tempos e as mesmas saidas; compara jsonb antes = depois;
--      confere papeis (mecanico recusado no painel, na lista e no a receber, e 0
--      linhas se chamar as funcoes private.* direto) e o plano novo de "entregues".
--   5. RAISE EXCEPTION de proposito com o relatorio: o erro desfaz tudo, inclusive a
--      migracao (nada fica no banco).
--
-- QUEM RODA: o CEO, no STAGING (postgres), arquivo inteiro, depois das migracoes
-- ate 20261104000004 e SEM a 20261108000001 aplicada (o "antes" precisa do corpo velho).
--
-- COMO LER (texto do erro):
--   * "IGUAL" em todas as linhas de comparacao. Um "DIFERENTE" e bloqueio: a migracao
--     mudou resultado. (Unica excecao aceitavel: produtividade com dois mecanicos
--     empatados em valor e quantidade, cuja ordem o banco nao garante; o relatorio
--     mostra o trecho para conferir.)
--   * DEPOIS painel_mes < 1000 ms nas 2 chamadas (meta) e painel_lista_os < 300 ms.
--   * Papeis: todos "OK".
--   * Plano novo: ordens_servico_entregue_idx na janela e a view com loops=1.
-- =============================================================================

begin;
-- -----------------------------------------------------------------------------
-- 0) Usuarios: f801 dono | f802, f803, f804 mecanicos
-- -----------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email, '', now(),
       '{"provider":"email","providers":["email"]}', '{}', now(), now()
  from (values
    ('00000000-0000-4000-8000-00000000f801', 'f8p1.dono@teste.invalid'),
    ('00000000-0000-4000-8000-00000000f802', 'f8p1.mec1@teste.invalid'),
    ('00000000-0000-4000-8000-00000000f803', 'f8p1.mec2@teste.invalid'),
    ('00000000-0000-4000-8000-00000000f804', 'f8p1.mec3@teste.invalid')
  ) as u(id, email);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000f801","role":"authenticated"}', true);
set local role authenticated;
select set_config('f8.oficina', public.criar_oficina('Oficina Volume F8-P1', 'Dono Volume', private.versao_termos_vigente())::text, true);
select set_config('f8.tk1', (select token from public.criar_convite('mecanico', 'Mecanico 1')), true);
select set_config('f8.tk2', (select token from public.criar_convite('mecanico', 'Mecanico 2')), true);
select set_config('f8.tk3', (select token from public.criar_convite('mecanico', 'Mecanico 3')), true);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000f802","role":"authenticated"}', true);
select public.aceitar_convite(current_setting('f8.tk1'), 'Joao Mecanico', private.versao_termos_vigente());
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000f803","role":"authenticated"}', true);
select public.aceitar_convite(current_setting('f8.tk2'), 'Marcos Mecanico', private.versao_termos_vigente());
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000f804","role":"authenticated"}', true);
select public.aceitar_convite(current_setting('f8.tk3'), 'Rafael Mecanico', private.versao_termos_vigente());

-- -----------------------------------------------------------------------------
-- 1) [ADMIN] Carga em massa como postgres, SEM usuario na sessao:
--    auth.uid() = null => os triggers de preco (evento 'preco', "precificado pelo
--    balcao") nao disparam efeito, como numa migracao. oficina_id sempre explicito.
-- -----------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims', '', true);

update public.oficinas
   set vistoria_obrigatoria = false, fuso_horario = 'America/Sao_Paulo'
 where id = current_setting('f8.oficina')::uuid;

-- catalogo: 12 servicos com preco padrao
insert into public.catalogo_servicos (oficina_id, nome, criado_por)
select current_setting('f8.oficina')::uuid, n, '00000000-0000-4000-8000-00000000f801'
  from unnest(array['Troca de óleo', 'Revisão de freio', 'Regulagem de válvulas', 'Troca de embreagem',
                    'Diagnóstico eletrônico', 'Alinhamento', 'Revisão de injeção', 'Troca de correia',
                    'Retífica de cabeçote', 'Revisão de suspensão', 'Troca de radiador', 'Revisão do turbo']) n;
create temp table f8_serv as
  select (row_number() over (order by s.nome) - 1)::int as ord, s.id, s.nome
    from public.catalogo_servicos s where s.oficina_id = current_setting('f8.oficina')::uuid;
insert into public.catalogo_servicos_precos (servico_id, oficina_id, preco_padrao_centavos)
select s.id, current_setting('f8.oficina')::uuid, 20000 + s.ord * 5000 from f8_serv s;

-- 150 clientes, 400 veiculos (placa Mercosul AAA9A99, unica na oficina)
create temp table f8_cli as
  select c - 1 as ord, gen_random_uuid() as id, c from generate_series(1, 150) c;
insert into public.clientes (id, oficina_id, nome, telefone, modo_padrao, criado_por)
select c.id, current_setting('f8.oficina')::uuid, 'Transportadora F8 ' || c.c, '1199' || lpad(c.c::text, 7, '0'),
       'servico_direto', '00000000-0000-4000-8000-00000000f801'
  from f8_cli c;

create temp table f8_veic as
  select v as ord, gen_random_uuid() as id, c.id as cliente_id,
         'FPX' || (v % 10)::text || chr(65 + (v / 10) % 26) || lpad(((v / 260) % 100)::text, 2, '0') as placa
    from generate_series(0, 399) v
    join f8_cli c on c.ord = v % 150;
insert into public.veiculos (id, oficina_id, cliente_id, placa, marca, modelo, criado_por)
select v.id, current_setting('f8.oficina')::uuid, v.cliente_id, v.placa, 'Scania', 'R450', '00000000-0000-4000-8000-00000000f801'
  from f8_veic v;

-- Plano das 3.000 OS
--   g 1..420     -> outubro/2026 (m = 11)          : o mes mais cheio
--   g 421..2900  -> nov/2025 a set/2026 (m = g % 11): ~225 por mes
--   g 2901..3000 -> novembro/2026, abertas         : 5 status abertos em rodizio
create temp table f8_os as
with b as (
  select g, case when g <= 420 then 11 when g <= 2900 then g % 11 else 12 end as m
    from generate_series(1, 3000) g
), s as (
  select b.*,
         (case when b.m = 12 then (array['aguardando_orcamento', 'orcamento_enviado', 'aprovada', 'em_andamento', 'pronta'])[b.g % 5 + 1]
               when b.g % 13 = 0 then 'cancelada'
               else 'entregue' end)::public.status_os as status_final,
         (case when b.m = 12 then (case when b.g % 5 in (0, 1, 2) then 'com_orcamento' else 'direto' end)
               when b.g % 4 = 0 then 'com_orcamento'
               else 'direto' end)::public.modo_os as modo,
         case when b.m = 12
              then make_timestamptz(2026, 11, 1, 0, 0, 0, 'America/Sao_Paulo') + make_interval(days => b.g % 7, hours => 7 + b.g % 10)
              else make_timestamptz(2025, 11, 1, 0, 0, 0, 'America/Sao_Paulo')
                   + make_interval(months => b.m, days => (b.g * 7) % 25, hours => 7 + b.g % 10) end as criado_em
    from b
)
select s.g, gen_random_uuid() as id, s.m, s.status_final, s.modo, s.criado_em,
       v.id as veiculo_id, v.cliente_id,
       case when s.g % 9 = 0 then null
            else (array['00000000-0000-4000-8000-00000000f802', '00000000-0000-4000-8000-00000000f803',
                        '00000000-0000-4000-8000-00000000f804']::uuid[])[s.g % 3 + 1] end as mecanico_id,
       (case when s.modo = 'direto' then 'em_andamento' else 'aguardando_orcamento' end)::public.status_os as status_inicial,
       case when s.modo = 'direto' then s.criado_em end as autorizado_em,
       case when s.modo = 'com_orcamento' and s.status_final not in ('aguardando_orcamento', 'cancelada')
            then s.criado_em + interval '1 hour' end as orcamento_enviado_em,
       case when s.modo = 'com_orcamento' and s.status_final in ('aprovada', 'em_andamento', 'pronta', 'entregue')
            then s.criado_em + interval '2 hours' end as orcamento_aprovado_em,
       case when s.status_final in ('em_andamento', 'pronta', 'entregue') or (s.status_final = 'cancelada' and s.modo = 'direto')
            then s.criado_em + interval '3 hours' end as iniciado_em,
       case when s.status_final = 'entregue' then s.criado_em + make_interval(days => s.g % 3, hours => 6) end as entregue_em,
       case when s.status_final = 'cancelada' then s.criado_em + interval '1 day' end as cancelado_em
  from s
  join f8_veic v on v.ord = s.g % 400;

alter table f8_os add column pronta_em timestamptz, add column pago_em timestamptz, add column forma public.forma_pagamento;
update f8_os set
  pronta_em = case when status_final = 'entregue' then entregue_em - interval '1 hour'
                   when status_final = 'pronta' then criado_em + interval '5 hours' end,
  -- 70% das entregues pagas: 1/3 na entrega, o resto ate 11 dias depois (pode cair no mes seguinte)
  pago_em = case when status_final = 'entregue' and g % 10 < 7
                 then least(entregue_em + make_interval(days => case when g % 3 = 0 then 0 else g % 12 end, mins => 10),
                            now() - interval '1 hour') end;
update f8_os set
  forma = case when pago_em is not null then (enum_range(null::public.forma_pagamento))[g % 6 + 1]
               when status_final = 'entregue' then (case when g % 2 = 0 then 'faturado' else 'boleto' end)::public.forma_pagamento end;

-- OS nascem ABERTAS (em_andamento no direto, aguardando_orcamento no com_orcamento)
insert into public.ordens_servico (id, oficina_id, numero, chave_idempotencia, cliente_id, veiculo_id, mecanico_id,
                                   modo, status, km, sintoma_relatado,
                                   autorizado_em, orcamento_enviado_em, orcamento_aprovado_em, iniciado_em,
                                   criado_por, criado_em)
select p.id, current_setting('f8.oficina')::uuid, p.g, gen_random_uuid(), p.cliente_id, p.veiculo_id, p.mecanico_id,
       p.modo, p.status_inicial, 100000 + p.g * 37, 'Sintoma de teste F8-P1',
       p.autorizado_em, p.orcamento_enviado_em, p.orcamento_aprovado_em, p.iniciado_em,
       '00000000-0000-4000-8000-00000000f801', p.criado_em
  from f8_os p;

insert into private.os_contadores (oficina_id, ultimo_numero)
values (current_setting('f8.oficina')::uuid, 3000)
on conflict (oficina_id) do update set ultimo_numero = excluded.ultimo_numero;

-- Itens (com a OS aberta): 1 a 3 servicos (1 em 17 avulso) + 0 a 4 pecas. g % 40 = 0: sem itens.
insert into public.os_itens (oficina_id, os_id, tipo, servico_id, peca_id, descricao, quantidade, unidade, lancado_por, criado_em)
select current_setting('f8.oficina')::uuid, p.id, 'servico',
       case when (p.g + k) % 17 = 0 then null else s.id end, null,
       case when (p.g + k) % 17 = 0 then 'Solda no chassi (avulso)' else s.nome end,
       1, 'un', coalesce(p.mecanico_id, '00000000-0000-4000-8000-00000000f801'),
       p.criado_em + make_interval(hours => 1, mins => k)
  from f8_os p
 cross join lateral generate_series(1, 1 + p.g % 3) k
  join f8_serv s on s.ord = (p.g + k) % 12
 where p.g % 40 <> 0;

insert into public.os_itens (oficina_id, os_id, tipo, servico_id, peca_id, descricao, quantidade, unidade, lancado_por, criado_em)
select current_setting('f8.oficina')::uuid, p.id, 'peca', null, null, 'Peça de teste ' || k,
       1 + k % 3, 'un', '00000000-0000-4000-8000-00000000f801',
       p.criado_em + make_interval(hours => 2, mins => k)
  from f8_os p
 cross join lateral generate_series(1, p.g % 5) k
 where p.g % 40 <> 0;

-- Precos de todos os itens; custo das pecas (60% do preco)
insert into public.os_itens_precos (item_id, oficina_id, preco_unitario_centavos)
select i.id, i.oficina_id,
       case when i.tipo = 'servico' then 15000 + (abs(hashtext(i.id::text)) % 66) * 1000
            else 2000 + (abs(hashtext(i.id::text)) % 480) * 100 end
  from public.os_itens i
 where i.oficina_id = current_setting('f8.oficina')::uuid;

insert into public.os_itens_custos (item_id, oficina_id, custo_unitario_centavos)
select p.item_id, p.oficina_id, (p.preco_unitario_centavos * 6) / 10
  from public.os_itens_precos p
  join public.os_itens i on i.id = p.item_id
 where p.oficina_id = current_setting('f8.oficina')::uuid and i.tipo = 'peca';

-- Comercial 1:1 (como abrir_os grava) + aprovacao + pagamento
insert into public.os_comercial (os_id, oficina_id, autorizado_por_nome, autorizacao_registrada_por,
                                 orcamento_aprovado_por_nome, orcamento_aprovacao_canal, orcamento_aprovacao_registrada_por,
                                 forma_pagamento, pago_em, pagamento_registrado_por)
select p.id, current_setting('f8.oficina')::uuid,
       case when p.modo = 'direto' then 'Motorista ' || p.g end,
       case when p.modo = 'direto' then '00000000-0000-4000-8000-00000000f801'::uuid end,
       case when p.orcamento_aprovado_em is not null then 'Gerente de frota ' || p.g end,
       case when p.orcamento_aprovado_em is not null then 'whatsapp'::public.canal_resposta end,
       case when p.orcamento_aprovado_em is not null then '00000000-0000-4000-8000-00000000f801'::uuid end,
       p.forma, p.pago_em,
       case when p.pago_em is not null then '00000000-0000-4000-8000-00000000f801'::uuid end
  from f8_os p;

-- Status final (as travas de OS fechada passam a valer daqui em diante)
update public.ordens_servico o
   set status              = p.status_final,
       pronta_em           = p.pronta_em,
       entregue_em         = p.entregue_em,
       cancelado_em        = p.cancelado_em,
       cancelado_por       = case when p.status_final = 'cancelada' then '00000000-0000-4000-8000-00000000f801'::uuid end,
       motivo_cancelamento = case when p.status_final = 'cancelada' then 'Cliente desistiu' end,
       causa_encontrada    = case when p.status_final = 'entregue' then 'Causa de teste F8-P1' end,
       solucao_aplicada    = case when p.status_final = 'entregue' then 'Solucao de teste F8-P1' end
  from f8_os p
 where o.id = p.id
   and p.status_final <> p.status_inicial;

analyze public.ordens_servico, public.os_comercial, public.os_itens, public.os_itens_precos,
        public.os_itens_custos, public.catalogo_servicos, public.perfis, public.clientes, public.veiculos;

-- Mes mais cheio (no fuso da oficina) e numeros esperados, contados direto nas tabelas.
-- (vw_os_totais nao serve aqui: como postgres, sem papel, ela devolve 0 linhas.)
select set_config('f8.ano', x.ano::text, true), set_config('f8.mes', x.mes::text, true)
  from (select extract(year  from o.entregue_em at time zone 'America/Sao_Paulo')::int as ano,
               extract(month from o.entregue_em at time zone 'America/Sao_Paulo')::int as mes,
               count(*) as n
          from public.ordens_servico o
         where o.oficina_id = current_setting('f8.oficina')::uuid and o.status = 'entregue'
         group by 1, 2
         order by n desc, 1, 2
         limit 1) x;
select set_config('f8.ini', make_timestamptz(current_setting('f8.ano')::int, current_setting('f8.mes')::int, 1, 0, 0, 0, 'America/Sao_Paulo')::text, true);
select set_config('f8.fim', (current_setting('f8.ini')::timestamptz + interval '1 month')::text, true);
select set_config('f8.esp_qtd', count(*)::text, true),
       set_config('f8.esp_total', coalesce(sum(t.total), 0)::text, true)
  from public.ordens_servico o
  cross join lateral (select coalesce(sum(round(i.quantidade * pr.preco_unitario_centavos)), 0)::bigint as total
                        from public.os_itens i
                        left join public.os_itens_precos pr on pr.item_id = i.id
                       where i.os_id = o.id) t
 where o.oficina_id = current_setting('f8.oficina')::uuid and o.status = 'entregue'
   and o.entregue_em >= current_setting('f8.ini')::timestamptz and o.entregue_em < current_setting('f8.fim')::timestamptz;
select set_config('f8.esp_receb', count(*)::text, true)
  from public.os_comercial c join public.ordens_servico o on o.id = c.os_id
 where c.oficina_id = current_setting('f8.oficina')::uuid and o.status = 'entregue'
   and c.pago_em >= current_setting('f8.ini')::timestamptz and c.pago_em < current_setting('f8.fim')::timestamptz;


-- -----------------------------------------------------------------------------
-- Ajudantes do teste (somem no fim)
-- -----------------------------------------------------------------------------
select set_config('f8.serv', (select id::text from f8_serv where ord = 0), true);

create function public.zz_f8_plano(p_sql text, p_max integer) returns text language plpgsql as $$
declare r record; t text := '';
begin
  for r in execute p_sql loop
    t := t || left(r."QUERY PLAN", 150) || E'\n';
  end loop;
  return left(t, p_max);
end $$;

create function public.zz_f8_estado(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'sem erro';
exception when others then
  return sqlstate;
end $$;

create function public.zz_f8_lista(p_ano integer, p_mes integer, p_recorte text, p_chave uuid default null)
returns text language sql as $$
  select coalesce(jsonb_agg(to_jsonb(l) order by l.ord), '[]'::jsonb)::text
    from public.painel_lista_os(p_ano, p_mes, p_recorte, p_chave)
         with ordinality l(os_id, numero, placa, cliente_nome, entregue_em, pago_em, forma_pagamento, valor_centavos, detalhe, ord)
$$;

-- Fotografa tudo com a etiqueta p_tag ('antes' ou 'depois') em f8.<tag>.<chave>
create function public.zz_f8_foto(p_tag text) returns void language plpgsql as $$
declare
  v_ano int := current_setting('f8.ano')::int;
  v_mes int := current_setting('f8.mes')::int;
  v_s   uuid := current_setting('f8.serv')::uuid;
  v_t0  timestamptz;
  v_p   jsonb;
begin
  v_t0 := clock_timestamp();
  v_p  := public.painel_mes(v_ano, v_mes);
  perform set_config('f8.' || p_tag || '.ms_mes1', round(extract(epoch from clock_timestamp() - v_t0) * 1000, 1)::text, true);
  v_t0 := clock_timestamp();
  perform public.painel_mes(v_ano, v_mes);
  perform set_config('f8.' || p_tag || '.ms_mes2', round(extract(epoch from clock_timestamp() - v_t0) * 1000, 1)::text, true);
  perform set_config('f8.' || p_tag || '.mes', v_p::text, true);

  v_t0 := clock_timestamp();
  perform set_config('f8.' || p_tag || '.l_entregues', public.zz_f8_lista(v_ano, v_mes, 'entregues'), true);
  perform set_config('f8.' || p_tag || '.ms_lista', round(extract(epoch from clock_timestamp() - v_t0) * 1000, 1)::text, true);

  perform set_config('f8.' || p_tag || '.outro', public.painel_mes(2026, 3)::text, true);
  perform set_config('f8.' || p_tag || '.vazio', public.painel_mes(2025, 9)::text, true);
  perform set_config('f8.' || p_tag || '.l_recebido', public.zz_f8_lista(v_ano, v_mes, 'recebido'), true);
  perform set_config('f8.' || p_tag || '.l_servico', public.zz_f8_lista(v_ano, v_mes, 'servico', v_s), true);
  perform set_config('f8.' || p_tag || '.l_fora', public.zz_f8_lista(v_ano, v_mes, 'fora_catalogo'), true);
  perform set_config('f8.' || p_tag || '.l_mecanico', public.zz_f8_lista(v_ano, v_mes, 'mecanico', '00000000-0000-4000-8000-00000000f802'), true);
  perform set_config('f8.' || p_tag || '.l_sem', public.zz_f8_lista(v_ano, v_mes, 'sem_mecanico'), true);
  perform set_config('f8.' || p_tag || '.hoje', public.painel_hoje()::text, true);
  perform set_config('f8.' || p_tag || '.contas',
    (select coalesce(jsonb_agg(to_jsonb(c) order by c.ord), '[]'::jsonb)::text
       from public.contas_a_receber() with ordinality c(os_id, numero, cliente_id, cliente_nome, cliente_telefone, placa,
                                                        entregue_em, dias, forma_pagamento, total_centavos,
                                                        cliente_total_centavos, cliente_qtd_os, ord)), true);
end $$;
grant execute on function public.zz_f8_plano(text, integer), public.zz_f8_estado(text),
  public.zz_f8_lista(integer, integer, text, uuid), public.zz_f8_foto(text) to authenticated;

-- -----------------------------------------------------------------------------
-- ANTES (corpo atual)
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000f801","role":"authenticated"}', true);
set local role authenticated;
select public.zz_f8_foto('antes');

-- -----------------------------------------------------------------------------
-- MIGRACAO 20261108000001_f8_painel_desempenho (copia fiel do arquivo)
-- -----------------------------------------------------------------------------
reset role;
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

-- -----------------------------------------------------------------------------
-- DEPOIS
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000f801","role":"authenticated"}', true);
set local role authenticated;
select public.zz_f8_foto('depois');

do $$
declare v_j record;
begin
  v_j := private.janela_mes(current_setting('f8.ano')::int, current_setting('f8.mes')::int);
  perform set_config('f8.plano', public.zz_f8_plano(format($q$
    explain (analyze, costs off)
    with e as materialized (
      select o.id, o.numero, o.cliente_id, o.veiculo_id, o.mecanico_id, o.entregue_em
        from public.ordens_servico o
       where o.oficina_id = (select private.minha_oficina_id()) and o.status = 'entregue'
         and o.entregue_em >= %L::timestamptz and o.entregue_em < %L::timestamptz)
    select count(*), sum(t.total_centavos)
      from e join public.vw_os_totais t on t.os_id = e.id
     where t.os_id = any (array(select e2.id from e e2)) $q$, v_j.inicio, v_j.fim), 2200), true);
  perform set_config('f8.ini_txt', v_j.inicio::text, true);
  perform set_config('f8.fim_txt', v_j.fim::text, true);
end $$;

-- Papeis: mecanico (f802)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000f802","role":"authenticated"}', true);
select set_config('f8.pap_mes',    public.zz_f8_estado('select public.painel_mes(' || current_setting('f8.ano') || ', ' || current_setting('f8.mes') || ')'), true);
select set_config('f8.pap_lista',  public.zz_f8_estado('select * from public.painel_lista_os(' || current_setting('f8.ano') || ', ' || current_setting('f8.mes') || ', ''entregues'')'), true);
select set_config('f8.pap_contas', public.zz_f8_estado('select * from public.contas_a_receber()'), true);
select set_config('f8.pap_priv',
  (select count(*) from private.os_entregues_no_mes(current_setting('f8.ini_txt')::timestamptz, current_setting('f8.fim_txt')::timestamptz))::text
  || '/' ||
  (select count(*) from private.os_recebidas_no_mes(current_setting('f8.ini_txt')::timestamptz, current_setting('f8.fim_txt')::timestamptz))::text
  || '/' ||
  (select count(*) from private.os_totais(array(select o.id from public.ordens_servico o)))::text, true);

-- -----------------------------------------------------------------------------
-- Relatorio (no texto do erro; o erro desfaz tudo)
-- -----------------------------------------------------------------------------
reset role;
do $$
declare
  v_txt text;
  k     text;
  v_a   text;
  v_d   text;
begin
  v_txt := format(E'F8-P1 DEPOIS | mes %s/%s | OS da oficina: %s\n',
                  current_setting('f8.mes'), current_setting('f8.ano'),
                  (select count(*) from public.ordens_servico where oficina_id = current_setting('f8.oficina')::uuid));
  v_txt := v_txt || format(E'painel_mes ms  ANTES %s / %s  ->  DEPOIS %s / %s  (meta < 1000: %s)\n',
                  current_setting('f8.antes.ms_mes1'), current_setting('f8.antes.ms_mes2'),
                  current_setting('f8.depois.ms_mes1'), current_setting('f8.depois.ms_mes2'),
                  case when greatest(current_setting('f8.depois.ms_mes1')::numeric, current_setting('f8.depois.ms_mes2')::numeric) < 1000
                       then 'OK' else 'ACIMA' end);
  v_txt := v_txt || format(E'painel_lista_os(entregues) ms  ANTES %s  ->  DEPOIS %s  (meta < 300: %s)\n',
                  current_setting('f8.antes.ms_lista'), current_setting('f8.depois.ms_lista'),
                  case when current_setting('f8.depois.ms_lista')::numeric < 300 then 'OK' else 'ACIMA' end);
  v_txt := v_txt || format(E'conferencia: painel %s entregues x contagem direta %s | total %s x %s\n',
                  (current_setting('f8.depois.mes')::jsonb)->'entregues'->>'qtd_os', current_setting('f8.esp_qtd'),
                  (current_setting('f8.depois.mes')::jsonb)->'entregues'->>'total_centavos', current_setting('f8.esp_total'));

  foreach k in array array['mes', 'outro', 'vazio', 'l_entregues', 'l_recebido', 'l_servico', 'l_fora',
                           'l_mecanico', 'l_sem', 'hoje', 'contas'] loop
    v_a := current_setting('f8.antes.' || k);
    v_d := current_setting('f8.depois.' || k);
    v_txt := v_txt || format(E'%s: %s (%s)\n', k,
               case when v_a::jsonb = v_d::jsonb then 'IGUAL' else 'DIFERENTE' end,
               case when jsonb_typeof(v_d::jsonb) = 'array' then jsonb_array_length(v_d::jsonb)::text || ' linhas' else 'objeto' end);
    if v_a::jsonb <> v_d::jsonb then
      v_txt := v_txt || '  antes:  ' || left(v_a, 300) || E'\n  depois: ' || left(v_d, 300) || E'\n';
    end if;
  end loop;

  v_txt := v_txt || format(E'papeis (mecanico): painel_mes %s | lista %s | contas %s -> %s\n',
                  current_setting('f8.pap_mes'), current_setting('f8.pap_lista'), current_setting('f8.pap_contas'),
                  case when current_setting('f8.pap_mes') = '42501' and current_setting('f8.pap_lista') = '42501'
                            and current_setting('f8.pap_contas') = '42501' then 'OK' else 'FALHOU' end);
  v_txt := v_txt || format(E'mecanico chamando private.* direto (entregues/recebidas/totais): %s -> %s\n',
                  current_setting('f8.pap_priv'),
                  case when current_setting('f8.pap_priv') = '0/0/0' then 'OK' else 'FALHOU' end);
  v_txt := v_txt || E'--- plano novo de "entregues no mes" (corpo da funcao, janela literal)\n' || current_setting('f8.plano');

  raise exception '%', left(v_txt, 6200);
end $$;

rollback;
