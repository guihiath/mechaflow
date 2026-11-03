-- =============================================================================
-- MechaFlow - Fase 6 - Teste do banco: orcamento por link (criterios de PLANO 19.4)
--
-- O que prova:
--   * anon: nenhuma tabela nem view; EXECUTE so em ver_orcamento e responder_orcamento
--     (mais ver_convite e normalizar_placa, da Fase 1); logado nao chama as publicas;
--   * token de 256 bits, so o hash gravado; com o banco na mao nao se abre o link;
--   * RPC publica com lista fechada de campos: qualquer chave a mais reprova;
--     nada de custo, telefone, documento do cliente, sintoma, id interno;
--   * inventado, vencido, revogado, substituido: so { situacao }, nada gravado;
--   * enviar: sem item, sem preco, total diferente; idempotente (troca o token, sem
--     versao nova nem segundo link ativo); prazo e condicoes no hash;
--   * versao congelada: catalogo, oficina e cliente mudam e o link nao muda;
--   * trava por trigger: tambem escrita direta, com link ativo, vencido e cancelado;
--   * versao e resposta imutaveis para os 3 papeis e para o postgres; hash confere e
--     acusa alteracao feita com o trigger desligado;
--   * aprovar e recusar pelo link, primeira resposta vale, repetir nao duplica;
--     item depois da aprovacao marcado, versao aprovada intacta;
--   * link x mao, desfazer sem apagar a prova, cancelar, trocar modo, alterar, reenviar;
--   * OS antiga em orcamento_enviado sem link continua funcionando;
--   * IP so dos cabecalhos; limite por link sem bloquear cliente normal; expurgo LGPD;
--   * mecanico: 0 linhas e nenhum detalhe; atendente sem custo; isolamento A x B.
--
-- [ADMIN] As secoes marcadas desligam triggers dentro da transacao, para simular
-- link vencido e provar que o hash acusa alteracao. Tudo volta no ROLLBACK.
-- Concorrencia real (duas conexoes): testar-staging (F6-B6). Aqui a transacao e uma so.
--
-- Como rodar: SQL Editor do Supabase STAGING (usuario postgres), DEPOIS das migracoes
-- 20261102000002..04. Resultado esperado: 'FASE 6 OK: orcamento por link passou'.
-- Tudo numa transacao que termina em ROLLBACK: nada fica gravado.
-- =============================================================================

begin;

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
create function public.zz_afetadas(p_sql text) returns integer language plpgsql as $$
declare n integer;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $$;
-- chaves de um objeto, em ordem: compara com a lista fechada
create function public.zz_chaves(p jsonb) returns text language sql immutable as $$
  select coalesce(string_agg(k, ',' order by k), '') from jsonb_object_keys(p) k
$$;
grant execute on function public.zz_erro(text), public.zz_estado(text), public.zz_afetadas(text), public.zz_chaves(jsonb) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 0) Usuarios: a1 dono A | a2 mecanico A | a3 atendente A | b1 dono B
-- -----------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email, '', now(),
       '{"provider":"email","providers":["email"]}', '{}', now(), now()
  from (values
    ('00000000-0000-4000-8000-0000000006a1', 'f6.dono.a@teste.invalid'),
    ('00000000-0000-4000-8000-0000000006a2', 'f6.mec.a@teste.invalid'),
    ('00000000-0000-4000-8000-0000000006a3', 'f6.atd.a@teste.invalid'),
    ('00000000-0000-4000-8000-0000000006b1', 'f6.dono.b@teste.invalid')
  ) as u(id, email);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000006a1","role":"authenticated"}', true);
set local role authenticated;

select set_config('teste.oficina_a', public.criar_oficina('Oficina Diesel A', 'Dono A', private.versao_termos_vigente(), p_telefone => '1133334444')::text, true);
select set_config('teste.tk_mec', (select token from public.criar_convite('mecanico', 'Mecanico A')), true);
select set_config('teste.tk_atd', (select token from public.criar_convite('atendente', 'Atendente A')), true);

with c as (insert into public.clientes (nome, telefone, documento) values ('Transportes Silva', '11988887777', '12345678000199') returning id)
select set_config('teste.cliente', (select id::text from c), true);
with v as (insert into public.veiculos (cliente_id, placa, marca, modelo) values (current_setting('teste.cliente')::uuid, 'FTR6A66', 'Scania', 'R450') returning id)
select set_config('teste.veiculo', (select id::text from v), true);
with s as (insert into public.catalogo_servicos (nome) values ('Revisao do motor') returning id)
select set_config('teste.servico', (select id::text from s), true);
insert into public.catalogo_servicos_precos (servico_id, preco_padrao_centavos) values (current_setting('teste.servico')::uuid, 15000);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000006a2","role":"authenticated"}', true);
select public.aceitar_convite(current_setting('teste.tk_mec'), 'Mecanico A', private.versao_termos_vigente());
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000006a3","role":"authenticated"}', true);
select public.aceitar_convite(current_setting('teste.tk_atd'), 'Ana Atendente', private.versao_termos_vigente());

-- Dono B com um orcamento proprio, para o isolamento
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000006b1","role":"authenticated"}', true);
select public.criar_oficina('Oficina B', 'Dono B', private.versao_termos_vigente());
with c as (insert into public.clientes (nome) values ('Cliente de B') returning id)
select set_config('teste.clienteB', (select id::text from c), true);
with v as (insert into public.veiculos (cliente_id, placa) values (current_setting('teste.clienteB')::uuid, 'BBB6B66') returning id)
select set_config('teste.veiculoB', (select id::text from v), true);
do $$
declare os uuid; tk text;
begin
  select os_id into os from public.abrir_os(gen_random_uuid(), p_veiculo_id => current_setting('teste.veiculoB')::uuid, p_modo => 'com_orcamento');
  perform public.adicionar_item_os(gen_random_uuid(), os, 'servico', p_descricao => 'Servico SEGREDO_DE_B', p_preco_unitario_centavos => 5000);
  select token into tk from public.enviar_orcamento(os, gen_random_uuid(), 5000);
  perform set_config('teste.osB', os::text, true);
  perform set_config('teste.tkB', tk, true);
end $$;

reset role;
-- OS padrao de A: servico 2 x 150,00 (custo secreto) + peca 1,5 x 99,50 = 449,25
create function public.zz_nova_os() returns uuid language plpgsql as $$
declare os uuid;
begin
  select os_id into os from public.abrir_os(gen_random_uuid(),
    p_veiculo_id => current_setting('teste.veiculo')::uuid, p_modo => 'com_orcamento',
    p_sintoma_relatado => 'SINTOMA_INTERNO',
    p_mecanico_id => '00000000-0000-4000-8000-0000000006a2');
  perform public.adicionar_item_os(gen_random_uuid(), os, 'servico', p_servico_id => current_setting('teste.servico')::uuid,
    p_quantidade => 2, p_preco_unitario_centavos => 15000, p_custo_unitario_centavos => 7777);
  perform public.adicionar_item_os(gen_random_uuid(), os, 'peca', p_descricao => 'Filtro diesel', p_quantidade => 1.5, p_unidade => 'un',
    p_preco_unitario_centavos => 9950, p_custo_unitario_centavos => 8888);
  return os;
end $$;
grant execute on function public.zz_nova_os() to authenticated;
-- Envia e guarda o token
create function public.zz_enviar(p_os uuid) returns text language sql as $$
  select token from public.enviar_orcamento(p_os, gen_random_uuid(), 44925)
$$;
grant execute on function public.zz_enviar(uuid) to authenticated;

-- =============================================================================
-- 1) anon e permissoes: toda tabela e view; toda funcao
-- =============================================================================
reset role;
do $$
declare r record; v_lista text;
begin
  for r in
    select c.oid, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p', 'f')
  loop
    assert not has_table_privilege('anon', r.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'),
      format('ANON TEM PERMISSAO EM %s', r.relname);
  end loop;
  assert not has_schema_privilege('anon', 'private', 'USAGE'), 'ANON USA O SCHEMA private';

  select string_agg(p.proname, ',' order by p.proname) into v_lista
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname !~ '^zz_'
     and has_function_privilege('anon', p.oid, 'EXECUTE');
  assert v_lista = 'normalizar_placa,responder_orcamento,ver_convite,ver_orcamento',
    format('ANON EXECUTA FUNCOES DEMAIS: %s', v_lista);

  assert not has_function_privilege('authenticated', 'public.ver_orcamento(text)', 'EXECUTE'), 'logado nao chama ver_orcamento';
  assert not has_function_privilege('authenticated', 'public.responder_orcamento(text, boolean, text, text)', 'EXECUTE'), 'logado nao chama responder';

  -- RPC publica nao recebe id, IP nem navegador
  assert (select pg_get_function_identity_arguments('public.ver_orcamento(text)'::regprocedure)) = 'p_token text', 'ver_orcamento: parametros';
  assert (select pg_get_function_identity_arguments('public.responder_orcamento(text, boolean, text, text)'::regprocedure))
         = 'p_token text, p_aprovou boolean, p_nome text, p_motivo text', 'responder: parametro a mais (IP nao pode vir de parametro)';

  -- toda funcao nova DEFINER tem search_path vazio
  assert not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private') and p.prosecdef
       and (p.proname ~ 'orcamento|link|versao' )
       and not coalesce(p.proconfig @> array['search_path=""'], false)
  ), 'funcao DEFINER da Fase 6 sem search_path vazio';

  -- escrita: authenticated nao escreve em nenhuma tabela nova
  assert not has_table_privilege('authenticated', 'public.orcamento_versoes', 'INSERT, UPDATE, DELETE, TRUNCATE'), 'escrita em versoes';
  assert not has_table_privilege('authenticated', 'public.orcamento_links', 'INSERT, UPDATE, DELETE, TRUNCATE'), 'escrita em links';
  assert not has_table_privilege('authenticated', 'public.orcamento_respostas', 'INSERT, UPDATE, DELETE, TRUNCATE'), 'escrita em respostas';
  assert not has_table_privilege('authenticated', 'public.orcamento_resposta_rede', 'INSERT, UPDATE, DELETE, TRUNCATE'), 'escrita em rede';
  assert not has_column_privilege('authenticated', 'public.orcamento_links', 'token_hash', 'SELECT'), 'token_hash legivel pelo balcao';

  -- RLS ligada
  assert (select bool_and(c.relrowsecurity) from pg_class c
           where c.oid in ('public.orcamento_versoes'::regclass, 'public.orcamento_links'::regclass,
                           'public.orcamento_respostas'::regclass, 'public.orcamento_resposta_rede'::regclass,
                           'private.orcamento_tentativas'::regclass)), 'tabela nova sem RLS';
end $$;

-- =============================================================================
-- 2) enviar_orcamento: validacoes, token, idempotencia
-- =============================================================================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000006a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  os uuid; os2 uuid; r record; r2 record; tk text; ch uuid := gen_random_uuid(); it uuid; n_hist integer;
begin
  -- sem item
  select os_id into os2 from public.abrir_os(gen_random_uuid(), p_veiculo_id => current_setting('teste.veiculo')::uuid, p_modo => 'com_orcamento');
  assert public.zz_erro(format($q$ select * from public.enviar_orcamento(%L, gen_random_uuid(), 0) $q$, os2)) = 'orcamento_sem_itens', 'enviar sem item';
  -- item sem preco
  it := public.adicionar_item_os(gen_random_uuid(), os2, 'peca', p_descricao => 'Sem preco');
  assert public.zz_erro(format($q$ select * from public.enviar_orcamento(%L, gen_random_uuid(), 0) $q$, os2)) = 'os_itens_sem_preco', 'enviar com item sem preco';
  assert (select status from public.ordens_servico where id = os2) = 'aguardando_orcamento', 'recusa nao muda status';
  assert not exists (select 1 from public.orcamento_versoes where os_id = os2), 'recusa nao congela versao';
  assert not exists (select 1 from public.orcamento_links where os_id = os2), 'recusa nao cria link';
  -- modo direto
  select os_id into os2 from public.abrir_os(gen_random_uuid(), p_veiculo_id => current_setting('teste.veiculo')::uuid, p_modo => 'direto', p_autorizado_por_nome => 'Autorizou');
  assert public.zz_erro(format($q$ select * from public.enviar_orcamento(%L, gen_random_uuid(), 0) $q$, os2)) = 'transicao_invalida', 'enviar em OS direta';

  os := public.zz_nova_os();
  perform set_config('teste.os1', os::text, true);
  -- chave, total conferido, texto grande
  assert public.zz_erro(format($q$ select * from public.enviar_orcamento(%L, null, 44925) $q$, os)) = 'chave_obrigatoria', 'sem chave';
  assert public.zz_erro(format($q$ select * from public.enviar_orcamento(%L, gen_random_uuid(), 100) $q$, os)) = 'orcamento_mudou', 'total diferente deveria barrar';
  assert public.zz_erro(format($q$ select * from public.enviar_orcamento(%L, gen_random_uuid(), null) $q$, os)) = 'orcamento_mudou', 'sem total deveria barrar';
  assert public.zz_erro(format($q$ select * from public.enviar_orcamento(%L, gen_random_uuid(), 44925, repeat('x', 121)) $q$, os)) = 'texto_orcamento_grande', 'prazo grande';
  assert public.zz_erro(format($q$ select * from public.enviar_orcamento(%L, gen_random_uuid(), 44925, null, repeat('x', 121)) $q$, os)) = 'texto_orcamento_grande', 'condicoes grandes';
  assert not exists (select 1 from public.orcamento_versoes where os_id = os), 'nada deveria ter sido gerado';

  select * into r from public.enviar_orcamento(os, ch, 44925, ' 3 dias uteis ', '50% na entrada');
  assert r.versao_numero = 1 and not r.ja_existia, 'envio 1';
  -- 256 bits, 64 hex
  assert r.token ~ '^[0-9a-f]{64}$', 'token deveria ter 64 hex (256 bits)';
  -- validade: 23:59:59 do 10o dia no fuso da oficina
  assert to_char(r.expira_em at time zone 'America/Sao_Paulo', 'HH24:MI:SS') = '23:59:59', 'validade deveria ser ate 23:59:59';
  assert (r.expira_em at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date + 10, 'validade deveria ser o 10o dia';

  assert (select status from public.ordens_servico where id = os) = 'orcamento_enviado', 'deveria ir para orcamento_enviado';
  assert (select orcamento_enviado_em from public.ordens_servico where id = os) is not null, 'enviado_em';
  perform set_config('teste.tk1', r.token, true);

  -- Reenvio do mesmo toque: token novo, sem versao nova nem historico nem 2o link ativo
  select count(*) into n_hist from public.os_historico where os_id = os;
  select * into r2 from public.enviar_orcamento(os, ch, 44925);
  assert r2.ja_existia and r2.versao_numero = 1, 'reenvio deveria devolver ja_existia';
  assert r2.token <> r.token, 'reenvio deveria trocar o token';
  assert (select count(*) from public.orcamento_versoes where os_id = os) = 1, 'reenvio criou versao';
  assert (select count(*) from public.orcamento_links where os_id = os and revogado_em is null) = 1, 'reenvio deixou 2 links ativos';
  assert (select count(*) from public.os_historico where os_id = os) = n_hist, 'reenvio duplicou historico';
  perform set_config('teste.tk1_velho', r.token, true);
  perform set_config('teste.tk1', r2.token, true);

  -- outra chave com versao vigente: nao gera nada
  assert public.zz_erro(format($q$ select * from public.enviar_orcamento(%L, gen_random_uuid(), 44925) $q$, os)) = 'orcamento_ja_enviado', 'segundo envio';
end $$;

-- so o hash: com tudo do banco na mao, o token nao aparece em lugar nenhum
reset role;
do $$
declare v_tk text := current_setting('teste.tk1'); v_vel text := current_setting('teste.tk1_velho'); r record; v_txt text;
begin
  assert exists (select 1 from public.orcamento_links where token_hash = sha256(convert_to(v_tk, 'UTF8'))), 'hash do token deveria estar gravado';
  for r in
    select to_jsonb(l)::text as t from public.orcamento_links l
    union all select to_jsonb(v)::text from public.orcamento_versoes v
    union all select to_jsonb(h)::text from public.os_historico h
    union all select to_jsonb(ht)::text from public.os_historico_textos ht
    union all select to_jsonb(c)::text from public.os_comercial c
    union all select to_jsonb(t)::text from private.orcamento_tentativas t
  loop
    assert position(v_tk in r.t) = 0 and position(v_vel in r.t) = 0, 'TOKEN EM TEXTO PURO NO BANCO';
  end loop;
  -- o proprio hash nao abre o link
  select encode(token_hash, 'hex') into v_txt from public.orcamento_links where token_hash = sha256(convert_to(v_tk, 'UTF8'));
  perform set_config('teste.hash1', v_txt, true);
  -- nenhuma coluna de token nas tabelas novas
  assert not exists (select 1 from information_schema.columns
                      where table_schema = 'public' and table_name like 'orcamento%' and column_name = 'token'), 'coluna token existe';
end $$;

-- =============================================================================
-- 3) ver_orcamento: lista fechada. Qualquer chave a mais reprova.
-- =============================================================================
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $$
declare
  j jsonb; d jsonb; i jsonb; t text;
begin
  -- com o hash na mao nao se abre
  assert public.ver_orcamento(current_setting('teste.hash1')) ->> 'situacao' = 'nao_encontrado', 'O HASH ABRIU O LINK';

  j := public.ver_orcamento(current_setting('teste.tk1'));
  assert j ->> 'situacao' = 'aberto', 'link deveria estar aberto';
  assert public.zz_chaves(j) = 'documento,expira_em,resposta,situacao', format('chaves do topo: %s', public.zz_chaves(j));
  d := j -> 'documento';
  assert public.zz_chaves(d) = 'cliente_nome,condicoes_pagamento,itens,oficina_nome,oficina_telefone,os_numero,prazo_estimado,subtotal_pecas_centavos,subtotal_servicos_centavos,total_centavos,veiculo_marca,veiculo_modelo,veiculo_placa',
    format('chaves do documento: %s', public.zz_chaves(d));
  assert jsonb_array_length(d -> 'itens') = 2, 'itens';
  for i in select * from jsonb_array_elements(d -> 'itens') loop
    assert public.zz_chaves(i) = 'descricao,preco_unitario_centavos,quantidade,subtotal_centavos,tipo,unidade',
      format('chaves do item: %s', public.zz_chaves(i));
  end loop;
  -- valores
  assert d ->> 'oficina_nome' = 'Oficina Diesel A' and d ->> 'oficina_telefone' = '1133334444', 'oficina';
  assert d ->> 'cliente_nome' = 'Transportes Silva' and d ->> 'veiculo_placa' = 'FTR6A66', 'identificacao';
  assert (d ->> 'subtotal_servicos_centavos')::bigint = 30000, 'subtotal de servicos';
  assert (d ->> 'subtotal_pecas_centavos')::bigint = 14925, 'subtotal de pecas';
  assert (d ->> 'total_centavos')::bigint = 44925, 'total';
  assert d ->> 'prazo_estimado' = '3 dias uteis' and d ->> 'condicoes_pagamento' = '50% na entrada', 'prazo e condicoes';
  assert j -> 'resposta' = 'null'::jsonb, 'sem resposta ainda';

  -- nada proibido em lugar nenhum do payload
  t := j::text;
  assert t !~* 'custo|margem|7777|8888', 'CUSTO NO PAYLOAD';
  assert t !~ '11988887777', 'TELEFONE DO CLIENTE NO PAYLOAD';
  assert t !~ '12345678000199', 'DOCUMENTO DO CLIENTE NO PAYLOAD';
  assert t !~ 'SINTOMA_INTERNO', 'SINTOMA NO PAYLOAD';
  assert t !~* 'mecanico', 'MECANICO NO PAYLOAD';
  assert t !~ '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}', 'ID INTERNO NO PAYLOAD';
  assert t !~ 'SEGREDO_DE_B', 'DADO DE OUTRA OFICINA';
  assert t !~* 'logo', 'LOGO FORA DESTA FASE';

  -- o token de B traz so B
  j := public.ver_orcamento(current_setting('teste.tkB'));
  assert j::text ~ 'SEGREDO_DE_B' and j::text !~ 'Transportes Silva|FTR6A66|Oficina Diesel A', 'token de B trouxe dado de A';
  -- oficina sem telefone e caso valido: a chave vem, com null
  assert j -> 'documento' -> 'oficina_telefone' = 'null'::jsonb, 'oficina sem telefone deveria vir null';

  -- token inventado ou malformado: so a situacao
  for t in select unnest(array[repeat('a', 64), 'abc', '', repeat('z', 64), repeat('a', 63), null]) loop
    j := public.ver_orcamento(t);
    assert j = '{"situacao":"nao_encontrado"}'::jsonb, format('token invalido: %s', j);
    j := public.responder_orcamento(t, true, 'Fulano');
    assert j = '{"situacao":"nao_encontrado"}'::jsonb, format('responder invalido: %s', j);
  end loop;

  -- token substituido (toque repetido): so a situacao
  j := public.ver_orcamento(current_setting('teste.tk1_velho'));
  assert j = '{"situacao":"substituido"}'::jsonb, format('substituido: %s', j);
  j := public.responder_orcamento(current_setting('teste.tk1_velho'), true, 'Fulano');
  assert j = '{"situacao":"substituido"}'::jsonb, format('responder substituido: %s', j);

  -- anon nao le nada
  assert public.zz_estado('select 1 from public.orcamento_versoes') = '42501', 'ANON LEU versoes';
  assert public.zz_estado('select 1 from public.orcamento_links') = '42501', 'ANON LEU links';
  assert public.zz_estado('select 1 from public.orcamento_respostas') = '42501', 'ANON LEU respostas';
  assert public.zz_estado('select 1 from public.orcamento_resposta_rede') = '42501', 'ANON LEU rede';
  assert public.zz_estado('select 1 from public.vw_orcamento_situacao') = '42501', 'ANON LEU vw_orcamento_situacao';
  assert public.zz_estado('select 1 from public.vw_orcamento_versoes') = '42501', 'ANON LEU vw_orcamento_versoes';
  assert public.zz_estado('select 1 from public.vw_orcamento_provas') = '42501', 'ANON LEU vw_orcamento_provas';
  assert public.zz_estado('select 1 from public.vw_os') = '42501', 'ANON LEU vw_os';
  assert public.zz_estado('select 1 from public.ordens_servico') = '42501', 'ANON LEU ordens_servico';
  assert public.zz_estado('select 1 from public.os_itens') = '42501', 'ANON LEU os_itens';
  assert public.zz_estado('select 1 from public.os_itens_precos') = '42501', 'ANON LEU os_itens_precos';
  assert public.zz_estado('select 1 from public.clientes') = '42501', 'ANON LEU clientes';
  assert public.zz_estado('select 1 from public.oficinas') = '42501', 'ANON LEU oficinas';
  assert public.zz_estado('select 1 from private.orcamento_tentativas') = '42501', 'ANON LEU tentativas';
  -- anon nao chama as RPCs do balcao
  assert public.zz_estado($q$ select * from public.enviar_orcamento(gen_random_uuid(), gen_random_uuid(), 0) $q$) = '42501', 'ANON CHAMOU enviar';
  assert public.zz_estado($q$ select * from public.reenviar_orcamento(gen_random_uuid(), gen_random_uuid()) $q$) = '42501', 'ANON CHAMOU reenviar';
  assert public.zz_estado($q$ select public.cancelar_link_orcamento(gen_random_uuid()) $q$) = '42501', 'ANON CHAMOU cancelar';
  assert public.zz_estado($q$ select public.alterar_orcamento(gen_random_uuid()) $q$) = '42501', 'ANON CHAMOU alterar';
  assert public.zz_estado($q$ select public.previa_orcamento(gen_random_uuid()) $q$) = '42501', 'ANON CHAMOU previa';
  assert public.zz_estado($q$ select public.conferir_orcamento(gen_random_uuid()) $q$) = '42501', 'ANON CHAMOU conferir';
  assert public.zz_estado($q$ select public.registrar_resposta_orcamento(gen_random_uuid(), 'orcamento_enviado', true, 'telefone') $q$) = '42501', 'ANON CHAMOU registrar_resposta';
end $$;

-- Abrir nao muda nada (GET/robo de previa): OS, link, resposta e historico iguais.
reset role;
do $$
declare v_os text; v_l text; v_h bigint; v_r bigint;
begin
  select to_jsonb(o)::text into v_os from public.ordens_servico o where o.id = current_setting('teste.os1')::uuid;
  select to_jsonb(l)::text into v_l from public.orcamento_links l where l.os_id = current_setting('teste.os1')::uuid and l.revogado_em is null;
  select count(*) into v_h from public.os_historico where os_id = current_setting('teste.os1')::uuid;
  select count(*) into v_r from public.orcamento_respostas where os_id = current_setting('teste.os1')::uuid;
  perform public.ver_orcamento(current_setting('teste.tk1'));
  perform public.ver_orcamento(current_setting('teste.tk1'));
  assert (select to_jsonb(o)::text from public.ordens_servico o where o.id = current_setting('teste.os1')::uuid) = v_os, 'ABRIR MUDOU A OS';
  assert (select to_jsonb(l)::text from public.orcamento_links l where l.os_id = current_setting('teste.os1')::uuid and l.revogado_em is null) = v_l, 'ABRIR MUDOU O LINK';
  assert (select count(*) from public.os_historico where os_id = current_setting('teste.os1')::uuid) = v_h, 'ABRIR GRAVOU HISTORICO';
  assert (select count(*) from public.orcamento_respostas where os_id = current_setting('teste.os1')::uuid) = v_r, 'ABRIR GRAVOU RESPOSTA';
end $$;

-- Logado nao chama as publicas (a pagina usa cliente sem sessao)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000006a1","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  assert public.zz_estado(format($q$ select public.ver_orcamento(%L) $q$, current_setting('teste.tk1'))) = '42501', 'logado chamou ver_orcamento';
  assert public.zz_estado(format($q$ select public.responder_orcamento(%L, true, 'Dono') $q$, current_setting('teste.tk1'))) = '42501', 'logado chamou responder';
end $$;

-- =============================================================================
-- 4) Versao congelada e trava por trigger
-- =============================================================================
do $$
declare os uuid := current_setting('teste.os1')::uuid; it uuid; it2 uuid; v_vers uuid;
begin
  select id into it from public.os_itens where os_id = os and tipo = 'servico';
  select id into it2 from public.os_itens where os_id = os and tipo = 'peca';
  perform set_config('teste.it1', it::text, true);

  -- escrita direta em os_itens e os_itens_precos (dono)
  assert public.zz_erro(format($q$ update public.os_itens set quantidade = 9 where id = %L $q$, it)) = 'orcamento_travado', 'trava: update de item';
  assert public.zz_erro(format($q$ update public.os_itens set descricao = 'Mudou' where id = %L $q$, it)) = 'orcamento_travado', 'trava: descricao';
  assert public.zz_erro(format($q$ delete from public.os_itens where id = %L $q$, it)) = 'orcamento_travado', 'trava: delete de item';
  assert public.zz_erro(format($q$ insert into public.os_itens (os_id, tipo, descricao) values (%L, 'peca', 'Nova') $q$, os)) = 'orcamento_travado', 'trava: insert de item';
  assert public.zz_erro(format($q$ update public.os_itens_precos set preco_unitario_centavos = 1 where item_id = %L $q$, it)) = 'orcamento_travado', 'trava: preco';
  assert public.zz_erro(format($q$ delete from public.os_itens_precos where item_id = %L $q$, it)) = 'orcamento_travado', 'trava: delete de preco';
  -- pela RPC
  assert public.zz_erro(format($q$ select public.adicionar_item_os(gen_random_uuid(), %L, 'peca', p_descricao => 'Nova RPC') $q$, os)) = 'orcamento_travado', 'trava: adicionar_item_os';
  -- custo fica livre: nao entra na versao
  update public.os_itens_custos set custo_unitario_centavos = 1234 where item_id = it;
  assert found, 'dono deveria corrigir custo com a OS travada';

  -- Muda catalogo, nome da oficina, cliente e veiculo: a pagina nao muda
  update public.catalogo_servicos set nome = 'Nome novo do catalogo' where id = current_setting('teste.servico')::uuid;
  update public.catalogo_servicos_precos set preco_padrao_centavos = 99900 where servico_id = current_setting('teste.servico')::uuid;
  update public.oficinas set nome = 'Oficina Renomeada', telefone = '1199990000' where id = current_setting('teste.oficina_a')::uuid;
  assert found, 'dono deveria editar nome e telefone da oficina (F6-B4)';
  update public.clientes set nome = 'Cliente Renomeado' where id = current_setting('teste.cliente')::uuid;

  select versao_id into v_vers from public.orcamento_links where os_id = os and revogado_em is null;
  perform set_config('teste.v1', v_vers::text, true);
  assert public.conferir_orcamento(v_vers), 'hash deveria conferir';
end $$;

-- trava vale tambem para atendente, mecanico e postgres
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000006a3","role":"authenticated"}', true);
do $$
begin
  assert public.zz_erro(format($q$ update public.os_itens set quantidade = 9 where id = %L $q$, current_setting('teste.it1'))) = 'orcamento_travado', 'trava: atendente';
  assert public.zz_erro(format($q$ update public.os_itens_precos set preco_unitario_centavos = 1 where item_id = %L $q$, current_setting('teste.it1'))) = 'orcamento_travado', 'trava: preco pelo atendente';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000006a2","role":"authenticated"}', true);
do $$
begin
  assert public.zz_erro(format($q$ select public.adicionar_item_os(gen_random_uuid(), %L, 'peca', p_descricao => 'Do mecanico') $q$, current_setting('teste.os1'))) = 'status_nao_permite_itens', 'mecanico nao lanca em orcamento_enviado';
end $$;
reset role;
do $$
begin
  assert public.zz_erro(format($q$ update public.os_itens set quantidade = 9 where id = %L $q$, current_setting('teste.it1'))) = 'orcamento_travado', 'trava: postgres';
end $$;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare d jsonb := public.ver_orcamento(current_setting('teste.tk1')) -> 'documento';
begin
  assert d ->> 'oficina_nome' = 'Oficina Diesel A' and d ->> 'oficina_telefone' = '1133334444', 'versao mudou com a oficina';
  assert d ->> 'cliente_nome' = 'Transportes Silva', 'versao mudou com o cliente';
  assert (d ->> 'total_centavos')::bigint = 44925, 'versao mudou com o catalogo';
  assert d::text !~ 'Nome novo do catalogo', 'versao mudou com o nome do catalogo';
end $$;

-- =============================================================================
-- 5) Prova: resposta pelo link, IP dos cabecalhos, primeira resposta vale
-- =============================================================================
reset role;
select set_config('request.headers', '{"cf-connecting-ip":"200.1.2.3","x-forwarded-for":"9.9.9.9, 200.1.2.3","user-agent":"NavegadorTeste/1.0"}', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $$
declare j jsonb; tk text := current_setting('teste.tk1');
begin
  -- nome obrigatorio para aprovar; nada gravado
  j := public.responder_orcamento(tk, true);
  assert j = '{"situacao":"aberto","erro":"nome_obrigatorio"}'::jsonb, format('sem nome: %s', j);
  j := public.responder_orcamento(tk, true, ' a ');
  assert j ->> 'erro' = 'nome_obrigatorio', '1 letra';
  j := public.responder_orcamento(tk, true, repeat('x', 81));
  assert j ->> 'erro' = 'nome_grande_demais', '81 letras';
  j := public.responder_orcamento(tk, null, 'Fulano');
  assert j ->> 'erro' = 'resposta_obrigatoria', 'sem resposta';
  j := public.responder_orcamento(tk, false, null, repeat('x', 501));
  assert j ->> 'erro' = 'motivo_grande_demais', 'motivo grande';

  -- aprova
  j := public.responder_orcamento(tk, true, '  Carlos   Souza ');
  assert j ->> 'situacao' = 'aprovado' and (j ->> 'aplicada')::boolean, format('aprovar: %s', j);
  assert public.zz_chaves(j) = 'aplicada,resposta,situacao', format('chaves da resposta: %s', public.zz_chaves(j));
  assert public.zz_chaves(j -> 'resposta') = 'nome,respondido_em,tipo', format('chaves de resposta: %s', public.zz_chaves(j -> 'resposta'));
  assert j -> 'resposta' ->> 'nome' = 'Carlos Souza' and j -> 'resposta' ->> 'tipo' = 'aprovou', 'nome normalizado';

  -- repetir: sucesso sem duplicar
  j := public.responder_orcamento(tk, true, 'Carlos Souza');
  assert j ->> 'situacao' = 'aprovado' and not (j ->> 'aplicada')::boolean, format('repetir: %s', j);
  -- recusar depois: vale a primeira
  j := public.responder_orcamento(tk, false, null, 'Mudei de ideia');
  assert j ->> 'situacao' = 'aprovado' and not (j ->> 'aplicada')::boolean and j -> 'resposta' ->> 'tipo' = 'aprovou', format('recusar depois: %s', j);

  -- pagina depois de responder: documento + resposta, sem motivo
  j := public.ver_orcamento(tk);
  assert j ->> 'situacao' = 'aprovado', 'ver depois de aprovar';
  assert public.zz_chaves(j) = 'documento,expira_em,resposta,situacao', 'chaves depois de aprovar';
  assert public.zz_chaves(j -> 'resposta') = 'nome,respondido_em,tipo', 'chaves da resposta na leitura';
end $$;

reset role;
do $$
declare os uuid := current_setting('teste.os1')::uuid; r public.orcamento_respostas; n public.orcamento_resposta_rede; c public.os_comercial; h public.os_historico; t text;
begin
  assert (select status from public.ordens_servico where id = os) = 'aprovada', 'OS deveria estar aprovada';
  assert (select orcamento_aprovado_em from public.ordens_servico where id = os) is not null, 'aprovado_em';
  assert (select count(*) from public.orcamento_respostas where os_id = os) = 1, 'duplicou resposta';
  select * into r from public.orcamento_respostas where os_id = os;
  assert r.canal = 'link' and r.aprovou and r.respondente_nome = 'Carlos Souza' and r.valor_centavos = 44925, 'prova';
  assert r.registrada_por is null, 'link nao tem usuario';
  assert r.link_id is not null and r.versao_id = current_setting('teste.v1')::uuid, 'prova sem versao';
  assert r.hash_versao = (select hash_conteudo from public.orcamento_versoes where id = r.versao_id), 'hash da versao';
  -- IP dos cabecalhos: cf-connecting-ip vence o x-forwarded-for
  select * into n from public.orcamento_resposta_rede where resposta_id = r.id;
  assert n.ip = '200.1.2.3' and n.ip_fonte = 'cf-connecting-ip', format('IP gravado errado: %s', n.ip);
  assert n.user_agent = 'NavegadorTeste/1.0', 'navegador';
  assert n.apagar_em > now() + interval '11 months' and n.apagar_em < now() + interval '13 months', 'guarda de 12 meses';
  -- os_comercial
  select * into c from public.os_comercial where os_id = os;
  assert c.orcamento_aprovacao_canal = 'link' and c.orcamento_aprovado_por_nome = 'Carlos Souza', 'comercial';
  assert c.orcamento_aprovacao_registrada_por is null, 'registrada_por deveria ser NULL';
  assert c.valor_aprovado_centavos = 44925, 'valor aprovado = total da versao';
  assert c.orcamento_versao_vigente_id is null, 'vigente deveria limpar';
  -- historico: 1 evento, sem usuario, sem texto para o mecanico, texto para o balcao
  assert (select count(*) from public.os_historico where os_id = os and evento = 'aprovacao') = 1, 'historico duplicado';
  select * into h from public.os_historico where os_id = os and evento = 'aprovacao';
  assert h.por is null, 'historico: por deveria ser NULL';
  assert h.observacao is null, 'historico: observacao deveria ser NULL (mecanico le)';
  select observacao into t from public.os_historico_textos where historico_id = h.id;
  assert t = 'por link. Nome informado: Carlos Souza', format('historico interno: %s', t);
  assert (select por_nome from public.vw_os_historico where id = h.id) is null, 'por_nome deveria ser NULL';
end $$;

-- x-forwarded-for como reserva, com fonte registrada; cabecalho invalido nao grava lixo
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000006a1","role":"authenticated"}', true);
set local role authenticated;
select set_config('teste.os2', public.zz_nova_os()::text, true);
select set_config('teste.tk2', public.zz_enviar(current_setting('teste.os2')::uuid), true);
select set_config('teste.os3', public.zz_nova_os()::text, true);
select set_config('teste.tk3', public.zz_enviar(current_setting('teste.os3')::uuid), true);
reset role;
select set_config('request.headers', '{"x-forwarded-for":"177.9.8.7, 10.0.0.1"}', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select public.responder_orcamento(current_setting('teste.tk2'), false, null, 'Achei caro R$ 449,25');
reset role;
select set_config('request.headers', '{"cf-connecting-ip":"nao-e-ip","user-agent":"X"}', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select public.responder_orcamento(current_setting('teste.tk3'), true, 'Beto');
reset role;
select set_config('request.headers', '', true);
do $$
declare r public.orcamento_respostas; n public.orcamento_resposta_rede; t text; h public.os_historico;
begin
  select * into r from public.orcamento_respostas where os_id = current_setting('teste.os2')::uuid;
  select * into n from public.orcamento_resposta_rede where resposta_id = r.id;
  assert n.ip = '177.9.8.7' and n.ip_fonte = 'x-forwarded-for', format('reserva: %s', n.ip);
  select * into r from public.orcamento_respostas where os_id = current_setting('teste.os3')::uuid;
  select * into n from public.orcamento_resposta_rede where resposta_id = r.id;
  assert n.ip is null and n.ip_fonte is null, 'cabecalho invalido nao pode virar IP';

  -- Recusa pelo link: NUNCA cancela; volta para aguardando; motivo so no texto interno
  assert (select status from public.ordens_servico where id = current_setting('teste.os2')::uuid) = 'aguardando_orcamento', 'recusa deveria voltar para aguardando';
  select * into h from public.os_historico where os_id = current_setting('teste.os2')::uuid and evento = 'recusa';
  assert h.por is null and h.observacao is null, 'recusa: historico sem usuario e sem texto para o mecanico';
  select observacao into t from public.os_historico_textos where historico_id = h.id;
  assert t = 'Cliente recusou por link: Achei caro R$ 449,25', format('recusa interna: %s', t);
  assert (select valor_aprovado_centavos from public.os_comercial where os_id = current_setting('teste.os2')::uuid) is null, 'recusa nao tem valor aprovado';
end $$;

-- Pagina: recusa mostra tipo, data e nome (nulo), mas NUNCA o motivo
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $$
declare j jsonb := public.ver_orcamento(current_setting('teste.tk2'));
begin
  assert j ->> 'situacao' = 'recusado', format('ver recusado: %s', j ->> 'situacao');
  assert j -> 'resposta' ->> 'tipo' = 'recusou' and j -> 'resposta' -> 'nome' = 'null'::jsonb, 'resposta da recusa';
  assert j::text !~ 'Achei caro', 'MOTIVO DA RECUSA VOLTOU PARA A PAGINA';
  j := public.responder_orcamento(current_setting('teste.tk2'), false);
  assert j::text !~ 'Achei caro', 'MOTIVO DA RECUSA VOLTOU NA REPETICAO';
  assert not (j ->> 'aplicada')::boolean, 'repetir recusa';
end $$;

-- =============================================================================
-- 6) Respondidos + item depois da aprovacao
-- =============================================================================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000006a3","role":"authenticated"}', true);
set local role authenticated;
do $$
declare os1 uuid := current_setting('teste.os1')::uuid; os2 uuid := current_setting('teste.os2')::uuid; it uuid; o record; n_v jsonb;
begin
  select * into o from public.vw_os where id = os1;
  assert o.orcamento_respondido and o.orcamento_link_situacao = 'aprovado' and o.orcamento_respondido_em is not null, 'respondido: aprovada pelo link';
  assert not coalesce(o.orcamento_itens_travados, false), 'aprovada nao trava';
  select * into o from public.vw_os where id = os2;
  assert o.orcamento_respondido and o.orcamento_link_situacao = 'recusado', 'respondido: recusa pelo link';

  -- item depois da aprovacao: marcado; versao aprovada e valor aprovado intactos
  select conteudo into n_v from public.orcamento_versoes where id = current_setting('teste.v1')::uuid;
  it := public.adicionar_item_os(gen_random_uuid(), os1, 'peca', p_descricao => 'Extra', p_preco_unitario_centavos => 10000);
  assert (select apos_aprovacao from public.os_itens where id = it), 'deveria marcar apos a aprovacao';
  select * into o from public.vw_os where id = os1;
  assert o.total_centavos = 54925 and o.valor_aprovado_centavos = 44925, 'aprovado x atual';
  assert (select conteudo from public.orcamento_versoes where id = current_setting('teste.v1')::uuid) = n_v, 'versao aprovada mudou';
  assert public.conferir_orcamento(current_setting('teste.v1')::uuid), 'hash depois do item novo';
  assert (select count(*) from public.vw_orcamento_provas where os_id = os1) = 1, 'prova';
  assert (select codigo_conferencia from public.vw_orcamento_provas where os_id = os1) ~ '^[0-9A-F]{4}-[0-9A-F]{4}$', 'codigo de conferencia';

  -- comecar servico: sai dos respondidos
  perform public.mudar_status_os(os1, 'aprovada', 'em_andamento');
  assert not (select orcamento_respondido from public.vw_os where id = os1), 'em andamento nao e respondido';
  perform public.mudar_status_os(os1, 'em_andamento', 'aprovada');
  assert (select orcamento_respondido from public.vw_os where id = os1), 'voltou para aprovada';
end $$;

-- =============================================================================
-- 7) Imutabilidade: 3 papeis e postgres
-- =============================================================================
-- [ADMIN] dono, atendente e mecanico: sem permissao nenhuma de escrita
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000006a1","role":"authenticated"}', true);
do $$
declare v uuid := current_setting('teste.v1')::uuid; u text;
begin
  foreach u in array array['00000000-0000-4000-8000-0000000006a1', '00000000-0000-4000-8000-0000000006a3', '00000000-0000-4000-8000-0000000006a2'] loop
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', u), true);
    assert public.zz_estado(format($q$ update public.orcamento_versoes set total_centavos = 1 where id = %L $q$, v)) = '42501', 'update em versao: ' || u;
    assert public.zz_estado(format($q$ delete from public.orcamento_versoes where id = %L $q$, v)) = '42501', 'delete em versao: ' || u;
    assert public.zz_estado($q$ truncate public.orcamento_versoes cascade $q$) = '42501', 'truncate: ' || u;
    assert public.zz_estado($q$ update public.orcamento_respostas set aprovou = false $q$) = '42501', 'update em resposta: ' || u;
    assert public.zz_estado($q$ delete from public.orcamento_respostas $q$) = '42501', 'delete em resposta: ' || u;
    assert public.zz_estado($q$ update public.orcamento_links set expira_em = now() $q$) = '42501', 'update em link: ' || u;
    assert public.zz_estado($q$ update public.orcamento_resposta_rede set ip = '1.1.1.1' $q$) = '42501', 'update em rede: ' || u;
    assert public.zz_estado($q$ delete from public.orcamento_resposta_rede $q$) = '42501', 'delete em rede: ' || u;
    assert public.zz_estado(format($q$ insert into public.orcamento_versoes (oficina_id, os_id, numero, origem, conteudo, subtotal_servicos_centavos, subtotal_pecas_centavos, total_centavos, hash_conteudo)
      values (gen_random_uuid(), gen_random_uuid(), 9, 'link', '{"total_centavos":0}', 0, 0, 0, repeat('a', 64)) $q$)) = '42501', 'insert em versao: ' || u;
  end loop;
end $$;

-- postgres: o trigger barra
reset role;
do $$
declare v uuid := current_setting('teste.v1')::uuid; r uuid; os uuid := current_setting('teste.os1')::uuid;
begin
  select id into r from public.orcamento_respostas where os_id = os;
  assert public.zz_erro(format($q$ update public.orcamento_versoes set total_centavos = 1 where id = %L $q$, v)) = 'orcamento_imutavel', 'postgres: update em versao';
  assert public.zz_erro(format($q$ delete from public.orcamento_versoes where id = %L $q$, v)) = 'orcamento_imutavel', 'postgres: delete em versao';
  assert public.zz_erro($q$ truncate public.orcamento_versoes cascade $q$) = 'orcamento_imutavel', 'postgres: truncate em versao';
  assert public.zz_erro($q$ truncate public.orcamento_respostas cascade $q$) is not null, 'postgres: truncate em resposta';
  assert public.zz_erro(format($q$ update public.orcamento_respostas set aprovou = false where id = %L $q$, r)) = 'orcamento_imutavel', 'postgres: update em resposta';
  assert public.zz_erro(format($q$ update public.orcamento_respostas set respondente_nome = 'Outro', desfeita_em = now(), desfeita_por = gen_random_uuid() where id = %L $q$, r)) = 'orcamento_imutavel', 'postgres: desfeita com mudanca junto';
  assert public.zz_erro(format($q$ delete from public.orcamento_respostas where id = %L $q$, r)) = 'orcamento_imutavel', 'postgres: delete em resposta';
  assert public.zz_erro(format($q$ update public.orcamento_resposta_rede set ip = '1.1.1.1' where resposta_id = %L $q$, r)) = 'orcamento_imutavel', 'postgres: update em rede';
  assert public.zz_erro(format($q$ delete from public.orcamento_resposta_rede where resposta_id = %L $q$, r)) = 'orcamento_imutavel', 'postgres: apagar rede antes do prazo';
  assert public.zz_erro(format($q$ update public.orcamento_links set expira_em = now() + interval '1 year' where os_id = %L $q$, os)) = 'orcamento_imutavel', 'postgres: mudar validade';
  assert public.zz_erro(format($q$ update public.orcamento_links set token_hash = sha256('x'::bytea) where os_id = %L $q$, os)) = 'orcamento_imutavel', 'postgres: trocar o hash';
  assert public.zz_erro(format($q$ update public.orcamento_links set revogado_em = now(), revogado_motivo = 'manual', expira_em = now() where os_id = %L and revogado_em is null $q$, os)) = 'orcamento_imutavel', 'postgres: revogar com mudanca junto';
  assert public.zz_erro(format($q$ delete from public.orcamento_links where os_id = %L $q$, os)) = 'orcamento_imutavel', 'postgres: delete em link';
end $$;

-- [ADMIN] hash acusa alteracao feita com o trigger desligado
alter table public.orcamento_versoes disable trigger orcamento_versoes_a_proteger;
update public.orcamento_versoes set conteudo = jsonb_set(conteudo, '{oficina_nome}', '"Forjada"') where id = current_setting('teste.v1')::uuid;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000006a1","role":"authenticated"}', true);
do $$ begin
  assert not public.conferir_orcamento(current_setting('teste.v1')::uuid), 'HASH NAO ACUSOU A VERSAO FORJADA';
end $$;
reset role;
update public.orcamento_versoes set conteudo = jsonb_set(conteudo, '{oficina_nome}', '"Oficina Diesel A"') where id = current_setting('teste.v1')::uuid;
alter table public.orcamento_versoes enable trigger orcamento_versoes_a_proteger;
alter table public.orcamento_respostas disable trigger orcamento_respostas_a_proteger;
update public.orcamento_respostas set respondente_nome = 'Forjado' where os_id = current_setting('teste.os1')::uuid;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000006a1","role":"authenticated"}', true);
do $$ begin
  assert not public.conferir_orcamento(current_setting('teste.v1')::uuid), 'HASH NAO ACUSOU A RESPOSTA FORJADA';
end $$;
reset role;
update public.orcamento_respostas set respondente_nome = 'Carlos Souza' where os_id = current_setting('teste.os1')::uuid;
alter table public.orcamento_respostas enable trigger orcamento_respostas_a_proteger;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000006a1","role":"authenticated"}', true);
do $$ begin
  assert public.conferir_orcamento(current_setting('teste.v1')::uuid), 'hash deveria voltar a conferir';
end $$;

-- =============================================================================
-- 8) Desfazer: a prova fica, o link nao volta
-- =============================================================================
set local role authenticated;
do $$
declare os uuid := current_setting('teste.os1')::uuid; r public.orcamento_respostas; h_antes text;
begin
  select hash_resposta into h_antes from public.orcamento_respostas where os_id = os;
  perform public.mudar_status_os(os, 'aprovada', 'aguardando_orcamento');
  assert (select status from public.ordens_servico where id = os) = 'aguardando_orcamento', 'desfazer: status';
  -- estado atual limpo
  assert (select valor_aprovado_centavos from public.os_comercial where os_id = os) is null, 'desfazer: valor atual limpo';
  assert (select orcamento_aprovado_em from public.ordens_servico where id = os) is null, 'desfazer: data atual limpa';
  -- prova guardada, marcada
  select * into r from public.orcamento_respostas where os_id = os;
  assert found and r.aprovou and r.valor_centavos = 44925 and r.respondente_nome = 'Carlos Souza', 'DESFAZER APAGOU A PROVA';
  assert r.hash_resposta = h_antes, 'desfazer mudou o hash';
  assert r.desfeita_em is not null and r.desfeita_por = '00000000-0000-4000-8000-0000000006a1' and r.desfeita_por_nome = 'Dono A', 'desfeita por quem';
  assert public.conferir_orcamento(r.versao_id), 'hash confere depois de desfazer';
  assert (select count(*) from public.orcamento_versoes where id = r.versao_id) = 1, 'desfazer apagou a versao';
  -- link revogado
  assert (select revogado_motivo from public.orcamento_links where id = r.link_id) = 'desfeito', 'desfazer: link';
  assert not (select orcamento_respondido from public.vw_os where id = os), 'desfeita nao e respondido';
  -- marca desfeita so uma vez
  assert (select desfeita_por_nome from public.vw_orcamento_provas where id = r.id) = 'Dono A', 'view da prova';
end $$;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $$
declare tk text := current_setting('teste.tk1'); j jsonb;
begin
  -- aprovada e desfeita: encerrado na pagina, sem a resposta antiga
  j := public.ver_orcamento(tk);
  assert j = '{"situacao":"encerrado"}'::jsonb, format('desfeito: %s', j);
  j := public.responder_orcamento(tk, true, 'De novo');
  assert j = '{"situacao":"encerrado"}'::jsonb, format('responder desfeito: %s', j);
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.orcamento_respostas where os_id = current_setting('teste.os1')::uuid) = 1, 'responder desfeito gravou';
  assert public.zz_erro(format($q$ update public.orcamento_respostas set desfeita_em = now(), desfeita_por = gen_random_uuid() where os_id = %L $q$, current_setting('teste.os1'))) = 'orcamento_imutavel', 'desfeita 2 vezes';
end $$;

-- =============================================================================
-- 9) Alterar: link antigo "atualizado"; versao nova, link novo; proxima resposta na nova
-- =============================================================================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000006a1","role":"authenticated"}', true);
set local role authenticated;
select set_config('teste.os4', public.zz_nova_os()::text, true);
select set_config('teste.tk4', public.zz_enviar(current_setting('teste.os4')::uuid), true);
do $$
declare os uuid := current_setting('teste.os4')::uuid; it uuid; r record; v1 uuid;
begin
  select id into it from public.os_itens where os_id = os and tipo = 'servico';
  select versao_id into v1 from public.orcamento_links where os_id = os and revogado_em is null;

  perform public.alterar_orcamento(os);
  perform public.alterar_orcamento(os);  -- reenvio
  assert (select status from public.ordens_servico where id = os) = 'aguardando_orcamento', 'alterar: status';
  assert (select count(*) from public.os_historico where os_id = os and evento = 'orcamento_link' and para_status = 'aguardando_orcamento') = 1, 'alterar: historico duplicado';
  assert (select revogado_motivo from public.orcamento_links where versao_id = v1) = 'alterado', 'alterar: motivo';

  -- itens livres
  update public.os_itens set quantidade = 3 where id = it;
  assert found, 'itens deveriam estar livres';

  -- total antigo agora nao passa
  assert public.zz_erro(format($q$ select * from public.enviar_orcamento(%L, gen_random_uuid(), 44925) $q$, os)) = 'orcamento_mudou', 'conferencia do total';
  select * into r from public.enviar_orcamento(os, gen_random_uuid(), 59925);
  assert r.versao_numero = 2, 'versao nova';
  perform set_config('teste.tk4b', r.token, true);
  -- versao antiga guardada e diferente
  assert (select count(*) from public.vw_orcamento_versoes where os_id = os) = 2, 'versoes guardadas';
  assert (select (conteudo ->> 'total_centavos')::bigint from public.orcamento_versoes where id = v1) = 44925, 'versao antiga mudou';
end $$;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $$
declare j jsonb;
begin
  -- pagina aberta na versao antiga nao aprova a nova sem querer
  j := public.ver_orcamento(current_setting('teste.tk4'));
  assert j = '{"situacao":"atualizado"}'::jsonb, format('atualizado: %s', j);
  j := public.responder_orcamento(current_setting('teste.tk4'), true, 'Cliente');
  assert j = '{"situacao":"atualizado"}'::jsonb, format('responder atualizado: %s', j);
  j := public.ver_orcamento(current_setting('teste.tk4b'));
  assert j ->> 'situacao' = 'aberto' and (j -> 'documento' ->> 'total_centavos')::bigint = 59925, 'link novo';
  j := public.responder_orcamento(current_setting('teste.tk4b'), true, 'Cliente');
  assert (j ->> 'aplicada')::boolean, 'aprovou a nova';
end $$;
reset role;
do $$ begin
  assert (select valor_aprovado_centavos from public.os_comercial where os_id = current_setting('teste.os4')::uuid) = 59925, 'valor = total da versao aprovada';
  assert (select count(*) from public.orcamento_respostas where os_id = current_setting('teste.os4')::uuid) = 1, 'link antigo gravou resposta';
end $$;

-- Prazo e condicoes fazem parte do hash; a previa nao grava
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000006a1","role":"authenticated"}', true);
set local role authenticated;
select set_config('teste.os5', public.zz_nova_os()::text, true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000006a3","role":"authenticated"}', true);
do $$
declare os uuid := current_setting('teste.os5')::uuid; p jsonb; h1 text; n bigint;
begin
  select count(*) into n from public.orcamento_versoes where os_id = os;
  p := public.previa_orcamento(os, '5 dias', 'A vista');
  assert public.zz_chaves(p) = 'documento,expira_em', 'previa: chaves';
  assert p -> 'documento' ->> 'prazo_estimado' = '5 dias', 'previa: prazo';
  assert (select count(*) from public.orcamento_versoes where os_id = os) = n, 'previa gravou versao';
  assert p::text !~* 'custo|7777|8888|SINTOMA_INTERNO|11988887777', 'previa trouxe dado proibido';
  -- atendente: versao sem custo
  perform public.enviar_orcamento(os, gen_random_uuid(), 44925, '5 dias', 'A vista');
  select hash_conteudo into h1 from public.orcamento_versoes where os_id = os;
  assert h1 = encode(sha256(convert_to((select conteudo::text from public.orcamento_versoes where os_id = os), 'UTF8')), 'hex'), 'hash cobre o conteudo';
  assert (select conteudo ->> 'prazo_estimado' from public.orcamento_versoes where os_id = os) = '5 dias', 'prazo na versao';
  assert (select conteudo::text from public.orcamento_versoes where os_id = os) !~* 'custo|margem|7777|8888', 'CUSTO NA VERSAO';
  -- atendente nao ve custo pela view de itens, como antes
  assert (select bool_and(custo_unitario_centavos is null) from public.vw_os_itens where os_id = os), 'atendente viu custo';
end $$;

-- =============================================================================
-- 10) Reenviar: mesma versao, antigo substituido; vencido e cancelado continuam travados
-- =============================================================================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000006a1","role":"authenticated"}', true);
select set_config('teste.os6', public.zz_nova_os()::text, true);
select set_config('teste.tk6', public.zz_enviar(current_setting('teste.os6')::uuid), true);
do $$
declare os uuid := current_setting('teste.os6')::uuid; r record; r2 record; ch uuid := gen_random_uuid(); n bigint;
begin
  select * into r from public.reenviar_orcamento(os, ch);
  assert r.versao_numero = 1 and not r.ja_existia, 'reenviar';
  select count(*) into n from public.os_historico where os_id = os;
  select * into r2 from public.reenviar_orcamento(os, ch);
  assert r2.ja_existia and r2.token <> r.token, 'reenviar: repeticao troca token';
  assert (select count(*) from public.os_historico where os_id = os) = n, 'reenviar: repeticao duplicou historico';
  assert (select count(*) from public.orcamento_versoes where os_id = os) = 1, 'reenviar nao cria versao';
  assert (select count(*) from public.orcamento_links where os_id = os and revogado_em is null) = 1, 'reenviar: 1 link ativo';
  perform set_config('teste.tk6b', r2.token, true);
  perform set_config('teste.tk6r', r.token, true);
end $$;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $$ begin
  assert public.ver_orcamento(current_setting('teste.tk6')) = '{"situacao":"substituido"}'::jsonb, 'antigo: substituido';
  assert public.ver_orcamento(current_setting('teste.tk6r')) = '{"situacao":"substituido"}'::jsonb, 'do meio: substituido';
  assert public.responder_orcamento(current_setting('teste.tk6'), true, 'X Y') = '{"situacao":"substituido"}'::jsonb, 'antigo nao responde';
  assert public.ver_orcamento(current_setting('teste.tk6b')) ->> 'situacao' = 'aberto', 'novo: aberto';
end $$;

-- [ADMIN] Vencido: simula passando a validade com o trigger desligado
reset role;
alter table public.orcamento_links disable trigger orcamento_links_a_proteger;
update public.orcamento_links set expira_em = now() - interval '1 second'
 where os_id = current_setting('teste.os6')::uuid and revogado_em is null;
alter table public.orcamento_links enable trigger orcamento_links_a_proteger;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $$
declare j jsonb;
begin
  j := public.ver_orcamento(current_setting('teste.tk6b'));
  assert j = '{"situacao":"vencido"}'::jsonb, format('VENCIDO MOSTROU DADO: %s', j);
  j := public.responder_orcamento(current_setting('teste.tk6b'), true, 'Tarde Demais');
  assert j = '{"situacao":"vencido"}'::jsonb, format('vencido respondeu: %s', j);
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000006a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare os uuid := current_setting('teste.os6')::uuid; it uuid; r record;
begin
  assert (select status from public.ordens_servico where id = os) = 'orcamento_enviado', 'vencido nao muda o status';
  assert (select orcamento_link_situacao from public.vw_os where id = os) = 'vencido', 'etiqueta Link vencido';
  assert (select orcamento_itens_travados from public.vw_os where id = os), 'vencido continua travado';
  select id into it from public.os_itens where os_id = os limit 1;
  assert public.zz_erro(format($q$ update public.os_itens set quantidade = 9 where id = %L $q$, it)) = 'orcamento_travado', 'TRAVA: LINK VENCIDO';
  assert not exists (select 1 from public.orcamento_respostas where os_id = os), 'vencido gravou resposta';
  -- reenviar renova
  select * into r from public.reenviar_orcamento(os, gen_random_uuid());
  assert r.expira_em > now() and r.versao_numero = 1, 'reenviar renova';
  assert (select orcamento_link_situacao from public.vw_os where id = os) = 'aberto', 'renovado';
  perform set_config('teste.tk6c', r.token, true);

  -- Cancelar link: OS fica em orcamento_enviado, itens travados, sai por reenviar
  assert public.cancelar_link_orcamento(os), 'cancelar';
  assert not public.cancelar_link_orcamento(os), 'cancelar de novo devolve false';
  assert (select count(*) from public.os_historico where os_id = os and evento = 'orcamento_link' and para_status = 'orcamento_enviado') >= 2, 'historico do cancelar';
  assert (select status from public.ordens_servico where id = os) = 'orcamento_enviado', 'cancelar mantem o status';
  assert (select orcamento_itens_travados from public.vw_os where id = os), 'cancelado continua travado';
  assert public.zz_erro(format($q$ update public.os_itens set quantidade = 9 where id = %L $q$, it)) = 'orcamento_travado', 'TRAVA: LINK CANCELADO';
  assert public.zz_erro(format($q$ update public.os_itens_precos set preco_unitario_centavos = 1 where item_id = %L $q$, it)) = 'orcamento_travado', 'TRAVA: PRECO COM LINK CANCELADO';
  assert (select link_situacao from public.vw_orcamento_situacao where os_id = os) = 'encerrado', 'cancelado: situacao';
  assert (select link_revogado_motivo from public.vw_orcamento_situacao where os_id = os) = 'manual', 'cancelado: motivo';
  assert (select link_revogado_por_nome from public.vw_orcamento_situacao where os_id = os) = 'Dono A', 'cancelado: quem';
  assert public.zz_erro(format($q$ select * from public.enviar_orcamento(%L, gen_random_uuid(), 44925) $q$, os)) = 'orcamento_ja_enviado', 'cancelado: enviar nao, reenviar sim';
end $$;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $$ begin
  assert public.ver_orcamento(current_setting('teste.tk6c')) = '{"situacao":"encerrado"}'::jsonb, 'cancelado: encerrado';
  assert public.responder_orcamento(current_setting('teste.tk6c'), true, 'X Y') = '{"situacao":"encerrado"}'::jsonb, 'cancelado nao responde';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000006a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare os uuid := current_setting('teste.os6')::uuid; r record;
begin
  select * into r from public.reenviar_orcamento(os, gen_random_uuid());
  assert r.versao_numero = 1, 'reenviar depois de cancelar: mesma versao';
  perform set_config('teste.tk6d', r.token, true);
end $$;

-- =============================================================================
-- 11) Link x mao
-- =============================================================================
do $$
declare os uuid := current_setting('teste.os6')::uuid; r public.orcamento_respostas;
begin
  -- mao com link ativo: usa a mesma versao, revoga o link, grava a prova
  perform public.registrar_resposta_orcamento(os, 'orcamento_enviado', true, 'telefone', 'Ricardo, gerente');
  perform public.registrar_resposta_orcamento(os, 'orcamento_enviado', true, 'telefone', 'Ricardo, gerente'); -- reenvio
  assert (select status from public.ordens_servico where id = os) = 'aprovada', 'mao: status';
  assert (select count(*) from public.orcamento_versoes where os_id = os) = 1, 'mao com link nao cria versao';
  assert (select count(*) from public.orcamento_respostas where os_id = os) = 1, 'mao duplicou prova';
  select * into r from public.orcamento_respostas where os_id = os;
  assert r.canal = 'telefone' and r.link_id is null and r.registrada_por = '00000000-0000-4000-8000-0000000006a1' and r.respondente_nome = 'Ricardo, gerente', 'prova da mao';
  assert (select orcamento_aprovacao_canal from public.os_comercial where os_id = os) = 'telefone', 'mao: canal';
  assert not (select orcamento_respondido from public.vw_os where id = os), 'mao nao conta em respondidos';
  assert exists (select 1 from public.os_historico where os_id = os and evento = 'aprovacao' and observacao = 'por telefone'), 'historico distingue a mao';
end $$;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $$ begin
  assert public.ver_orcamento(current_setting('teste.tk6d')) = '{"situacao":"encerrado"}'::jsonb, 'mao: link encerrado';
  assert public.responder_orcamento(current_setting('teste.tk6d'), false) = '{"situacao":"encerrado"}'::jsonb, 'mao: link nao responde';
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.orcamento_respostas where os_id = current_setting('teste.os6')::uuid) = 1, 'link gravou depois da mao';
end $$;

-- Link aprovou primeiro: a mao recebe o aviso e nada muda
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000006a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare os uuid := current_setting('teste.os3')::uuid; os2 uuid := current_setting('teste.os2')::uuid;
begin
  assert public.zz_erro(format($q$ select public.registrar_resposta_orcamento(%L, 'orcamento_enviado', true, 'telefone', 'Outro') $q$, os)) = 'cliente_ja_respondeu', 'link x mao: aprovou';
  assert (select orcamento_aprovacao_canal from public.os_comercial where os_id = os) = 'link', 'link x mao: vale o link';
  assert public.zz_erro(format($q$ select public.alterar_orcamento(%L) $q$, os)) = 'cliente_ja_respondeu', 'alterar depois do cliente';
  assert public.zz_erro(format($q$ select * from public.reenviar_orcamento(%L, gen_random_uuid()) $q$, os)) = 'cliente_ja_respondeu', 'reenviar depois do cliente';
  assert public.zz_erro(format($q$ select public.registrar_resposta_orcamento(%L, 'orcamento_enviado', false, 'telefone') $q$, os2)) = 'cliente_ja_respondeu', 'link x mao: recusou';
  assert public.zz_erro(format($q$ select public.alterar_orcamento(%L) $q$, os2)) = 'cliente_ja_respondeu', 'alterar depois da recusa';

  -- Recusa pelo link nao impede marcar a mao depois: congela versao nova se nao havia vigente
  perform public.registrar_resposta_orcamento(os2, 'aguardando_orcamento', true, 'whatsapp', 'Mudou de ideia');
  assert (select status from public.ordens_servico where id = os2) = 'aprovada', 'recusa + mao';
  assert (select count(*) from public.orcamento_respostas where os_id = os2) = 2, 'duas respostas guardadas';
  assert (select count(*) from public.orcamento_versoes where os_id = os2 and origem = 'manual') = 1, 'mao congela versao';
  assert (select orcamento_link_situacao from public.vw_os where id = os2) = 'encerrado', 'recusa + mao: link encerrado';
end $$;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $$ begin
  -- recusa pelo link + aprovacao a mao: a pagina nao mostra mais a resposta antiga
  assert public.ver_orcamento(current_setting('teste.tk2')) = '{"situacao":"encerrado"}'::jsonb, 'recusa + mao: encerrado na pagina';
end $$;

-- Recusa a mao com link ativo: para o link e guarda a prova
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000006a1","role":"authenticated"}', true);
set local role authenticated;
select set_config('teste.os7', public.zz_nova_os()::text, true);
select set_config('teste.tk7', public.zz_enviar(current_setting('teste.os7')::uuid), true);
do $$
declare os uuid := current_setting('teste.os7')::uuid;
begin
  perform public.registrar_resposta_orcamento(os, 'orcamento_enviado', false, 'telefone', null, 'Muito caro');
  assert (select status from public.ordens_servico where id = os) = 'aguardando_orcamento', 'recusa a mao: status';
  assert (select count(*) from public.orcamento_respostas where os_id = os and not aprovou and canal = 'telefone' and motivo = 'Muito caro') = 1, 'recusa a mao: prova';
  assert (select revogado_motivo from public.orcamento_links where os_id = os) = 'resposta_manual', 'recusa a mao: link';
end $$;

-- =============================================================================
-- 12) Cancelar OS e trocar para direto revogam
-- =============================================================================
select set_config('teste.os8', public.zz_nova_os()::text, true);
select set_config('teste.tk8', public.zz_enviar(current_setting('teste.os8')::uuid), true);
select set_config('teste.os9', public.zz_nova_os()::text, true);
select set_config('teste.tk9', public.zz_enviar(current_setting('teste.os9')::uuid), true);
select public.mudar_status_os(current_setting('teste.os8')::uuid, 'orcamento_enviado', 'cancelada', 'Cliente desistiu');
select public.trocar_modo_os(current_setting('teste.os9')::uuid, 'direto', 'Quem Autorizou');
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $$ begin
  assert public.ver_orcamento(current_setting('teste.tk8')) = '{"situacao":"encerrado"}'::jsonb, 'OS cancelada: encerrado';
  assert public.responder_orcamento(current_setting('teste.tk8'), true, 'X Y') = '{"situacao":"encerrado"}'::jsonb, 'OS cancelada nao responde';
  assert public.ver_orcamento(current_setting('teste.tk9')) = '{"situacao":"encerrado"}'::jsonb, 'modo direto: encerrado';
  assert public.responder_orcamento(current_setting('teste.tk9'), false) = '{"situacao":"encerrado"}'::jsonb, 'modo direto nao responde';
end $$;
reset role;
do $$ begin
  assert (select revogado_motivo from public.orcamento_links where os_id = current_setting('teste.os8')::uuid) = 'cancelada', 'motivo: cancelada';
  assert (select revogado_motivo from public.orcamento_links where os_id = current_setting('teste.os9')::uuid) = 'modo_direto', 'motivo: modo_direto';
  assert (select count(*) from public.orcamento_versoes where os_id = current_setting('teste.os8')::uuid) = 1, 'cancelar apagou a versao';
end $$;

-- Desfazer de aprovada para orcamento_enviado (app antigo) tambem nao devolve o link
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000006a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare os uuid := current_setting('teste.os3')::uuid;
begin
  perform public.mudar_status_os(os, 'aprovada', 'orcamento_enviado');
  assert (select desfeita_em from public.orcamento_respostas where os_id = os) is not null, 'desfazer para enviado: prova desfeita';
  assert (select revogado_motivo from public.orcamento_links where os_id = os) = 'desfeito', 'desfazer para enviado: link';
  assert not coalesce((select orcamento_itens_travados from public.vw_os where id = os), false), 'desfazer para enviado: nao trava';
  -- sai dali por um novo envio
  perform public.enviar_orcamento(os, gen_random_uuid(), 44925);
  assert (select count(*) from public.orcamento_versoes where os_id = os) = 2, 'novo envio: versao 2';
end $$;

-- =============================================================================
-- 13) OS antiga em orcamento_enviado sem link: Fase 2 intacta
-- =============================================================================
do $$
declare os uuid := public.zz_nova_os(); it uuid; r record;
begin
  perform public.mudar_status_os(os, 'aguardando_orcamento', 'orcamento_enviado');
  select id into it from public.os_itens where os_id = os and tipo = 'servico';
  update public.os_itens set quantidade = 2 where id = it;
  assert found, 'OS antiga: itens seguem editaveis';
  assert public.zz_erro(format($q$ select * from public.reenviar_orcamento(%L, gen_random_uuid()) $q$, os)) = 'sem_versao_enviada', 'OS antiga: sem o que reenviar';
  assert not public.cancelar_link_orcamento(os), 'OS antiga: sem link para cancelar';
  -- a mao congela versao e grava a prova, valor igual ao total
  perform public.registrar_resposta_orcamento(os, 'orcamento_enviado', true, 'presencial', 'Dono do caminhao');
  assert (select status from public.ordens_servico where id = os) = 'aprovada', 'OS antiga: aprova a mao';
  assert (select valor_aprovado_centavos from public.os_comercial where os_id = os) = 44925, 'OS antiga: valor';
  assert (select origem from public.orcamento_versoes where os_id = os) = 'manual', 'OS antiga: versao manual';
  -- recusa a mao sem versao: so historico, como na Fase 2
  os := public.zz_nova_os();
  perform public.mudar_status_os(os, 'aguardando_orcamento', 'orcamento_enviado');
  perform public.registrar_resposta_orcamento(os, 'orcamento_enviado', false, 'telefone');
  assert (select status from public.ordens_servico where id = os) = 'aguardando_orcamento', 'OS antiga: recusa';
  assert not exists (select 1 from public.orcamento_versoes where os_id = os), 'OS antiga: recusa nao congela';
  -- OS antiga pode mandar o link: nao muda o status, cria a versao
  os := public.zz_nova_os();
  perform public.mudar_status_os(os, 'aguardando_orcamento', 'orcamento_enviado');
  select * into r from public.enviar_orcamento(os, gen_random_uuid(), 44925);
  assert r.versao_numero = 1 and (select status from public.ordens_servico where id = os) = 'orcamento_enviado', 'OS antiga: manda o link';
  assert (select orcamento_itens_travados from public.vw_os where id = os), 'OS antiga: com link, trava';
end $$;

-- =============================================================================
-- 14) Limite de tentativas por link
-- =============================================================================
select set_config('teste.os10', public.zz_nova_os()::text, true);
select set_config('teste.tk10', public.zz_enviar(current_setting('teste.os10')::uuid), true);
select set_config('teste.os11', public.zz_nova_os()::text, true);
select set_config('teste.tk11', public.zz_enviar(current_setting('teste.os11')::uuid), true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $$
declare i integer; j jsonb; tk text := current_setting('teste.tk10');
begin
  -- cliente normal abre varias vezes
  for i in 1..30 loop
    j := public.ver_orcamento(tk);
    assert j ->> 'situacao' = 'aberto', format('CLIENTE NORMAL BLOQUEADO na abertura %s', i);
  end loop;
  for i in 31..120 loop
    j := public.ver_orcamento(tk);
  end loop;
  assert j ->> 'situacao' = 'aberto', 'a 120a leitura ainda vale';
  j := public.ver_orcamento(tk);
  assert j = '{"situacao":"limite"}'::jsonb, format('121a leitura deveria barrar: %s', j);
  -- outro link nao e afetado
  assert public.ver_orcamento(current_setting('teste.tk11')) ->> 'situacao' = 'aberto', 'limite de um link afetou outro';
  -- responder ainda tem a propria conta: leitura em excesso nao impede a resposta
  j := public.responder_orcamento(tk, true);
  assert j ->> 'erro' = 'nome_obrigatorio', 'leitura em excesso nao deveria barrar a resposta';
  -- excesso na resposta: 30 por janela (a 1a ja foi acima)
  for i in 2..30 loop
    j := public.responder_orcamento(tk, true);
    assert j ->> 'erro' = 'nome_obrigatorio', format('tentativa %s', i);
  end loop;
  j := public.responder_orcamento(tk, true, 'Passou Do Limite');
  assert j = '{"situacao":"limite"}'::jsonb, format('31a resposta deveria barrar: %s', j);
end $$;
reset role;
do $$ begin
  assert not exists (select 1 from public.orcamento_respostas where os_id = current_setting('teste.os10')::uuid), 'LIMITE GRAVOU A RESPOSTA';
  assert (select status from public.ordens_servico where id = current_setting('teste.os10')::uuid) = 'orcamento_enviado', 'limite mudou o status';
  -- janela nova: libera sozinho, sem rotina
  update private.orcamento_tentativas t set janela = janela - interval '10 minutes'
    from public.orcamento_links l where l.id = t.link_id and l.os_id = current_setting('teste.os10')::uuid;
  assert (select count(*) from private.orcamento_tentativas t join public.orcamento_links l on l.id = t.link_id where l.os_id = current_setting('teste.os10')::uuid) = 1, 'tentativas: 1 linha por link';
end $$;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $$
declare j jsonb;
begin
  j := public.ver_orcamento(current_setting('teste.tk10'));
  assert j ->> 'situacao' = 'aberto', 'janela nova deveria liberar';
  j := public.responder_orcamento(current_setting('teste.tk10'), true, 'Agora Vai');
  assert (j ->> 'aplicada')::boolean, 'janela nova deveria liberar a resposta';
end $$;
reset role;
do $$ begin
  -- token invalido nao grava contador nenhum
  assert (select count(*) from private.orcamento_tentativas t
           where not exists (select 1 from public.orcamento_links l where l.id = t.link_id)) = 0, 'tentativa sem link';
end $$;

-- =============================================================================
-- 15) GET: transacao somente leitura nao entrega o orcamento (PostgREST em GET)
-- =============================================================================
savepoint antes_ro;
set local transaction_read_only = on;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $$
begin
  assert public.zz_estado(format($q$ select public.ver_orcamento(%L) $q$, current_setting('teste.tk11'))) = '25006', 'leitura por GET deveria falhar';
end $$;
rollback to savepoint antes_ro;

-- =============================================================================
-- 16) Mecanico: 0 linhas de tudo, nenhum detalhe; acoes barradas
-- =============================================================================
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000006a2","role":"authenticated"}', true);
set local role authenticated;
do $$
declare os uuid := current_setting('teste.os1')::uuid; os2 uuid := current_setting('teste.os2')::uuid; t text; o record;
begin
  assert (select count(*) from public.orcamento_versoes) = 0, 'MECANICO LEU VERSOES';
  assert (select count(*) from public.orcamento_links) = 0, 'MECANICO LEU LINKS';
  assert (select count(*) from public.orcamento_respostas) = 0, 'MECANICO LEU RESPOSTAS';
  assert (select count(*) from public.orcamento_resposta_rede) = 0, 'MECANICO LEU REDE';
  assert (select count(*) from public.vw_orcamento_situacao) = 0, 'MECANICO LEU vw_orcamento_situacao';
  assert (select count(*) from public.vw_orcamento_versoes) = 0, 'MECANICO LEU vw_orcamento_versoes';
  assert (select count(*) from public.vw_orcamento_provas) = 0, 'MECANICO LEU vw_orcamento_provas';
  assert public.zz_estado('select 1 from private.orcamento_tentativas') = '42501', 'MECANICO LEU tentativas';

  -- vw_os: ve o status, nada do orcamento
  select * into o from public.vw_os where id = os2;
  assert found and o.status is not null, 'mecanico ve a OS dele';
  assert o.orcamento_link_situacao is null and o.orcamento_respondido is null and o.orcamento_itens_travados is null and o.orcamento_respondido_em is null, 'MECANICO RECEBEU DADO DO ORCAMENTO NA vw_os';
  assert o.valor_aprovado_centavos is null, 'mecanico: valor aprovado';

  -- historico: nada de valor, nome, motivo, canal, versao
  select string_agg(coalesce(observacao, ''), ' ') into t from public.vw_os_historico where os_id in (os, os2);
  assert t !~* 'carlos|achei caro|449|R\$|link|versao|versão|nome informado', format('MECANICO LEU NO HISTORICO: %s', t);
  select string_agg(coalesce(observacao, ''), ' ') into t from public.os_historico where os_id in (os, os2);
  assert t !~* 'carlos|achei caro|449|R\$|link|versao|versão|nome informado', format('MECANICO LEU NA TABELA: %s', t);
  assert (select count(*) from public.os_historico_textos) = 0, 'MECANICO LEU TEXTOS';
  assert (select count(*) from public.os_comercial) = 0, 'MECANICO LEU COMERCIAL';

  -- acoes
  assert public.zz_estado(format($q$ select * from public.enviar_orcamento(%L, gen_random_uuid(), 44925) $q$, os2)) = '42501', 'mecanico enviou';
  assert public.zz_estado(format($q$ select * from public.reenviar_orcamento(%L, gen_random_uuid()) $q$, os2)) = '42501', 'mecanico reenviou';
  assert public.zz_estado(format($q$ select public.cancelar_link_orcamento(%L) $q$, os2)) = '42501', 'mecanico cancelou';
  assert public.zz_estado(format($q$ select public.alterar_orcamento(%L) $q$, os2)) = '42501', 'mecanico alterou';
  assert public.zz_estado(format($q$ select public.previa_orcamento(%L) $q$, os2)) = '42501', 'mecanico viu a previa';
  assert public.zz_estado(format($q$ select public.conferir_orcamento(%L) $q$, current_setting('teste.v1'))) = '42501', 'mecanico conferiu';
end $$;

-- =============================================================================
-- 17) Isolamento A x B
-- =============================================================================
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000006b1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare osA uuid := current_setting('teste.os1')::uuid; osA2 uuid := current_setting('teste.os10')::uuid; vA uuid := current_setting('teste.v1')::uuid; osB uuid := current_setting('teste.osB')::uuid;
begin
  assert not exists (select 1 from public.orcamento_versoes where os_id = osA or id = vA), 'B LEU VERSAO DE A';
  assert not exists (select 1 from public.orcamento_links where os_id = osA), 'B LEU LINK DE A';
  assert not exists (select 1 from public.orcamento_respostas where os_id = osA), 'B LEU RESPOSTA DE A';
  assert (select count(*) from public.orcamento_versoes where os_id <> osB) = 0, 'B LEU VERSOES DE OUTRA OFICINA';
  assert (select count(*) from public.orcamento_respostas where os_id <> osB) = 0, 'B LEU RESPOSTAS DE OUTRA OFICINA';
  assert (select count(*) from public.orcamento_resposta_rede) = 0, 'B LEU REDE';
  assert not exists (select 1 from public.vw_orcamento_situacao where os_id = osA), 'B LEU vw_orcamento_situacao';
  assert not exists (select 1 from public.vw_orcamento_versoes where os_id = osA), 'B LEU vw_orcamento_versoes';
  assert not exists (select 1 from public.vw_orcamento_provas where os_id = osA), 'B LEU vw_orcamento_provas';
  -- RPCs com o id na mao
  assert public.zz_erro(format($q$ select * from public.enviar_orcamento(%L, gen_random_uuid(), 44925) $q$, osA)) = 'os_nao_encontrada', 'B enviou OS de A';
  assert public.zz_erro(format($q$ select * from public.reenviar_orcamento(%L, gen_random_uuid()) $q$, osA)) = 'os_nao_encontrada', 'B reenviou';
  assert public.zz_erro(format($q$ select public.cancelar_link_orcamento(%L) $q$, osA)) = 'os_nao_encontrada', 'B cancelou';
  assert public.zz_erro(format($q$ select public.alterar_orcamento(%L) $q$, osA)) = 'os_nao_encontrada', 'B alterou';
  assert public.zz_erro(format($q$ select public.previa_orcamento(%L) $q$, osA)) = 'os_nao_encontrada', 'B viu a previa de A';
  assert public.zz_erro(format($q$ select public.conferir_orcamento(%L) $q$, vA)) = 'versao_nao_encontrada', 'B conferiu versao de A';
  assert public.zz_erro(format($q$ select public.registrar_resposta_orcamento(%L, 'orcamento_enviado', true, 'telefone') $q$, osA)) = 'os_nao_encontrada', 'B respondeu por A';
  -- B ve o que e dele
  assert (select count(*) from public.vw_orcamento_versoes) = 1, 'B deveria ver a versao dele';
end $$;

-- =============================================================================
-- 18) LGPD: IP e navegador saem depois do prazo; a prova e o hash ficam
-- =============================================================================
reset role;
do $$
declare r uuid; v uuid; n integer;
begin
  select id, versao_id into r, v from public.orcamento_respostas
   where os_id = current_setting('teste.os6')::uuid limit 1;  -- resposta a mao: nao tem linha de rede
  insert into public.orcamento_resposta_rede (resposta_id, oficina_id, ip, user_agent, apagar_em)
  values (r, current_setting('teste.oficina_a')::uuid, '1.2.3.4', 'Velho', now() - interval '1 day');
  perform set_config('teste.rVelha', r::text, true);
  perform set_config('teste.vVelha', v::text, true);
end $$;
-- vencido some da leitura mesmo antes de ser apagado
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000006a1","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  assert not exists (select 1 from public.orcamento_resposta_rede where resposta_id = current_setting('teste.rVelha')::uuid), 'rede vencida ainda legivel';
  assert exists (select 1 from public.orcamento_resposta_rede where ip = '200.1.2.3'), 'rede no prazo deveria ser legivel pelo dono';
end $$;
reset role;
do $$
declare n integer;
begin
  n := private.expurgar_rede_orcamento();
  assert n = 1, format('expurgo apagou %s', n);
  assert not exists (select 1 from public.orcamento_resposta_rede where resposta_id = current_setting('teste.rVelha')::uuid), 'expurgo nao apagou';
  assert exists (select 1 from public.orcamento_respostas where id = current_setting('teste.rVelha')::uuid), 'expurgo apagou a prova';
  assert exists (select 1 from public.orcamento_resposta_rede where ip = '200.1.2.3'), 'expurgo apagou o que estava no prazo';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000006a1","role":"authenticated"}', true);
do $$ begin
  assert public.conferir_orcamento(current_setting('teste.vVelha')::uuid), 'hash deveria conferir depois do expurgo';
end $$;

-- =============================================================================
reset role;
select 'FASE 6 OK: orcamento por link passou' as resultado;

rollback;
