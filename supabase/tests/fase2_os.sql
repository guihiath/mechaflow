-- =============================================================================
-- MechaFlow - Fase 2 - Teste da OS (criterio de pronto do banco da Fase 2)
--
-- O que prova:
--   * isolamento A x B em OS, itens, precos, custos, comercial, historico, views e RPCs;
--   * mecanico nao le NENHUM valor (tabelas, views, RPCs), nem telefone do
--     cliente nem quem autorizou; ve o nome do cliente;
--   * numero sequencial por oficina, sem repeticao, sem buraco em erro;
--   * abrir_os e adicionar_item_os idempotentes (reenvio nao duplica);
--   * maquina de status: transicoes proibidas, status de origem conferido,
--     papel do mecanico (comecar / pronta / desfazer so na OS dele);
--   * modo direto nao anda sem autorizacao (RPC e check constraint);
--   * OS entregue/cancelada travada; pagamento por dono/atendente.
--
-- Como rodar: SQL Editor do Supabase STAGING (usuario postgres), DEPOIS das
-- migracoes da Fase 2. Colar tudo e executar.
-- Resultado esperado: 'FASE 2 OK: todos os testes da OS passaram'.
-- Tudo dentro de uma transacao que termina em ROLLBACK: nada fica gravado.
-- =============================================================================

begin;

-- Auxiliares do teste (somem no ROLLBACK). Executam o SQL e devolvem a
-- mensagem / o SQLSTATE do erro, ou NULL se nao deu erro.
create function public.zz_erro(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return null;
exception when others then
  return sqlerrm;
end $$;
create function public.zz_estado(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return null;
exception when others then
  return sqlstate;
end $$;
grant execute on function public.zz_erro(text), public.zz_estado(text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 0) Usuarios: a1 dono A | a2 mecanico A | a3 atendente A | a4 mecanico A2 | b1 dono B
-- -----------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email, '', now(),
       '{"provider":"email","providers":["email"]}', '{}', now(), now()
  from (values
    ('00000000-0000-4000-8000-0000000002a1', 'f2.dono.a@teste.invalid'),
    ('00000000-0000-4000-8000-0000000002a2', 'f2.mec.a@teste.invalid'),
    ('00000000-0000-4000-8000-0000000002a3', 'f2.atd.a@teste.invalid'),
    ('00000000-0000-4000-8000-0000000002a4', 'f2.mec2.a@teste.invalid'),
    ('00000000-0000-4000-8000-0000000002b1', 'f2.dono.b@teste.invalid')
  ) as u(id, email);

-- =============================================================================
-- 1) DONO A: oficina, equipe, catalogo, cliente e veiculo
-- =============================================================================
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000002a1","role":"authenticated","email":"f2.dono.a@teste.invalid"}', true);
set local role authenticated;

select set_config('teste.oficina_a',
  public.criar_oficina('Oficina A F2', 'Dono A', private.versao_termos_vigente())::text, true);
select set_config('teste.tk_mec',  (select token from public.criar_convite('mecanico', 'Mecanico A')), true);
select set_config('teste.tk_atd',  (select token from public.criar_convite('atendente', 'Atendente A')), true);
select set_config('teste.tk_mec2', (select token from public.criar_convite('mecanico', 'Mecanico A2')), true);

with s as (insert into public.catalogo_servicos (nome) values ('Troca de oleo') returning id)
select set_config('teste.servico', (select id::text from s), true);
insert into public.catalogo_servicos_precos (servico_id, preco_padrao_centavos)
values (current_setting('teste.servico')::uuid, 25000);

with p as (insert into public.catalogo_pecas (nome, unidade) values ('Filtro de oleo', 'un') returning id)
select set_config('teste.peca', (select id::text from p), true);
insert into public.catalogo_pecas_precos (peca_id, preco_venda_centavos) values (current_setting('teste.peca')::uuid, 18000);
insert into public.catalogo_pecas_custos (peca_id, custo_centavos)      values (current_setting('teste.peca')::uuid, 9000);

with c as (insert into public.clientes (nome, telefone) values ('Transportadora A', '11988887777') returning id)
select set_config('teste.cliente_a', (select id::text from c), true);
with v as (insert into public.veiculos (cliente_id, placa, km_atual)
           values (current_setting('teste.cliente_a')::uuid, 'ABC1D23', 350000) returning id)
select set_config('teste.veiculo_a', (select id::text from v), true);

-- Funcionarios entram
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000002a2","role":"authenticated","email":"f2.mec.a@teste.invalid"}', true);
select public.aceitar_convite(current_setting('teste.tk_mec'), 'Mecanico A', private.versao_termos_vigente());
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000002a3","role":"authenticated","email":"f2.atd.a@teste.invalid"}', true);
select public.aceitar_convite(current_setting('teste.tk_atd'), 'Atendente A', private.versao_termos_vigente());
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000002a4","role":"authenticated","email":"f2.mec2.a@teste.invalid"}', true);
select public.aceitar_convite(current_setting('teste.tk_mec2'), 'Mecanico A2', private.versao_termos_vigente());

-- =============================================================================
-- 2) DONO A: abrir OS (numero, idempotencia, modo direto sem autorizacao)
-- =============================================================================
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000002a1","role":"authenticated","email":"f2.dono.a@teste.invalid"}', true);

-- OS 1: com orcamento, veiculo conhecido, mecanico A
select set_config('teste.os1', (select os_id::text from public.abrir_os(
  p_chave_idempotencia => '11111111-1111-4111-8111-111111111111',
  p_veiculo_id => current_setting('teste.veiculo_a')::uuid,
  p_km => 351000, p_sintoma_relatado => 'Luz de injecao acesa',
  p_mecanico_id => '00000000-0000-4000-8000-0000000002a2')), true);

do $$
declare r record;
begin
  -- reenvio: mesma OS, nada novo
  select * into r from public.abrir_os(
    p_chave_idempotencia => '11111111-1111-4111-8111-111111111111',
    p_veiculo_id => current_setting('teste.veiculo_a')::uuid, p_km => 351000);
  assert r.os_id = current_setting('teste.os1')::uuid and r.ja_existia and r.numero = 1,
    'reenvio de abrir_os deveria devolver a mesma OS (numero 1)';
  assert (select count(*) from public.ordens_servico) = 1, 'reenvio de abrir_os duplicou a OS';

  assert (select status from public.ordens_servico where id = r.os_id) = 'aguardando_orcamento',
    'OS com orcamento deveria nascer aguardando_orcamento';
  assert (select modo from public.ordens_servico where id = r.os_id) = 'com_orcamento',
    'modo deveria vir do padrao do cliente (exige_orcamento)';
  assert (select count(*) from public.os_historico where os_id = r.os_id and evento = 'criada') = 1,
    'historico de criacao nao gravado';

  -- modo direto sem autorizacao: bloqueado, e NAO gasta numero
  assert public.zz_erro($q$ select public.abrir_os(
      p_chave_idempotencia => '22222222-2222-4222-8222-222222222222',
      p_placa => 'qwe-1r23', p_cliente_nome => 'Frota Direta', p_modo => 'direto') $q$)
    = 'autorizacao_obrigatoria', 'modo direto abriu sem autorizacao';
  assert not exists (select 1 from public.veiculos where placa = 'QWE1R23'),
    'falha na abertura deixou veiculo orfao';

  -- placa ja cadastrada pelo caminho de "placa nova"
  assert public.zz_erro($q$ select public.abrir_os(
      p_chave_idempotencia => '33333333-3333-4333-8333-333333333333',
      p_placa => 'ABC-1D23', p_cliente_nome => 'Outro') $q$)
    = 'placa_ja_cadastrada', 'placa repetida deveria dar placa_ja_cadastrada';

  -- dono nao insere OS direto na tabela
  assert public.zz_estado($q$ insert into public.ordens_servico (numero, chave_idempotencia, cliente_id, veiculo_id, modo, status)
      values (99, gen_random_uuid(), current_setting('teste.cliente_a')::uuid, current_setting('teste.veiculo_a')::uuid,
              'com_orcamento', 'aguardando_orcamento') $q$) = '42501', 'INSERT direto em ordens_servico permitido';
  -- nem muda status por UPDATE direto
  assert public.zz_estado($q$ update public.ordens_servico set status = 'entregue'
      where id = current_setting('teste.os1')::uuid $q$) = '42501', 'UPDATE direto de status permitido';
end $$;

-- OS 2: placa nova + cliente novo, modo direto COM autorizacao, sem mecanico
select set_config('teste.os2', (select os_id::text from public.abrir_os(
  p_chave_idempotencia => '22222222-2222-4222-8222-222222222222',
  p_placa => 'qwe-1r23', p_cliente_nome => 'Frota Direta', p_cliente_telefone => '(11) 97777-6666',
  p_cliente_modo_padrao => 'servico_direto', p_veiculo_tipo => 'carreta',
  p_km => 120000, p_autorizado_por_nome => 'Carlos motorista', p_autorizado_por_telefone => '(11) 96666-5555')), true);

-- OS 3 e OS 4: com orcamento, para cancelar / recusar / trocar modo
select set_config('teste.os3', (select os_id::text from public.abrir_os(
  p_chave_idempotencia => '44444444-4444-4444-8444-444444444444',
  p_veiculo_id => current_setting('teste.veiculo_a')::uuid)), true);
select set_config('teste.os4', (select os_id::text from public.abrir_os(
  p_chave_idempotencia => '55555555-5555-4555-8555-555555555555',
  p_veiculo_id => current_setting('teste.veiculo_a')::uuid)), true);

do $$
begin
  assert (select array_agg(numero order by numero) from public.ordens_servico) = array[1, 2, 3, 4],
    'numeros deveriam ser 1,2,3,4 (sem repeticao e sem buraco)';
  assert (select status from public.ordens_servico where id = current_setting('teste.os2')::uuid) = 'em_andamento',
    'OS direta autorizada deveria nascer em_andamento';
  assert (select autorizado_em from public.ordens_servico where id = current_setting('teste.os2')::uuid) is not null,
    'autorizado_em nao gravado';
  assert (select autorizado_por_telefone from public.os_comercial where os_id = current_setting('teste.os2')::uuid) = '11966665555',
    'telefone de quem autorizou nao normalizado/gravado';
  assert (select autorizacao_registrada_por from public.os_comercial where os_id = current_setting('teste.os2')::uuid)
    = '00000000-0000-4000-8000-0000000002a1', 'quem registrou a autorizacao nao gravado';
  assert (select tipo from public.veiculos where placa = 'QWE1R23') = 'carreta', 'veiculo novo nao criado';
end $$;

-- Check constraint: nem o postgres consegue deixar OS direta sem autorizacao
reset role;
do $$
declare ok boolean := false;
begin
  begin
    update public.ordens_servico set autorizado_em = null where id = current_setting('teste.os2')::uuid;
  exception when check_violation then ok := true;
  end;
  assert ok, 'check constraint deixou OS direta em andamento sem autorizacao';

  ok := false;
  begin
    update public.ordens_servico set numero = 1 where id = current_setting('teste.os2')::uuid;
  exception when unique_violation then ok := true;
  end;
  assert ok, 'numero repetido na mesma oficina foi aceito';
end $$;
set local role authenticated;

-- =============================================================================
-- 3) DONO A: itens, total no banco, orcamento, aprovacao
-- =============================================================================
do $$
declare
  os1 uuid := current_setting('teste.os1')::uuid;
  i1 uuid; i2 uuid; i3 uuid; t record;
begin
  i1 := public.adicionar_item_os('aaaaaaaa-0000-4000-8000-000000000001', os1, 'servico',
                                 p_servico_id => current_setting('teste.servico')::uuid);
  i2 := public.adicionar_item_os('aaaaaaaa-0000-4000-8000-000000000002', os1, 'peca',
                                 p_peca_id => current_setting('teste.peca')::uuid, p_quantidade => 2);
  i3 := public.adicionar_item_os('aaaaaaaa-0000-4000-8000-000000000003', os1, 'servico',
                                 p_descricao => 'Diagnostico eletronico');  -- avulso, sem preco
  perform set_config('teste.item_avulso', i3::text, true);

  -- reenvio do mesmo item
  assert public.adicionar_item_os('aaaaaaaa-0000-4000-8000-000000000002', os1, 'peca',
                                  p_peca_id => current_setting('teste.peca')::uuid, p_quantidade => 2) = i2,
    'reenvio de adicionar_item_os deveria devolver o mesmo item';
  assert (select count(*) from public.os_itens where os_id = os1) = 3, 'reenvio de item duplicou';

  select * into t from public.vw_os_totais where os_id = os1;
  assert t.total_centavos = 61000, 'total errado (esperado 25000 + 2x18000 = 61000), veio ' || t.total_centavos;
  assert t.itens_sem_preco = 1, 'deveria haver 1 item sem preco';
  assert t.custo_total_centavos = 18000, 'custo total do dono errado (2x9000)';
  assert (select subtotal_centavos from public.vw_os_itens where id = i2) = 36000, 'subtotal do item errado';

  -- aprovar com item sem preco: bloqueado
  assert public.zz_erro(format($q$ select public.registrar_resposta_orcamento(%L, 'aguardando_orcamento', true, 'telefone') $q$, os1))
    = 'os_itens_sem_preco', 'aprovou orcamento com item sem preco';
  -- canal 'link' e da Fase 6
  assert public.zz_erro(format($q$ select public.registrar_resposta_orcamento(%L, 'aguardando_orcamento', true, 'link') $q$, os1))
    = 'canal_invalido', 'aprovacao manual aceitou canal link';

  insert into public.os_itens_precos (item_id, preco_unitario_centavos) values (i3, 5000);
  assert (select total_centavos from public.vw_os_totais where os_id = os1) = 66000, 'total nao atualizou com o preco novo';

  -- transicoes proibidas
  assert public.zz_erro(format($q$ select public.mudar_status_os(%L, 'aguardando_orcamento', 'em_andamento') $q$, os1))
    = 'transicao_invalida', 'pulou da espera do orcamento para em_andamento';
  assert public.zz_erro(format($q$ select public.mudar_status_os(%L, 'aguardando_orcamento', 'aprovada') $q$, os1))
    = 'transicao_invalida', 'aprovou por mudar_status (deveria exigir registrar_resposta_orcamento)';
  assert public.zz_erro(format($q$ select public.mudar_status_os(%L, 'aguardando_orcamento', 'pronta') $q$, os1))
    = 'transicao_invalida', 'pulou para pronta';
  -- status de origem errado
  -- (a tela achava que a OS estava aprovada, mas ainda esta aguardando_orcamento)
  assert public.zz_erro(format($q$ select public.mudar_status_os(%L, 'aprovada', 'em_andamento') $q$, os1))
    = 'status_mudou', 'nao conferiu o status de origem';

  perform public.mudar_status_os(os1, 'aguardando_orcamento', 'orcamento_enviado');
  perform public.mudar_status_os(os1, 'aguardando_orcamento', 'orcamento_enviado');  -- reenvio: sem erro
  assert (select count(*) from public.os_historico where os_id = os1 and para_status = 'orcamento_enviado') = 1,
    'reenvio de mudar_status gravou historico duplicado';

  perform public.registrar_resposta_orcamento(os1, 'orcamento_enviado', true, 'whatsapp', 'Ricardo, gerente');
  perform public.registrar_resposta_orcamento(os1, 'orcamento_enviado', true, 'whatsapp', 'Ricardo, gerente');  -- reenvio
  assert (select status from public.ordens_servico where id = os1) = 'aprovada', 'OS nao ficou aprovada';
  assert (select valor_aprovado_centavos from public.os_comercial where os_id = os1) = 66000, 'valor aprovado nao gravado';
  assert (select orcamento_aprovacao_canal from public.os_comercial where os_id = os1) = 'whatsapp', 'canal nao gravado';

  -- desfazer aprovacao e aprovar de novo
  perform public.mudar_status_os(os1, 'aprovada', 'orcamento_enviado');
  assert (select valor_aprovado_centavos from public.os_comercial where os_id = os1) is null, 'desfazer nao limpou a aprovacao';
  assert (select orcamento_aprovado_em from public.ordens_servico where id = os1) is null, 'desfazer nao limpou aprovado_em';
  perform public.registrar_resposta_orcamento(os1, 'orcamento_enviado', true, 'telefone');

  -- dono tambem pode ser o mecanico da OS
  perform public.atribuir_mecanico(current_setting('teste.os4')::uuid, '00000000-0000-4000-8000-0000000002a1');
  assert (select mecanico_id from public.ordens_servico where id = current_setting('teste.os4')::uuid)
    = '00000000-0000-4000-8000-0000000002a1', 'dono nao pode ser atribuido como mecanico';
  assert exists (select 1 from public.os_historico where os_id = current_setting('teste.os4')::uuid and evento = 'mecanico'),
    'troca de mecanico nao foi para o historico';

  -- liberar "ver todas" para o mecanico A2
  perform public.atualizar_membro('00000000-0000-4000-8000-0000000002a4', p_ve_todas_os => true);
end $$;

-- =============================================================================
-- 4) MECANICO A (atribuido a OS 1): nenhum valor, nenhum contato
-- =============================================================================
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000002a2","role":"authenticated","email":"f2.mec.a@teste.invalid"}', true);

do $$
declare
  os1 uuid := current_setting('teste.os1')::uuid;
  os2 uuid := current_setting('teste.os2')::uuid;
  r   record;
begin
  -- so as OS dele
  assert (select count(*) from public.ordens_servico) = 1, 'mecanico ve OS que nao sao dele';
  assert (select count(*) from public.vw_os) = 1, 'mecanico ve OS que nao sao dele pela view';
  assert (select count(*) from public.os_itens) = 3, 'mecanico deveria ver os 3 itens da OS dele';
  assert not exists (select 1 from public.os_historico where os_id = os2), 'mecanico ve historico de OS alheia';

  -- NENHUM valor
  assert (select count(*) from public.os_itens_precos) = 0, 'MECANICO VE PRECO DE ITEM';
  assert (select count(*) from public.os_itens_custos) = 0, 'MECANICO VE CUSTO DE ITEM';
  assert (select count(*) from public.os_comercial) = 0, 'MECANICO VE DADOS COMERCIAIS';
  assert (select count(*) from public.vw_os_totais) = 0, 'MECANICO VE TOTAL PELA vw_os_totais';
  assert not exists (select 1 from public.vw_os_itens
                      where preco_unitario_centavos is not null or subtotal_centavos is not null
                         or custo_unitario_centavos is not null), 'MECANICO VE VALOR PELA vw_os_itens';
  select * into r from public.vw_os where id = os1;
  assert r.total_centavos is null and r.total_servicos_centavos is null and r.total_pecas_centavos is null
     and r.custo_total_centavos is null and r.itens_sem_preco is null and r.qtd_itens is null
     and r.valor_aprovado_centavos is null and r.forma_pagamento is null and r.pago_em is null,
    'MECANICO VE VALOR/PAGAMENTO PELA vw_os';
  -- nem contato do cliente nem quem aprovou/autorizou; ve o nome do cliente
  assert r.cliente_nome = 'Transportadora A', 'mecanico deveria ver o nome do cliente';
  assert r.cliente_telefone is null and r.orcamento_aprovado_por_nome is null and r.autorizado_por_nome is null
     and r.autorizado_por_telefone is null and r.orcamento_aprovacao_canal is null,
    'MECANICO VE TELEFONE DO CLIENTE OU QUEM AUTORIZOU';
  assert (select count(*) from public.clientes) = 0, 'mecanico le a tabela clientes';
  assert r.mecanico_nome = 'Mecanico A', 'nome do mecanico nao aparece na view';

  -- placa: nome sim, telefone nao
  select * into r from public.dados_da_placa('abc-1d23');
  assert r.cliente_nome = 'Transportadora A' and r.cliente_telefone is null,
    'dados_da_placa para o mecanico: nome sim, telefone nao';

  -- RPCs nao vazam valor nem deixam gravar valor
  assert public.zz_estado($q$ select public.adicionar_item_os(gen_random_uuid(), current_setting('teste.os1')::uuid,
      'servico', p_descricao => 'X', p_preco_unitario_centavos => 1) $q$) in ('42501', 'P0001'),
    'mecanico gravou preco';
  assert public.zz_erro(format($q$ select public.adicionar_item_os(gen_random_uuid(), %L, 'servico', p_descricao => 'X') $q$, os1))
    = 'os_nao_esta_em_andamento', 'mecanico lancou item fora de em_andamento';

  -- proibido para o mecanico
  assert public.zz_estado(format($q$ select public.mudar_status_os(%L, 'aprovada', 'cancelada', 'teste') $q$, os1))
    = '42501', 'mecanico cancelou OS';
  assert public.zz_estado(format($q$ select public.registrar_resposta_orcamento(%L, 'aprovada', true, 'telefone') $q$, os1))
    = '42501', 'mecanico registrou resposta do orcamento';
  assert public.zz_estado(format($q$ select public.atribuir_mecanico(%L, null) $q$, os1))
    = '42501', 'mecanico trocou o mecanico';
  assert public.zz_estado($q$ select public.abrir_os(gen_random_uuid(), p_veiculo_id => current_setting('teste.veiculo_a')::uuid) $q$)
    = '42501', 'mecanico abriu OS';
  assert public.zz_erro(format($q$ select public.mudar_status_os(%L, 'em_andamento', 'pronta') $q$, os2))
    = 'os_nao_encontrada', 'mecanico mexeu em OS que nao e dele';
  assert public.zz_estado(format($q$ select public.entregar_os(%L, 'causa', 'solucao', 'pix', true) $q$, os1))
    = '42501', 'mecanico entregou OS';

  -- update direto na OS: sem efeito
  update public.ordens_servico set causa_encontrada = 'mudou' where id = os1;
  assert (select causa_encontrada from public.ordens_servico where id = os1) is null, 'mecanico editou a OS direto';

  -- Comecar (CEO: pode), desfazer, comecar de novo
  perform public.mudar_status_os(os1, 'aprovada', 'em_andamento');
  perform public.mudar_status_os(os1, 'em_andamento', 'aprovada');
  perform public.mudar_status_os(os1, 'aprovada', 'em_andamento');
  assert exists (select 1 from public.os_historico where os_id = os1 and evento = 'desfazer'), 'desfazer nao registrado';

  -- Fase 3: lanca servico do catalogo (preco vem sozinho, ele nao ve) e servico avulso direto
  perform set_config('teste.item_mec', public.adicionar_item_os('bbbbbbbb-0000-4000-8000-000000000001', os1, 'servico',
                     p_servico_id => current_setting('teste.servico')::uuid)::text, true);
  insert into public.os_itens (os_id, tipo, descricao, lancado_por)
  values (os1, 'servico', 'Limpeza de bico', '00000000-0000-4000-8000-0000000002a2');
  assert public.zz_estado(format($q$ insert into public.os_itens (os_id, tipo, descricao, lancado_por)
      values (%L, 'peca', 'Peca avulsa', '00000000-0000-4000-8000-0000000002a2') $q$, os1)) = '42501',
    'mecanico lancou peca avulsa (deveria ser do catalogo, pendente)';
  assert public.zz_estado(format($q$ select public.adicionar_item_os(gen_random_uuid(), %L, 'peca', p_descricao => 'Avulsa') $q$, os1))
    = 'P0001', 'mecanico lancou peca avulsa pela RPC';

  -- Pronta com causa e solucao (so isso)
  perform public.marcar_pronta(os1, 'Sensor de pressao com defeito', 'Troca do sensor');
  assert (select status from public.ordens_servico where id = os1) = 'pronta', 'mecanico nao marcou pronta';
  assert (select causa_encontrada from public.ordens_servico where id = os1) = 'Sensor de pressao com defeito',
    'causa da folha de pronta nao gravada';
end $$;

-- =============================================================================
-- 5) MECANICO A2 com "ve todas": ve, mas nao mexe no que nao e dele
-- =============================================================================
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000002a4","role":"authenticated","email":"f2.mec2.a@teste.invalid"}', true);
do $$
begin
  assert (select count(*) from public.ordens_servico) = 4, 'mecanico com ve_todas_os deveria ver as 4 OS';
  assert (select count(*) from public.vw_os_totais) = 0, 'MECANICO (ve todas) VE TOTAL';
  assert not exists (select 1 from public.vw_os where total_centavos is not null or autorizado_por_nome is not null
                      or cliente_telefone is not null), 'MECANICO (ve todas) VE VALOR/CONTATO';
  assert public.zz_estado(format($q$ select public.mudar_status_os(%L, 'em_andamento', 'pronta') $q$,
                                 current_setting('teste.os2'))) = '42501',
    'mecanico mudou status de OS que nao e dele';
end $$;

-- =============================================================================
-- 6) ATENDENTE A: ve preco e total, nao ve custo; registra pagamento
-- =============================================================================
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000002a3","role":"authenticated","email":"f2.atd.a@teste.invalid"}', true);
do $$
declare
  os1 uuid := current_setting('teste.os1')::uuid;
  i   uuid;
begin
  assert (select count(*) from public.os_itens_custos) = 0, 'ATENDENTE VE CUSTO';
  assert (select custo_total_centavos from public.vw_os_totais where os_id = os1) is null, 'ATENDENTE VE CUSTO TOTAL';
  assert not exists (select 1 from public.vw_os_itens where custo_unitario_centavos is not null), 'ATENDENTE VE CUSTO PELA VIEW';
  -- 66000 + servico do catalogo lancado pelo mecanico (25000) + avulso sem preco
  assert (select total_centavos from public.vw_os_totais where os_id = os1) = 91000, 'atendente: total errado';
  assert (select itens_sem_preco from public.vw_os_totais where os_id = os1) = 1, 'item avulso do mecanico deveria estar sem preco';
  assert (select cliente_telefone from public.vw_os where id = os1) = '11988887777', 'atendente deveria ver o telefone';

  assert public.zz_estado(format($q$ select public.adicionar_item_os(gen_random_uuid(), %L, 'peca',
      p_peca_id => current_setting('teste.peca')::uuid, p_custo_unitario_centavos => 1) $q$, os1)) = '42501',
    'atendente gravou custo';
  i := public.adicionar_item_os('cccccccc-0000-4000-8000-000000000001', os1, 'peca', p_peca_id => current_setting('teste.peca')::uuid);
  perform set_config('teste.item_atd', i::text, true);
  assert public.zz_estado($q$ insert into public.os_itens_custos (item_id, custo_unitario_centavos)
      values (current_setting('teste.item_atd')::uuid, 1) $q$) = '42501', 'atendente inseriu custo direto';

  -- preco do item avulso do mecanico
  insert into public.os_itens_precos (item_id, preco_unitario_centavos)
  select id, 4000 from public.os_itens where os_id = os1 and descricao = 'Limpeza de bico';

  -- entregar: validacoes
  assert public.zz_erro(format($q$ select public.entregar_os(%L, '', 'x troca', 'pix', true) $q$, os1))
    = 'causa_obrigatoria', 'entregou sem causa';
  assert public.zz_erro(format($q$ select public.entregar_os(%L, 'causa ok', 'solucao ok', null, true) $q$, os1))
    = 'forma_pagamento_obrigatoria', 'entregou sem forma de pagamento';
  assert public.zz_erro(format($q$ select public.mudar_status_os(%L, 'pronta', 'entregue') $q$, os1))
    = 'transicao_invalida', 'entregou por mudar_status';

  perform public.entregar_os(os1, 'Sensor de pressao com defeito', 'Troca do sensor', 'faturado', false, '100/1');
  perform public.entregar_os(os1, 'Sensor de pressao com defeito', 'Troca do sensor', 'faturado', false, '100/1');  -- reenvio
  assert (select status from public.ordens_servico where id = os1) = 'entregue', 'OS nao foi entregue';
  assert (select km_atual from public.veiculos where id = current_setting('teste.veiculo_a')::uuid) = 351000,
    'entrega nao atualizou o km_atual do veiculo';
  assert (select pago_em from public.os_comercial where os_id = os1) is null, 'faturado deveria ficar a receber';

  -- OS fechada: travada
  assert public.zz_erro(format($q$ select public.adicionar_item_os(gen_random_uuid(), %L, 'servico', p_descricao => 'X') $q$, os1))
    = 'os_fechada', 'adicionou item em OS entregue';
  assert public.zz_erro($q$ update public.os_itens_precos set preco_unitario_centavos = 1
      where item_id = current_setting('teste.item_atd')::uuid $q$) = 'os_fechada', 'mudou preco em OS entregue';
  assert public.zz_erro($q$ delete from public.os_itens where id = current_setting('teste.item_atd')::uuid $q$)
    = 'os_fechada', 'apagou item de OS entregue';
  assert public.zz_erro(format($q$ update public.ordens_servico set causa_encontrada = 'outra' where id = %L $q$, os1))
    = 'os_fechada', 'editou causa de OS entregue';
  assert public.zz_erro(format($q$ select public.mudar_status_os(%L, 'entregue', 'cancelada', 'teste') $q$, os1))
    = 'os_fechada', 'cancelou OS entregue';

  -- pagamento pelo atendente (CEO: pode)
  perform public.registrar_pagamento(os1, 'boleto');
  assert (select pago_em from public.os_comercial where os_id = os1) is not null, 'pagamento nao registrado';
  assert exists (select 1 from public.os_historico where os_id = os1 and evento = 'pagamento'), 'pagamento fora do historico';
end $$;

-- =============================================================================
-- 7) DONO A: cancelamento, recusa, troca de modo, custo copiado do catalogo
-- =============================================================================
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000002a1","role":"authenticated","email":"f2.dono.a@teste.invalid"}', true);
do $$
declare
  os2 uuid := current_setting('teste.os2')::uuid;
  os3 uuid := current_setting('teste.os3')::uuid;
  os4 uuid := current_setting('teste.os4')::uuid;
begin
  assert (select custo_unitario_centavos from public.os_itens_custos where item_id = current_setting('teste.item_atd')::uuid) = 9000,
    'custo do catalogo deveria ser copiado no item lancado pelo atendente';
  assert (select preco_unitario_centavos from public.os_itens_precos where item_id = current_setting('teste.item_mec')::uuid) = 25000,
    'preco do catalogo deveria ser copiado no item lancado pelo mecanico';

  -- cancelar exige motivo
  assert public.zz_erro(format($q$ select public.mudar_status_os(%L, 'aguardando_orcamento', 'cancelada') $q$, os3))
    = 'motivo_obrigatorio', 'cancelou sem motivo';
  perform public.mudar_status_os(os3, 'aguardando_orcamento', 'cancelada', 'Cliente desistiu');
  assert (select cancelado_por from public.ordens_servico where id = os3) = '00000000-0000-4000-8000-0000000002a1',
    'cancelado_por nao gravado';
  assert public.zz_erro(format($q$ select public.atribuir_mecanico(%L, null) $q$, os3)) = 'os_fechada',
    'mexeu em OS cancelada';

  -- recusa sem mudar status (fica em aguardando_orcamento) => evento no historico
  perform public.adicionar_item_os('dddddddd-0000-4000-8000-000000000001', os4, 'servico',
                                   p_servico_id => current_setting('teste.servico')::uuid);
  perform public.registrar_resposta_orcamento(os4, 'aguardando_orcamento', false, 'telefone', p_motivo => 'Achou caro');
  assert (select status from public.ordens_servico where id = os4) = 'aguardando_orcamento', 'recusa mudou o status';
  assert exists (select 1 from public.os_historico where os_id = os4 and evento = 'recusa'), 'recusa fora do historico';

  -- troca de modo: direto exige autorizacao
  assert public.zz_erro(format($q$ select public.trocar_modo_os(%L, 'direto') $q$, os4))
    = 'autorizacao_obrigatoria', 'trocou para direto sem autorizacao';
  perform public.trocar_modo_os(os4, 'direto', 'Ricardo', '11955554444');
  assert (select status from public.ordens_servico where id = os4) = 'em_andamento', 'troca para direto deveria comecar o servico';
  -- direta com itens nao volta para orcamento
  assert public.zz_erro(format($q$ select public.trocar_modo_os(%L, 'com_orcamento') $q$, os4))
    = 'troca_modo_nao_permitida', 'voltou para orcamento com servico ja lancado';
  -- direta nao "desfaz" para aprovada
  assert public.zz_erro(format($q$ select public.mudar_status_os(%L, 'em_andamento', 'aprovada') $q$, os2))
    = 'transicao_invalida', 'OS direta foi para aprovada';
  -- direta sem itens volta para orcamento
  perform public.trocar_modo_os(os2, 'com_orcamento');
  assert (select status from public.ordens_servico where id = os2) = 'aguardando_orcamento', 'direta sem itens nao voltou para orcamento';
  assert (select autorizado_por_nome from public.os_comercial where os_id = os2) is null, 'autorizacao nao apagada na troca';

  -- autopreenchimento pela placa (dono)
  assert (select ultimo_km from public.dados_da_placa('ABC1D23')) = 351000, 'dados_da_placa: ultimo km errado';
  assert (select ultima_os_numero from public.dados_da_placa('ABC1D23')) = 1, 'dados_da_placa: ultima OS errada';
  assert (select ultimo_servico from public.dados_da_placa('ABC1D23')) = 'Troca do sensor', 'dados_da_placa: ultimo servico errado';
  assert (select os_aberta_numero from public.dados_da_placa('ABC1D23')) = 4, 'dados_da_placa: OS aberta errada';
  assert (select cliente_telefone from public.dados_da_placa('ABC1D23')) = '11988887777', 'dados_da_placa: telefone para o dono';
  assert not exists (select 1 from public.dados_da_placa('ZZZ9Z99')), 'placa inexistente deveria voltar 0 linhas';

  -- "mais usados" do catalogo
  assert (select usos from public.vw_catalogo_mais_usados where catalogo_id = current_setting('teste.servico')::uuid) = 3,
    'contagem de mais usados errada';
end $$;

-- =============================================================================
-- 8) DONO B: nao ve nem mexe em nada da A
-- =============================================================================
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000002b1","role":"authenticated","email":"f2.dono.b@teste.invalid"}', true);
select set_config('teste.oficina_b', public.criar_oficina('Oficina B F2', 'Dono B', private.versao_termos_vigente())::text, true);

do $$
declare
  os1 uuid := current_setting('teste.os1')::uuid;
  os4 uuid := current_setting('teste.os4')::uuid;
  n int;
  r record;
begin
  -- a mesma placa e a mesma chave de idempotencia em outra oficina: OS nova, numero 1
  select * into r from public.abrir_os(
    p_chave_idempotencia => '11111111-1111-4111-8111-111111111111',
    p_placa => 'ABC1D23', p_cliente_nome => 'Cliente B');
  assert r.numero = 1 and not r.ja_existia, 'oficina B deveria comecar no numero 1 (contador por oficina)';
  perform set_config('teste.os_b', r.os_id::text, true);

  assert (select count(*) from public.ordens_servico) = 1, 'DONO B VE OS DA A';
  assert (select count(*) from public.vw_os) = 1, 'DONO B VE OS DA A PELA VIEW';
  assert (select count(*) from public.os_itens) = 0, 'DONO B VE ITENS DA A';
  assert (select count(*) from public.os_itens_precos) = 0, 'DONO B VE PRECOS DA A';
  assert (select count(*) from public.os_itens_custos) = 0, 'DONO B VE CUSTOS DA A';
  assert (select count(*) from public.os_comercial) = 1, 'DONO B VE COMERCIAL DA A';
  assert (select count(*) from public.os_historico) = 1, 'DONO B VE HISTORICO DA A';
  assert (select count(*) from public.vw_os_totais) = 1, 'DONO B VE TOTAIS DA A';
  assert (select count(*) from public.vw_catalogo_mais_usados) = 0, 'DONO B VE USO DO CATALOGO DA A';
  assert (select ultima_os_id from public.dados_da_placa('ABC1D23')) is null, 'dados_da_placa vazou OS da A';

  assert public.zz_erro(format($q$ select public.mudar_status_os(%L, 'em_andamento', 'pronta') $q$, os4))
    = 'os_nao_encontrada', 'dono B mudou status de OS da A';
  assert public.zz_erro(format($q$ select public.adicionar_item_os(gen_random_uuid(), %L, 'servico', p_descricao => 'X') $q$, os4))
    = 'os_nao_encontrada', 'dono B lancou item em OS da A';
  assert public.zz_erro(format($q$ select public.registrar_pagamento(%L, 'pix') $q$, os1))
    = 'os_nao_encontrada', 'dono B registrou pagamento na A';
  assert public.zz_erro($q$ select public.abrir_os(gen_random_uuid(), p_veiculo_id => current_setting('teste.veiculo_a')::uuid) $q$)
    = 'veiculo_nao_encontrado', 'dono B abriu OS com veiculo da A';
  assert public.zz_erro($q$ select public.abrir_os(gen_random_uuid(), p_placa => 'BBB1B11',
      p_cliente_id => current_setting('teste.cliente_a')::uuid) $q$)
    = 'cliente_nao_encontrado', 'dono B abriu OS com cliente da A';
  assert public.zz_erro(format($q$ select public.atribuir_mecanico(%L, '00000000-0000-4000-8000-0000000002a2') $q$,
                               current_setting('teste.os_b'))) = 'mecanico_invalido',
    'dono B atribuiu mecanico da A';
  assert public.zz_erro($q$ select public.adicionar_item_os(gen_random_uuid(), current_setting('teste.os_b')::uuid, 'servico',
      p_servico_id => current_setting('teste.servico')::uuid) $q$) = 'catalogo_item_nao_encontrado',
    'dono B usou servico do catalogo da A';

  -- escrita direta cruzada
  assert public.zz_estado(format($q$ insert into public.os_itens (os_id, tipo, descricao) values (%L, 'servico', 'X') $q$, os4))
    in ('42501', '23503'), 'dono B inseriu item em OS da A';
  update public.os_itens_precos set preco_unitario_centavos = 1;
  get diagnostics n = row_count;
  assert n = 0, 'dono B alterou preco da A';
  update public.ordens_servico set sintoma_relatado = 'hack' where id = os4;
  get diagnostics n = row_count;
  assert n = 0, 'dono B alterou OS da A';
  delete from public.os_itens where os_id = os4;
  get diagnostics n = row_count;
  assert n = 0, 'dono B apagou item da A';
end $$;

-- =============================================================================
-- 9) Desativado e anon
-- =============================================================================
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000002a1","role":"authenticated","email":"f2.dono.a@teste.invalid"}', true);
select public.atualizar_membro('00000000-0000-4000-8000-0000000002a2', p_ativo => false);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000002a2","role":"authenticated","email":"f2.mec.a@teste.invalid"}', true);
do $$
begin
  assert (select count(*) from public.ordens_servico) = 0, 'mecanico desativado ve OS';
  assert (select count(*) from public.os_itens) = 0, 'mecanico desativado ve itens';
  assert public.zz_estado(format($q$ select public.marcar_pronta(%L) $q$, current_setting('teste.os1'))) = '42501',
    'mecanico desativado chamou RPC';
end $$;

reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $$
begin
  assert public.zz_estado('select 1 from public.ordens_servico') = '42501', 'ANON LEU OS';
  assert public.zz_estado('select 1 from public.vw_os') = '42501', 'ANON LEU vw_os';
  assert public.zz_estado('select 1 from public.os_comercial') = '42501', 'ANON LEU os_comercial';
  assert public.zz_estado($q$ select public.abrir_os(gen_random_uuid()) $q$) = '42501', 'ANON CHAMOU abrir_os';
  assert public.zz_estado($q$ select public.dados_da_placa('ABC1D23') $q$) = '42501', 'ANON CHAMOU dados_da_placa';
end $$;

-- =============================================================================
reset role;
select 'FASE 2 OK: todos os testes da OS passaram' as resultado;

rollback;
