-- =============================================================================
-- MechaFlow - Fase 3 - Teste do banco: mecanico lanca itens + fotos da OS
--
-- O que prova:
--   * mecanico lanca servico/peca do catalogo (preco e custo copiados pelo
--     banco) e avulsos (ficam sem preco); nao le preco/custo/total de nada,
--     nem dos itens que ele lancou; nao escreve direto em os_itens;
--   * so lanca/altera/remove em aguardando_orcamento, aprovada e em_andamento,
--     so na OS atribuida a ele, so os itens dele e so antes do balcao precificar;
--   * item lancado depois da aprovacao fica marcado, o total aprovado continua
--     o mesmo e o status nao muda; a marca zera ao desfazer a aprovacao;
--   * item sem preco bloqueia a entrega; "apos a aprovacao" nao bloqueia;
--   * observacao do balcao (observacoes) fora do alcance do mecanico; dono e
--     atendente leem e editam;
--   * fotos: tabela isolada A x B e por mecanico, limite de 40, regras de
--     enviar e apagar por papel e status;
--   * bucket privado e politicas de storage.objects (ler/listar/URL assinada =
--     SELECT; subir = INSERT; apagar = DELETE), com set local role + claims.
--
-- [STAGING] As secoes marcadas com [STORAGE] usam o schema storage do
-- Supabase. No PGlite elas rodam contra uma copia minima (buckets/objects),
-- entao o resultado que vale para o Storage e o do STAGING. Limite de 5 MB e
-- "so JPEG" sao conferidos pela API do Storage (testar-staging, F3-B7), nao
-- pelo SQL: aqui so se confere a configuracao do bucket.
--
-- Como rodar: SQL Editor do Supabase STAGING (usuario postgres), DEPOIS das
-- migracoes 05, 06 e 07 da Fase 3. Colar tudo e executar.
-- Resultado esperado: 'FASE 3 OK: itens do mecanico e fotos passaram'.
-- Tudo dentro de uma transacao que termina em ROLLBACK: nada fica gravado
-- (nenhum arquivo e criado de verdade: as linhas de storage.objects inseridas
-- aqui somem no ROLLBACK).
-- =============================================================================

begin;

-- Auxiliares do teste (somem no ROLLBACK).
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
-- linhas afetadas por um UPDATE/DELETE (RLS filtra em silencio)
create function public.zz_afetadas(p_sql text) returns integer language plpgsql as $$
declare n integer;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.zz_erro(text), public.zz_estado(text), public.zz_afetadas(text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 0) Usuarios: a1 dono A | a2 mecanico A (das OS) | a3 atendente A
--              a4 mecanico A2 (ve todas) | a5 mecanico A3 (nao ve) | b1 dono B
-- -----------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email, '', now(),
       '{"provider":"email","providers":["email"]}', '{}', now(), now()
  from (values
    ('00000000-0000-4000-8000-0000000003a1', 'f3.dono.a@teste.invalid'),
    ('00000000-0000-4000-8000-0000000003a2', 'f3.mec.a@teste.invalid'),
    ('00000000-0000-4000-8000-0000000003a3', 'f3.atd.a@teste.invalid'),
    ('00000000-0000-4000-8000-0000000003a4', 'f3.mec2.a@teste.invalid'),
    ('00000000-0000-4000-8000-0000000003a5', 'f3.mec3.a@teste.invalid'),
    ('00000000-0000-4000-8000-0000000003b1', 'f3.dono.b@teste.invalid')
  ) as u(id, email);

-- =============================================================================
-- 1) DONO A: oficina, equipe, catalogo, veiculo e 4 OS
-- =============================================================================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003a1","role":"authenticated"}', true);
set local role authenticated;

select set_config('teste.oficina_a', public.criar_oficina('Oficina A F3', 'Dono A', private.versao_termos_vigente())::text, true);
select set_config('teste.tk_mec',  (select token from public.criar_convite('mecanico', 'Mecanico A')), true);
select set_config('teste.tk_atd',  (select token from public.criar_convite('atendente', 'Atendente A')), true);
select set_config('teste.tk_mec2', (select token from public.criar_convite('mecanico', 'Mecanico A2')), true);
select set_config('teste.tk_mec3', (select token from public.criar_convite('mecanico', 'Mecanico A3')), true);

with s as (insert into public.catalogo_servicos (nome) values ('Troca de oleo') returning id)
select set_config('teste.servico', (select id::text from s), true);
insert into public.catalogo_servicos_precos (servico_id, preco_padrao_centavos) values (current_setting('teste.servico')::uuid, 25000);
-- servico do catalogo SEM preco
with s as (insert into public.catalogo_servicos (nome) values ('Regulagem de valvulas') returning id)
select set_config('teste.servico_sem_preco', (select id::text from s), true);
with p as (insert into public.catalogo_pecas (nome, unidade) values ('Filtro de oleo', 'un') returning id)
select set_config('teste.peca', (select id::text from p), true);
insert into public.catalogo_pecas_precos (peca_id, preco_venda_centavos) values (current_setting('teste.peca')::uuid, 18000);
insert into public.catalogo_pecas_custos (peca_id, custo_centavos)      values (current_setting('teste.peca')::uuid, 9000);

with c as (insert into public.clientes (nome, telefone) values ('Transportadora F3', '11988887777') returning id)
select set_config('teste.cliente', (select id::text from c), true);
with v as (insert into public.veiculos (cliente_id, placa) values (current_setting('teste.cliente')::uuid, 'FTR3A33') returning id)
select set_config('teste.veiculo', (select id::text from v), true);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003a2","role":"authenticated"}', true);
select public.aceitar_convite(current_setting('teste.tk_mec'), 'Mecanico A', private.versao_termos_vigente());
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003a3","role":"authenticated"}', true);
select public.aceitar_convite(current_setting('teste.tk_atd'), 'Atendente A', private.versao_termos_vigente());
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003a4","role":"authenticated"}', true);
select public.aceitar_convite(current_setting('teste.tk_mec2'), 'Mecanico A2', private.versao_termos_vigente());
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003a5","role":"authenticated"}', true);
select public.aceitar_convite(current_setting('teste.tk_mec3'), 'Mecanico A3', private.versao_termos_vigente());

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003a1","role":"authenticated"}', true);
select public.atualizar_membro('00000000-0000-4000-8000-0000000003a4', p_ve_todas_os => true);

-- OS A: com orcamento, mecanico a2, com observacao do balcao (tem valor e telefone)
select set_config('teste.osA', (select os_id::text from public.abrir_os('f3000000-0000-4000-8000-00000000000a',
  p_veiculo_id => current_setting('teste.veiculo')::uuid, p_mecanico_id => '00000000-0000-4000-8000-0000000003a2',
  p_observacoes => '  Cliente paga R$ 900 no pix, ligar 11999998888  ')), true);
-- OS X: com orcamento, mecanico a4 (nao e do a2)
select set_config('teste.osX', (select os_id::text from public.abrir_os('f3000000-0000-4000-8000-00000000000b',
  p_veiculo_id => current_setting('teste.veiculo')::uuid, p_mecanico_id => '00000000-0000-4000-8000-0000000003a4')), true);
-- OS D: direta (ja em_andamento), mecanico a2 -> fotos
select set_config('teste.osD', (select os_id::text from public.abrir_os('f3000000-0000-4000-8000-00000000000c',
  p_veiculo_id => current_setting('teste.veiculo')::uuid, p_mecanico_id => '00000000-0000-4000-8000-0000000003a2',
  p_modo => 'direto', p_autorizado_por_nome => 'Joao motorista')), true);
-- OS E: com orcamento, mecanico a2 -> desfazer aprovacao
select set_config('teste.osE', (select os_id::text from public.abrir_os('f3000000-0000-4000-8000-00000000000d',
  p_veiculo_id => current_setting('teste.veiculo')::uuid, p_mecanico_id => '00000000-0000-4000-8000-0000000003a2')), true);

-- =============================================================================
-- 2) OBSERVACOES (F3-A3): dono/atendente leem e editam; a coluna saiu da OS
-- =============================================================================
do $$
declare
  osA uuid := current_setting('teste.osA')::uuid;
  osX uuid := current_setting('teste.osX')::uuid;
begin
  assert (select observacoes from public.vw_os where id = osA) = 'Cliente paga R$ 900 no pix, ligar 11999998888',
    'dono deveria ler a observacao pela vw_os (sem espacos nas pontas)';
  assert (select observacoes from public.os_comercial where os_id = osA) = 'Cliente paga R$ 900 no pix, ligar 11999998888',
    'observacao deveria estar em os_comercial';
  assert not exists (select 1 from information_schema.columns
                      where table_schema = 'public' and table_name = 'ordens_servico' and column_name = 'observacoes'),
    'a coluna observacoes continua em ordens_servico (o mecanico le essa tabela)';
  assert public.zz_afetadas(format($q$ update public.os_comercial set observacoes = '  Deixar a chave na portaria ' where os_id = %L $q$, osX)) = 1,
    'dono deveria editar a observacao';
  assert (select observacoes from public.vw_os where id = osX) = 'Deixar a chave na portaria', 'observacao editada nao normalizada';
  -- dono nao edita outras colunas comerciais direto
  assert public.zz_estado(format($q$ update public.os_comercial set valor_aprovado_centavos = 1 where os_id = %L $q$, osX)) = '42501',
    'dono editou valor aprovado direto';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003a3","role":"authenticated"}', true);
do $$
begin
  assert public.zz_afetadas(format($q$ update public.os_comercial set observacoes = 'Atendente anotou' where os_id = %L $q$,
                                   current_setting('teste.osX'))) = 1, 'atendente deveria editar a observacao';
  assert (select observacoes from public.vw_os where id = current_setting('teste.osA')::uuid) like 'Cliente paga R$ 900%',
    'atendente deveria ler a observacao';
end $$;

-- =============================================================================
-- 3) MECANICO A (a2) lanca na OS A (aguardando_orcamento)
-- =============================================================================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003a2","role":"authenticated"}', true);
do $$
declare
  osA uuid := current_setting('teste.osA')::uuid;
  i_cat uuid; i_peca uuid; i_avulsa uuid; i_semcat uuid; i_extra uuid;
  r record;
begin
  -- observacao do balcao: nao chega ao mecanico
  assert (select count(*) from public.ordens_servico where id = osA) = 1, 'mecanico deveria ver a OS A';
  assert (select observacoes from public.vw_os where id = osA) is null, 'MECANICO LE A OBSERVACAO DO BALCAO PELA vw_os';
  assert not exists (select 1 from public.ordens_servico o where row_to_json(o)::text like '%R$%'
                        or row_to_json(o)::text like '%11999998888%'), 'MECANICO LE A OBSERVACAO EM ordens_servico';
  assert not exists (select 1 from public.vw_os v where row_to_json(v)::text like '%R$%'
                        or row_to_json(v)::text like '%11999998888%'), 'MECANICO LE A OBSERVACAO EM vw_os';
  assert (select count(*) from public.os_comercial) = 0, 'MECANICO LE os_comercial';
  assert public.zz_afetadas(format($q$ update public.os_comercial set observacoes = 'x' where os_id = %L $q$, osA)) = 0,
    'mecanico editou a observacao';

  -- lanca: servico e peca do catalogo, peca avulsa, servico do catalogo sem preco, avulso extra
  i_cat    := public.adicionar_item_os('f3100000-0000-4000-8000-000000000001', osA, 'servico', p_servico_id => current_setting('teste.servico')::uuid);
  i_peca   := public.adicionar_item_os('f3100000-0000-4000-8000-000000000002', osA, 'peca', p_peca_id => current_setting('teste.peca')::uuid, p_quantidade => 2);
  i_avulsa := public.adicionar_item_os('f3100000-0000-4000-8000-000000000003', osA, 'peca', p_descricao => 'Mangueira do intercooler');
  i_semcat := public.adicionar_item_os('f3100000-0000-4000-8000-000000000004', osA, 'servico', p_servico_id => current_setting('teste.servico_sem_preco')::uuid);
  i_extra  := public.adicionar_item_os('f3100000-0000-4000-8000-000000000005', osA, 'servico', p_descricao => 'Lavar motor');
  perform set_config('teste.i_cat', i_cat::text, true);
  perform set_config('teste.i_peca', i_peca::text, true);
  perform set_config('teste.i_avulsa', i_avulsa::text, true);
  perform set_config('teste.i_semcat', i_semcat::text, true);

  -- reenvio
  assert public.adicionar_item_os('f3100000-0000-4000-8000-000000000001', osA, 'servico',
                                  p_servico_id => current_setting('teste.servico')::uuid) = i_cat, 'reenvio do mecanico duplicou';
  assert (select count(*) from public.os_itens where os_id = osA) = 5, 'mecanico deveria ver os 5 itens que lancou';

  -- a RPC devolve so o id (nenhum valor)
  assert pg_get_function_result('public.adicionar_item_os(uuid, uuid, public.tipo_item_os, uuid, uuid, text, numeric, text, integer, integer)'::regprocedure) = 'uuid',
    'adicionar_item_os deveria devolver so o uuid';

  -- NENHUM valor, nem dos itens dele
  assert (select count(*) from public.os_itens_precos) = 0, 'MECANICO VE PRECO DO ITEM QUE LANCOU';
  assert (select count(*) from public.os_itens_custos) = 0, 'MECANICO VE CUSTO DO ITEM QUE LANCOU';
  assert (select count(*) from public.vw_os_totais) = 0, 'MECANICO VE vw_os_totais';
  assert not exists (select 1 from public.vw_os_itens where os_id = osA
                      and (preco_unitario_centavos is not null or subtotal_centavos is not null or custo_unitario_centavos is not null)),
    'MECANICO VE VALOR DO ITEM QUE LANCOU PELA vw_os_itens';
  select * into r from public.vw_os where id = osA;
  assert r.total_centavos is null and r.itens_sem_preco is null and r.qtd_itens is null and r.valor_aprovado_centavos is null
     and r.itens_mecanico is null and r.itens_apos_aprovacao is null, 'MECANICO VE TOTAIS PELA vw_os';
  assert (select bool_and(lancado_pelo_mecanico and mecanico_pode_alterar) from public.vw_os_itens where os_id = osA),
    'itens do mecanico deveriam estar marcados e editaveis por ele';

  -- nao grava valor; nao escreve direto na tabela
  assert public.zz_estado(format($q$ select public.adicionar_item_os(gen_random_uuid(), %L, 'servico', p_descricao => 'X',
                                    p_preco_unitario_centavos => 1) $q$, osA)) = '42501', 'mecanico gravou preco';
  assert public.zz_estado(format($q$ select public.adicionar_item_os(gen_random_uuid(), %L, 'peca',
                                    p_peca_id => %L, p_custo_unitario_centavos => 1) $q$, osA, current_setting('teste.peca'))) = '42501',
    'mecanico gravou custo';
  assert public.zz_estado(format($q$ insert into public.os_itens (os_id, tipo, descricao) values (%L, 'servico', 'Direto') $q$, osA)) = '42501',
    'mecanico inseriu item direto';
  assert public.zz_afetadas(format($q$ update public.os_itens set quantidade = 9 where id = %L $q$, i_cat)) = 0,
    'mecanico alterou item direto (deveria ser so pela RPC)';
  assert public.zz_afetadas(format($q$ delete from public.os_itens where id = %L $q$, i_extra)) = 0,
    'mecanico apagou item direto (deveria ser so pela RPC)';
  assert public.zz_estado(format($q$ insert into public.os_itens_precos (item_id, preco_unitario_centavos) values (%L, 1) $q$, i_avulsa)) = '42501',
    'mecanico gravou preco direto';

  -- altera e remove os dele
  perform public.alterar_item_mecanico(i_avulsa, p_quantidade => 2);
  assert (select quantidade from public.os_itens where id = i_avulsa) = 2, 'mecanico nao alterou a quantidade';
  perform public.alterar_item_mecanico(i_avulsa, p_descricao => '  Mangueira do intercooler 2"  ');
  assert (select descricao from public.os_itens where id = i_avulsa) = 'Mangueira do intercooler 2"', 'descricao nao alterada';
  assert public.zz_erro(format($q$ select public.alterar_item_mecanico(%L, p_quantidade => 0) $q$, i_avulsa)) = 'quantidade_invalida',
    'quantidade zero aceita';
  assert public.zz_erro(format($q$ select public.alterar_item_mecanico(%L, p_descricao => '  ') $q$, i_avulsa)) = 'descricao_obrigatoria',
    'descricao vazia aceita';
  assert public.remover_item_mecanico(i_extra), 'mecanico nao removeu o item dele';
  assert not public.remover_item_mecanico(i_extra), 'reenvio da remocao deveria devolver false';
  assert public.zz_erro($q$ select public.alterar_item_mecanico(gen_random_uuid(), p_quantidade => 1) $q$) = 'item_nao_encontrado',
    'item inexistente deveria dar item_nao_encontrado';

  -- OS que nao e dele
  assert public.zz_erro(format($q$ select public.adicionar_item_os(gen_random_uuid(), %L, 'servico', p_descricao => 'X') $q$,
                               current_setting('teste.osX'))) = 'os_nao_encontrada', 'mecanico lancou em OS que nao e dele';

  -- OS direta em andamento: item nao e "apos aprovacao"
  perform set_config('teste.i_d', public.adicionar_item_os('f3100000-0000-4000-8000-000000000010', current_setting('teste.osD')::uuid,
                     'servico', p_servico_id => current_setting('teste.servico')::uuid)::text, true);
  assert not (select apos_aprovacao from public.os_itens where id = current_setting('teste.i_d')::uuid),
    'OS direta nao tem aprovacao: item nao deveria ser marcado';
end $$;

-- =============================================================================
-- 4) DONO A: preco copiado, pendencias, item do balcao, precificar
-- =============================================================================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003a1","role":"authenticated"}', true);
do $$
declare
  osA uuid := current_setting('teste.osA')::uuid;
  r record;
begin
  assert (select preco_unitario_centavos from public.os_itens_precos where item_id = current_setting('teste.i_cat')::uuid) = 25000,
    'preco do servico do catalogo nao copiado no item do mecanico';
  assert (select preco_unitario_centavos from public.os_itens_precos where item_id = current_setting('teste.i_peca')::uuid) = 18000,
    'preco da peca do catalogo nao copiado';
  assert (select custo_unitario_centavos from public.os_itens_custos where item_id = current_setting('teste.i_peca')::uuid) = 9000,
    'custo da peca do catalogo nao copiado';
  assert not exists (select 1 from public.os_itens_precos where item_id in (current_setting('teste.i_avulsa')::uuid, current_setting('teste.i_semcat')::uuid)),
    'avulso / catalogo sem preco deveriam ficar SEM preco';

  select * into r from public.vw_os where id = osA;
  assert r.itens_sem_preco = 2 and r.itens_mecanico = 4 and r.itens_apos_aprovacao = 0,
    format('pendencias erradas na vw_os: sem_preco=%s mecanico=%s apos=%s', r.itens_sem_preco, r.itens_mecanico, r.itens_apos_aprovacao);
  assert (select lancado_por_nome from public.vw_os_itens where id = current_setting('teste.i_avulsa')::uuid) = 'Mecanico A',
    'nome de quem lancou';
  assert not exists (select 1 from public.vw_os_itens where os_id = osA and mecanico_pode_alterar),
    'mecanico_pode_alterar deveria ser false para o dono';

  -- item do balcao (com preco)
  perform set_config('teste.i_balcao', public.adicionar_item_os('f3100000-0000-4000-8000-000000000006', osA, 'servico',
                     p_descricao => 'Diagnostico', p_preco_unitario_centavos => 10000)::text, true);
  assert not (select lancado_pelo_mecanico from public.os_itens where id = current_setting('teste.i_balcao')::uuid),
    'item do balcao marcado como do mecanico';

  -- balcao precifica o avulso do mecanico -> so leitura para ele
  insert into public.os_itens_precos (item_id, preco_unitario_centavos) values (current_setting('teste.i_avulsa')::uuid, 7000);
  assert (select precificado_pelo_balcao_em from public.os_itens where id = current_setting('teste.i_avulsa')::uuid) is not null,
    'precificar pelo balcao nao travou o item para o mecanico';
  assert (select precificado_pelo_balcao_em from public.os_itens where id = current_setting('teste.i_cat')::uuid) is null,
    'preco copiado do catalogo nao deveria travar o item do mecanico';
end $$;

-- =============================================================================
-- 5) MECANICO: item precificado, item do balcao, outro mecanico
-- =============================================================================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003a2","role":"authenticated"}', true);
do $$
begin
  assert public.zz_erro(format($q$ select public.alterar_item_mecanico(%L, p_quantidade => 3) $q$, current_setting('teste.i_avulsa')))
    = 'item_ja_precificado', 'mecanico mudou item ja precificado pelo balcao';
  assert public.zz_erro(format($q$ select public.remover_item_mecanico(%L) $q$, current_setting('teste.i_avulsa')))
    = 'item_ja_precificado', 'mecanico removeu item ja precificado pelo balcao';
  assert public.zz_erro(format($q$ select public.alterar_item_mecanico(%L, p_quantidade => 3) $q$, current_setting('teste.i_balcao')))
    = 'item_de_outra_pessoa', 'mecanico mudou item do balcao';
  assert public.zz_erro(format($q$ select public.remover_item_mecanico(%L) $q$, current_setting('teste.i_balcao')))
    = 'item_de_outra_pessoa', 'mecanico removeu item do balcao';
  assert not (select mecanico_pode_alterar from public.vw_os_itens where id = current_setting('teste.i_avulsa')::uuid),
    'item precificado deveria aparecer como nao editavel';
  assert not (select mecanico_pode_alterar from public.vw_os_itens where id = current_setting('teste.i_balcao')::uuid),
    'item do balcao deveria aparecer como nao editavel';
  -- o do catalogo (preco veio do catalogo, balcao nao mexeu) continua dele
  perform public.alterar_item_mecanico(current_setting('teste.i_cat')::uuid, p_quantidade => 1);
  -- ainda sem ver valor do item do balcao
  assert (select preco_unitario_centavos from public.vw_os_itens where id = current_setting('teste.i_balcao')::uuid) is null,
    'MECANICO VE PRECO DO ITEM DO BALCAO';
end $$;

-- a4 ve todas as OS, mas nao lanca nem mexe na OS do a2
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003a4","role":"authenticated"}', true);
do $$
begin
  assert (select count(*) from public.ordens_servico where id = current_setting('teste.osA')::uuid) = 1, 'a4 (ve todas) deveria ver a OS A';
  assert public.zz_estado(format($q$ select public.adicionar_item_os(gen_random_uuid(), %L, 'servico', p_descricao => 'X') $q$,
                                 current_setting('teste.osA'))) = '42501', 'mecanico (ve todas) lancou em OS que nao e dele';
  assert public.zz_estado(format($q$ select public.alterar_item_mecanico(%L, p_quantidade => 5) $q$, current_setting('teste.i_cat'))) = '42501',
    'mecanico (ve todas) mexeu em item de outro mecanico';
  assert (select count(*) from public.vw_os_totais) = 0, 'MECANICO (ve todas) VE TOTAIS';
end $$;

-- =============================================================================
-- 6) Status: orcamento_enviado bloqueia; aprovada permite (marca "apos a aprovacao")
-- =============================================================================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003a3","role":"authenticated"}', true);
insert into public.os_itens_precos (item_id, preco_unitario_centavos) values (current_setting('teste.i_semcat')::uuid, 30000);
select public.mudar_status_os(current_setting('teste.osA')::uuid, 'aguardando_orcamento', 'orcamento_enviado');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003a2","role":"authenticated"}', true);
do $$
begin
  assert public.zz_erro(format($q$ select public.adicionar_item_os(gen_random_uuid(), %L, 'servico', p_descricao => 'X') $q$,
                               current_setting('teste.osA'))) = 'status_nao_permite_itens', 'mecanico lancou com orcamento enviado';
  assert public.zz_erro(format($q$ select public.alterar_item_mecanico(%L, p_quantidade => 2) $q$, current_setting('teste.i_cat')))
    = 'status_nao_permite_itens', 'mecanico alterou item com orcamento enviado';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003a3","role":"authenticated"}', true);
select public.registrar_resposta_orcamento(current_setting('teste.osA')::uuid, 'orcamento_enviado', true, 'whatsapp', 'Gerente');
do $$
begin
  -- 25000 + 2x18000 + 2x7000 + 30000 + 10000
  assert (select valor_aprovado_centavos from public.os_comercial where os_id = current_setting('teste.osA')::uuid) = 115000,
    'valor aprovado errado: ' || (select valor_aprovado_centavos from public.os_comercial where os_id = current_setting('teste.osA')::uuid);
  assert (select itens_apos_aprovacao from public.vw_os where id = current_setting('teste.osA')::uuid) = 0,
    'nenhum item deveria estar marcado logo depois da aprovacao';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003a2","role":"authenticated"}', true);
do $$
declare
  osA uuid := current_setting('teste.osA')::uuid;
  i_pos uuid; i_pos2 uuid;
begin
  -- aprovada: pode lancar; fica marcado; status nao muda
  i_pos := public.adicionar_item_os('f3100000-0000-4000-8000-000000000007', osA, 'peca', p_descricao => 'Abracadeira');
  perform set_config('teste.i_pos', i_pos::text, true);
  assert (select apos_aprovacao from public.os_itens where id = i_pos), 'item depois da aprovacao nao foi marcado';
  assert (select status from public.ordens_servico where id = osA) = 'aprovada', 'item novo mudou o status da OS';
  assert (select mecanico_pode_alterar from public.vw_os_itens where id = i_pos), 'mecanico deveria poder alterar o item novo';

  -- em andamento: pode lancar
  perform public.mudar_status_os(osA, 'aprovada', 'em_andamento');
  i_pos2 := public.adicionar_item_os('f3100000-0000-4000-8000-000000000008', osA, 'servico', p_servico_id => current_setting('teste.servico')::uuid);
  perform set_config('teste.i_pos2', i_pos2::text, true);
  assert (select apos_aprovacao from public.os_itens where id = i_pos2), 'item em andamento (apos aprovacao) nao foi marcado';

  -- pronta: nao pode
  perform public.marcar_pronta(osA);
  assert public.zz_erro(format($q$ select public.adicionar_item_os(gen_random_uuid(), %L, 'servico', p_descricao => 'X') $q$, osA))
    = 'status_nao_permite_itens', 'mecanico lancou com a OS pronta';
  assert public.zz_erro(format($q$ select public.remover_item_mecanico(%L) $q$, i_pos)) = 'status_nao_permite_itens',
    'mecanico removeu item com a OS pronta';
end $$;

-- =============================================================================
-- 7) DONO: total aprovado preservado, sem preco bloqueia a entrega, apos aprovacao so avisa
-- =============================================================================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003a1","role":"authenticated"}', true);
do $$
declare
  osA uuid := current_setting('teste.osA')::uuid;
  r record;
begin
  select * into r from public.vw_os where id = osA;
  assert r.status = 'pronta', 'OS A deveria estar pronta';
  assert r.valor_aprovado_centavos = 115000, 'total aprovado mudou com item novo';
  assert r.total_centavos = 140000, 'total atual errado (115000 + 25000), veio ' || r.total_centavos;
  assert r.itens_apos_aprovacao = 2, 'deveria haver 2 itens apos a aprovacao';
  assert r.itens_sem_preco = 1, 'a abracadeira avulsa deveria estar sem preco';

  assert public.zz_erro(format($q$ select public.entregar_os(%L, 'Mangueira rompida', 'Troca da mangueira', 'pix', true) $q$, osA))
    = 'os_itens_sem_preco', 'entregou com item do mecanico sem preco';
  insert into public.os_itens_precos (item_id, preco_unitario_centavos) values (current_setting('teste.i_pos')::uuid, 500);
  perform public.entregar_os(osA, 'Mangueira rompida', 'Troca da mangueira', 'pix', true);  -- "apos aprovacao" nao bloqueia
  assert (select status from public.ordens_servico where id = osA) = 'entregue', 'OS A nao foi entregue';
  assert (select valor_aprovado_centavos from public.os_comercial where os_id = osA) = 115000, 'entrega mudou o valor aprovado';

  -- OS entregue: observacao continua editavel (como na Fase 2)
  assert public.zz_afetadas(format($q$ update public.os_comercial set observacoes = 'Cliente buscou' where os_id = %L $q$, osA)) = 1,
    'observacao deveria continuar editavel na OS entregue';

  -- OS E: aprovar, mecanico lanca, desfazer a aprovacao zera a marca
  perform public.adicionar_item_os('f3100000-0000-4000-8000-000000000020', current_setting('teste.osE')::uuid, 'servico',
                                   p_servico_id => current_setting('teste.servico')::uuid);
  perform public.registrar_resposta_orcamento(current_setting('teste.osE')::uuid, 'aguardando_orcamento', true, 'telefone');
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003a2","role":"authenticated"}', true);
do $$
begin
  assert public.zz_erro(format($q$ select public.adicionar_item_os(gen_random_uuid(), %L, 'servico', p_descricao => 'X') $q$,
                               current_setting('teste.osA'))) = 'os_fechada', 'mecanico lancou em OS entregue';
  assert public.zz_erro(format($q$ select public.alterar_item_mecanico(%L, p_quantidade => 2) $q$, current_setting('teste.i_cat')))
    = 'os_fechada', 'mecanico alterou item de OS entregue';
  perform set_config('teste.i_e', public.adicionar_item_os('f3100000-0000-4000-8000-000000000021', current_setting('teste.osE')::uuid,
                     'servico', p_descricao => 'Reaperto')::text, true);
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003a1","role":"authenticated"}', true);
do $$
begin
  assert (select apos_aprovacao from public.os_itens where id = current_setting('teste.i_e')::uuid), 'OS E: item nao marcado';
  perform public.mudar_status_os(current_setting('teste.osE')::uuid, 'aprovada', 'aguardando_orcamento');
  assert not (select apos_aprovacao from public.os_itens where id = current_setting('teste.i_e')::uuid),
    'desfazer a aprovacao deveria zerar a marca "apos a aprovacao"';
end $$;

-- =============================================================================
-- 8) FOTOS: registro (tabela e RPCs)
-- =============================================================================
-- [STORAGE] o bucket e privado, 5 MB, so JPEG (lido como postgres)
reset role;
do $$
begin
  assert exists (select 1 from storage.buckets where id = 'os-fotos' and public = false
                   and file_size_limit = 5242880 and allowed_mime_types = array['image/jpeg']),
    'bucket os-fotos deveria ser PRIVADO, 5 MB, so image/jpeg';
end $$;
set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003a2","role":"authenticated"}', true);
do $$
declare
  osD uuid := current_setting('teste.osD')::uuid;
  f1  uuid := 'f3f00000-0000-4000-8000-000000000001';
  r   record;
begin
  select * into r from public.registrar_foto(f1, osD, 1600, 1200, 400000, 30000, 'diagnostico', ' Vazamento no carter ');
  assert r.caminho = current_setting('teste.oficina_a') || '/' || osD || '/' || f1 || '.jpg', 'caminho da foto errado: ' || r.caminho;
  assert r.caminho_miniatura = current_setting('teste.oficina_a') || '/' || osD || '/' || f1 || '_mini.jpg', 'caminho da miniatura errado';
  assert not r.enviada and not r.ja_existia, 'registro novo deveria vir pendente';
  perform set_config('teste.f1_caminho', r.caminho, true);
  perform set_config('teste.f1_mini', r.caminho_miniatura, true);

  select * into r from public.registrar_foto(f1, osD, 1600, 1200, 400000, 30000, 'diagnostico');
  assert r.ja_existia, 'reenvio do registro deveria devolver ja_existia';
  assert (select count(*) from public.os_fotos where id = f1) = 1, 'reenvio do registro duplicou';
  assert (select legenda from public.os_fotos where id = f1) = 'Vazamento no carter', 'legenda nao normalizada';

  assert public.zz_erro(format($q$ select public.registrar_foto(gen_random_uuid(), %L, 1600, 1200, 6000000, 30000) $q$, osD))
    = 'foto_grande_demais', 'aceitou foto maior que 5 MB';
  assert public.zz_erro(format($q$ select public.registrar_foto(gen_random_uuid(), %L, 0, 1200, 1000, 100) $q$, osD))
    = 'foto_invalida', 'aceitou largura 0';
  assert public.zz_erro(format($q$ select public.registrar_foto(gen_random_uuid(), %L, 1600, 1200, 1000, 100) $q$,
                               current_setting('teste.osX'))) = 'os_nao_encontrada', 'mecanico registrou foto em OS que nao e dele';
  assert public.zz_erro(format($q$ select public.registrar_foto(%L, %L, 1600, 1200, 1000, 100) $q$, f1,
                               current_setting('teste.osE'))) = 'foto_invalida', 'mesmo id em outra OS aceito';
  assert public.zz_erro(format($q$ select public.confirmar_foto(%L) $q$, f1)) = 'foto_nao_enviada',
    'confirmou foto sem o arquivo no bucket';
  assert public.zz_estado(format($q$ insert into public.os_fotos (id, oficina_id, os_id, largura, altura, tamanho_bytes, tamanho_miniatura_bytes)
      values (gen_random_uuid(), %L, %L, 1, 1, 1, 1) $q$, current_setting('teste.oficina_a'), osD)) = '42501',
    'mecanico inseriu foto direto na tabela';
  assert public.zz_estado(format($q$ update public.os_fotos set legenda = 'x' where id = %L $q$, f1)) = '42501',
    'mecanico alterou foto direto';
  assert public.zz_estado(format($q$ delete from public.os_fotos where id = %L $q$, f1)) = '42501',
    'mecanico apagou foto direto na tabela';
  assert (select count(*) from public.vw_os_fotos where os_id = osD) = 0, 'foto pendente apareceu na galeria';
end $$;

-- a4 (ve todas) nao envia na OS do a2; a5 nem ve
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003a4","role":"authenticated"}', true);
do $$
begin
  assert public.zz_estado(format($q$ select public.registrar_foto(gen_random_uuid(), %L, 1600, 1200, 1000, 100) $q$,
                                 current_setting('teste.osD'))) = '42501', 'mecanico (ve todas) enviou foto em OS que nao e dele';
end $$;

-- dono registra a foto 2 (ainda sem arquivo)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003a1","role":"authenticated"}', true);
select set_config('teste.f2_caminho', (select caminho from public.registrar_foto('f3f00000-0000-4000-8000-000000000002',
  current_setting('teste.osD')::uuid, 1200, 1600, 350000, 25000, 'entrega')), true);
select set_config('teste.f2_mini', (select caminho_miniatura from public.os_fotos where id = 'f3f00000-0000-4000-8000-000000000002'), true);

-- =============================================================================
-- 9) [STORAGE] subir (INSERT em storage.objects) - como o Storage faz, com o JWT de quem envia
-- =============================================================================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003a2","role":"authenticated"}', true);
do $$
declare
  e text;
  pasta_osX text := current_setting('teste.oficina_a') || '/' || current_setting('teste.osX') || '/';
begin
  e := public.zz_erro(format($q$ insert into storage.objects (bucket_id, name, metadata)
         values ('os-fotos', %L, '{"size": 398000, "mimetype": "image/jpeg"}') $q$, current_setting('teste.f1_caminho')));
  assert e is null, 'mecanico deveria subir a foto registrada por ele: ' || coalesce(e, '');
  e := public.zz_erro(format($q$ insert into storage.objects (bucket_id, name, metadata)
         values ('os-fotos', %L, '{"size": 30000, "mimetype": "image/jpeg"}') $q$, current_setting('teste.f1_mini')));
  assert e is null, 'mecanico deveria subir a miniatura: ' || coalesce(e, '');

  -- caminhos forjados
  assert public.zz_estado(format($q$ insert into storage.objects (bucket_id, name) values ('os-fotos', %L) $q$,
                                 pasta_osX || gen_random_uuid() || '.jpg')) = '42501', 'mecanico subiu arquivo na pasta de outra OS';
  assert public.zz_estado(format($q$ insert into storage.objects (bucket_id, name) values ('os-fotos', %L) $q$,
                                 current_setting('teste.oficina_a') || '/' || current_setting('teste.osD') || '/' || gen_random_uuid() || '.jpg')) = '42501',
    'mecanico subiu arquivo sem registro';
  assert public.zz_estado(format($q$ insert into storage.objects (bucket_id, name) values ('os-fotos', %L) $q$,
                                 current_setting('teste.f2_caminho'))) = '42501', 'mecanico subiu no registro de outra pessoa';

  perform public.confirmar_foto('f3f00000-0000-4000-8000-000000000001');
  perform public.confirmar_foto('f3f00000-0000-4000-8000-000000000001');  -- reenvio
  assert (select enviada_em from public.os_fotos where id = 'f3f00000-0000-4000-8000-000000000001') is not null, 'confirmacao nao marcou enviada';
  assert (select tamanho_bytes from public.os_fotos where id = 'f3f00000-0000-4000-8000-000000000001') = 398000,
    'confirmacao deveria gravar o tamanho real informado pelo Storage';
  -- foto ja enviada: nao sobrescreve nem sobe de novo
  assert public.zz_estado(format($q$ insert into storage.objects (bucket_id, name) values ('os-fotos', %L) $q$,
                                 current_setting('teste.f1_caminho'))) in ('42501', '23505'), 'subiu de novo por cima da foto enviada';
  assert (select count(*) from storage.objects where bucket_id = 'os-fotos'
           and name like current_setting('teste.oficina_a') || '/' || current_setting('teste.osD') || '/%') = 2,
    'mecanico deveria ver (listar) os 2 arquivos da foto dele';
  assert (select count(*) from public.vw_os_fotos where os_id = current_setting('teste.osD')::uuid) = 1, 'foto enviada fora da galeria';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003a1","role":"authenticated"}', true);
do $$
begin
  perform public.zz_erro(format($q$ insert into storage.objects (bucket_id, name, metadata) values ('os-fotos', %L, '{"size": 350000}') $q$,
                                current_setting('teste.f2_caminho')));
  perform public.zz_erro(format($q$ insert into storage.objects (bucket_id, name, metadata) values ('os-fotos', %L, '{"size": 25000}') $q$,
                                current_setting('teste.f2_mini')));
  perform public.confirmar_foto('f3f00000-0000-4000-8000-000000000002');
  assert (select count(*) from public.vw_os_fotos where os_id = current_setting('teste.osD')::uuid) = 2, 'dono: 2 fotos na galeria';
  assert (select qtd_fotos from public.vw_os where id = current_setting('teste.osD')::uuid) = 2, 'vw_os.qtd_fotos errado';
end $$;

-- =============================================================================
-- 10) [STORAGE] ler / listar / URL assinada (SELECT em storage.objects)
-- =============================================================================
-- a4 ve todas: ve as fotos da OS D (e o atendente tambem)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003a4","role":"authenticated"}', true);
do $$
begin
  assert (select count(*) from storage.objects where bucket_id = 'os-fotos') = 4, 'mecanico (ve todas) deveria ver os 4 arquivos';
  assert (select count(*) from public.os_fotos where os_id = current_setting('teste.osD')::uuid) = 2, 'mecanico (ve todas) deveria ver as fotos';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003a3","role":"authenticated"}', true);
do $$
begin
  assert (select count(*) from storage.objects where bucket_id = 'os-fotos') = 4, 'atendente deveria ver os 4 arquivos';
end $$;

-- a5: mecanico que NAO ve a OS D: nada, nem com o caminho
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003a5","role":"authenticated"}', true);
do $$
begin
  assert (select count(*) from public.os_fotos) = 0, 'MECANICO VE FOTO DE OS QUE NAO E DELE (tabela)';
  assert (select count(*) from public.vw_os_fotos) = 0, 'MECANICO VE FOTO DE OS QUE NAO E DELE (view)';
  assert (select count(*) from storage.objects where bucket_id = 'os-fotos') = 0, 'MECANICO LISTA FOTO DE OS QUE NAO E DELE';
  assert not exists (select 1 from storage.objects where bucket_id = 'os-fotos' and name = current_setting('teste.f1_caminho')),
    'MECANICO ABRE FOTO DE OS QUE NAO E DELE COM O CAMINHO';
  assert public.zz_erro(format($q$ select public.registrar_foto(gen_random_uuid(), %L, 1600, 1200, 1000, 100) $q$,
                               current_setting('teste.osD'))) = 'os_nao_encontrada', 'mecanico enviou foto em OS que nao ve';
  assert public.zz_estado(format($q$ insert into storage.objects (bucket_id, name) values ('os-fotos', %L) $q$,
                                 current_setting('teste.oficina_a') || '/' || current_setting('teste.osD') || '/' || gen_random_uuid() || '.jpg')) = '42501',
    'mecanico subiu arquivo em OS que nao ve';
  perform set_config('storage.allow_delete_query', 'true', true);
  assert public.zz_afetadas(format($q$ delete from storage.objects where bucket_id = 'os-fotos' and name = %L $q$,
                                   current_setting('teste.f1_caminho'))) = 0, 'mecanico apagou arquivo de OS que nao ve';
end $$;

-- =============================================================================
-- 11) Limite de 40 fotos por OS (registros pendentes de ate 24 h contam)
-- =============================================================================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003a1","role":"authenticated"}', true);
do $$
declare k int;
begin
  for k in 3..40 loop
    perform public.registrar_foto(gen_random_uuid(), current_setting('teste.osD')::uuid, 1600, 1200, 1000, 100);
  end loop;
  assert (select count(*) from public.os_fotos where os_id = current_setting('teste.osD')::uuid) = 40, 'deveria haver 40 registros';
  assert public.zz_erro(format($q$ select public.registrar_foto(gen_random_uuid(), %L, 1600, 1200, 1000, 100) $q$,
                               current_setting('teste.osD'))) = 'limite_fotos', 'a 41a foto foi aceita';
end $$;
-- registro pendente velho (mais de 24 h, nunca enviado) deixa de contar
reset role;
update public.os_fotos set criado_em = now() - interval '25 hours'
 where id = (select id from public.os_fotos where os_id = current_setting('teste.osD')::uuid and enviada_em is null limit 1);
set local role authenticated;
do $$
begin
  perform public.registrar_foto('f3f00000-0000-4000-8000-000000000041', current_setting('teste.osD')::uuid, 1600, 1200, 1000, 100);
  assert public.zz_erro(format($q$ select public.registrar_foto(gen_random_uuid(), %L, 1600, 1200, 1000, 100) $q$,
                               current_setting('teste.osD'))) = 'limite_fotos', 'limite nao voltou a valer';
end $$;

-- =============================================================================
-- 12) DONO B: nada da A (tabela, RPC e Storage com o caminho na mao)
-- =============================================================================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003b1","role":"authenticated"}', true);
select set_config('teste.oficina_b', public.criar_oficina('Oficina B F3', 'Dono B', private.versao_termos_vigente())::text, true);
do $$
declare r record;
begin
  assert (select count(*) from public.os_fotos) = 0, 'DONO B VE FOTOS DA A (tabela)';
  assert (select count(*) from public.vw_os_fotos) = 0, 'DONO B VE FOTOS DA A (view)';
  assert (select count(*) from storage.objects where bucket_id = 'os-fotos') = 0, 'DONO B LISTA ARQUIVOS DA A';
  assert not exists (select 1 from storage.objects where name = current_setting('teste.f1_caminho')),
    'DONO B ABRE (OU GERA URL ASSINADA DE) FOTO DA A COM O CAMINHO';
  assert public.zz_erro(format($q$ select public.registrar_foto(gen_random_uuid(), %L, 1600, 1200, 1000, 100) $q$,
                               current_setting('teste.osD'))) = 'os_nao_encontrada', 'dono B registrou foto em OS da A';
  assert public.zz_erro($q$ select public.confirmar_foto('f3f00000-0000-4000-8000-000000000001') $q$) = 'foto_nao_encontrada',
    'dono B confirmou foto da A';
  assert not public.apagar_foto('f3f00000-0000-4000-8000-000000000001'), 'dono B apagou foto da A';
  assert public.zz_estado(format($q$ insert into storage.objects (bucket_id, name) values ('os-fotos', %L) $q$,
                                 current_setting('teste.oficina_a') || '/' || current_setting('teste.osD') || '/' || gen_random_uuid() || '.jpg')) = '42501',
    'DONO B SUBIU ARQUIVO NA PASTA DA A';
  -- mesmo com um registro proprio, nao sobe no caminho da A
  select * into r from public.abrir_os(gen_random_uuid(), p_placa => 'BBB3B33', p_cliente_nome => 'Cliente B');
  perform public.registrar_foto('f3f00000-0000-4000-8000-0000000000b1', r.os_id, 1600, 1200, 1000, 100);
  assert (select caminho from public.os_fotos where id = 'f3f00000-0000-4000-8000-0000000000b1')
         like current_setting('teste.oficina_b') || '/%', 'foto da B fora da pasta da B';
  assert public.zz_estado(format($q$ insert into storage.objects (bucket_id, name) values ('os-fotos', %L) $q$,
                                 current_setting('teste.f1_caminho'))) = '42501', 'DONO B SUBIU POR CIMA DO CAMINHO DA A';
  perform set_config('storage.allow_delete_query', 'true', true);
  assert public.zz_afetadas($q$ delete from storage.objects where bucket_id = 'os-fotos' $q$) = 0, 'DONO B APAGOU ARQUIVO DA A';
end $$;

-- =============================================================================
-- 13) Apagar: OS aberta (mecanico so as dele) e OS entregue (so o dono)
-- =============================================================================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003a4","role":"authenticated"}', true);
do $$
begin
  perform set_config('storage.allow_delete_query', 'true', true);
  assert public.zz_afetadas(format($q$ delete from storage.objects where bucket_id = 'os-fotos' and name = %L $q$,
                                   current_setting('teste.f1_caminho'))) = 0, 'mecanico (ve todas) apagou arquivo de foto de outro';
  assert public.zz_erro($q$ select public.apagar_foto('f3f00000-0000-4000-8000-000000000001') $q$) = 'foto_nao_pode_apagar',
    'mecanico (ve todas) apagou foto de outro';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003a2","role":"authenticated"}', true);
do $$
begin
  perform set_config('storage.allow_delete_query', 'true', true);
  assert (select pode_apagar from public.vw_os_fotos where id = 'f3f00000-0000-4000-8000-000000000001'), 'mecanico deveria poder apagar a dele';
  assert not (select pode_apagar from public.vw_os_fotos where id = 'f3f00000-0000-4000-8000-000000000002'), 'mecanico nao apaga a do dono';
  assert public.zz_afetadas(format($q$ delete from storage.objects where bucket_id = 'os-fotos' and name = %L $q$,
                                   current_setting('teste.f2_caminho'))) = 0, 'mecanico apagou arquivo da foto do dono';
  assert public.zz_erro($q$ select public.apagar_foto('f3f00000-0000-4000-8000-000000000002') $q$) = 'foto_nao_pode_apagar',
    'mecanico apagou foto do dono';
  -- a dele: arquivo e registro
  assert public.zz_afetadas(format($q$ delete from storage.objects where bucket_id = 'os-fotos' and name in (%L, %L) $q$,
                                   current_setting('teste.f1_caminho'), current_setting('teste.f1_mini'))) = 2,
    'mecanico deveria apagar os arquivos da foto dele';
  assert public.apagar_foto('f3f00000-0000-4000-8000-000000000001'), 'mecanico deveria apagar a foto dele';
  assert not public.apagar_foto('f3f00000-0000-4000-8000-000000000001'), 'reenvio do apagar deveria devolver false';

  -- OS D pronta -> entregue (pelo dono abaixo); mecanico marca pronta
  perform public.marcar_pronta(current_setting('teste.osD')::uuid);
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003a1","role":"authenticated"}', true);
select public.entregar_os(current_setting('teste.osD')::uuid, 'Vazamento no carter', 'Troca da junta', 'dinheiro', true);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003a2","role":"authenticated"}', true);
do $$
begin
  assert public.zz_erro(format($q$ select public.registrar_foto(gen_random_uuid(), %L, 1600, 1200, 1000, 100) $q$,
                               current_setting('teste.osD'))) = 'os_fechada', 'mecanico enviou foto em OS entregue';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003a3","role":"authenticated"}', true);
-- entregue: atendente nao apaga (nem arquivo, nem registro)
do $$
begin
  perform set_config('storage.allow_delete_query', 'true', true);
  assert public.zz_afetadas(format($q$ delete from storage.objects where bucket_id = 'os-fotos' and name = %L $q$,
                                   current_setting('teste.f2_caminho'))) = 0, 'atendente apagou arquivo em OS entregue';
  assert public.zz_erro($q$ select public.apagar_foto('f3f00000-0000-4000-8000-000000000002') $q$) = 'foto_nao_pode_apagar',
    'atendente apagou foto em OS entregue';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003a1","role":"authenticated"}', true);
do $$
begin
  perform set_config('storage.allow_delete_query', 'true', true);
  assert public.zz_afetadas(format($q$ delete from storage.objects where bucket_id = 'os-fotos' and name in (%L, %L) $q$,
                                   current_setting('teste.f2_caminho'), current_setting('teste.f2_mini'))) = 2,
    'dono deveria apagar os arquivos em OS entregue';
  assert public.apagar_foto('f3f00000-0000-4000-8000-000000000002'), 'dono deveria apagar foto em OS entregue';
end $$;

-- entregue: atendente envia foto (CEO 16.6-6; ha vagas: 2 fotos apagadas acima)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003a3","role":"authenticated"}', true);
do $$
declare r record;
begin
  select * into r from public.registrar_foto(gen_random_uuid(), current_setting('teste.osD')::uuid, 1600, 1200, 1000, 100, 'entrega');
  assert r.caminho is not null, 'atendente deveria enviar foto em OS entregue';
end $$;

-- =============================================================================
-- 14) Anon
-- =============================================================================
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $$
begin
  assert public.zz_estado('select 1 from public.os_fotos') = '42501', 'ANON LEU os_fotos';
  assert public.zz_estado('select 1 from public.vw_os_fotos') = '42501', 'ANON LEU vw_os_fotos';
  assert public.zz_estado($q$ select public.registrar_foto(gen_random_uuid(), gen_random_uuid(), 1, 1, 1, 1) $q$) = '42501',
    'ANON CHAMOU registrar_foto';
  assert public.zz_estado($q$ select public.alterar_item_mecanico(gen_random_uuid(), 1) $q$) = '42501',
    'ANON CHAMOU alterar_item_mecanico';
  -- [STORAGE] anon nao ve nenhum arquivo do bucket
  assert coalesce(public.zz_estado($q$ do $d$ begin
           if (select count(*) from storage.objects where bucket_id = 'os-fotos') > 0 then raise exception 'viu'; end if;
         end $d$ $q$), '42501') = '42501', 'ANON VE ARQUIVOS DO BUCKET';
end $$;

-- =============================================================================
reset role;
select 'FASE 3 OK: itens do mecanico e fotos passaram' as resultado;

rollback;
