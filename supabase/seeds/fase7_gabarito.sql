-- =============================================================================
-- MechaFlow - Fase 7 - F7-C4: OFICINA-GABARITO no STAGING (dados ficticios, COMMIT)
--
-- O QUE FAZ: preenche a oficina "Oficina Diesel Teste (gabarito7)" com 11 OS de
-- outubro e novembro de 2026, com numeros redondos, para o Guilherme conferir o
-- painel do dono (F7-G1) contra a tabela escrita a mao em docs/GABARITO-FASE7.md.
--
-- NUNCA EM PRODUCAO. Nada na "Oficina Diesel Teste" (sem sufixo): a oficina e
-- achada pelo nome EXATO que o seed gera com SEED_SUFIXO=gabarito7.
--
-- ORDEM:
--   1. SEED_SUFIXO=gabarito7 npm run seed:staging      (cria oficina, dono, atendente e
--                                                     mecanico pela API, chave publishable)
--   2. Este arquivo inteiro, como postgres, no SQL Editor do STAGING (ou MCP execute_sql).
--
-- ABORTA (nada fica gravado) se: nao achar a oficina, achar mais de uma, a oficina ja
-- tiver OS (rodar duas vezes nao duplica), faltar dono/atendente/mecanico do seed,
-- faltar servico do catalogo do seed, a vistoria estiver obrigatoria, o fuso nao for
-- America/Sao_Paulo, ou QUALQUER numero do painel nao bater com o gabarito a mao.
--
-- Mecanicos: so ha uma conta de mecanico no seed e criar outra exige conta de Auth.
-- O "segundo mecanico" e o proprio DONO ("Dono Teste"), que o banco aceita como
-- responsavel (abrir_os: "qualquer perfil ATIVO da oficina, dono tambem"). Nenhuma
-- conta de Auth e criada aqui.
--
-- Como o teste fase7_painel.sql: tudo pelas RPCs de sempre (abrir_os, adicionar_item_os,
-- mudar_status_os, entregar_os, registrar_pagamento) com a sessao do dono/atendente;
-- [ADMIN] as datas passadas sao gravadas direto como postgres (a API nao cria
-- entregue_em no passado), inclusive a hora dos eventos da linha do tempo, para a
-- tela da OS nao mostrar "entregue hoje" numa OS de outubro. Os 2 pagamentos com
-- data passada sao registrados depois, pela atendente, pela RPC (evento com a hora real).
--
-- RESULTADO: a ultima consulta lista cada numero do painel, o valor do banco, o valor
-- do gabarito e "confere". Se algo nao conferir, o script para ANTES do COMMIT.
-- Nenhum objeto permanente e criado (so uma funcao e uma tabela temporarias da sessao).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0) Conferencias (como postgres). Qualquer falha: erro e nada e gravado.
-- -----------------------------------------------------------------------------
do $$
declare
  v_nome    constant text := 'Oficina Diesel Teste (gabarito7)';
  v_qtd     integer;
  v_of      public.oficinas;
  v_id      uuid;
  v_n       integer;
  v_servico text;
  v_chave   text;
begin
  select count(*) into v_qtd from public.oficinas where nome = v_nome;
  if v_qtd = 0 then
    raise exception 'GABARITO: oficina "%" nao encontrada. Rode antes: SEED_SUFIXO=gabarito7 npm run seed:staging', v_nome;
  elsif v_qtd > 1 then
    raise exception 'GABARITO: % oficinas com o nome "%". Esperado 1. Nada foi gravado.', v_qtd, v_nome;
  end if;
  select * into v_of from public.oficinas where nome = v_nome;

  if exists (select 1 from public.ordens_servico where oficina_id = v_of.id)
     or coalesce((select c.ultimo_numero from private.os_contadores c where c.oficina_id = v_of.id), 0) <> 0 then
    raise exception 'GABARITO: a oficina "%" ja tem OS. O gabarito so roda numa oficina sem OS (nao duplica). Para refazer, use outro SEED_SUFIXO e ajuste o nome no topo deste arquivo.', v_nome;
  end if;
  if v_of.fuso_horario <> 'America/Sao_Paulo' then
    raise exception 'GABARITO: fuso da oficina e %, esperado America/Sao_Paulo.', v_of.fuso_horario;
  end if;
  if v_of.vistoria_obrigatoria then
    raise exception 'GABARITO: a vistoria desta oficina esta obrigatoria. Desligue em Configuracoes e rode de novo.';
  end if;
  perform set_config('gab.oficina', v_of.id::text, true);

  -- Dono, atendente e mecanico do seed (um de cada, ativos)
  foreach v_servico in array array['dono', 'atendente', 'mecanico'] loop
    select count(*), min(p.id::text)::uuid into v_n, v_id
      from public.perfis p where p.oficina_id = v_of.id and p.papel = v_servico::public.papel_usuario and p.ativo;
    if v_n <> 1 then
      raise exception 'GABARITO: esperado 1 % ativo na oficina, ha %.', v_servico, v_n;
    end if;
    perform set_config('gab.' || v_servico, v_id::text, true);
  end loop;

  -- Servicos do catalogo do seed (nome exato)
  for v_servico, v_chave in
    select * from (values ('Troca de óleo do motor', 's_oleo'), ('Regulagem de freios', 's_freio'),
                          ('Diagnóstico eletrônico', 's_diag')) as x(nome, chave) loop
    select count(*), min(s.id::text)::uuid into v_n, v_id
      from public.catalogo_servicos s where s.oficina_id = v_of.id and s.nome = v_servico;
    if v_n <> 1 then
      raise exception 'GABARITO: servico "%" do seed: esperado 1 no catalogo, ha %.', v_servico, v_n;
    end if;
    perform set_config('gab.' || v_chave, v_id::text, true);
  end loop;

  if exists (select 1 from public.veiculos v where v.oficina_id = v_of.id and v.placa like 'TST7%')
     or exists (select 1 from public.clientes c where c.oficina_id = v_of.id and c.nome like '%Gabarito%') then
    raise exception 'GABARITO: ja existem placas TST7... ou clientes "Gabarito" nesta oficina. Nada foi gravado.';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 1) Cadastros e OS, na sessao do DONO, pelas RPCs e pela RLS do app
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims',
                  json_build_object('sub', current_setting('gab.dono'), 'role', 'authenticated')::text, true);
set local role authenticated;

insert into public.clientes (nome, telefone, modo_padrao, observacoes) values
  ('Transportes Gabarito Alfa', '11900000071', 'servico_direto',  'Cliente ficticio do gabarito da Fase 7.'),
  ('Frota Gabarito Beta',       '11900000072', 'servico_direto',  'Cliente ficticio do gabarito da Fase 7.'),
  ('Cargas Gabarito Gama',      '11900000073', 'exige_orcamento', 'Cliente ficticio do gabarito da Fase 7.');

insert into public.veiculos (cliente_id, placa, tipo, marca, modelo, km_atual, observacoes)
select c.id, v.placa, 'caminhao', v.marca, v.modelo, v.km, 'Caminhao ficticio do gabarito da Fase 7.'
  from (values
    ('Transportes Gabarito Alfa', 'TST7A01', 'Volvo',         'FH 540',       295000),
    ('Transportes Gabarito Alfa', 'TST7A02', 'Scania',        'R 450',        410000),
    ('Frota Gabarito Beta',       'TST7B01', 'Mercedes-Benz', 'Atego 2430',   220000),
    ('Cargas Gabarito Gama',      'TST7C01', 'Volkswagen',    'Constellation', 150000)
  ) as v(cliente, placa, marca, modelo, km)
  join public.clientes c on c.nome = v.cliente;

do $$
declare
  mec    uuid := current_setting('gab.mecanico')::uuid;     -- "Mecânico Teste"
  dono   uuid := current_setting('gab.dono')::uuid;         -- "Dono Teste", 2o responsavel
  s_oleo  uuid := current_setting('gab.s_oleo')::uuid;   -- Troca de óleo do motor
  s_freio uuid := current_setting('gab.s_freio')::uuid;  -- Regulagem de freios
  s_diag  uuid := current_setting('gab.s_diag')::uuid;   -- Diagnóstico eletrônico
  a1 uuid; a2 uuid; b1 uuid; c1 uuid;
  os uuid;
  n  integer;
begin
  select id into a1 from public.veiculos where placa = 'TST7A01';
  select id into a2 from public.veiculos where placa = 'TST7A02';
  select id into b1 from public.veiculos where placa = 'TST7B01';
  select id into c1 from public.veiculos where placa = 'TST7C01';

  -- OS 1 | Alfa TST7A01 | Mecânico Teste | 500,00 = Troca de óleo 200,00 + óleo 1,5 x 200,00 | paga na entrega (pix)
  select os_id, numero into os, n from public.abrir_os(gen_random_uuid(), p_veiculo_id => a1, p_modo => 'direto',
    p_autorizado_por_nome => 'Motorista Alfa', p_mecanico_id => mec, p_km => 300000, p_sintoma_relatado => 'Troca de óleo programada');
  perform public.adicionar_item_os(gen_random_uuid(), os, 'servico', p_servico_id => s_oleo, p_preco_unitario_centavos => 20000);
  perform public.adicionar_item_os(gen_random_uuid(), os, 'peca', p_descricao => 'Óleo 15W40 (balde de 20 l)',
    p_quantidade => 1.5, p_preco_unitario_centavos => 20000);
  perform public.mudar_status_os(os, 'em_andamento', 'pronta');
  perform public.entregar_os(os, 'Óleo no fim da vida útil', 'Óleo trocado (30 litros)', 'pix', true);
  perform set_config('gab.os1', os::text, true);
  if n <> 1 then raise exception 'GABARITO: a primeira OS saiu com numero %, esperado 1', n; end if;

  -- OS 2 | Beta TST7B01 | Dono Teste | 700,00 = Regulagem de freios 400,00 + lona 300,00 | a receber; paga depois (20/10)
  select os_id into os from public.abrir_os(gen_random_uuid(), p_veiculo_id => b1, p_modo => 'direto',
    p_autorizado_por_nome => 'Motorista Beta', p_mecanico_id => dono, p_km => 225000, p_sintoma_relatado => 'Freio puxando para a direita');
  perform public.adicionar_item_os(gen_random_uuid(), os, 'servico', p_servico_id => s_freio, p_preco_unitario_centavos => 40000);
  perform public.adicionar_item_os(gen_random_uuid(), os, 'peca', p_descricao => 'Lona de freio traseira',
    p_quantidade => 1, p_unidade => 'jogo', p_preco_unitario_centavos => 30000);
  perform public.mudar_status_os(os, 'em_andamento', 'pronta');
  perform public.entregar_os(os, 'Lona gasta', 'Lona trocada e freio regulado', 'boleto', false);
  perform set_config('gab.os2', os::text, true);

  -- OS 3 | Beta TST7B01 | Mecânico Teste | Troca de óleo 300,00 | CANCELADA
  select os_id into os from public.abrir_os(gen_random_uuid(), p_veiculo_id => b1, p_modo => 'direto',
    p_autorizado_por_nome => 'Motorista Beta', p_mecanico_id => mec, p_km => 226000, p_sintoma_relatado => 'Troca de óleo');
  perform public.adicionar_item_os(gen_random_uuid(), os, 'servico', p_servico_id => s_oleo, p_preco_unitario_centavos => 30000);
  perform public.mudar_status_os(os, 'em_andamento', 'cancelada', 'Cliente desistiu do serviço');
  perform set_config('gab.os3', os::text, true);

  -- OS 4 | Alfa TST7A02 | SEM mecanico | 400,00 = Diagnóstico 300,00 + solda AVULSA 100,00 | entregue em out., paga em nov. (04/11)
  select os_id into os from public.abrir_os(gen_random_uuid(), p_veiculo_id => a2, p_modo => 'direto',
    p_autorizado_por_nome => 'Motorista Alfa', p_km => 412000, p_sintoma_relatado => 'Luz de falha acesa no painel');
  perform public.adicionar_item_os(gen_random_uuid(), os, 'servico', p_servico_id => s_diag, p_preco_unitario_centavos => 30000);
  perform public.adicionar_item_os(gen_random_uuid(), os, 'servico', p_descricao => 'Solda no suporte do para-choque',
    p_preco_unitario_centavos => 10000);
  perform public.mudar_status_os(os, 'em_andamento', 'pronta');
  perform public.entregar_os(os, 'Sensor com mau contato', 'Conector limpo e suporte soldado', 'faturado', false);
  perform set_config('gab.os4', os::text, true);

  -- OS 5 | Gama TST7C01 | Mecânico Teste | Troca de óleo 300,00 | entregue 31/10 23:30 (SP) | a receber
  select os_id into os from public.abrir_os(gen_random_uuid(), p_veiculo_id => c1, p_modo => 'direto',
    p_autorizado_por_nome => 'Motorista Gama', p_mecanico_id => mec, p_km => 152000, p_sintoma_relatado => 'Troca de óleo');
  perform public.adicionar_item_os(gen_random_uuid(), os, 'servico', p_servico_id => s_oleo, p_preco_unitario_centavos => 30000);
  perform public.mudar_status_os(os, 'em_andamento', 'pronta');
  perform public.entregar_os(os, 'Óleo vencido', 'Óleo trocado', 'faturado', false);
  perform set_config('gab.os5', os::text, true);

  -- OS 6 | Alfa TST7A01 | Mecânico Teste | 600,00 = Regulagem 400,00 + Diagnóstico 200,00 | a receber
  select os_id into os from public.abrir_os(gen_random_uuid(), p_veiculo_id => a1, p_modo => 'direto',
    p_autorizado_por_nome => 'Motorista Alfa', p_mecanico_id => mec, p_km => 310000, p_sintoma_relatado => 'Freio fraco e luz no painel');
  perform public.adicionar_item_os(gen_random_uuid(), os, 'servico', p_servico_id => s_freio, p_preco_unitario_centavos => 40000);
  perform public.adicionar_item_os(gen_random_uuid(), os, 'servico', p_servico_id => s_diag, p_preco_unitario_centavos => 20000);
  perform public.mudar_status_os(os, 'em_andamento', 'pronta');
  perform public.entregar_os(os, 'Freio desregulado', 'Freio regulado e falhas apagadas', 'faturado', false);
  perform set_config('gab.os6', os::text, true);

  -- OS 7 | Gama TST7C01 | Dono Teste | 500,00 = Troca de óleo 300,00 + 2 filtros x 100,00 | paga na entrega (dinheiro)
  select os_id into os from public.abrir_os(gen_random_uuid(), p_veiculo_id => c1, p_modo => 'direto',
    p_autorizado_por_nome => 'Motorista Gama', p_mecanico_id => dono, p_km => 158000, p_sintoma_relatado => 'Troca de óleo e filtros');
  perform public.adicionar_item_os(gen_random_uuid(), os, 'servico', p_servico_id => s_oleo, p_preco_unitario_centavos => 30000);
  perform public.adicionar_item_os(gen_random_uuid(), os, 'peca', p_descricao => 'Filtro de óleo',
    p_quantidade => 2, p_preco_unitario_centavos => 10000);
  perform public.mudar_status_os(os, 'em_andamento', 'pronta');
  perform public.entregar_os(os, 'Manutenção preventiva', 'Óleo e filtros trocados', 'dinheiro', true);
  perform set_config('gab.os7', os::text, true);

  -- OS 8 | Beta TST7B01 | Dono Teste | SEM itens = 0,00 (retorno em garantia) | entregue sem pagamento
  select os_id into os from public.abrir_os(gen_random_uuid(), p_veiculo_id => b1, p_modo => 'direto',
    p_autorizado_por_nome => 'Motorista Beta', p_mecanico_id => dono, p_km => 228000, p_sintoma_relatado => 'Retorno: barulho no freio');
  perform public.mudar_status_os(os, 'em_andamento', 'pronta');
  perform public.entregar_os(os, 'Retorno em garantia', 'Conferido e reapertado, sem custo', 'dinheiro', false);
  perform set_config('gab.os8', os::text, true);

  -- OS 9 | Alfa TST7A02 | SEM mecanico | 200,00 = servico AVULSO | a receber
  select os_id into os from public.abrir_os(gen_random_uuid(), p_veiculo_id => a2, p_modo => 'direto',
    p_autorizado_por_nome => 'Motorista Alfa', p_km => 415000, p_sintoma_relatado => 'Barulho na carroceria');
  perform public.adicionar_item_os(gen_random_uuid(), os, 'servico', p_descricao => 'Reaperto geral da carroceria',
    p_preco_unitario_centavos => 20000);
  perform public.mudar_status_os(os, 'em_andamento', 'pronta');
  perform public.entregar_os(os, 'Parafusos frouxos', 'Carroceria reapertada', 'faturado', false);
  perform set_config('gab.os9', os::text, true);

  -- OS 10 | Alfa TST7A01 | Mecânico Teste | EM ANDAMENTO, com Troca de óleo 300,00 lancada
  select os_id into os from public.abrir_os(gen_random_uuid(), p_veiculo_id => a1, p_modo => 'direto',
    p_autorizado_por_nome => 'Motorista Alfa', p_mecanico_id => mec, p_km => 312000, p_sintoma_relatado => 'Vazamento de óleo');
  perform public.adicionar_item_os(gen_random_uuid(), os, 'servico', p_servico_id => s_oleo, p_preco_unitario_centavos => 30000);
  perform set_config('gab.os10', os::text, true);

  -- OS 11 | Gama TST7C01 | sem mecanico | AGUARDANDO ORCAMENTO, sem itens
  select os_id, numero into os, n from public.abrir_os(gen_random_uuid(), p_veiculo_id => c1, p_modo => 'com_orcamento',
    p_km => 160000, p_sintoma_relatado => 'Motor sem força na subida');
  perform set_config('gab.os11', os::text, true);
  if n <> 11 then raise exception 'GABARITO: a ultima OS saiu com numero %, esperado 11', n; end if;
end $$;

-- -----------------------------------------------------------------------------
-- 2) [ADMIN] Datas passadas (como postgres). Hora de Sao Paulo escrita em cada literal.
-- -----------------------------------------------------------------------------
reset role;

update public.ordens_servico o
   set criado_em     = d.criado,
       autorizado_em = case when o.autorizado_em is not null then d.criado end,
       iniciado_em   = case when o.iniciado_em   is not null then d.criado end,
       pronta_em     = case when o.pronta_em     is not null then d.entregue - interval '1 hour' end,
       entregue_em   = case when o.status = 'entregue'  then d.entregue end,
       cancelado_em  = case when o.status = 'cancelada' then d.cancelado end
  from (values
    ('os1',  '2026-10-05 08:00-03'::timestamptz, '2026-10-05 17:00-03'::timestamptz, null::timestamptz),
    ('os2',  '2026-10-11 08:00-03', '2026-10-12 10:00-03', null),
    ('os3',  '2026-10-15 08:00-03', null,                  '2026-10-16 08:00-03'),
    ('os4',  '2026-10-19 08:00-03', '2026-10-20 15:00-03', null),
    ('os5',  '2026-10-31 14:00-03', '2026-10-31 23:30-03', null),   -- em UTC ja e 01/11 02:30
    ('os6',  '2026-11-02 08:00-03', '2026-11-03 10:00-03', null),
    ('os7',  '2026-11-04 08:00-03', '2026-11-04 14:00-03', null),
    ('os8',  '2026-11-05 08:00-03', '2026-11-05 09:00-03', null),
    ('os9',  '2026-11-06 08:00-03', '2026-11-06 11:00-03', null),
    ('os10', '2026-11-06 13:00-03', null,                  null),
    ('os11', '2026-11-06 14:00-03', null,                  null)
  ) as d(chave, criado, entregue, cancelado)
 where o.id = current_setting('gab.' || d.chave)::uuid;

-- pagas NA ENTREGA: o pagamento tem a hora da entrega
update public.os_comercial c
   set pago_em = o.entregue_em
  from public.ordens_servico o
 where o.id = c.os_id
   and o.id in (current_setting('gab.os1')::uuid, current_setting('gab.os7')::uuid);

-- linha do tempo com as mesmas datas (so as OS do gabarito, so os eventos ja gravados)
update public.os_historico h
   set em = case
              when h.evento = 'criada'                              then o.criado_em
              when h.evento = 'status' and h.para_status = 'pronta' then o.pronta_em
              when h.evento = 'entregue'                            then o.entregue_em
              when h.evento = 'pagamento'                           then o.entregue_em + interval '1 second'
              when h.evento = 'cancelada'                           then o.cancelado_em
              else o.criado_em + interval '1 minute'
            end
  from public.ordens_servico o
 where o.id = h.os_id
   and o.oficina_id = current_setting('gab.oficina')::uuid;

do $$ begin
  -- o caso da virada: 31/10 23:30 em Sao Paulo ja e 01/11 em UTC
  if (select (entregue_em at time zone 'UTC')::date from public.ordens_servico where id = current_setting('gab.os5')::uuid)
     <> date '2026-11-01' then
    raise exception 'GABARITO: OS 5 deveria cair em 01/11 em UTC';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 3) Pagamentos com DATA PASSADA, pela ATENDENTE, pela RPC do app (meio-dia de SP)
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims',
                  json_build_object('sub', current_setting('gab.atendente'), 'role', 'authenticated')::text, true);
set local role authenticated;
select public.registrar_pagamento(current_setting('gab.os2')::uuid, 'boleto', '2026-10-20 12:00-03', p_so_se_a_receber => true);
select public.registrar_pagamento(current_setting('gab.os4')::uuid, 'pix',    '2026-11-04 12:00-03', p_so_se_a_receber => true);

-- -----------------------------------------------------------------------------
-- 4) As MESMAS leituras do painel, na sessao do DONO
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims',
                  json_build_object('sub', current_setting('gab.dono'), 'role', 'authenticated')::text, true);
select set_config('gab.p10',  public.painel_mes(2026, 10)::text, true),
       set_config('gab.p11',  public.painel_mes(2026, 11)::text, true),
       set_config('gab.hoje', public.painel_hoje()::text, true),
       set_config('gab.receber', coalesce((select jsonb_agg(to_jsonb(c) order by c.ordinality)
                                             from public.contas_a_receber() with ordinality c), '[]')::text, true),
       set_config('gab.l10e', coalesce((select string_agg('#' || numero, ', ' order by ord)
                                          from public.painel_lista_os(2026, 10, 'entregues') with ordinality l(os_id, numero, placa, cliente_nome, entregue_em, pago_em, forma_pagamento, valor_centavos, detalhe, ord)), '-'), true),
       set_config('gab.l10r', coalesce((select string_agg('#' || numero, ', ' order by ord)
                                          from public.painel_lista_os(2026, 10, 'recebido') with ordinality l(os_id, numero, placa, cliente_nome, entregue_em, pago_em, forma_pagamento, valor_centavos, detalhe, ord)), '-'), true),
       set_config('gab.l11e', coalesce((select string_agg('#' || numero, ', ' order by ord)
                                          from public.painel_lista_os(2026, 11, 'entregues') with ordinality l(os_id, numero, placa, cliente_nome, entregue_em, pago_em, forma_pagamento, valor_centavos, detalhe, ord)), '-'), true),
       set_config('gab.l11r', coalesce((select string_agg('#' || numero, ', ' order by ord)
                                          from public.painel_lista_os(2026, 11, 'recebido') with ordinality l(os_id, numero, placa, cliente_nome, entregue_em, pago_em, forma_pagamento, valor_centavos, detalhe, ord)), '-'), true),
       set_config('gab.f10', coalesce((select string_agg('#' || numero || ' ' || detalhe, ' | ' order by numero)
                                         from public.painel_lista_os(2026, 10, 'fora_catalogo')), '-'), true),
       set_config('gab.f11', coalesce((select string_agg('#' || numero || ' ' || detalhe, ' | ' order by numero)
                                         from public.painel_lista_os(2026, 11, 'fora_catalogo')), '-'), true);

-- -----------------------------------------------------------------------------
-- 5) Comparacao com o gabarito ESCRITO A MAO (docs/GABARITO-FASE7.md). Como postgres.
-- -----------------------------------------------------------------------------
reset role;

create function pg_temp.gab_brl(c bigint) returns text language sql immutable as $$
  select 'R$ ' || translate(to_char(c / 100.0, 'FM999,999,990.00'), ',.', '.,')
$$;
create function pg_temp.gab_sp(t timestamptz) returns text language sql immutable as $$
  select to_char(t at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
$$;

create temp table gabarito_conferencia on commit preserve rows as
with p10 as (select current_setting('gab.p10')::jsonb j),
     p11 as (select current_setting('gab.p11')::jsonb j),
     h   as (select current_setting('gab.hoje')::jsonb j),
     r   as (select current_setting('gab.receber')::jsonb j),
     banco(ordem, bloco, numero_na_tela, banco) as (
  select 1, 'Outubro', 'Serviços entregues no mês',
         pg_temp.gab_brl((j->'entregues'->>'total_centavos')::bigint) || ' · ' || (j->'entregues'->>'qtd_os') || ' OS' from p10
  union all select 2, 'Outubro', '  (dentro dele) serviços / peças',
         pg_temp.gab_brl((j->'entregues'->>'servicos_centavos')::bigint) || ' / ' || pg_temp.gab_brl((j->'entregues'->>'pecas_centavos')::bigint) from p10
  union all select 3, 'Outubro', 'Dinheiro recebido no mês',
         pg_temp.gab_brl((j->'recebido'->>'total_centavos')::bigint) || ' · ' || (j->'recebido'->>'qtd_os') || ' OS' from p10
  union all select 4, 'Outubro', 'Serviços mais feitos',
         (select string_agg((e->>'nome') || ' ' || (e->>'qtd_os') || ' OS', ' | ' order by k)
            from jsonb_array_elements(j->'servicos') with ordinality x(e, k)) from p10
  union all select 5, 'Outubro', 'Produtividade por mecânico',
         (select string_agg(coalesce(e->>'nome', 'Sem mecânico') || ' ' || (e->>'qtd_os') || ' OS ' || pg_temp.gab_brl((e->>'servicos_centavos')::bigint), ' | ' order by k)
            from jsonb_array_elements(j->'produtividade') with ordinality x(e, k)) from p10
  union all select 6, 'Outubro', '  lista: Serviços entregues', current_setting('gab.l10e')
  union all select 7, 'Outubro', '  lista: Dinheiro recebido',  current_setting('gab.l10r')
  union all select 8, 'Outubro', '  lista: Fora do catálogo',   current_setting('gab.f10')
  union all select 11, 'Novembro', 'Serviços entregues no mês',
         pg_temp.gab_brl((j->'entregues'->>'total_centavos')::bigint) || ' · ' || (j->'entregues'->>'qtd_os') || ' OS' from p11
  union all select 12, 'Novembro', '  (dentro dele) serviços / peças',
         pg_temp.gab_brl((j->'entregues'->>'servicos_centavos')::bigint) || ' / ' || pg_temp.gab_brl((j->'entregues'->>'pecas_centavos')::bigint) from p11
  union all select 13, 'Novembro', 'Dinheiro recebido no mês',
         pg_temp.gab_brl((j->'recebido'->>'total_centavos')::bigint) || ' · ' || (j->'recebido'->>'qtd_os') || ' OS' from p11
  union all select 14, 'Novembro', 'Serviços mais feitos',
         (select string_agg((e->>'nome') || ' ' || (e->>'qtd_os') || ' OS', ' | ' order by k)
            from jsonb_array_elements(j->'servicos') with ordinality x(e, k)) from p11
  union all select 15, 'Novembro', 'Produtividade por mecânico',
         (select string_agg(coalesce(e->>'nome', 'Sem mecânico') || ' ' || (e->>'qtd_os') || ' OS ' || pg_temp.gab_brl((e->>'servicos_centavos')::bigint), ' | ' order by k)
            from jsonb_array_elements(j->'produtividade') with ordinality x(e, k)) from p11
  union all select 16, 'Novembro', '  lista: Serviços entregues', current_setting('gab.l11e')
  union all select 17, 'Novembro', '  lista: Dinheiro recebido',  current_setting('gab.l11r')
  union all select 18, 'Novembro', '  lista: Fora do catálogo',   current_setting('gab.f11')
  union all select 21, 'Hoje', 'A receber',
         pg_temp.gab_brl((j->'a_receber'->>'total_centavos')::bigint) || ' · ' || (j->'a_receber'->>'qtd_os') || ' OS de '
         || (j->'a_receber'->>'qtd_clientes') || ' clientes · mais antiga ' || pg_temp.gab_sp((j->'a_receber'->>'mais_antiga_em')::timestamptz) from h
  union all select 22, 'Hoje', 'A receber, por cliente (ordem da tela)',
         (select string_agg(cli, ' | ' order by o1)
            from (select min(k) as o1, (e->>'cliente_nome') || ' ' || pg_temp.gab_brl(max((e->>'cliente_total_centavos')::bigint))
                         || ' (' || string_agg('#' || (e->>'numero'), ', ' order by k) || ')' as cli
                    from jsonb_array_elements(j) with ordinality x(e, k)
                   group by e->>'cliente_nome') g) from r
  union all select 23, 'Hoje', 'OS abertas',
         (j->'abertas'->>'total') || ' (aguardando orçamento ' || (j->'abertas'->>'aguardando_orcamento')
         || ', em andamento ' || (j->'abertas'->>'em_andamento') || ', outras '
         || ((j->'abertas'->>'total')::int - (j->'abertas'->>'aguardando_orcamento')::int - (j->'abertas'->>'em_andamento')::int) || ')' from h
  union all select 24, 'Hoje', 'Primeiro registro (início do seletor de mês)',
         pg_temp.gab_sp((j->>'primeiro_registro_em')::timestamptz) from h
),
-- ESPERADO, escrito a mao (mesma tabela de docs/GABARITO-FASE7.md). Nao recalcular por query.
gabarito(ordem, esperado) as (values
  (1,  'R$ 1.900,00 · 4 OS'),
  (2,  'R$ 1.300,00 / R$ 600,00'),
  (3,  'R$ 1.200,00 · 2 OS'),
  (4,  'Troca de óleo do motor 2 OS | Diagnóstico eletrônico 1 OS | Regulagem de freios 1 OS | Fora do catálogo 1 OS'),
  (5,  'Mecânico Teste 2 OS R$ 500,00 | Dono Teste 1 OS R$ 400,00 | Sem mecânico 1 OS R$ 400,00'),
  (6,  '#1, #2, #4, #5'),
  (7,  '#1, #2'),
  (8,  '#4 Solda no suporte do para-choque'),
  (11, 'R$ 1.300,00 · 4 OS'),
  (12, 'R$ 1.100,00 / R$ 200,00'),
  (13, 'R$ 900,00 · 2 OS'),
  (14, 'Diagnóstico eletrônico 1 OS | Regulagem de freios 1 OS | Troca de óleo do motor 1 OS | Fora do catálogo 1 OS'),
  (15, 'Mecânico Teste 1 OS R$ 600,00 | Dono Teste 2 OS R$ 300,00 | Sem mecânico 1 OS R$ 200,00'),
  (16, '#6, #7, #8, #9'),
  (17, '#4, #7'),
  (18, '#9 Reaperto geral da carroceria'),
  (21, 'R$ 1.100,00 · 3 OS de 2 clientes · mais antiga 31/10/2026 23:30'),
  (22, 'Cargas Gabarito Gama R$ 300,00 (#5) | Transportes Gabarito Alfa R$ 800,00 (#6, #9)'),
  (23, '2 (aguardando orçamento 1, em andamento 1, outras 0)'),
  (24, '05/10/2026 17:00')
)
select b.ordem, b.bloco, b.numero_na_tela, b.banco, g.esperado as gabarito,
       case when b.banco is not distinct from g.esperado then 'confere' else 'NAO CONFERE' end as confere
  from banco b join gabarito g using (ordem);

do $$
declare v_erros text;
begin
  select string_agg(format('[%s] %s: banco "%s" x gabarito "%s"', bloco, numero_na_tela, banco, gabarito), E'\n' order by ordem)
    into v_erros from gabarito_conferencia where confere <> 'confere';
  if v_erros is not null then
    raise exception E'GABARITO NAO CONFERE (nada foi gravado):\n%', v_erros;
  end if;
  if (select count(*) from gabarito_conferencia) <> 20 then
    raise exception 'GABARITO: conferencia incompleta';
  end if;
end $$;

commit;

-- Resultado para o CEO comparar com docs/GABARITO-FASE7.md (todas as linhas "confere")
select ordem, bloco, numero_na_tela, banco, gabarito, confere from gabarito_conferencia order by ordem;
