-- =============================================================================
-- MechaFlow - F8-P1 - Diagnostico CURTO do painel_mes lento (alvo: < 40 s no total)
--
-- O QUE FAZ: a mesma carga do f8-p1-painel-volume.sql (oficina descartavel, 3.000
-- OS, ~8 s) e, como o DONO (claims + role authenticated, RLS valendo):
--   T   1 chamada de painel_mes e 1 de painel_lista_os('entregues') no mes mais cheio (ms)
--   D1  EXPLAIN ANALYZE do corpo ATUAL de private.os_entregues_no_mes com PLANO
--       GENERICO (como a funcao SQL roda por dentro: janela em $1/$2)
--   D2  EXPLAIN ANALYZE de vw_os_totais para UMA OS (o custo de cada volta do lateral)
--   D3  EXPLAIN ANALYZE da forma proposta (migracao 20261108000001): vw_os_totais
--       com "os_id = any($1)" para todas as OS da janela de uma vez (plano generico)
-- e termina com RAISE EXCEPTION de proposito: o texto do erro e o resultado (cerca
-- de 6 mil caracteres) e o erro desfaz tudo (nada fica no banco).
--
-- QUEM RODA: o CEO, no STAGING (postgres), arquivo inteiro, depois das migracoes
-- ate 20261104000004. NAO precisa da migracao nova.
--
-- COMO LER:
--   D1: procurar o "Nested Loop" com o lado de dentro (Subquery Scan / GroupAggregate
--       de vw_os_totais) com "loops=N" ~ numero de OS do mes. tempo por volta x loops
--       = quase todo o Execution Time => causa confirmada (total recalculado por OS).
--       Ver tambem, dentro da volta, se ha Seq Scan em ordens_servico (subconsulta
--       da RLS de os_itens "os_id in (select o.id from ordens_servico o)").
--   D2: Execution Time de 1 OS (esperado ~1 ms). x (3 x OS do mes + recebidas) ~ 1,7 s.
--   D3: deve sair em poucos ms, com loops=1 no topo da view e indice
--       ordens_servico_pkey / os_itens_os_idx.
--   Usa PREPARE (fora da transacao por natureza); o script faz DEALLOCATE antes do fim.
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
-- Diagnostico como o DONO; resultado no texto do erro
-- -----------------------------------------------------------------------------
create function public.zz_f8_plano(p_sql text, p_max integer) returns text language plpgsql as $$
declare r record; t text := '';
begin
  for r in execute p_sql loop
    t := t || left(r."QUERY PLAN", 150) || E'\n';
  end loop;
  return left(t, p_max);
end $$;
grant execute on function public.zz_f8_plano(text, integer) to authenticated;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000f801","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  v_ano int := current_setting('f8.ano')::int;
  v_mes int := current_setting('f8.mes')::int;
  v_j   record;
  v_t0  timestamptz;
  v_ids uuid[];
  v_txt text;
  v_ms_painel numeric;
  v_ms_lista  numeric;
  v_qtd_painel text;
begin
  v_j := private.janela_mes(v_ano, v_mes);
  select array_agg(o.id) into v_ids
    from public.ordens_servico o
   where o.oficina_id = private.minha_oficina_id() and o.status = 'entregue'
     and o.entregue_em >= v_j.inicio and o.entregue_em < v_j.fim;

  -- uma chamada so de cada
  v_t0 := clock_timestamp();
  v_qtd_painel := (public.painel_mes(v_ano, v_mes))->'entregues'->>'qtd_os';
  v_ms_painel := round(extract(epoch from clock_timestamp() - v_t0) * 1000, 1);
  v_t0 := clock_timestamp();
  perform count(*) from public.painel_lista_os(v_ano, v_mes, 'entregues');
  v_ms_lista := round(extract(epoch from clock_timestamp() - v_t0) * 1000, 1);

  v_txt := format(E'F8-P1 DIAGNOSTICO | mes %s/%s | OS entregues no mes: %s (painel_mes diz %s)\n',
                  v_mes, v_ano, coalesce(array_length(v_ids, 1), 0), v_qtd_painel)
        || format(E'T painel_mes: %s ms | painel_lista_os(entregues): %s ms | server_version %s\n',
                  v_ms_painel, v_ms_lista, current_setting('server_version'));

  -- D1: corpo atual, plano generico
  begin
    execute $q$prepare f8p1_velho(timestamptz, timestamptz) as
      select count(*), sum(t.total_centavos)
        from public.ordens_servico o
       cross join lateral (select tt.* from public.vw_os_totais tt where tt.os_id = o.id) t
       where o.oficina_id = (select private.minha_oficina_id())
         and o.status = 'entregue'
         and o.entregue_em >= $1 and o.entregue_em < $2$q$;
    perform set_config('plan_cache_mode', 'force_generic_plan', true);
    v_txt := v_txt || E'--- D1 corpo atual (lateral por OS), plano generico\n'
          || public.zz_f8_plano(format('explain (analyze, costs off) execute f8p1_velho(%L, %L)', v_j.inicio, v_j.fim), 2300);
    perform set_config('plan_cache_mode', 'auto', true);
    execute 'deallocate f8p1_velho';
  exception when others then
    v_txt := v_txt || 'D1 falhou: ' || sqlerrm || E'\n';
    begin execute 'deallocate f8p1_velho'; exception when others then null; end;
  end;

  -- D2: uma volta do lateral (1 OS)
  v_txt := v_txt || E'--- D2 vw_os_totais de 1 OS\n'
        || public.zz_f8_plano(format('explain (analyze, costs off) select * from public.vw_os_totais where os_id = %L', v_ids[1]), 1400);

  -- D3: forma proposta, todas de uma vez, plano generico
  begin
    execute $q$prepare f8p1_novo(uuid[]) as
      select count(*), sum(tt.total_centavos) from public.vw_os_totais tt where tt.os_id = any ($1)$q$;
    perform set_config('plan_cache_mode', 'force_generic_plan', true);
    v_txt := v_txt || E'--- D3 proposta: vw_os_totais com os_id = any(lista), plano generico\n'
          || public.zz_f8_plano(format('explain (analyze, costs off) execute f8p1_novo(%L)', v_ids), 1600);
    perform set_config('plan_cache_mode', 'auto', true);
    execute 'deallocate f8p1_novo';
  exception when others then
    v_txt := v_txt || 'D3 falhou: ' || sqlerrm || E'\n';
    begin execute 'deallocate f8p1_novo'; exception when others then null; end;
  end;

  raise exception '%', left(v_txt, 6200);
end $$;

rollback;
