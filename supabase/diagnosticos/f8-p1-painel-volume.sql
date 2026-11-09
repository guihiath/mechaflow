-- =============================================================================
-- MechaFlow - F8-P1 - Painel com volume (PLANO 21.3; ARQUITETURA 14.13)
--
-- O QUE FAZ
--   1. Cria uma oficina DESCARTAVEL ("Oficina Volume F8-P1"): 1 dono, 3 mecanicos
--      (pelo convite, como no app), 150 clientes, 400 veiculos, 12 servicos no catalogo.
--   2. Cria 3.000 OS espalhadas de nov/2025 a nov/2026, com ~4 itens cada (servicos
--      do catalogo, avulsos e pecas), precos, custos das pecas e pagamentos:
--        * outubro/2026 e o MES MAIS CHEIO (~390 entregues); os outros meses ~210;
--        * ~7,7% canceladas; ~70% das entregues pagas (algumas no mes seguinte),
--          o resto "a receber"; 2,5% sem itens (total 0, fora do a receber);
--        * 100 OS abertas em novembro/2026 (aguardando, enviado, aprovada, em
--          andamento, pronta); ~11% das OS sem mecanico.
--      Itens e precos entram com a OS ABERTA (os triggers de OS fechada valem) e so
--      depois a OS e levada ao status final. Datas no passado gravadas como postgres
--      [ADMIN], como no fase7_painel.sql.
--   3. ANALYZE e, logado como o DONO (request.jwt.claims + role authenticated, RLS
--      valendo), descobre o mes mais cheio e roda EXPLAIN (ANALYZE, BUFFERS) de:
--        A  painel_mes(ano, mes) inteira (so mostra o tempo total; o plano interno
--           fica escondido dentro da funcao, por isso os blocos B a F)
--        B  "entregues no mes"  (corpo de private.os_entregues_no_mes + soma)
--        B2 o mesmo B com enable_seqscan = off (so comparacao: prova que o indice
--           serve, se o B tiver preferido Seq Scan)
--        C  "recebido no mes"   (corpo de private.os_recebidas_no_mes + soma)
--        D  "servicos do mes"   (entregues x os_itens x catalogo)
--        E  "produtividade"     (entregues por mecanico)
--        F  "a receber"         (corpo de private.os_a_receber + soma do painel_hoje)
--        G  painel_hoje()        H  contas_a_receber()        I  painel_lista_os('entregues')
--      E chama painel_mes 5 vezes seguidas (depois de 1 de aquecimento) e mede.
--   4. Devolve UMA tabela (ordem, bloco, linha, texto) e termina em ROLLBACK:
--      NADA fica no banco (nem oficina, nem usuarios, nem estatisticas do ANALYZE).
--
-- QUEM RODA E ONDE
--   O CEO, no SQL Editor do Supabase de STAGING (usuario postgres), colando o arquivo
--   INTEIRO de uma vez, DEPOIS de todas as migracoes (ate 20261104000004).
--   Nao rodar em producao. Nada aqui altera migracao nem dado existente.
--
-- COMO LER O RESULTADO
--   Linhas "0 RESUMO" (topo):
--     * mes analisado, OS da oficina, conferencia "painel = contagem direta" (qtd e
--       total do mes; se "DIFERENTE", o painel esta somando errado -> parar);
--     * tempos das 5 chamadas de painel_mes, em ms. META: todas < 1000 ms.
--   Linhas "1 RESUMO POR BLOCO": para cada bloco, Execution Time, tabelas com
--     Seq Scan e indices usados. Esperado:
--       B/D/E: ordens_servico_entregue_idx (Index Scan ou Bitmap Index Scan);
--       C:     os_comercial_pago_idx;
--       F:     ordens_servico_entregue_idx ou ordens_servico_oficina_status_idx, e
--              os_comercial_pkey;
--       em todos, o total por OS (vw_os_totais) sai por os_itens_os_idx,
--       os_itens_precos_pkey e os_itens_custos_pkey, com "loops=" ~ numero de OS do
--       recorte (e lateral por OS, nao a oficina inteira).
--   Linhas seguintes: o plano completo de cada bloco, linha a linha.
--     * "Seq Scan on ordens_servico" / "on os_comercial" / "on os_itens" = indice NAO
--       usado. Com so ~3 mil linhas o planner as vezes prefere Seq Scan por ser
--       barato; olhar o B2: se o B2 usa o indice e o tempo do B continua baixo,
--       e escolha do planner, nao falta de indice. Ainda assim registrar.
--     * "Buffers: shared hit=... read=..." : read alto na 1a vez e normal (disco);
--       o que importa e o tempo.
--     * "Execution Time: X ms" no fim de cada bloco. META do criterio (PLANO 21.3):
--       painel_mes < 1000 ms e indice usado. Qualquer bloco > 1000 ms ou Seq Scan
--       em ordens_servico/os_comercial no B, C ou F (com B2 tambem sem indice) vira
--       correcao antes do piloto.
-- =============================================================================

begin;

-- EXPLAIN dentro de funcao INVOKER: roda com o papel e a RLS de quem chama.
create function public.zz_f8_explain(p_sql text) returns text language plpgsql as $$
declare r record; t text := '';
begin
  for r in execute 'explain (analyze, buffers) ' || p_sql loop
    t := t || r."QUERY PLAN" || E'\n';
  end loop;
  return t;
end $$;
grant execute on function public.zz_f8_explain(text) to authenticated;

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
-- 2) Medicao como o DONO (RLS e auth.uid() de verdade)
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000f801","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  v_ano int := current_setting('f8.ano')::int;
  v_mes int := current_setting('f8.mes')::int;
  v_j   record;
  v_p   jsonb;
  v_t0  timestamptz;
  v_ms  numeric[] := '{}';
  v_e   text;   -- corpo de private.os_entregues_no_mes, com a janela literal
  v_r   text;   -- corpo de private.os_recebidas_no_mes
  v_a   text;   -- corpo de private.os_a_receber
begin
  v_j := private.janela_mes(v_ano, v_mes);

  -- tempos: 1 aquecimento + 5 medidas
  perform public.painel_mes(v_ano, v_mes);
  for i in 1..5 loop
    v_t0 := clock_timestamp();
    v_p  := public.painel_mes(v_ano, v_mes);
    v_ms := v_ms || round(extract(epoch from clock_timestamp() - v_t0) * 1000, 1);
  end loop;
  perform set_config('f8.tempos', array_to_string(v_ms, ' / '), true);
  perform set_config('f8.tempo_max', (select max(x) from unnest(v_ms) x)::text, true);
  perform set_config('f8.painel_qtd', v_p->'entregues'->>'qtd_os', true);
  perform set_config('f8.painel_total', v_p->'entregues'->>'total_centavos', true);
  perform set_config('f8.painel_receb', v_p->'recebido'->>'qtd_os', true);

  v_e := format($q$
    select o.id as os_id, o.mecanico_id, t.total_centavos, t.total_servicos_centavos, t.total_pecas_centavos
      from public.ordens_servico o
     cross join lateral (select tt.* from public.vw_os_totais tt where tt.os_id = o.id) t
     where o.oficina_id = (select private.minha_oficina_id())
       and o.status = 'entregue'
       and o.entregue_em >= %L::timestamptz
       and o.entregue_em <  %L::timestamptz $q$, v_j.inicio, v_j.fim);

  v_r := format($q$
    select o.id as os_id, t.total_centavos
      from public.os_comercial c
      join public.ordens_servico o on o.id = c.os_id
     cross join lateral (select tt.* from public.vw_os_totais tt where tt.os_id = o.id) t
     where c.oficina_id = (select private.minha_oficina_id())
       and o.status = 'entregue'
       and c.pago_em >= %L::timestamptz
       and c.pago_em <  %L::timestamptz $q$, v_j.inicio, v_j.fim);

  v_a := $q$
    select o.id as os_id, o.cliente_id, o.entregue_em, t.total_centavos
      from public.ordens_servico o
      left join public.os_comercial c on c.os_id = o.id
     cross join lateral (select tt.* from public.vw_os_totais tt where tt.os_id = o.id) t
     where o.oficina_id = (select private.minha_oficina_id())
       and o.status = 'entregue'
       and c.pago_em is null
       and t.total_centavos > 0 $q$;

  perform set_config('f8.p_a', public.zz_f8_explain(format('select public.painel_mes(%s, %s)', v_ano, v_mes)), true);

  perform set_config('f8.p_b', public.zz_f8_explain(format($q$
    select count(*)::integer, coalesce(sum(e.total_centavos), 0)::bigint,
           coalesce(sum(e.total_servicos_centavos), 0)::bigint, coalesce(sum(e.total_pecas_centavos), 0)::bigint
      from (%s) e $q$, v_e)), true);

  perform set_config('enable_seqscan', 'off', true);
  perform set_config('f8.p_b2', public.zz_f8_explain(format($q$
    select count(*)::integer, coalesce(sum(e.total_centavos), 0)::bigint
      from (%s) e $q$, v_e)), true);
  perform set_config('enable_seqscan', 'on', true);

  perform set_config('f8.p_c', public.zz_f8_explain(format($q$
    select count(*)::integer, coalesce(sum(r.total_centavos), 0)::bigint from (%s) r $q$, v_r)), true);

  perform set_config('f8.p_d', public.zz_f8_explain(format($q$
    select s.servico_id, coalesce(c.nome, 'Fora do catálogo'), s.qtd_os
      from (select i.servico_id, count(distinct i.os_id)::integer as qtd_os
              from (%s) e
              join public.os_itens i on i.os_id = e.os_id
             where i.tipo = 'servico'
             group by i.servico_id) s
      left join public.catalogo_servicos c on c.id = s.servico_id
     order by (s.servico_id is null), s.qtd_os desc, c.nome $q$, v_e)), true);

  perform set_config('f8.p_e', public.zz_f8_explain(format($q$
    select e.mecanico_id,
           case when e.mecanico_id is not null then coalesce(private.nome_membro(e.mecanico_id), '—') end,
           count(*)::integer, coalesce(sum(e.total_servicos_centavos), 0)::bigint
      from (%s) e
     group by e.mecanico_id $q$, v_e)), true);

  perform set_config('f8.p_f', public.zz_f8_explain(format($q$
    select coalesce(sum(a.total_centavos), 0)::bigint, count(*)::integer,
           count(distinct a.cliente_id)::integer, min(a.entregue_em)
      from (%s) a $q$, v_a)), true);

  perform set_config('f8.p_g', public.zz_f8_explain('select public.painel_hoje()'), true);
  perform set_config('f8.p_h', public.zz_f8_explain('select count(*), sum(total_centavos) from public.contas_a_receber()'), true);
  perform set_config('f8.p_i', public.zz_f8_explain(format(
    $q$select count(*), sum(valor_centavos) from public.painel_lista_os(%s, %s, 'entregues')$q$, v_ano, v_mes)), true);
end $$;

-- -----------------------------------------------------------------------------
-- 3) Resultado (uma tabela so; o SQL Editor mostra o ultimo SELECT)
-- -----------------------------------------------------------------------------
reset role;

with blocos(ordem, bloco, chave) as (values
  (10, 'A  painel_mes (chamada inteira)',          'f8.p_a'),
  (20, 'B  entregues no mes',                       'f8.p_b'),
  (25, 'B2 entregues no mes, enable_seqscan = off', 'f8.p_b2'),
  (30, 'C  recebido no mes',                        'f8.p_c'),
  (40, 'D  servicos do mes',                        'f8.p_d'),
  (50, 'E  produtividade',                          'f8.p_e'),
  (60, 'F  a receber (os_a_receber)',               'f8.p_f'),
  (70, 'G  painel_hoje()',                          'f8.p_g'),
  (80, 'H  contas_a_receber()',                     'f8.p_h'),
  (90, 'I  painel_lista_os(entregues)',             'f8.p_i')
), resumo(linha, texto) as (values
  (1, format('Mes analisado (mais cheio): %s/%s  |  janela %s a %s',
             current_setting('f8.mes'), current_setting('f8.ano'), current_setting('f8.ini'), current_setting('f8.fim'))),
  (2, format('OS da oficina descartavel: %s',
             (select count(*) from public.ordens_servico where oficina_id = current_setting('f8.oficina')::uuid))),
  (3, format('Entregues no mes: painel %s x contagem direta %s -> %s',
             current_setting('f8.painel_qtd'), current_setting('f8.esp_qtd'),
             case when current_setting('f8.painel_qtd') = current_setting('f8.esp_qtd') then 'OK' else 'DIFERENTE' end)),
  (4, format('Total entregue no mes (centavos): painel %s x direto %s -> %s',
             current_setting('f8.painel_total'), current_setting('f8.esp_total'),
             case when current_setting('f8.painel_total') = current_setting('f8.esp_total') then 'OK' else 'DIFERENTE' end)),
  (5, format('Recebido no mes (qtd OS): painel %s x direto %s -> %s',
             current_setting('f8.painel_receb'), current_setting('f8.esp_receb'),
             case when current_setting('f8.painel_receb') = current_setting('f8.esp_receb') then 'OK' else 'DIFERENTE' end)),
  (6, format('painel_mes, 5 chamadas (ms): %s  |  pior: %s ms -> %s',
             current_setting('f8.tempos'), current_setting('f8.tempo_max'),
             case when current_setting('f8.tempo_max')::numeric < 1000 then 'DENTRO DA META (< 1 s)' else 'ACIMA DA META' end))
), linhas as (
  select 0 as ordem, '0 RESUMO' as bloco, r.linha, r.texto from resumo r
  union all
  select 1, '1 RESUMO POR BLOCO', (b.ordem / 5)::int,
         format('%s | Execution Time: %s ms | Seq Scan em: %s | indices: %s',
                b.bloco,
                coalesce(substring(current_setting(b.chave) from 'Execution Time: ([0-9.]+) ms'), '?'),
                coalesce((select string_agg(distinct m[1], ', ')
                            from regexp_matches(current_setting(b.chave), 'Seq Scan on ([a-z0-9_]+)', 'g') m), 'nenhum'),
                coalesce((select string_agg(distinct coalesce(m[1], m[2]), ', ')
                            from regexp_matches(current_setting(b.chave),
                                                '(?:Index Scan|Index Only Scan) (?:Backward )?using ([a-z0-9_]+)|Bitmap Index Scan on ([a-z0-9_]+)', 'g') m),
                         'nenhum'))
    from blocos b
  union all
  select b.ordem, b.bloco, l.n::int, l.txt
    from blocos b
   cross join lateral regexp_split_to_table(rtrim(current_setting(b.chave), E'\n'), E'\n') with ordinality l(txt, n)
)
select ordem, bloco, linha, texto from linhas order by ordem, linha;

rollback;
