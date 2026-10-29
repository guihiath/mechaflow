-- =============================================================================
-- MechaFlow - Fase 1 - Teste de isolamento (criterio de pronto)
--
-- O que prova:
--   * duas oficinas (A e B) nao veem nem alteram dados uma da outra;
--   * mecanico nao ve preco nem custo (nem pela tabela, nem pela view);
--   * atendente ve preco de venda, mas nao custo;
--   * convite: uso unico, expira, so dono cria;
--   * usuario sem oficina, desativado ou sem login (anon) nao ve nada.
--
-- Como rodar: SQL Editor do Supabase STAGING (usuario postgres), colar tudo e
-- executar. Ou: psql "<connection string staging>" -v ON_ERROR_STOP=1 -f fase1_isolamento.sql
--
-- Resultado esperado: a ultima consulta mostra
--   'FASE 1 OK: todos os testes de isolamento passaram'.
-- Se algo falhar, o script para com a mensagem do teste que quebrou.
-- Tudo roda dentro de uma transacao e termina em ROLLBACK: nada fica gravado.
--
-- Simulacao de usuario: set local role authenticated + request.jwt.claims
-- (e o mesmo que o PostgREST faz a cada requisicao).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0) Usuarios de teste em auth.users (como postgres)
--    a1 = dono A | a2 = mecanico A | a3 = atendente A | b1 = dono B | x1 = sem oficina
-- -----------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'dono.a@teste.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'mecanico.a@teste.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-4000-8000-0000000000a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'atendente.a@teste.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'dono.b@teste.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'sem.oficina@teste.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

-- =============================================================================
-- 1) DONO A: cria oficina A, cadastros, catalogo com preco e custo, convites
-- =============================================================================
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated","email":"dono.a@teste.invalid"}', true);
set local role authenticated;

select set_config('teste.oficina_a',
  public.criar_oficina('Oficina A Teste', 'Dono A', private.versao_termos_vigente(), true, '(11) 3333-4444')::text, true);

with c as (
  insert into public.clientes (nome, telefone, documento)
  values ('Transportadora A', '(11) 98888-7777', '12.345.678/0001-90')
  returning id
) select set_config('teste.cliente_a', (select id::text from c), true);

with v as (
  insert into public.veiculos (cliente_id, placa, marca, modelo, ano_modelo, km_atual)
  values (current_setting('teste.cliente_a')::uuid, 'abc-1d23', 'Volvo', 'FH 540', 2022, 350000)
  returning id
) select set_config('teste.veiculo_a', (select id::text from v), true);

with s as (
  insert into public.catalogo_servicos (nome) values ('Troca de oleo do motor') returning id
) select set_config('teste.servico_a', (select id::text from s), true);
insert into public.catalogo_servicos_precos (servico_id, preco_padrao_centavos)
values (current_setting('teste.servico_a')::uuid, 25000);

with p as (
  insert into public.catalogo_pecas (nome, codigo, unidade) values ('Filtro de oleo', 'FO-123', 'un') returning id
) select set_config('teste.peca_a', (select id::text from p), true);
insert into public.catalogo_pecas_precos (peca_id, preco_venda_centavos)
values (current_setting('teste.peca_a')::uuid, 18000);
insert into public.catalogo_pecas_custos (peca_id, custo_centavos)
values (current_setting('teste.peca_a')::uuid, 9000);

select set_config('teste.token_mec', (select token from public.criar_convite('mecanico', 'Mecanico A')), true);
select set_config('teste.token_atd', (select token from public.criar_convite('atendente', 'Atendente A')), true);
select set_config('teste.token_exp', (select token from public.criar_convite('mecanico', 'Vai expirar')), true);

do $$
begin
  assert (select placa from public.veiculos where id = current_setting('teste.veiculo_a')::uuid) = 'ABC1D23',
    'placa nao foi normalizada para ABC1D23';
  assert (select telefone from public.clientes where id = current_setting('teste.cliente_a')::uuid) = '11988887777',
    'telefone nao foi normalizado';
  assert (select pendente_precificacao from public.catalogo_pecas where id = current_setting('teste.peca_a')::uuid) = false,
    'peca com preco deveria deixar de ser pendente';
  assert (select custo_centavos from public.vw_catalogo_pecas where id = current_setting('teste.peca_a')::uuid) = 9000,
    'dono deveria ver o custo na view';
  assert (select papel from public.meu_contexto()) = 'dono', 'meu_contexto deveria dizer dono';
  assert (select termos_aceitos from public.meu_contexto()), 'aceite dos termos nao foi gravado';
  assert (select count(*) from public.convites) = 3, 'dono A deveria ver seus 3 convites';
end $$;

-- Placa invalida e placa duplicada na mesma oficina
do $$
declare ok boolean := false;
begin
  begin
    insert into public.veiculos (cliente_id, placa) values (current_setting('teste.cliente_a')::uuid, 'AB12345');
  exception when check_violation then ok := true;
  end;
  assert ok, 'placa invalida AB12345 foi aceita';

  ok := false;
  begin
    insert into public.veiculos (cliente_id, placa) values (current_setting('teste.cliente_a')::uuid, 'ABC 1D23');
  exception when unique_violation then ok := true;
  end;
  assert ok, 'placa duplicada na mesma oficina foi aceita';
end $$;

-- Placa formato antigo e valida
insert into public.veiculos (cliente_id, placa, tipo)
values (current_setting('teste.cliente_a')::uuid, 'xyz-9876', 'carreta');

-- =============================================================================
-- 2) DONO B: cria oficina B com a MESMA placa (permitido: unica por oficina)
-- =============================================================================
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated","email":"dono.b@teste.invalid"}', true);

select set_config('teste.oficina_b',
  public.criar_oficina('Oficina B Teste', 'Dono B', private.versao_termos_vigente())::text, true);

with c as (
  insert into public.clientes (nome) values ('Cliente B') returning id
) select set_config('teste.cliente_b', (select id::text from c), true);

with v as (
  insert into public.veiculos (cliente_id, placa) values (current_setting('teste.cliente_b')::uuid, 'ABC1D23') returning id
) select set_config('teste.veiculo_b', (select id::text from v), true);

with p as (
  insert into public.catalogo_pecas (nome) values ('Peca B') returning id
) select set_config('teste.peca_b', (select id::text from p), true);
insert into public.catalogo_pecas_precos (peca_id, preco_venda_centavos)
values (current_setting('teste.peca_b')::uuid, 5000);

select set_config('teste.convite_b', (select convite_id::text from public.criar_convite('mecanico')), true);

-- Dono B nao ve nada da A
do $$
declare n int;
begin
  assert (select count(*) from public.oficinas) = 1, 'dono B ve mais de uma oficina';
  assert (select count(*) from public.perfis) = 1, 'dono B ve perfis de outra oficina';
  assert (select count(*) from public.clientes) = 1, 'dono B ve clientes de outra oficina';
  assert (select count(*) from public.veiculos) = 1, 'dono B ve veiculos de outra oficina';
  assert (select count(*) from public.catalogo_servicos) = 0, 'dono B ve servicos de outra oficina';
  assert (select count(*) from public.catalogo_pecas) = 1, 'dono B ve pecas de outra oficina';
  assert (select count(*) from public.catalogo_pecas_custos) = 0, 'dono B ve custos de outra oficina';
  assert (select count(*) from public.convites) = 1, 'dono B ve convites de outra oficina';
  assert (select count(*) from public.termos_aceite) = 1, 'dono B ve termos de outra oficina';
  assert (select count(*) from public.vw_catalogo_pecas) = 1, 'dono B ve pecas de outra oficina pela view';
end $$;

-- =============================================================================
-- 3) Funcionarios aceitam convites
-- =============================================================================
-- Mecanico A
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated","email":"mecanico.a@teste.invalid"}', true);
do $$
begin
  assert (select situacao from public.ver_convite(current_setting('teste.token_mec'))) = 'valido',
    'convite do mecanico deveria estar valido';
  assert (select oficina_id from public.meu_contexto()) is null, 'antes do convite nao deveria ter oficina';
end $$;
select public.aceitar_convite(current_setting('teste.token_mec'), 'Mecanico A', private.versao_termos_vigente());

-- Atendente A
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a3","role":"authenticated","email":"atendente.a@teste.invalid"}', true);
select public.aceitar_convite(current_setting('teste.token_atd'), '', private.versao_termos_vigente());  -- usa nome sugerido

-- Usuario sem oficina tenta reusar convite, convite expirado e token inventado
reset role;
update public.convites
   set criado_em = now() - interval '5 days', expira_em = now() - interval '1 day'
 where token_hash = sha256(convert_to(current_setting('teste.token_exp'), 'UTF8'));

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000f1","role":"authenticated","email":"sem.oficina@teste.invalid"}', true);
set local role authenticated;

do $$
declare msg text;
begin
  begin
    perform public.aceitar_convite(current_setting('teste.token_mec'), 'Intruso', private.versao_termos_vigente());
  exception when raise_exception then msg := sqlerrm;
  end;
  assert msg = 'convite_usado', 'convite reutilizado! msg=' || coalesce(msg, '(nenhum erro)');

  msg := null;
  begin
    perform public.aceitar_convite(current_setting('teste.token_exp'), 'Intruso', private.versao_termos_vigente());
  exception when raise_exception then msg := sqlerrm;
  end;
  assert msg = 'convite_expirado', 'convite expirado aceito! msg=' || coalesce(msg, '(nenhum erro)');

  msg := null;
  begin
    perform public.aceitar_convite(repeat('a', 64), 'Intruso', private.versao_termos_vigente());
  exception when raise_exception then msg := sqlerrm;
  end;
  assert msg = 'convite_invalido', 'token inventado aceito! msg=' || coalesce(msg, '(nenhum erro)');

  assert (select situacao from public.ver_convite(current_setting('teste.token_exp'))) = 'expirado',
    'ver_convite deveria mostrar expirado';

  -- Usuario sem oficina nao ve nada
  assert (select count(*) from public.oficinas) = 0, 'sem oficina ve oficinas';
  assert (select count(*) from public.perfis) = 0, 'sem oficina ve perfis';
  assert (select count(*) from public.clientes) = 0, 'sem oficina ve clientes';
  assert (select count(*) from public.veiculos) = 0, 'sem oficina ve veiculos';
  assert (select count(*) from public.catalogo_pecas) = 0, 'sem oficina ve pecas';
  assert (select count(*) from public.convites) = 0, 'sem oficina ve convites';

  -- e nao consegue gravar
  msg := null;
  begin
    insert into public.clientes (nome) values ('Intruso');
  exception when insufficient_privilege or not_null_violation then msg := 'bloqueado';
  end;
  assert msg = 'bloqueado', 'usuario sem oficina inseriu cliente';
end $$;

-- =============================================================================
-- 4) DONO A tentando mexer na oficina B
-- =============================================================================
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated","email":"dono.a@teste.invalid"}', true);

do $$
declare
  n  int;
  ok boolean;
  oficina_b uuid := current_setting('teste.oficina_b')::uuid;
  cliente_b uuid := current_setting('teste.cliente_b')::uuid;
  peca_b    uuid := current_setting('teste.peca_b')::uuid;
begin
  -- leitura
  assert (select count(*) from public.oficinas) = 1, 'dono A ve mais de uma oficina';
  assert not exists (select 1 from public.oficinas where id = oficina_b), 'dono A ve a oficina B';
  assert not exists (select 1 from public.clientes where id = cliente_b), 'dono A ve cliente da B';
  assert not exists (select 1 from public.veiculos where oficina_id = oficina_b), 'dono A ve veiculo da B';
  assert not exists (select 1 from public.catalogo_pecas where id = peca_b), 'dono A ve peca da B';
  assert not exists (select 1 from public.catalogo_pecas_precos where peca_id = peca_b), 'dono A ve preco da B';
  assert not exists (select 1 from public.convites where oficina_id = oficina_b), 'dono A ve convite da B';
  assert (select count(*) from public.perfis) = 3, 'dono A deveria ver 3 perfis (dono, mecanico, atendente)';
  assert (select count(*) from public.termos_aceite) = 3, 'dono A deveria ver os 3 aceites da oficina A';
  assert (select count(*) from public.veiculos where placa = 'ABC1D23') = 1, 'busca por placa vazou para outra oficina';

  -- alteracao / exclusao silenciosamente nao afetam nada
  update public.clientes set nome = 'Hackeado' where id = cliente_b;
  get diagnostics n = row_count;
  assert n = 0, 'dono A alterou cliente da B';

  delete from public.clientes where id = cliente_b;
  get diagnostics n = row_count;
  assert n = 0, 'dono A apagou cliente da B';

  update public.oficinas set nome = 'Hackeada' where id = oficina_b;
  get diagnostics n = row_count;
  assert n = 0, 'dono A alterou a oficina B';

  delete from public.catalogo_pecas where id = peca_b;
  get diagnostics n = row_count;
  assert n = 0, 'dono A apagou peca da B';

  -- insercao apontando para a B
  ok := false;
  begin
    insert into public.clientes (oficina_id, nome) values (oficina_b, 'Intruso');
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'dono A inseriu cliente na oficina B';

  ok := false;
  begin
    insert into public.veiculos (cliente_id, placa) values (cliente_b, 'QWE1R23');
  exception when foreign_key_violation then ok := true;
  end;
  assert ok, 'dono A cadastrou veiculo ligado a cliente da B';

  ok := false;
  begin
    -- (a peca B ja tem preco: a PK pode barrar antes da FK composta; os dois bloqueiam)
    insert into public.catalogo_pecas_precos (peca_id, preco_venda_centavos) values (peca_b, 1);
  exception when foreign_key_violation or insufficient_privilege or unique_violation then ok := true;
  end;
  assert ok, 'dono A gravou preco em peca da B';

  ok := false;
  begin
    update public.clientes set oficina_id = oficina_b where id = current_setting('teste.cliente_a')::uuid;
  exception when insufficient_privilege or foreign_key_violation then ok := true;
  end;
  assert ok, 'dono A moveu cliente para a oficina B';

  -- convite da B
  ok := false;
  begin
    perform public.revogar_convite(current_setting('teste.convite_b')::uuid);
  exception when raise_exception then ok := true;
  end;
  assert ok, 'dono A revogou convite da B';

  -- campos protegidos
  ok := false;
  begin
    update public.oficinas set plano = 'completo' where id = current_setting('teste.oficina_a')::uuid;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'dono conseguiu mudar o proprio plano';

  ok := false;
  begin
    update public.termos_aceite set versao = 'x';
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'termos_aceite foi alterado';

  ok := false;
  begin
    perform public.atualizar_membro('00000000-0000-4000-8000-0000000000a1', 'mecanico');
  exception when raise_exception then ok := true;
  end;
  assert ok, 'dono rebaixou a si mesmo';
end $$;

-- =============================================================================
-- 5) MECANICO A: nao ve preco nem custo; so cria peca pendente
-- =============================================================================
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated","email":"mecanico.a@teste.invalid"}', true);

do $$
declare
  n  int;
  ok boolean;
  peca_a uuid := current_setting('teste.peca_a')::uuid;
begin
  assert (select papel from public.meu_contexto()) = 'mecanico', 'meu_contexto deveria dizer mecanico';

  -- ve o catalogo (nomes), mas nenhum valor
  assert (select count(*) from public.catalogo_pecas) = 1, 'mecanico deveria ver a peca (sem valores)';
  assert (select count(*) from public.catalogo_servicos) = 1, 'mecanico deveria ver o servico (sem valores)';
  assert (select count(*) from public.catalogo_pecas_precos) = 0, 'MECANICO VE PRECO DE PECA';
  assert (select count(*) from public.catalogo_pecas_custos) = 0, 'MECANICO VE CUSTO DE PECA';
  assert (select count(*) from public.catalogo_servicos_precos) = 0, 'MECANICO VE PRECO DE SERVICO';
  assert not exists (select 1 from public.vw_catalogo_pecas
                      where preco_venda_centavos is not null or custo_centavos is not null),
    'MECANICO VE VALOR PELA VIEW DE PECAS';
  assert not exists (select 1 from public.vw_catalogo_servicos where preco_padrao_centavos is not null),
    'MECANICO VE VALOR PELA VIEW DE SERVICOS';

  -- ve veiculos da propria oficina (historico por placa), nada da B.
  -- Desde a Fase 2 NAO le a tabela clientes (telefone/documento); o nome do
  -- cliente chega pelas views da OS e pela RPC dados_da_placa.
  assert (select count(*) from public.veiculos) = 2, 'mecanico deveria ver os 2 veiculos da A';
  assert (select count(*) from public.clientes) = 0, 'mecanico nao deveria ler a tabela clientes (Fase 2)';

  -- nao ve colegas nem convites
  assert (select count(*) from public.perfis) = 1, 'mecanico ve dados de outros funcionarios';
  assert (select count(*) from public.convites) = 0, 'mecanico ve convites';
  assert (select count(*) from public.termos_aceite) = 1, 'mecanico ve aceites de outros';

  -- cria peca pendente: ok
  insert into public.catalogo_pecas (nome) values ('Peca nova do mecanico');
  assert (select pendente_precificacao from public.catalogo_pecas where nome = 'Peca nova do mecanico'),
    'peca do mecanico deveria nascer pendente';

  -- nao cria peca ja "precificada"
  ok := false;
  begin
    insert into public.catalogo_pecas (nome, pendente_precificacao) values ('Peca sem pendencia', false);
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'mecanico criou peca nao pendente';

  -- nao grava preco nem custo
  ok := false;
  begin
    insert into public.catalogo_pecas_precos (peca_id, preco_venda_centavos)
    values ((select id from public.catalogo_pecas where nome = 'Peca nova do mecanico'), 100);
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'mecanico gravou preco';

  ok := false;
  begin
    update public.catalogo_pecas_custos set custo_centavos = 1 where peca_id = peca_a;
    get diagnostics n = row_count;
    ok := (n = 0);
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'mecanico alterou custo';

  -- nao edita catalogo, cliente nem veiculo; nao apaga
  update public.catalogo_pecas set nome = 'Mudou' where id = peca_a;
  get diagnostics n = row_count;
  assert n = 0, 'mecanico editou peca do catalogo';

  delete from public.veiculos where id = current_setting('teste.veiculo_a')::uuid;
  get diagnostics n = row_count;
  assert n = 0, 'mecanico apagou veiculo';

  update public.clientes set nome = 'Mudou' where id = current_setting('teste.cliente_a')::uuid;
  get diagnostics n = row_count;
  assert n = 0, 'mecanico editou cliente';

  ok := false;
  begin
    insert into public.clientes (nome) values ('Cliente do mecanico');
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'mecanico cadastrou cliente';

  -- nao se promove
  ok := false;
  begin
    update public.perfis set papel = 'dono' where id = '00000000-0000-4000-8000-0000000000a2';
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'MECANICO SE PROMOVEU A DONO';

  ok := false;
  begin
    perform public.atualizar_membro('00000000-0000-4000-8000-0000000000a2', 'dono');
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'mecanico usou atualizar_membro';

  -- nao altera a oficina nem cria convite
  update public.oficinas set nome = 'Mudou' where id = current_setting('teste.oficina_a')::uuid;
  get diagnostics n = row_count;
  assert n = 0, 'mecanico alterou a oficina';

  ok := false;
  begin
    perform public.criar_convite('mecanico');
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'mecanico criou convite';

  -- pode mudar o proprio nome
  update public.perfis set nome = 'Mecanico A Silva' where id = '00000000-0000-4000-8000-0000000000a2';
  get diagnostics n = row_count;
  assert n = 1, 'mecanico deveria poder mudar o proprio nome';
end $$;

-- =============================================================================
-- 6) ATENDENTE A: ve preco de venda, nao ve custo; cadastra cliente; nao apaga
-- =============================================================================
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a3","role":"authenticated","email":"atendente.a@teste.invalid"}', true);

do $$
declare
  n  int;
  ok boolean;
begin
  assert (select perfil_nome from public.meu_contexto()) = 'Atendente A', 'atendente deveria usar o nome sugerido';
  assert (select count(*) from public.catalogo_pecas_precos) = 1, 'atendente deveria ver preco de venda';
  assert (select count(*) from public.catalogo_servicos_precos) = 1, 'atendente deveria ver preco de servico';
  assert (select count(*) from public.catalogo_pecas_custos) = 0, 'ATENDENTE VE CUSTO';
  assert not exists (select 1 from public.vw_catalogo_pecas where custo_centavos is not null), 'ATENDENTE VE CUSTO PELA VIEW';
  assert (select preco_venda_centavos from public.vw_catalogo_pecas where id = current_setting('teste.peca_a')::uuid) = 18000,
    'atendente deveria ver preco de venda pela view';
  assert (select count(*) from public.perfis) = 3, 'atendente deveria ver a equipe (3)';
  assert (select count(*) from public.convites) = 0, 'atendente ve convites';

  insert into public.clientes (nome, modo_padrao) values ('Cliente do atendente', 'servico_direto');

  delete from public.clientes where id = current_setting('teste.cliente_a')::uuid;
  get diagnostics n = row_count;
  assert n = 0, 'atendente apagou cliente';

  ok := false;
  begin
    insert into public.catalogo_pecas_precos (peca_id, preco_venda_centavos)
    values ((select id from public.catalogo_pecas where nome = 'Peca nova do mecanico'), 100);
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'atendente gravou preco no catalogo';
end $$;

-- =============================================================================
-- 7) Desativacao: dono A desliga o mecanico => mecanico nao ve mais nada
-- =============================================================================
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated","email":"dono.a@teste.invalid"}', true);
select public.atualizar_membro('00000000-0000-4000-8000-0000000000a2', p_ativo => false);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated","email":"mecanico.a@teste.invalid"}', true);
do $$
begin
  assert (select ativo from public.meu_contexto()) = false, 'meu_contexto deveria mostrar ativo = false';
  assert (select count(*) from public.clientes) = 0, 'mecanico desativado ainda ve clientes';
  assert (select count(*) from public.catalogo_pecas) = 0, 'mecanico desativado ainda ve catalogo';
  assert (select count(*) from public.oficinas) = 0, 'mecanico desativado ainda ve a oficina';
end $$;

-- =============================================================================
-- 8) ANON (sem login): nenhuma tabela; so ver_convite
-- =============================================================================
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;

do $$
declare ok boolean := false;
begin
  begin
    perform 1 from public.clientes;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'ANON LEU CLIENTES';

  ok := false;
  begin
    perform 1 from public.vw_catalogo_pecas;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'ANON LEU O CATALOGO';

  ok := false;
  begin
    perform public.criar_oficina('X', 'Y', '2026-10-28');
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'ANON CHAMOU criar_oficina';

  assert (select situacao from public.ver_convite(current_setting('teste.token_mec'))) = 'usado',
    'anon deveria ver o convite como usado';
  assert (select oficina_nome from public.ver_convite(repeat('b', 64))) is null,
    'ver_convite vazou dados para token inexistente';
end $$;

-- =============================================================================
reset role;
select 'FASE 1 OK: todos os testes de isolamento passaram' as resultado;

rollback;
