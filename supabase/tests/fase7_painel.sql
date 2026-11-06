-- =============================================================================
-- MechaFlow - Fase 7 - Teste do banco: painel, contas a receber, historico por
-- placa, dados do PDF e evento de preco (criterios de banco de PLANO 20.4)
--
-- OFICINA-GABARITO. Os numeros esperados foram escritos A MAO a partir da tabela
-- abaixo; nenhum deles e recalculado pela propria query. Se a tabela mudar, refazer
-- as contas a mao (ARQUITETURA 14.2 tem as formulas).
--
--   OS   mecanico  cliente  entregue (Sao Paulo)  pago (Sao Paulo)        itens                                   total   servicos  pecas
--   OS1  Carlos    C1       31/10 23:30 (*)       31/10 23:40 (na entrega)  Troca de oleo 1x200,00 + Filtro 1,5x33,33  250,00  200,00    50,00 (4999,5 -> 5000)
--   OS2  Pedro     C1       15/10 10:00           05/11 10:00 (data passada) Revisao de freio 350,00 + Pastilha 2x120,00 590,00 350,00 240,00
--   OS3  Carlos    C2       20/10 14:00           a receber                Troca de oleo 200,00 + Solda (avulso) 150,00 350,00 350,00 0
--   OS10 Pedro     C1       25/10 08:00           a receber                Revisao de freio 200,00 + Revisao de freio 150,00 (2 linhas) 350,00 350,00 0
--   OS4  (nenhum)  C1       01/11 00:30 (**)      02/11 12:00 (data passada) Revisao de freio 300,00 + Lampada 3x15,00 345,00 300,00 45,00
--   OS8  Pedro     C2       03/11 10:00           a receber, total 0       (sem itens)                              0       0         0
--   OS9  Carlos    C1       04/11 09:00           a receber                Troca de oleo 200,00                     200,00  200,00    0
--   OS5  Carlos    C1       cancelada (06/10)     -                        Troca de oleo 200,00                     fora de tudo
--   OS6  Pedro     C2       em andamento          -                        Revisao de freio 350,00                  fora do mes; aberta
--   OS7  -         C2       aguardando orcamento  -                        (sem itens)                              fora do mes; aberta
--   (*)  ja e 01/11 02:30 em UTC   (**) ainda e 01/11 03:30 em UTC, mes novo nos dois
--
--   Outubro/2026: entregues 4 OS = 250+590+350+350 = 1.540,00 (servicos 1.250,00; pecas 290,00)
--                 recebido  1 OS = 250,00 (OS1)
--                 servicos  Revisao de freio 2 OS (OS2, OS10) | Troca de oleo 2 OS (OS1, OS3) | Fora do catalogo 1 OS (OS3)
--                 producao  Pedro 2 OS, 700,00 | Carlos 2 OS, 550,00
--   Novembro/2026: entregues 3 OS = 345+0+200 = 545,00 (servicos 500,00; pecas 45,00)
--                 recebido  2 OS = 590,00 (OS2) + 345,00 (OS4) = 935,00
--                 servicos  Revisao de freio 1 | Troca de oleo 1
--                 producao  Carlos 1 OS, 200,00 | Pedro 1 OS, 0 | sem mecanico 1 OS, 300,00 (sempre por ultimo)
--   Setembro/2026: tudo zero, listas vazias.
--   Hoje: a receber 900,00 em 3 OS de 2 clientes: C2 350,00 (OS3) primeiro, porque a divida
--         mais antiga e dele (20/10); depois C1 550,00 (OS10 350,00 + OS9 200,00).
--         OS8 (total 0) nao e divida. Abertas: 2 (OS6 em andamento, OS7 aguardando orcamento).
--   Oficina B: mesma placa ABC1D23; 1 OS entregue em 12/10, a receber, 999,00.
--
-- Tambem prova: fuso da oficina (nao do servidor); mes passado muda com pagamento de data
-- passada e volta ao desfazer (20.6-5); OS entregue nao muda; papeis (mecanico sem valor
-- nem telefone; atendente sem custo e sem totais do mes); isolamento A x B; anon; Storage
-- do mecanico (20.6-7); PDF em lista fechada (20.6-8); evento de preco (F7-B8); volume.
--
-- [STORAGE] usa o schema storage do Supabase (no PGlite, uma copia minima).
-- [ADMIN] datas no passado sao gravadas como postgres, dentro da transacao.
-- Como rodar: SQL Editor do Supabase STAGING (usuario postgres), DEPOIS das migracoes
-- 20261104000001..04. Resultado esperado: 'FASE 7 OK: painel, historico e PDF passaram'.
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
create function public.zz_chaves(p jsonb) returns text language sql immutable as $$
  select coalesce(string_agg(k, ',' order by k collate "C"), '') from jsonb_object_keys(p) k
$$;
-- OS em modo direto (nasce em_andamento), com sintoma e observacao do balcao marcados
create function public.zz_abrir(p_veiculo uuid, p_mec uuid) returns uuid language plpgsql as $$
declare os uuid;
begin
  select os_id into os from public.abrir_os(gen_random_uuid(), p_veiculo_id => p_veiculo, p_modo => 'direto',
    p_autorizado_por_nome => 'Motorista', p_mecanico_id => p_mec, p_km => 100000,
    p_sintoma_relatado => 'SINTOMA_INTERNO', p_observacoes => 'OBS_BALCAO');
  return os;
end $$;
create function public.zz_item(p_os uuid, p_tipo public.tipo_item_os, p_servico uuid, p_desc text,
                               p_qtd numeric, p_preco integer, p_custo integer default null)
returns uuid language sql as $$
  select public.adicionar_item_os(gen_random_uuid(), p_os, p_tipo, p_servico_id => p_servico, p_descricao => p_desc,
    p_quantidade => p_qtd, p_preco_unitario_centavos => p_preco, p_custo_unitario_centavos => p_custo)
$$;
create function public.zz_entregar(p_os uuid, p_forma public.forma_pagamento, p_pago boolean) returns void language plpgsql as $$
begin
  perform public.mudar_status_os(p_os, 'em_andamento', 'pronta');
  perform public.entregar_os(p_os, 'Causa encontrada X', 'Solucao aplicada Y', p_forma, p_pago);
end $$;
-- [ADMIN] datas no passado (so como postgres)
create function public.zz_datas(p_os uuid, p_criado timestamptz, p_entregue timestamptz default null, p_pago timestamptz default null)
returns void language plpgsql as $$
begin
  update public.ordens_servico o
     set criado_em     = p_criado,
         autorizado_em = case when o.autorizado_em is not null then p_criado end,
         iniciado_em   = case when o.iniciado_em is not null then p_criado end,
         pronta_em     = case when o.pronta_em is not null then coalesce(p_entregue, p_criado) end,
         entregue_em   = case when o.status = 'entregue' then p_entregue end,
         cancelado_em  = case when o.status = 'cancelada' then p_criado + interval '1 day' end
   where o.id = p_os;
  if p_pago is not null then
    update public.os_comercial c set pago_em = p_pago where c.os_id = p_os;
  end if;
end $$;
grant execute on function public.zz_erro(text), public.zz_estado(text), public.zz_chaves(jsonb) to anon, authenticated;
grant execute on function public.zz_abrir(uuid, uuid), public.zz_item(uuid, public.tipo_item_os, uuid, text, numeric, integer, integer),
  public.zz_entregar(uuid, public.forma_pagamento, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- 0) Usuarios: a1 dono A | a2 mecanico Carlos | a3 atendente | a4 mecanico Pedro | b1 dono B
-- -----------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email, '', now(),
       '{"provider":"email","providers":["email"]}', '{}', now(), now()
  from (values
    ('00000000-0000-4000-8000-0000000007a1', 'f7.dono.a@teste.invalid'),
    ('00000000-0000-4000-8000-0000000007a2', 'f7.carlos.a@teste.invalid'),
    ('00000000-0000-4000-8000-0000000007a3', 'f7.atd.a@teste.invalid'),
    ('00000000-0000-4000-8000-0000000007a4', 'f7.pedro.a@teste.invalid'),
    ('00000000-0000-4000-8000-0000000007b1', 'f7.dono.b@teste.invalid')
  ) as u(id, email);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000007a1","role":"authenticated"}', true);
set local role authenticated;

select set_config('teste.oficina_a', public.criar_oficina('Oficina Gabarito A', 'Dono A', private.versao_termos_vigente(), p_telefone => '1133334444')::text, true);
select set_config('teste.tk_carlos', (select token from public.criar_convite('mecanico', 'Carlos')), true);
select set_config('teste.tk_pedro',  (select token from public.criar_convite('mecanico', 'Pedro')), true);
select set_config('teste.tk_atd',    (select token from public.criar_convite('atendente', 'Ana')), true);

with c as (insert into public.clientes (nome, telefone, documento) values ('Transportes Silva', '11988887777', '12345678000199') returning id)
select set_config('teste.c1', (select id::text from c), true);
with c as (insert into public.clientes (nome, telefone) values ('Frete Rapido Ltda', '11977776666') returning id)
select set_config('teste.c2', (select id::text from c), true);
with v as (insert into public.veiculos (cliente_id, placa, marca, modelo) values (current_setting('teste.c1')::uuid, 'ABC1D23', 'Scania', 'R450') returning id)
select set_config('teste.v1', (select id::text from v), true);
with v as (insert into public.veiculos (cliente_id, placa, marca, modelo) values (current_setting('teste.c2')::uuid, 'XYZ9K88', 'Volvo', 'FH') returning id)
select set_config('teste.v2', (select id::text from v), true);
with s as (insert into public.catalogo_servicos (nome) values ('Troca de oleo') returning id)
select set_config('teste.s1', (select id::text from s), true);
with s as (insert into public.catalogo_servicos (nome) values ('Revisao de freio') returning id)
select set_config('teste.s2', (select id::text from s), true);
insert into public.catalogo_servicos_precos (servico_id, preco_padrao_centavos) values
  (current_setting('teste.s1')::uuid, 20000), (current_setting('teste.s2')::uuid, 35000);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000007a2","role":"authenticated"}', true);
select public.aceitar_convite(current_setting('teste.tk_carlos'), 'Carlos Mecanico', private.versao_termos_vigente());
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000007a4","role":"authenticated"}', true);
select public.aceitar_convite(current_setting('teste.tk_pedro'), 'Pedro Mecanico', private.versao_termos_vigente());
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000007a3","role":"authenticated"}', true);
select public.aceitar_convite(current_setting('teste.tk_atd'), 'Ana Atendente', private.versao_termos_vigente());

-- Oficina B: MESMA placa ABC1D23, uma OS entregue a receber de 999,00
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000007b1","role":"authenticated"}', true);
select set_config('teste.oficina_b', public.criar_oficina('Oficina B', 'Dono B', private.versao_termos_vigente())::text, true);
with c as (insert into public.clientes (nome, telefone) values ('Cliente de B', '21955554444') returning id)
select set_config('teste.cB', (select id::text from c), true);
with v as (insert into public.veiculos (cliente_id, placa) values (current_setting('teste.cB')::uuid, 'ABC1D23') returning id)
select set_config('teste.vB', (select id::text from v), true);
do $$
declare os uuid;
begin
  os := public.zz_abrir(current_setting('teste.vB')::uuid, null);
  perform public.zz_item(os, 'servico', null, 'Servico SEGREDO_B', 1, 99900);
  perform public.zz_entregar(os, 'faturado', false);
  perform set_config('teste.osB', os::text, true);
end $$;

-- -----------------------------------------------------------------------------
-- 1) OS da oficina A (pelo dono, pelas RPCs de sempre)
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000007a1","role":"authenticated"}', true);
do $$
declare
  v1 uuid := current_setting('teste.v1')::uuid;
  v2 uuid := current_setting('teste.v2')::uuid;
  s1 uuid := current_setting('teste.s1')::uuid;
  s2 uuid := current_setting('teste.s2')::uuid;
  carlos uuid := '00000000-0000-4000-8000-0000000007a2';
  pedro  uuid := '00000000-0000-4000-8000-0000000007a4';
  os uuid;
  it uuid;
  r record;
begin
  -- OS1: Carlos, 250,00 com quantidade 1,5; paga na entrega
  os := public.zz_abrir(v1, carlos);
  it := public.zz_item(os, 'servico', s1, null, 1, 20000, 7777);
  perform set_config('teste.os1_item', it::text, true);
  perform public.zz_item(os, 'peca', null, 'Filtro diesel', 1.5, 3333, 2000);
  perform public.zz_entregar(os, 'pix', true);
  perform set_config('teste.os1', os::text, true);

  -- OS2: Pedro, 590,00; vistoria concluida com assinatura e complemento; fotos (1 enviada, 1 pendente)
  os := public.zz_abrir(v1, pedro);
  perform public.zz_item(os, 'servico', s2, null, 1, 35000);
  perform public.zz_item(os, 'peca', null, 'Pastilha de freio', 2, 12000, 9000);
  perform set_config('teste.os2', os::text, true);

  select * into r from public.iniciar_vistoria(os);
  perform set_config('teste.vis2', r.vistoria_id::text, true);
  perform public.salvar_vistoria(r.vistoria_id, p_sem_avarias => true, p_observacoes => 'OBS_VISTORIA_GERAL');
  perform public.marcar_itens_restantes_ok(r.vistoria_id);
  select * into r from public.registrar_foto_vistoria('f7f00000-0000-4000-8000-000000000001', current_setting('teste.vis2')::uuid,
                                                      'painel', 800, 600, 1000, 100);
  perform set_config('teste.vis2_foto', r.caminho, true);
  insert into storage.objects (bucket_id, name, metadata) values
    ('vistorias', r.caminho, '{"size": 1000, "mimetype": "image/jpeg"}'),
    ('vistorias', r.caminho_miniatura, '{"size": 100, "mimetype": "image/jpeg"}');
  perform public.confirmar_foto_vistoria('f7f00000-0000-4000-8000-000000000001');
  perform set_config('teste.vis2_ass', public.registrar_assinatura_vistoria(current_setting('teste.vis2')::uuid,
                     'f7500000-0000-4000-8000-000000000001', 'Jose Motorista', 900, 300, 18000), true);
  insert into storage.objects (bucket_id, name, metadata)
  values ('vistorias', current_setting('teste.vis2_ass'), '{"size": 18000, "mimetype": "image/png"}');
  perform public.concluir_vistoria(current_setting('teste.vis2')::uuid);
  perform public.complementar_vistoria('f7c00000-0000-4000-8000-000000000001', current_setting('teste.vis2')::uuid, 'COMPLEMENTO_TEXTO');
  select * into r from public.registrar_foto_vistoria('f7f00000-0000-4000-8000-000000000002', current_setting('teste.vis2')::uuid,
                                                      'outro', 800, 600, 1000, 100, p_complemento_id => 'f7c00000-0000-4000-8000-000000000001');
  perform set_config('teste.vis2_compl', r.caminho, true);
  insert into storage.objects (bucket_id, name, metadata) values
    ('vistorias', r.caminho, '{"size": 1000, "mimetype": "image/jpeg"}'),
    ('vistorias', r.caminho_miniatura, '{"size": 100, "mimetype": "image/jpeg"}');
  perform public.confirmar_foto_vistoria('f7f00000-0000-4000-8000-000000000002');

  select * into r from public.registrar_foto('f7f10000-0000-4000-8000-000000000001', os, 1600, 1200, 1000, 100, 'diagnostico', 'Bico entupido');
  perform set_config('teste.foto1', r.caminho, true);
  perform set_config('teste.foto1_mini', r.caminho_miniatura, true);
  insert into storage.objects (bucket_id, name, metadata) values
    ('os-fotos', r.caminho, '{"size": 1000, "mimetype": "image/jpeg"}'),
    ('os-fotos', r.caminho_miniatura, '{"size": 100, "mimetype": "image/jpeg"}');
  perform public.confirmar_foto('f7f10000-0000-4000-8000-000000000001');
  -- pendente: o arquivo subiu, mas a foto nao foi confirmada
  select * into r from public.registrar_foto('f7f10000-0000-4000-8000-000000000002', os, 1600, 1200, 1000, 100);
  perform set_config('teste.foto2', r.caminho, true);
  insert into storage.objects (bucket_id, name, metadata) values ('os-fotos', r.caminho, '{"size": 1000, "mimetype": "image/jpeg"}');

  perform public.zz_entregar(os, 'faturado', false);

  -- OS3: Carlos, C2, 350,00 com avulso; vistoria concluida sem assinatura e depois ANULADA
  os := public.zz_abrir(v2, carlos);
  perform public.zz_item(os, 'servico', s1, null, 1, 20000);
  perform public.zz_item(os, 'servico', null, 'Solda no chassi', 1, 15000);
  select * into r from public.iniciar_vistoria(os);
  perform set_config('teste.vis3', r.vistoria_id::text, true);
  perform public.salvar_vistoria(r.vistoria_id, p_sem_avarias => true);
  perform public.marcar_itens_restantes_ok(r.vistoria_id);
  perform public.concluir_vistoria(r.vistoria_id, 'motorista_ausente');
  perform public.anular_vistoria(r.vistoria_id, 'MOTIVO_ANULACAO_INTERNO');
  perform public.zz_entregar(os, 'boleto', false);
  perform set_config('teste.os3', os::text, true);

  -- OS10: Pedro, 350,00 em duas linhas do mesmo servico
  os := public.zz_abrir(v1, pedro);
  perform public.zz_item(os, 'servico', s2, null, 1, 20000);
  perform public.zz_item(os, 'servico', s2, null, 1, 15000);
  perform public.zz_entregar(os, 'faturado', false);
  perform set_config('teste.os10', os::text, true);

  -- OS4: sem mecanico, 345,00
  os := public.zz_abrir(v1, null);
  perform public.zz_item(os, 'servico', s2, null, 1, 30000);
  perform public.zz_item(os, 'peca', null, 'Lampada', 3, 1500);
  perform public.zz_entregar(os, 'faturado', false);
  perform set_config('teste.os4', os::text, true);

  -- OS8: Pedro, C2, sem itens (total 0)
  os := public.zz_abrir(v2, pedro);
  perform public.zz_entregar(os, 'faturado', false);
  perform set_config('teste.os8', os::text, true);

  -- OS9: Carlos, 200,00 a receber
  os := public.zz_abrir(v1, carlos);
  perform public.zz_item(os, 'servico', s1, null, 1, 20000);
  perform public.zz_entregar(os, 'faturado', false);
  perform set_config('teste.os9', os::text, true);

  -- OS5: Carlos, cancelada com texto livre
  os := public.zz_abrir(v1, carlos);
  perform public.zz_item(os, 'servico', s1, null, 1, 20000);
  perform public.mudar_status_os(os, 'em_andamento', 'cancelada', 'MOTIVO_LIVRE_SECRETO');
  perform set_config('teste.os5', os::text, true);

  -- OS6: Pedro, C2, em andamento; vistoria em RASCUNHO com foto enviada
  os := public.zz_abrir(v2, pedro);
  perform public.zz_item(os, 'servico', s2, null, 1, 35000);
  perform set_config('teste.os6', os::text, true);
  select * into r from public.iniciar_vistoria(os);
  select * into r from public.registrar_foto_vistoria('f7f00000-0000-4000-8000-000000000006', r.vistoria_id, 'painel', 800, 600, 1000, 100);
  perform set_config('teste.vis6_foto', r.caminho, true);
  insert into storage.objects (bucket_id, name, metadata) values
    ('vistorias', r.caminho, '{"size": 1000, "mimetype": "image/jpeg"}'),
    ('vistorias', r.caminho_miniatura, '{"size": 100, "mimetype": "image/jpeg"}');
  perform public.confirmar_foto_vistoria('f7f00000-0000-4000-8000-000000000006');

  -- OS7: C2, com orcamento, aguardando, sem itens
  select os_id into os from public.abrir_os(gen_random_uuid(), p_veiculo_id => v2, p_modo => 'com_orcamento');
  perform set_config('teste.os7', os::text, true);
end $$;

-- [ADMIN] datas da tabela (fuso de Sao Paulo escrito em cada literal)
reset role;
select public.zz_datas(current_setting('teste.os1')::uuid,  '2026-10-30 08:00-03', '2026-10-31 23:30-03', '2026-10-31 23:40-03');
select public.zz_datas(current_setting('teste.os2')::uuid,  '2026-10-10 08:00-03', '2026-10-15 10:00-03');
select public.zz_datas(current_setting('teste.os3')::uuid,  '2026-10-18 08:00-03', '2026-10-20 14:00-03');
select public.zz_datas(current_setting('teste.os10')::uuid, '2026-10-22 08:00-03', '2026-10-25 08:00-03');
select public.zz_datas(current_setting('teste.os4')::uuid,  '2026-10-31 20:00-03', '2026-11-01 00:30-03');
select public.zz_datas(current_setting('teste.os8')::uuid,  '2026-11-02 08:00-03', '2026-11-03 10:00-03');
select public.zz_datas(current_setting('teste.os9')::uuid,  '2026-11-03 08:00-03', '2026-11-04 09:00-03');
select public.zz_datas(current_setting('teste.os5')::uuid,  '2026-10-05 08:00-03');
select public.zz_datas(current_setting('teste.os6')::uuid,  '2026-11-05 08:00-03');
select public.zz_datas(current_setting('teste.os7')::uuid,  '2026-11-05 09:00-03');
select public.zz_datas(current_setting('teste.osB')::uuid,  '2026-10-11 08:00-03', '2026-10-12 10:00-03');
update public.oficinas set documento = '11222333000181' where id = current_setting('teste.oficina_a')::uuid;
-- dado incoerente de proposito: pago_em numa OS ABERTA (nenhuma RPC faz isso) nao pode contar como recebido
update public.os_comercial set pago_em = '2026-10-15 12:00-03', forma_pagamento = 'pix' where os_id = current_setting('teste.os6')::uuid;
do $$ begin
  -- a gabarito e o caso da virada: 31/10 23:30 em Sao Paulo ja e novembro em UTC
  assert (select (entregue_em at time zone 'UTC')::date from public.ordens_servico where id = current_setting('teste.os1')::uuid) = date '2026-11-01',
    'gabarito: OS1 deveria cair em 01/11 em UTC';
end $$;

-- Pagamentos com data passada, pela RPC de sempre, pela atendente
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000007a3","role":"authenticated"}', true);
set local role authenticated;
select public.registrar_pagamento(current_setting('teste.os2')::uuid, 'pix', '2026-11-05 10:00-03');
select public.registrar_pagamento(current_setting('teste.os4')::uuid, 'dinheiro', '2026-11-02 12:00-03');

-- Servidor num fuso estranho: o corte tem de vir de oficinas.fuso_horario
set local timezone = 'Pacific/Kiritimati';

-- =============================================================================
-- 2) painel_mes: numeros do gabarito (dono)
-- =============================================================================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000007a1","role":"authenticated"}', true);
do $$
declare p jsonb;
begin
  p := public.painel_mes(2026, 10);
  assert p->>'fuso' = 'America/Sao_Paulo', 'fuso errado: ' || coalesce(p->>'fuso', 'null');
  assert (p->>'inicio')::timestamptz = '2026-10-01 03:00+00' and (p->>'fim')::timestamptz = '2026-11-01 03:00+00',
    'janela de outubro errada: ' || (p->>'inicio') || ' a ' || (p->>'fim');
  assert p->'entregues' = '{"qtd_os": 4, "total_centavos": 154000, "servicos_centavos": 125000, "pecas_centavos": 29000}'::jsonb,
    'outubro entregues: ' || (p->'entregues')::text;
  assert p->'recebido' = '{"qtd_os": 1, "total_centavos": 25000}'::jsonb, 'outubro recebido: ' || (p->'recebido')::text;
  assert p->'servicos' = jsonb_build_array(
      jsonb_build_object('servico_id', current_setting('teste.s2'), 'nome', 'Revisao de freio', 'qtd_os', 2),
      jsonb_build_object('servico_id', current_setting('teste.s1'), 'nome', 'Troca de oleo', 'qtd_os', 2),
      jsonb_build_object('servico_id', null, 'nome', 'Fora do catálogo', 'qtd_os', 1)),
    'outubro servicos: ' || (p->'servicos')::text;
  assert p->'produtividade' = jsonb_build_array(
      jsonb_build_object('mecanico_id', '00000000-0000-4000-8000-0000000007a4', 'nome', 'Pedro Mecanico', 'qtd_os', 2, 'servicos_centavos', 70000),
      jsonb_build_object('mecanico_id', '00000000-0000-4000-8000-0000000007a2', 'nome', 'Carlos Mecanico', 'qtd_os', 2, 'servicos_centavos', 55000)),
    'outubro produtividade: ' || (p->'produtividade')::text;
  assert public.zz_chaves(p) = 'ano,entregues,fim,fuso,inicio,mes,produtividade,recebido,servicos', 'chaves do painel: ' || public.zz_chaves(p);
  assert jsonb_typeof(p->'entregues'->'total_centavos') = 'number' and (p->'entregues'->>'total_centavos') ~ '^[0-9]+$',
    'centavos nao inteiros';

  p := public.painel_mes(2026, 11);
  assert p->'entregues' = '{"qtd_os": 3, "total_centavos": 54500, "servicos_centavos": 50000, "pecas_centavos": 4500}'::jsonb,
    'novembro entregues: ' || (p->'entregues')::text;
  assert p->'recebido' = '{"qtd_os": 2, "total_centavos": 93500}'::jsonb, 'novembro recebido: ' || (p->'recebido')::text;
  assert p->'servicos' = jsonb_build_array(
      jsonb_build_object('servico_id', current_setting('teste.s2'), 'nome', 'Revisao de freio', 'qtd_os', 1),
      jsonb_build_object('servico_id', current_setting('teste.s1'), 'nome', 'Troca de oleo', 'qtd_os', 1)),
    'novembro servicos: ' || (p->'servicos')::text;
  assert p->'produtividade' = jsonb_build_array(
      jsonb_build_object('mecanico_id', '00000000-0000-4000-8000-0000000007a2', 'nome', 'Carlos Mecanico', 'qtd_os', 1, 'servicos_centavos', 20000),
      jsonb_build_object('mecanico_id', '00000000-0000-4000-8000-0000000007a4', 'nome', 'Pedro Mecanico', 'qtd_os', 1, 'servicos_centavos', 0),
      jsonb_build_object('mecanico_id', null, 'nome', null, 'qtd_os', 1, 'servicos_centavos', 30000)),
    'novembro produtividade: ' || (p->'produtividade')::text;

  p := public.painel_mes(2026, 9);
  assert p->'entregues' = '{"qtd_os": 0, "total_centavos": 0, "servicos_centavos": 0, "pecas_centavos": 0}'::jsonb, 'setembro deveria ser zero';
  assert p->'recebido' = '{"qtd_os": 0, "total_centavos": 0}'::jsonb, 'setembro recebido deveria ser zero';
  assert p->'servicos' = '[]'::jsonb and p->'produtividade' = '[]'::jsonb, 'setembro: listas deveriam vir vazias';

  -- dezembro (virada de ano na janela)
  p := public.painel_mes(2026, 12);
  assert (p->>'fim')::timestamptz = '2027-01-01 03:00+00', 'fim de dezembro errado';

  assert public.zz_erro('select public.painel_mes(2026, 13)') = 'mes_invalido', 'mes 13 aceito';
  assert public.zz_erro('select public.painel_mes(null, 10)') = 'mes_invalido', 'ano nulo aceito';
end $$;

-- =============================================================================
-- 3) painel_lista_os: as OS atras de cada numero; a soma bate com o numero
-- =============================================================================
do $$
declare n integer; s bigint; nums text;
begin
  select count(*), sum(valor_centavos), string_agg(numero::text, ',' order by ord)
    into n, s, nums from (select * from public.painel_lista_os(2026, 10, 'entregues') with ordinality) l(os_id, numero, placa, cliente_nome, entregue_em, pago_em, forma_pagamento, valor_centavos, detalhe, ord);
  assert n = 4 and s = 154000, format('lista entregues outubro: %s OS, %s', n, s);
  assert nums = (select string_agg(numero::text, ',' order by array_position(array['os2','os3','os10','os1'], k))
                   from (values ('os2'), ('os3'), ('os10'), ('os1')) x(k)
                   join public.ordens_servico o on o.id = current_setting('teste.' || k)::uuid),
    'ordem da lista de entregues errada (calendario: 15, 20, 25, 31/10): ' || nums;
  -- a soma da lista e a soma de vw_os das mesmas OS (mesma conta da tela da OS)
  assert (select sum(v.total_centavos) from public.vw_os v
           where v.id in (select os_id from public.painel_lista_os(2026, 10, 'entregues'))) = 154000,
    'soma de vw_os diferente do painel';

  select count(*), sum(valor_centavos) into n, s from public.painel_lista_os(2026, 10, 'recebido');
  assert n = 1 and s = 25000, format('lista recebido outubro: %s OS, %s', n, s);
  select count(*), sum(valor_centavos) into n, s from public.painel_lista_os(2026, 11, 'recebido');
  assert n = 2 and s = 93500, format('lista recebido novembro: %s OS, %s', n, s);

  select count(*), sum(valor_centavos) into n, s from public.painel_lista_os(2026, 10, 'servico', current_setting('teste.s2')::uuid);
  assert n = 2 and s = 94000, format('lista Revisao de freio outubro: %s OS, %s', n, s);
  select count(*), sum(valor_centavos) into n, s from public.painel_lista_os(2026, 10, 'fora_catalogo');
  assert n = 1 and s = 35000, format('lista fora do catalogo outubro: %s OS, %s', n, s);
  assert (select detalhe from public.painel_lista_os(2026, 10, 'fora_catalogo')) = 'Solda no chassi', 'fora do catalogo sem a descricao digitada';
  assert (select count(*) from public.painel_lista_os(2026, 10, 'entregues') where detalhe is not null) = 0, 'detalhe fora do recorte fora_catalogo';

  select count(*), sum(valor_centavos) into n, s from public.painel_lista_os(2026, 10, 'mecanico', '00000000-0000-4000-8000-0000000007a4');
  assert n = 2 and s = 70000, format('lista Pedro outubro: %s OS, %s', n, s);
  select count(*), sum(valor_centavos) into n, s from public.painel_lista_os(2026, 10, 'mecanico', '00000000-0000-4000-8000-0000000007a2');
  assert n = 2 and s = 55000, format('lista Carlos outubro: %s OS, %s', n, s);
  select count(*) into n from public.painel_lista_os(2026, 10, 'sem_mecanico');
  assert n = 0, 'outubro nao tem OS sem mecanico';
  select count(*), sum(valor_centavos) into n, s from public.painel_lista_os(2026, 11, 'sem_mecanico');
  assert n = 1 and s = 30000, format('lista sem mecanico novembro: %s OS, %s', n, s);

  assert public.zz_erro($q$ select * from public.painel_lista_os(2026, 10, 'qualquer') $q$) = 'recorte_invalido', 'recorte invalido aceito';
  assert public.zz_erro($q$ select * from public.painel_lista_os(2026, 10, 'servico') $q$) = 'recorte_invalido', 'servico sem chave aceito';
  assert public.zz_erro($q$ select * from public.painel_lista_os(2026, 0, 'entregues') $q$) = 'mes_invalido', 'mes 0 aceito';
  -- nenhuma OS cancelada, aberta ou de outra oficina aparece em lista nenhuma
  assert not exists (select 1 from public.painel_lista_os(2026, 10, 'entregues') l
                      where l.os_id in (current_setting('teste.os5')::uuid, current_setting('teste.os6')::uuid,
                                        current_setting('teste.os7')::uuid, current_setting('teste.osB')::uuid)),
    'lista com OS cancelada, aberta ou de B';
end $$;

-- =============================================================================
-- 4) painel_hoje e contas_a_receber
-- =============================================================================
do $$
declare p jsonb; r record; ordem text;
begin
  p := public.painel_hoje();
  assert p->'a_receber' = jsonb_build_object('total_centavos', 90000, 'qtd_os', 3, 'qtd_clientes', 2,
                                             'mais_antiga_em', p->'a_receber'->'mais_antiga_em'),
    'a receber de hoje: ' || (p->'a_receber')::text;
  assert (p->'a_receber'->>'mais_antiga_em')::timestamptz = '2026-10-20 14:00-03', 'divida mais antiga errada';
  assert p->'abertas' = '{"total": 2, "aguardando_orcamento": 1, "orcamento_enviado": 0, "aprovada": 0, "em_andamento": 1, "pronta": 0}'::jsonb,
    'abertas: ' || (p->'abertas')::text;
  assert p->>'fuso' = 'America/Sao_Paulo', 'fuso do painel_hoje';
  assert (p->>'primeiro_registro_em')::timestamptz = '2026-10-15 10:00-03', 'primeiro registro deveria ser a entrega da OS2 (15/10 10:00)';
  assert public.zz_chaves(p) = 'a_receber,abertas,ano,fuso,hoje,mes,primeiro_registro_em', 'chaves do painel_hoje: ' || public.zz_chaves(p);
  -- o mes padrao e o de Sao Paulo, nao o do servidor (aqui em Kiritimati, UTC+14)
  assert (p->>'hoje')::date = (now() at time zone 'America/Sao_Paulo')::date, 'hoje nao esta em Sao Paulo';
  assert (p->>'mes')::integer = extract(month from (now() at time zone 'America/Sao_Paulo'))::integer, 'mes padrao fora de Sao Paulo';

  select string_agg(numero::text || ':' || cliente_total_centavos || ':' || cliente_qtd_os, ',' order by ord)
    into ordem
    from (select c.*, row_number() over () as ord from public.contas_a_receber() c) x;
  assert ordem = (select string_agg(o.numero::text || ':' || k.t || ':' || k.q, ',' order by k.ord)
                    from (values (1, 'os3', 35000, 1), (2, 'os10', 55000, 2), (3, 'os9', 55000, 2)) k(ord, os, t, q)
                    join public.ordens_servico o on o.id = current_setting('teste.' || k.os)::uuid),
    'contas a receber fora da ordem (C2 primeiro, depois C1 da mais antiga): ' || ordem;
  assert (select sum(total_centavos) from public.contas_a_receber()) = 90000, 'soma da lista a receber';
  select * into r from public.contas_a_receber() where os_id = current_setting('teste.os3')::uuid;
  assert r.cliente_nome = 'Frete Rapido Ltda' and r.cliente_telefone = '11977776666' and r.placa = 'XYZ9K88'
     and r.forma_pagamento = 'boleto' and r.total_centavos = 35000, 'linha da OS3 errada';
  assert r.dias = ((now() at time zone 'America/Sao_Paulo')::date - date '2026-10-20'), 'dias em aberto errados';
  assert not exists (select 1 from public.contas_a_receber() where os_id = current_setting('teste.os8')::uuid), 'OS de total 0 virou divida';
end $$;

-- =============================================================================
-- 5) Fuso: a mesma oficina em UTC muda o mes da OS1 (prova que o corte usa a oficina)
-- =============================================================================
reset role;
update public.oficinas set fuso_horario = 'UTC' where id = current_setting('teste.oficina_a')::uuid;
set local role authenticated;
do $$
declare p jsonb;
begin
  p := public.painel_mes(2026, 10);
  assert p->'entregues'->>'qtd_os' = '3' and p->'entregues'->>'total_centavos' = '129000',
    'em UTC a OS1 deveria sair de outubro: ' || (p->'entregues')::text;
  assert p->'recebido'->>'total_centavos' = '0', 'em UTC o pagamento das 23:40 deveria sair de outubro';
end $$;
reset role;
update public.oficinas set fuso_horario = 'America/Sao_Paulo' where id = current_setting('teste.oficina_a')::uuid;
set local role authenticated;

-- =============================================================================
-- 6) Mes passado muda com o registrado (20.6-5); desfazer volta
-- =============================================================================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000007a3","role":"authenticated"}', true);
select public.registrar_pagamento(current_setting('teste.os10')::uuid, 'pix', '2026-10-28 12:00-03', p_so_se_a_receber => true);
do $$ begin
  -- "outra pessoa ja registrou": com p_so_se_a_receber, OS ja paga recusa e nada muda
  assert public.zz_erro(format($q$ select public.registrar_pagamento(%L, 'dinheiro', p_so_se_a_receber => true) $q$, current_setting('teste.os1')))
    = 'pagamento_ja_registrado', 'registrar por cima de pagamento existente deveria recusar';
  assert (select forma_pagamento = 'pix' and pago_em = '2026-10-31 23:40-03' from public.vw_os where id = current_setting('teste.os1')::uuid),
    'recusa mudou o pagamento';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000007a1","role":"authenticated"}', true);
do $$ begin
  assert public.painel_mes(2026, 10)->'recebido' = '{"qtd_os": 2, "total_centavos": 60000}'::jsonb, 'pagamento com data de outubro nao subiu outubro';
  assert public.painel_mes(2026, 10)->'entregues'->>'total_centavos' = '154000', 'pagamento mudou o entregue';
  assert public.painel_hoje()->'a_receber'->>'total_centavos' = '55000', 'a receber nao caiu';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000007a3","role":"authenticated"}', true);
select public.registrar_pagamento(current_setting('teste.os10')::uuid, 'faturado', null);
select public.registrar_pagamento(current_setting('teste.os1')::uuid, 'pix', null);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000007a1","role":"authenticated"}', true);
do $$ begin
  assert public.painel_mes(2026, 10)->'recebido' = '{"qtd_os": 0, "total_centavos": 0}'::jsonb, 'voltar para a receber nao tirou de outubro';
  assert public.painel_hoje()->'a_receber' @> '{"total_centavos": 115000, "qtd_os": 4}'::jsonb, 'a receber depois de desfazer';
end $$;
-- de novo pela RPC, perto da virada: 31/10 23:40 em Sao Paulo
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000007a3","role":"authenticated"}', true);
select public.registrar_pagamento(current_setting('teste.os1')::uuid, 'pix', '2026-10-31 23:40-03');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000007a1","role":"authenticated"}', true);
do $$ begin
  assert public.painel_mes(2026, 10)->'recebido' = '{"qtd_os": 1, "total_centavos": 25000}'::jsonb, 'pagamento das 23:40 nao voltou para outubro';
  assert public.painel_mes(2026, 11)->'recebido' = '{"qtd_os": 2, "total_centavos": 93500}'::jsonb, 'novembro mudou';
  assert public.painel_hoje()->'a_receber'->>'total_centavos' = '90000', 'a receber nao voltou ao gabarito';
end $$;

-- =============================================================================
-- 7) OS entregue nao muda (total da entrega estavel)
-- =============================================================================
do $$ begin
  assert public.zz_erro(format($q$ update public.os_itens_precos set preco_unitario_centavos = 1 where item_id = %L $q$,
                               current_setting('teste.os1_item'))) is not null, 'MUDOU PRECO DE OS ENTREGUE';
  assert public.zz_erro(format($q$ delete from public.os_itens where id = %L $q$, current_setting('teste.os1_item'))) is not null,
    'APAGOU ITEM DE OS ENTREGUE';
  assert public.zz_erro(format($q$ select public.adicionar_item_os(gen_random_uuid(), %L, 'servico', p_descricao => 'x', p_preco_unitario_centavos => 1) $q$,
                               current_setting('teste.os1'))) is not null, 'LANCOU ITEM EM OS ENTREGUE';
  assert public.zz_erro(format($q$ select public.mudar_status_os(%L, 'entregue', 'pronta') $q$, current_setting('teste.os1'))) = 'os_fechada',
    'REABRIU OS ENTREGUE';
  assert public.painel_mes(2026, 10)->'entregues'->>'total_centavos' = '154000', 'total entregue mudou';
end $$;

-- =============================================================================
-- 8) Papeis no painel e no a receber
-- =============================================================================
-- mecanico: recusa em tudo que tem dinheiro
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000007a2","role":"authenticated"}', true);
do $$ begin
  assert public.zz_estado('select public.painel_mes(2026, 10)') = '42501', 'MECANICO LEU O PAINEL';
  assert public.zz_estado($q$ select * from public.painel_lista_os(2026, 10, 'entregues') $q$) = '42501', 'MECANICO LEU A LISTA DO PAINEL';
  assert public.zz_estado('select public.painel_hoje()') = '42501', 'MECANICO LEU O PAINEL DE HOJE';
  assert public.zz_estado('select * from public.contas_a_receber()') = '42501', 'MECANICO LEU O A RECEBER';
  assert public.zz_estado(format('select public.dados_pdf_os(%L)', current_setting('teste.os1'))) = '42501', 'MECANICO LEU OS DADOS DO PDF';
end $$;
-- atendente: a receber sim; totais do mes nao
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000007a3","role":"authenticated"}', true);
do $$ begin
  assert public.zz_estado('select public.painel_mes(2026, 10)') = '42501', 'ATENDENTE LEU O PAINEL DO MES';
  assert public.zz_estado($q$ select * from public.painel_lista_os(2026, 10, 'recebido') $q$) = '42501', 'ATENDENTE LEU A LISTA DO PAINEL';
  assert public.zz_estado('select public.painel_hoje()') = '42501', 'ATENDENTE LEU O PAINEL DE HOJE';
  assert (select count(*) from public.contas_a_receber()) = 3 and (select sum(total_centavos) from public.contas_a_receber()) = 90000,
    'atendente deveria ver o mesmo a receber do dono';
end $$;
reset role;
do $$ begin
  -- a receber nao tem coluna de custo nem de margem
  assert not exists (select 1 from pg_proc p, unnest(p.proargnames) a
                      where p.oid = 'public.contas_a_receber()'::regprocedure and (a like '%custo%' or a like '%margem%')),
    'contas_a_receber devolve custo';
  -- nenhuma leitura nova aceita a oficina por parametro
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace, unnest(coalesce(p.proargnames, '{}')) a
                      where n.nspname = 'public'
                        and p.proname in ('painel_mes', 'painel_lista_os', 'painel_hoje', 'contas_a_receber',
                                          'historico_placa', 'historico_os', 'dados_pdf_os')
                        and a like '%oficina%'),
    'leitura nova aceita oficina por parametro';
  -- anon: nenhuma funcao nova
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public'
                        and p.proname in ('painel_mes', 'painel_lista_os', 'painel_hoje', 'contas_a_receber',
                                          'historico_placa', 'historico_os', 'dados_pdf_os')
                        and has_function_privilege('anon', p.oid, 'execute')),
    'ANON GANHOU FUNCAO NOVA';
  assert (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public'
             and p.proname in ('painel_mes', 'painel_lista_os', 'painel_hoje', 'contas_a_receber',
                               'historico_placa', 'historico_os', 'dados_pdf_os')
             and has_function_privilege('authenticated', p.oid, 'execute')) = 7, 'authenticated deveria executar as 7';
end $$;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $$ begin
  assert public.zz_estado('select public.painel_mes(2026, 10)') = '42501', 'ANON LEU O PAINEL';
  assert public.zz_estado('select public.painel_hoje()') = '42501', 'ANON LEU O PAINEL DE HOJE';
  assert public.zz_estado('select * from public.contas_a_receber()') = '42501', 'ANON LEU O A RECEBER';
  assert public.zz_estado($q$ select public.historico_placa('ABC1D23') $q$) = '42501', 'ANON LEU O HISTORICO';
  assert public.zz_estado(format('select public.historico_os(%L)', current_setting('teste.os1'))) = '42501', 'ANON LEU A OS DO HISTORICO';
  assert public.zz_estado(format('select public.dados_pdf_os(%L)', current_setting('teste.os1'))) = '42501', 'ANON LEU O PDF';
end $$;
reset role;
set local role authenticated;

-- =============================================================================
-- 9) Isolamento A x B, inclusive dois usuarios em sequencia
-- =============================================================================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000007b1","role":"authenticated"}', true);
do $$
declare p jsonb; h jsonb;
begin
  p := public.painel_mes(2026, 10);
  assert p->'entregues' = '{"qtd_os": 1, "total_centavos": 99900, "servicos_centavos": 99900, "pecas_centavos": 0}'::jsonb,
    'B: painel de outubro: ' || (p->'entregues')::text;
  assert p->'servicos' = '[{"servico_id": null, "nome": "Fora do catálogo", "qtd_os": 1}]'::jsonb, 'B: servicos';
  assert public.painel_hoje()->'a_receber'->>'total_centavos' = '99900', 'B: a receber';
  assert (select count(*) from public.contas_a_receber()) = 1, 'B LE O A RECEBER DA A';
  assert (select count(*) from public.painel_lista_os(2026, 10, 'mecanico', '00000000-0000-4000-8000-0000000007a2')) = 0,
    'B LISTA AS OS DO MECANICO DA A';
  assert not exists (select 1 from public.painel_lista_os(2026, 10, 'entregues') where os_id <> current_setting('teste.osB')::uuid),
    'B LISTA OS DA A';
  -- mesma placa: so o da propria oficina
  h := public.historico_placa('ABC1D23');
  assert jsonb_array_length(h->'os') = 1 and h->'os'->0->>'id' = current_setting('teste.osB'), 'B: historico da placa deveria ter so a OS dela';
  assert h->'veiculo'->>'id' = current_setting('teste.vB'), 'B: veiculo errado';
  assert public.zz_erro(format('select public.historico_os(%L)', current_setting('teste.os2'))) = 'os_nao_encontrada', 'B ABRIU OS DA A NO HISTORICO';
  assert public.zz_erro(format('select public.dados_pdf_os(%L)', current_setting('teste.os1'))) = 'os_nao_encontrada', 'B LEU O PDF DA A';
  -- [STORAGE] nem com o caminho na mao
  assert not exists (select 1 from storage.objects where name in (current_setting('teste.foto1'), current_setting('teste.vis2_foto'),
                                                                 current_setting('teste.vis2_ass'))),
    'B ABRE ARQUIVO DA A';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000007a1","role":"authenticated"}', true);
do $$
declare h jsonb;
begin
  assert public.painel_mes(2026, 10)->'entregues'->>'total_centavos' = '154000', 'A depois de B: painel errado';
  h := public.historico_placa('ABC1D23');
  assert jsonb_array_length(h->'os') = 6, 'A: historico da placa deveria ter 6 OS';
  assert h::text not like '%SEGREDO_B%' and h::text not like '%' || current_setting('teste.osB') || '%', 'A VE A OS DA B NA MESMA PLACA';
end $$;

-- =============================================================================
-- 10) Historico por placa: lista fechada por papel e paginacao
-- =============================================================================
-- dono: com custo
do $$
declare h jsonb; o jsonb; i jsonb;
begin
  h := public.historico_placa(' abc-1d23 ', 4);
  assert public.zz_chaves(h) = 'os,proximo,resumo,veiculo', 'chaves do historico: ' || public.zz_chaves(h);
  assert h->'resumo'->>'qtd_os' = '6' and h->'resumo'->>'qtd_vistorias' = '1'
     and (h->'resumo'->>'primeira_os_em')::timestamptz = '2026-10-05 08:00-03', 'resumo da placa: ' || (h->'resumo')::text;
  assert jsonb_array_length(h->'os') = 4 and h->'proximo' is not null and h->'proximo' <> 'null'::jsonb, 'pagina 1 deveria ter 4 e proximo';
  -- ordem: mais nova primeiro (OS9, OS4, OS1, OS10 | OS2, OS5)
  assert (select string_agg(x->>'id', ',' order by n) from jsonb_array_elements(h->'os') with ordinality e(x, n))
       = concat_ws(',', current_setting('teste.os9'), current_setting('teste.os4'), current_setting('teste.os1'), current_setting('teste.os10')),
    'ordem da pagina 1 errada';
  h := public.historico_placa('ABC1D23', 4, (h->'proximo'->>'antes_criado_em')::timestamptz, (h->'proximo'->>'antes_id')::uuid);
  assert jsonb_array_length(h->'os') = 2 and h->'proximo' = 'null'::jsonb, 'pagina 2 deveria ter 2 e acabar';
  assert (select string_agg(x->>'id', ',' order by n) from jsonb_array_elements(h->'os') with ordinality e(x, n))
       = concat_ws(',', current_setting('teste.os2'), current_setting('teste.os5')), 'ordem da pagina 2 errada';

  h := public.historico_placa('ABC1D23', 10);
  select x into o from jsonb_array_elements(h->'os') x where x->>'id' = current_setting('teste.os1');
  assert public.zz_chaves(o) = 'abre_detalhe,cancelado_em,causa_encontrada,cliente_nome,codigo_falha,criado_em,custo_total_centavos,entregue_em,forma_pagamento,horimetro,id,km,mecanico_nome,motivo_cancelamento,numero,observacoes,pago_em,qtd_fotos,qtd_itens,qtd_vistorias,sintoma_relatado,solucao_aplicada,status,total_centavos',
    'dono: chaves da OS no historico: ' || public.zz_chaves(o);
  assert (o->>'total_centavos')::bigint = 25000 and (o->>'custo_total_centavos')::bigint = 10777, 'dono: total e custo da OS1 (250,00 e 77,77 + 1,5 x 20,00)';
  assert o->>'cliente_nome' = 'Transportes Silva' and o->>'observacoes' = 'OBS_BALCAO' and o->>'forma_pagamento' = 'pix', 'dono: campos do balcao';
  select x into o from jsonb_array_elements(h->'os') x where x->>'id' = current_setting('teste.os5');
  assert o->>'motivo_cancelamento' = 'MOTIVO_LIVRE_SECRETO', 'dono deveria ver o texto livre do cancelamento';
  select x into o from jsonb_array_elements(h->'os') x where x->>'id' = current_setting('teste.os2');
  assert (o->>'qtd_fotos')::int = 1 and (o->>'qtd_vistorias')::int = 1 and (o->>'qtd_itens')::int = 2, 'contagens da OS2';
  assert public.zz_chaves(h->'veiculo') = 'ano_modelo,cliente_id,cliente_nome,horimetro_atual,id,km_atual,marca,modelo,placa,tipo',
    'dono: chaves do veiculo: ' || public.zz_chaves(h->'veiculo');

  h := public.historico_os(current_setting('teste.os2')::uuid);
  select x into i from jsonb_array_elements(h->'itens') x where x->>'tipo' = 'peca';
  assert public.zz_chaves(i) = 'custo_unitario_centavos,descricao,id,preco_unitario_centavos,quantidade,subtotal_centavos,tipo,unidade',
    'dono: chaves do item: ' || public.zz_chaves(i);
  assert (i->>'subtotal_centavos')::bigint = 24000 and (i->>'custo_unitario_centavos')::int = 9000, 'dono: valores da pastilha';
  assert public.zz_chaves(h->'vistorias'->0) = 'anulada_em,anulada_por_nome,assinado_por_nome,assinatura_caminho,avarias,combustivel,complementos,concluida_em,concluida_por_nome,fotos,horimetro,id,itens,km,motivo_anulacao,objetos,observacoes,sem_assinatura_motivo,sem_avarias,status,tipo',
    'dono: chaves da vistoria: ' || public.zz_chaves(h->'vistorias'->0);
  assert h->'vistorias'->0->>'assinado_por_nome' = 'Jose Motorista' and jsonb_array_length(h->'vistorias'->0->'complementos') = 1,
    'dono deveria ver assinatura e complemento';
  assert jsonb_array_length(h->'vistorias'->0->'fotos') = 2, 'dono deveria ver a foto original e a do complemento';
  assert public.zz_chaves(h->'vistorias'->0->'complementos'->0) = 'criado_em,criado_por_nome,id,texto', 'dono: chaves do complemento';
  assert jsonb_array_length(h->'fotos') = 1, 'foto pendente apareceu no historico';
  assert public.zz_chaves(h->'fotos'->0) = 'altura,caminho,caminho_miniatura,categoria,criado_em,id,largura,legenda', 'chaves da foto';

  h := public.historico_os(current_setting('teste.os6')::uuid);
  assert h->'vistorias' = '[]'::jsonb, 'vistoria em rascunho apareceu no historico';
  h := public.historico_os(current_setting('teste.os3')::uuid);
  assert h->'vistorias'->0->>'status' = 'anulada' and h->'vistorias'->0->>'motivo_anulacao' = 'MOTIVO_ANULACAO_INTERNO',
    'dono: vistoria anulada marcada, com motivo';
  assert public.zz_erro(format('select public.historico_os(%L)', gen_random_uuid())) = 'os_nao_encontrada', 'OS inventada';
  h := public.historico_placa('ZZZ0Z00');
  assert h = '{"veiculo": null, "resumo": null, "os": [], "proximo": null}'::jsonb, 'placa desconhecida';
end $$;

-- atendente: preco sim, custo nunca
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000007a3","role":"authenticated"}', true);
do $$
declare h jsonb; o jsonb;
begin
  h := public.historico_placa('ABC1D23', 10);
  select x into o from jsonb_array_elements(h->'os') x where x->>'id' = current_setting('teste.os1');
  assert public.zz_chaves(o) = 'abre_detalhe,cancelado_em,causa_encontrada,cliente_nome,codigo_falha,criado_em,entregue_em,forma_pagamento,horimetro,id,km,mecanico_nome,motivo_cancelamento,numero,observacoes,pago_em,qtd_fotos,qtd_itens,qtd_vistorias,sintoma_relatado,solucao_aplicada,status,total_centavos',
    'atendente: chaves da OS no historico: ' || public.zz_chaves(o);
  assert h::text not like '%custo%', 'ATENDENTE RECEBE CUSTO NO HISTORICO';
  h := public.historico_os(current_setting('teste.os2')::uuid);
  assert public.zz_chaves(h->'itens'->0) = 'descricao,id,preco_unitario_centavos,quantidade,subtotal_centavos,tipo,unidade',
    'atendente: chaves do item: ' || public.zz_chaves(h->'itens'->0);
  assert h::text not like '%custo%' and h::text not like '%9000%', 'ATENDENTE RECEBE CUSTO NA OS DO HISTORICO';
end $$;

-- mecanico Carlos: TODAS as OS da placa, inclusive as do Pedro, sem nenhum valor nem telefone
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000007a2","role":"authenticated"}', true);
do $$
declare h jsonb; o jsonb; t text;
begin
  h := public.historico_placa('ABC1D23', 10);
  assert jsonb_array_length(h->'os') = 6, 'mecanico deveria ver as 6 OS da placa';
  assert public.zz_chaves(h->'veiculo') = 'ano_modelo,horimetro_atual,id,km_atual,marca,modelo,placa,tipo',
    'mecanico: chaves do veiculo: ' || public.zz_chaves(h->'veiculo');
  for o in select x from jsonb_array_elements(h->'os') x loop
    assert public.zz_chaves(o) = 'abre_detalhe,cancelado_em,causa_encontrada,codigo_falha,criado_em,entregue_em,horimetro,id,km,numero,qtd_fotos,qtd_itens,qtd_vistorias,sintoma_relatado,solucao_aplicada,status',
      'MECANICO: chave a mais na OS do historico: ' || public.zz_chaves(o);
  end loop;
  select x into o from jsonb_array_elements(h->'os') x where x->>'id' = current_setting('teste.os2');
  assert not (o->>'abre_detalhe')::boolean, 'OS do Pedro: sem abrir o detalhe';
  select x into o from jsonb_array_elements(h->'os') x where x->>'id' = current_setting('teste.os1');
  assert (o->>'abre_detalhe')::boolean, 'OS dele deveria abrir o detalhe';
  t := h::text;
  assert t not like '%Pedro Mecanico%' and t not like '%Outro motivo%', 'MECANICO RECEBE NOME DE OUTRO MECANICO OU MOTIVO DE CANCELAMENTO';
  assert t not like '%centavos%' and t not like '%pago%' and t not like '%custo%' and t not like '%forma_pagamento%',
    'MECANICO RECEBE VALOR NO HISTORICO DA PLACA';
  assert t not like '%11988887777%' and t not like '%Transportes Silva%' and t not like '%12345678000199%',
    'MECANICO RECEBE DADOS DO CLIENTE NO HISTORICO';
  assert t not like '%OBS_BALCAO%' and t not like '%MOTIVO_LIVRE_SECRETO%', 'MECANICO RECEBE TEXTO DO BALCAO';

  -- OS do Pedro, aberta pelo Carlos
  h := public.historico_os(current_setting('teste.os2')::uuid);
  assert jsonb_array_length(h->'itens') = 2, 'mecanico deveria ver os itens';
  for o in select x from jsonb_array_elements(h->'itens') x loop
    assert public.zz_chaves(o) = 'descricao,id,quantidade,tipo,unidade', 'MECANICO: chave a mais no item: ' || public.zz_chaves(o);
  end loop;
  assert jsonb_array_length(h->'fotos') = 1, 'mecanico deveria ver a foto enviada';
  assert jsonb_array_length(h->'vistorias') = 1, 'mecanico deveria ver a vistoria concluida';
  assert public.zz_chaves(h->'vistorias'->0) = 'anulada_em,avarias,combustivel,complementos,concluida_em,fotos,horimetro,id,itens,km,objetos,observacoes,sem_avarias,status,tipo',
    'MECANICO: chave a mais na vistoria: ' || public.zz_chaves(h->'vistorias'->0);
  -- como na Fase 4 (DESIGN 14.7): observacoes gerais e complementos, sem quem escreveu
  assert jsonb_array_length(h->'vistorias'->0->'fotos') = 2, 'mecanico deveria ver a foto original e a do complemento';
  assert h->'vistorias'->0->>'observacoes' = 'OBS_VISTORIA_GERAL', 'mecanico deveria ver as observacoes gerais da vistoria';
  assert public.zz_chaves(h->'vistorias'->0->'complementos'->0) = 'criado_em,id,texto', 'MECANICO: chave a mais no complemento';
  t := h::text;
  assert t not like '%centavos%' and t not like '%Jose Motorista%' and t not like '%assinatura%' and t not like '%Dono A%',
    'MECANICO RECEBE VALOR, ASSINATURA OU NOME NA VISTORIA';
  h := public.historico_os(current_setting('teste.os3')::uuid);
  assert h->'vistorias'->0->>'status' = 'anulada' and h::text not like '%MOTIVO_ANULACAO_INTERNO%', 'mecanico: anulada marcada, sem o motivo';
  assert public.zz_erro(format('select public.historico_os(%L)', current_setting('teste.osB'))) = 'os_nao_encontrada', 'MECANICO ABRIU OS DA B';

  -- a RLS das tabelas NAO mudou: fora do historico ele continua sem as OS do Pedro
  assert (select count(*) from public.ordens_servico where id = current_setting('teste.os2')::uuid) = 0, 'RLS de ordens_servico afrouxou';
  assert (select count(*) from public.os_fotos where os_id = current_setting('teste.os2')::uuid) = 0, 'RLS de os_fotos afrouxou';
  assert (select count(*) from public.vistorias where os_id = current_setting('teste.os2')::uuid) = 0, 'RLS de vistorias afrouxou';

  -- [STORAGE] le foto enviada e foto original de vistoria concluida; nada alem disso
  assert exists (select 1 from storage.objects where bucket_id = 'os-fotos' and name = current_setting('teste.foto1')), 'mecanico deveria abrir a foto enviada';
  assert exists (select 1 from storage.objects where bucket_id = 'os-fotos' and name = current_setting('teste.foto1_mini')), 'mecanico deveria abrir a miniatura';
  assert not exists (select 1 from storage.objects where name = current_setting('teste.foto2')), 'MECANICO ABRE FOTO PENDENTE DE OUTRO';
  assert exists (select 1 from storage.objects where bucket_id = 'vistorias' and name = current_setting('teste.vis2_foto')), 'mecanico deveria abrir a foto da vistoria';
  assert not exists (select 1 from storage.objects where name = current_setting('teste.vis2_ass')), 'MECANICO ABRE A ASSINATURA DE OS DE OUTRO';
  assert exists (select 1 from storage.objects where name = current_setting('teste.vis2_compl')), 'mecanico deveria abrir a foto do complemento';
  assert not exists (select 1 from storage.objects where name = current_setting('teste.vis6_foto')), 'MECANICO ABRE FOTO DE VISTORIA EM RASCUNHO DE OUTRO';
  -- e continua sem subir nem apagar
  perform set_config('storage.allow_delete_query', 'true', true);
  assert (select count(*) from (select 1) x where public.zz_erro(format($q$ delete from storage.objects where name = %L $q$, current_setting('teste.foto1'))) is null)
         = 1 and exists (select 1 from storage.objects where name = current_setting('teste.foto1')), 'MECANICO APAGOU FOTO DE OUTRO';
end $$;
-- Pedro (dono da OS2) continua vendo a assinatura dela, como antes
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000007a4","role":"authenticated"}', true);
do $$ begin
  assert exists (select 1 from storage.objects where name = current_setting('teste.vis2_ass')), 'mecanico da OS deveria ver a assinatura (Fase 4)';
end $$;

-- =============================================================================
-- 11) Dados do PDF (20.6-8): lista fechada, sem custo, sem documento, sem mecanico
-- =============================================================================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000007a1","role":"authenticated"}', true);
do $$
declare d jsonb; t text; n_hist integer;
begin
  select count(*) into n_hist from public.os_historico;
  d := public.dados_pdf_os(current_setting('teste.os1')::uuid);
  assert public.zz_chaves(d) = 'causa_encontrada,cliente_nome,criado_em,entregue_em,forma_pagamento,fuso,gerado_em,itens,itens_sem_preco,km,oficina_cnpj,oficina_nome,oficina_telefone,os_numero,pago_em,situacao_pagamento,solucao_aplicada,status,subtotal_pecas_centavos,subtotal_servicos_centavos,tipo_documento,total_centavos,veiculo_ano,veiculo_marca,veiculo_modelo,veiculo_placa',
    'chaves do PDF: ' || public.zz_chaves(d);
  assert public.zz_chaves(d->'itens'->0) = 'descricao,preco_unitario_centavos,quantidade,subtotal_centavos,tipo,unidade',
    'chaves do item do PDF: ' || public.zz_chaves(d->'itens'->0);
  assert d->>'tipo_documento' = 'resumo_final' and d->>'situacao_pagamento' = 'pago' and (d->>'pago_em')::timestamptz = '2026-10-31 23:40-03',
    'OS1: resumo final pago';
  assert (d->>'total_centavos')::bigint = 25000 and (d->>'subtotal_servicos_centavos')::bigint = 20000
     and (d->>'subtotal_pecas_centavos')::bigint = 5000, 'OS1: valores do PDF';
  assert (select sum((x->>'subtotal_centavos')::bigint) from jsonb_array_elements(d->'itens') x) = 25000, 'soma dos itens do PDF diferente do total';
  assert d->>'oficina_nome' = 'Oficina Gabarito A' and d->>'oficina_telefone' = '1133334444' and d->>'cliente_nome' = 'Transportes Silva'
     and d->>'veiculo_placa' = 'ABC1D23', 'cabecalho do PDF';
  t := d::text;
  assert t not like '%custo%' and t not like '%7777%' and t not like '%margem%', 'PDF COM CUSTO';
  assert d->>'oficina_cnpj' = '11222333000181', 'PDF deveria trazer o CNPJ da oficina';
  assert t not like '%12345678000199%' and t not like '%11988887777%', 'PDF COM DOCUMENTO OU TELEFONE DO CLIENTE';
  assert t not like '%Mecanico%' and t not like '%SINTOMA_INTERNO%' and t not like '%OBS_BALCAO%', 'PDF COM MECANICO, SINTOMA OU OBSERVACAO';

  d := public.dados_pdf_os(current_setting('teste.os6')::uuid);
  assert d->>'tipo_documento' = 'ordem_servico' and d->'situacao_pagamento' = 'null'::jsonb and d->'pago_em' = 'null'::jsonb,
    'OS aberta: ordem de servico sem situacao de pagamento';
  assert public.zz_erro(format('select public.dados_pdf_os(%L)', current_setting('teste.os5'))) = 'os_cancelada_sem_pdf', 'PDF de OS cancelada';
  assert public.zz_erro(format('select public.dados_pdf_os(%L)', gen_random_uuid())) = 'os_nao_encontrada', 'PDF de OS inventada';
  assert (select count(*) from public.os_historico) = n_hist, 'gerar o PDF escreveu no historico';
end $$;
-- oficina com CPF: o documento some do PDF
reset role;
update public.oficinas set documento = '12345678909' where id = current_setting('teste.oficina_a')::uuid;
set local role authenticated;
do $$
declare d jsonb;
begin
  d := public.dados_pdf_os(current_setting('teste.os1')::uuid);
  assert d->'oficina_cnpj' = 'null'::jsonb and d::text not like '%12345678909%', 'PDF COM CPF DA OFICINA';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000007a3","role":"authenticated"}', true);
do $$
declare d jsonb;
begin
  d := public.dados_pdf_os(current_setting('teste.os3')::uuid);
  assert d->>'situacao_pagamento' = 'a_receber' and d->>'forma_pagamento' = 'boleto' and (d->>'total_centavos')::bigint = 35000,
    'atendente: PDF da OS3 a receber';
  assert d::text not like '%custo%', 'ATENDENTE: PDF COM CUSTO';
end $$;

-- =============================================================================
-- 12) Evento de preco (F7-B8) e eventos que o mecanico nao le
-- =============================================================================
reset role;
-- item lancado "antes" (outro pedido): o preco definido depois e o evento
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000007a4","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  -- mecanico lanca do catalogo (o banco copia o preco): nao e evento
  perform public.adicionar_item_os(gen_random_uuid(), current_setting('teste.os6')::uuid, 'servico', p_servico_id => current_setting('teste.s1')::uuid);
  perform set_config('teste.it_correia', public.adicionar_item_os(gen_random_uuid(), current_setting('teste.os6')::uuid, 'peca',
                     p_descricao => 'Correia', p_quantidade => 1)::text, true);
end $$;
reset role;
update public.os_itens set criado_em = now() - interval '1 hour' where id = current_setting('teste.it_correia')::uuid;
do $$ begin
  assert (select count(*) from public.os_historico where os_id = current_setting('teste.os6')::uuid and evento = 'preco') = 0,
    'preco copiado do catalogo pelo mecanico virou evento';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000007a3","role":"authenticated"}', true);
set local role authenticated;
insert into public.os_itens_precos (item_id, preco_unitario_centavos) values (current_setting('teste.it_correia')::uuid, 8000);
update public.os_itens_precos set preco_unitario_centavos = 8500 where item_id = current_setting('teste.it_correia')::uuid;  -- agrupado
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000007a1","role":"authenticated"}', true);
update public.os_itens_precos set preco_unitario_centavos = 36000
 where item_id = (select id from public.os_itens where os_id = current_setting('teste.os6')::uuid and servico_id = current_setting('teste.s2')::uuid);
update public.os_itens_precos set preco_unitario_centavos = 36000
 where item_id = (select id from public.os_itens where os_id = current_setting('teste.os6')::uuid and servico_id = current_setting('teste.s2')::uuid);  -- mesmo valor
do $$
declare r record;
begin
  assert (select count(*) from public.os_historico where os_id = current_setting('teste.os6')::uuid and evento = 'preco') = 2,
    'deveria haver 2 eventos de preco (atendente agrupado + dono)';
  select * into r from public.vw_os_historico where os_id = current_setting('teste.os6')::uuid and evento = 'preco'
    and por = '00000000-0000-4000-8000-0000000007a3';
  assert r.observacao is null and r.por_nome = 'Ana Atendente' and r.de_status = 'em_andamento' and r.para_status = 'em_andamento',
    'evento de preco: sem texto, com quem e o status';
  -- item novo com preco no mesmo pedido: so lancamento, nao evento
  perform public.zz_item(current_setting('teste.os7')::uuid, 'servico', current_setting('teste.s1')::uuid, null, 1, 20000);
  assert (select count(*) from public.os_historico where os_id = current_setting('teste.os7')::uuid and evento = 'preco') = 0,
    'item novo com preco virou evento';
  -- com o orcamento enviado, a trava recusa antes e nada vira evento
  perform public.enviar_orcamento(current_setting('teste.os7')::uuid, gen_random_uuid(), 20000);
  assert public.zz_erro(format($q$ update public.os_itens_precos set preco_unitario_centavos = 1
                                   where item_id in (select id from public.os_itens where os_id = %L) $q$, current_setting('teste.os7'))) = 'orcamento_travado',
    'trava do orcamento deveria recusar';
  assert (select count(*) from public.os_historico where os_id = current_setting('teste.os7')::uuid and evento = 'preco') = 0,
    'preco travado virou evento';
  assert (select count(*) from public.vw_os_historico where os_id = current_setting('teste.os1')::uuid and evento = 'pagamento') >= 1,
    'dono deveria ver os pagamentos';
end $$;
-- mecanico: nem 'preco' nem 'pagamento', pela tabela ou pela view
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000007a4","role":"authenticated"}', true);
do $$ begin
  assert (select count(*) from public.os_historico where os_id = current_setting('teste.os6')::uuid) > 0, 'Pedro deveria ler o historico da OS dele';
  assert (select count(*) from public.os_historico where evento in ('preco', 'pagamento')) = 0, 'MECANICO LE EVENTO DE PRECO OU PAGAMENTO (tabela)';
  assert (select count(*) from public.vw_os_historico where evento in ('preco', 'pagamento')) = 0, 'MECANICO LE EVENTO DE PRECO OU PAGAMENTO (view)';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000007a2","role":"authenticated"}', true);
do $$ begin
  assert (select count(*) from public.vw_os_historico where os_id = current_setting('teste.os1')::uuid and evento = 'pagamento') = 0,
    'MECANICO LE O PAGAMENTO DA OS DELE';
end $$;
-- os_historico continua imutavel
do $$ begin
  assert public.zz_estado($q$ update public.os_historico set observacao = 'x' where evento = 'preco' $q$) is not null
      or (select count(*) from public.os_historico where observacao = 'x') = 0, 'historico alterado';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000007a1","role":"authenticated"}', true);
do $$ begin
  perform public.zz_erro($q$ update public.os_historico set observacao = 'x' where evento = 'preco' $q$);
  perform public.zz_erro($q$ delete from public.os_historico where evento = 'preco' $q$);
  assert (select count(*) from public.os_historico where evento = 'preco' and observacao is null) = 2, 'DONO ALTEROU OU APAGOU O EVENTO DE PRECO';
end $$;

-- =============================================================================
-- 13) Perfil desativado: recusado na hora
-- =============================================================================
reset role;
update public.perfis set ativo = false where id = '00000000-0000-4000-8000-0000000007a3';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000007a3","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  assert public.zz_estado('select * from public.contas_a_receber()') = '42501', 'DESATIVADO LEU O A RECEBER';
  assert public.zz_estado(format('select public.dados_pdf_os(%L)', current_setting('teste.os1'))) = '42501', 'DESATIVADO LEU O PDF';
  assert public.zz_estado($q$ select public.historico_placa('ABC1D23') $q$) = '42501', 'DESATIVADO LEU O HISTORICO';
end $$;

-- =============================================================================
-- 14) Volume: 3 mil OS entregues na oficina B; o painel usa indice
-- =============================================================================
reset role;
insert into public.ordens_servico (oficina_id, numero, chave_idempotencia, cliente_id, veiculo_id, modo, status,
                                   autorizado_em, iniciado_em, pronta_em, entregue_em, criado_em)
select current_setting('teste.oficina_b')::uuid, 1000 + g, gen_random_uuid(), current_setting('teste.cB')::uuid,
       current_setting('teste.vB')::uuid, 'direto', 'entregue', t, t, t, t, t
  from generate_series(1, 3000) g, lateral (select timestamptz '2025-01-01 12:00-03' + g * interval '3 hours' as t) x;
analyze public.ordens_servico;
analyze public.os_comercial;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000007b1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare p jsonb; plano text := ''; r record; t0 timestamptz;
begin
  t0 := clock_timestamp();
  p := public.painel_mes(2025, 3);
  -- marco/2025: g de 468 (01/03 00:00, inclusive) a 715 (31/03 21:00); g = 716 ja e 01/04 00:00 = 248 OS
  assert (p->'entregues'->>'qtd_os')::int = 248, 'volume: OS de marco/2025: ' || (p->'entregues'->>'qtd_os');
  raise notice 'FASE 7 volume: painel_mes com 3 mil OS em % ms', round(extract(epoch from clock_timestamp() - t0) * 1000);
  for r in execute $q$ explain select o.id from public.ordens_servico o
                         where o.oficina_id = (select private.minha_oficina_id()) and o.status = 'entregue'
                           and o.entregue_em >= timestamptz '2025-03-01 00:00-03' and o.entregue_em < timestamptz '2025-04-01 00:00-03' $q$ loop
    plano := plano || r."QUERY PLAN" || E'\n';
  end loop;
  assert plano not like '%Seq Scan on ordens_servico%', 'painel sem indice: ' || plano;
end $$;

-- =============================================================================
reset role;
select 'FASE 7 OK: painel, historico e PDF passaram' as resultado;

rollback;
