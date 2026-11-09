-- =============================================================================
-- MechaFlow - Fase 8 - Teste do banco: "Primeiros passos" (DESIGN 15.4, ARQUITETURA 15.15)
--
-- O que prova:
--   * oficina nova (sem telefone) nasce com os 4 passos falsos e nao dispensada;
--   * cada passo vira verdadeiro pela regra da tabela 15.4.1:
--       1 telefone preenchido; 2 convite criado OU > 1 perfil ativo (testado sem convite);
--       3 servico OU peca ATIVA (inativo nao conta); 4 qualquer OS;
--   * dispensar e desfazer: gravam, sao idempotentes (a data da 1a vez nao muda);
--   * atendente, mecanico e usuario sem oficina recebem 42501 nas 3 RPCs;
--   * oficina B nao enxerga nem mexe na A;
--   * UPDATE direto em oficinas.primeiros_passos_dispensado_em e recusado (42501),
--     enquanto o UPDATE do telefone continua permitido ao dono;
--   * anon sem EXECUTE nas 3 RPCs.
--
-- Como rodar: SQL Editor do Supabase STAGING (usuario postgres), DEPOIS da migracao
-- 20261109000001_f8_primeiros_passos. Leva poucos segundos.
-- Resultado esperado: 'FASE 8 OK: primeiros passos passaram'.
-- Tudo numa transacao que termina em ROLLBACK: nada fica gravado.
-- =============================================================================

begin;

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
grant execute on function public.zz_estado(text), public.zz_chaves(jsonb) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 0) Usuarios: a1 dono A | a2 mecanico A | a3 atendente A | b1 dono B | f1 sem oficina
-- -----------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email, '', now(),
       '{"provider":"email","providers":["email"]}', '{}', now(), now()
  from (values
    ('00000000-0000-4000-8000-0000000008a1', 'f8.dono.a@teste.invalid'),
    ('00000000-0000-4000-8000-0000000008a2', 'f8.mec.a@teste.invalid'),
    ('00000000-0000-4000-8000-0000000008a3', 'f8.atd.a@teste.invalid'),
    ('00000000-0000-4000-8000-0000000008b1', 'f8.dono.b@teste.invalid'),
    ('00000000-0000-4000-8000-0000000008f1', 'f8.sem.oficina@teste.invalid')
  ) as u(id, email);

-- =============================================================================
-- 1) DONO A: oficina nova, SEM telefone => tudo falso
-- =============================================================================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000008a1","role":"authenticated"}', true);
set local role authenticated;

select set_config('teste.oficina_a',
  public.criar_oficina('Oficina F8 A', 'Dono A', private.versao_termos_vigente())::text, true);

do $$
declare p jsonb := public.primeiros_passos();
begin
  assert public.zz_chaves(p) = 'catalogo,dados_oficina,dispensado,equipe,primeira_os',
    'chaves erradas: ' || public.zz_chaves(p);
  assert p = '{"dados_oficina":false,"equipe":false,"catalogo":false,"primeira_os":false,"dispensado":false}'::jsonb,
    'oficina nova deveria ter tudo falso: ' || p::text;
  -- o checklist ja nasce semeado e NAO conta para o passo 3
  assert exists (select 1 from public.checklist_modelos), 'criar_oficina deveria semear o checklist';
end $$;

-- =============================================================================
-- 2) Passo 1: telefone (UPDATE direto do dono, permitido)
-- =============================================================================
update public.oficinas set telefone = '(11) 3333-4444' where id = current_setting('teste.oficina_a')::uuid;

do $$
declare p jsonb := public.primeiros_passos();
begin
  assert (p->>'dados_oficina')::boolean, 'passo 1 deveria estar feito com telefone';
  assert not (p->>'equipe')::boolean and not (p->>'catalogo')::boolean and not (p->>'primeira_os')::boolean,
    'so o passo 1 deveria estar feito: ' || p::text;
end $$;

-- =============================================================================
-- 3) Passo 2: convite criado (ainda nao aceito) ja conta
-- =============================================================================
select set_config('teste.tk_mec', (select token from public.criar_convite('mecanico', 'Mecanico A')), true);
select set_config('teste.tk_atd', (select token from public.criar_convite('atendente', 'Atendente A')), true);

do $$
begin
  assert (public.primeiros_passos()->>'equipe')::boolean, 'passo 2 deveria contar convite nao aceito';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000008a2","role":"authenticated"}', true);
select public.aceitar_convite(current_setting('teste.tk_mec'), 'Mecanico A', private.versao_termos_vigente());
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000008a3","role":"authenticated"}', true);
select public.aceitar_convite(current_setting('teste.tk_atd'), 'Atendente A', private.versao_termos_vigente());

-- [ADMIN] some com os convites: o passo 2 tem de continuar feito pelo "> 1 perfil ativo"
reset role;
delete from public.convites where oficina_id = current_setting('teste.oficina_a')::uuid;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000008a1","role":"authenticated"}', true);

do $$
begin
  assert not exists (select 1 from public.convites), 'convites deveriam ter sumido';
  assert (public.primeiros_passos()->>'equipe')::boolean, 'passo 2 deveria contar mais de 1 perfil ativo';
end $$;

-- =============================================================================
-- 4) Passo 3: servico INATIVO nao conta; peca ativa conta; servico ativo conta
-- =============================================================================
insert into public.catalogo_servicos (nome, ativo) values ('Servico desativado', false);
do $$
begin
  assert not (public.primeiros_passos()->>'catalogo')::boolean, 'servico inativo nao deveria contar';
end $$;

with p as (insert into public.catalogo_pecas (nome) values ('Filtro de oleo') returning id)
select set_config('teste.peca_a', (select id::text from p), true);
do $$
begin
  assert (public.primeiros_passos()->>'catalogo')::boolean, 'peca ativa deveria contar';
end $$;

update public.catalogo_pecas set ativo = false where id = current_setting('teste.peca_a')::uuid;
do $$
begin
  assert not (public.primeiros_passos()->>'catalogo')::boolean, 'peca desativada nao deveria contar';
end $$;

insert into public.catalogo_servicos (nome) values ('Troca de oleo');
do $$
begin
  assert (public.primeiros_passos()->>'catalogo')::boolean, 'servico ativo deveria contar';
  assert not (public.primeiros_passos()->>'primeira_os')::boolean, 'ainda nao ha OS';
end $$;

-- =============================================================================
-- 5) Passo 4: qualquer OS (aqui, com orcamento, aguardando)
-- =============================================================================
with c as (insert into public.clientes (nome, telefone) values ('Transportes F8', '11988887777') returning id)
select set_config('teste.c1', (select id::text from c), true);
with v as (insert into public.veiculos (cliente_id, placa) values (current_setting('teste.c1')::uuid, 'ABC1D23') returning id)
select set_config('teste.v1', (select id::text from v), true);
select set_config('teste.os1',
  (select os_id::text from public.abrir_os(gen_random_uuid(), p_veiculo_id => current_setting('teste.v1')::uuid,
                                           p_modo => 'com_orcamento')), true);

do $$
declare p jsonb := public.primeiros_passos();
begin
  assert p = '{"dados_oficina":true,"equipe":true,"catalogo":true,"primeira_os":true,"dispensado":false}'::jsonb,
    'com tudo feito: ' || p::text;
end $$;

-- =============================================================================
-- 6) Dispensar e desfazer (idempotentes)
-- =============================================================================
select public.dispensar_primeiros_passos();
select set_config('teste.dispensado_em',
  (select primeiros_passos_dispensado_em::text from public.oficinas where id = current_setting('teste.oficina_a')::uuid), true);

do $$
begin
  assert current_setting('teste.dispensado_em', true) <> '', 'dispensar deveria gravar a data';
  assert (public.primeiros_passos()->>'dispensado')::boolean, 'deveria estar dispensado';
end $$;

-- 2a chamada: nao erra e nao muda a data
select public.dispensar_primeiros_passos();
do $$
begin
  assert (select primeiros_passos_dispensado_em::text from public.oficinas
           where id = current_setting('teste.oficina_a')::uuid) = current_setting('teste.dispensado_em'),
    'dispensar de novo mudou a data';
end $$;

select public.desfazer_dispensar_primeiros_passos();
select public.desfazer_dispensar_primeiros_passos();   -- 2a chamada: nao erra
do $$
begin
  assert (select primeiros_passos_dispensado_em from public.oficinas
           where id = current_setting('teste.oficina_a')::uuid) is null, 'desfazer deveria limpar a coluna';
  assert not (public.primeiros_passos()->>'dispensado')::boolean, 'nao deveria estar dispensado';
end $$;

-- Dispensar de novo, depois de desfazer, volta a gravar
select public.dispensar_primeiros_passos();
do $$
begin
  assert (public.primeiros_passos()->>'dispensado')::boolean, 'dispensar depois de desfazer deveria gravar';
end $$;

-- =============================================================================
-- 7) UPDATE direto na coluna: recusado (dono, atendente, mecanico)
-- =============================================================================
do $$
begin
  assert public.zz_estado(format(
    'update public.oficinas set primeiros_passos_dispensado_em = null where id = %L', current_setting('teste.oficina_a')))
    = '42501', 'DONO GRAVOU A COLUNA POR UPDATE DIRETO';
  assert public.zz_estado(format(
    'update public.oficinas set telefone = %L, primeiros_passos_dispensado_em = now() where id = %L',
    '11999990000', current_setting('teste.oficina_a'))) = '42501', 'DONO GRAVOU A COLUNA JUNTO COM O TELEFONE';
  assert (public.primeiros_passos()->>'dispensado')::boolean, 'o UPDATE recusado mexeu no dispensado';
  assert (select telefone from public.oficinas where id = current_setting('teste.oficina_a')::uuid) = '1133334444',
    'o UPDATE recusado mexeu no telefone';
end $$;

-- =============================================================================
-- 8) Atendente, mecanico e usuario sem oficina: 42501 nas 3 RPCs
-- =============================================================================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000008a3","role":"authenticated"}', true);
do $$
begin
  assert public.zz_estado('select public.primeiros_passos()') = '42501', 'ATENDENTE LEU PRIMEIROS PASSOS';
  assert public.zz_estado('select public.dispensar_primeiros_passos()') = '42501', 'ATENDENTE DISPENSOU';
  assert public.zz_estado('select public.desfazer_dispensar_primeiros_passos()') = '42501', 'ATENDENTE DESFEZ';
  assert public.zz_estado(format(
    'update public.oficinas set primeiros_passos_dispensado_em = null where id = %L', current_setting('teste.oficina_a')))
    = '42501', 'ATENDENTE GRAVOU A COLUNA';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000008a2","role":"authenticated"}', true);
do $$
begin
  assert public.zz_estado('select public.primeiros_passos()') = '42501', 'MECANICO LEU PRIMEIROS PASSOS';
  assert public.zz_estado('select public.dispensar_primeiros_passos()') = '42501', 'MECANICO DISPENSOU';
  assert public.zz_estado('select public.desfazer_dispensar_primeiros_passos()') = '42501', 'MECANICO DESFEZ';
  assert public.zz_estado(format(
    'update public.oficinas set primeiros_passos_dispensado_em = null where id = %L', current_setting('teste.oficina_a')))
    = '42501', 'MECANICO GRAVOU A COLUNA';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000008f1","role":"authenticated"}', true);
do $$
begin
  assert public.zz_estado('select public.primeiros_passos()') = '42501', 'SEM OFICINA LEU PRIMEIROS PASSOS';
  assert public.zz_estado('select public.dispensar_primeiros_passos()') = '42501', 'SEM OFICINA DISPENSOU';
  assert public.zz_estado('select public.desfazer_dispensar_primeiros_passos()') = '42501', 'SEM OFICINA DESFEZ';
end $$;

-- =============================================================================
-- 9) Oficina B: nao enxerga nem mexe na A
-- =============================================================================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000008b1","role":"authenticated"}', true);
select set_config('teste.oficina_b',
  public.criar_oficina('Oficina F8 B', 'Dono B', private.versao_termos_vigente())::text, true);

do $$
declare p jsonb := public.primeiros_passos();
begin
  assert p = '{"dados_oficina":false,"equipe":false,"catalogo":false,"primeira_os":false,"dispensado":false}'::jsonb,
    'B ENXERGOU DADOS DA A: ' || p::text;
  assert not exists (select 1 from public.oficinas where id = current_setting('teste.oficina_a')::uuid),
    'B LEU A LINHA DA OFICINA A';
end $$;

-- B dispensa e desfaz a dela; a A continua dispensada
select public.dispensar_primeiros_passos();
select public.desfazer_dispensar_primeiros_passos();
do $$
begin
  assert public.zz_estado(format(
    'update public.oficinas set primeiros_passos_dispensado_em = null where id = %L', current_setting('teste.oficina_a')))
    = '42501', 'B GRAVOU A COLUNA DA A';
  assert not (public.primeiros_passos()->>'dispensado')::boolean, 'B deveria estar nao dispensada';
end $$;

reset role;
do $$
begin
  assert (select primeiros_passos_dispensado_em from public.oficinas
           where id = current_setting('teste.oficina_a')::uuid) is not null, 'B MEXEU NO DISPENSADO DA A';
  assert (select primeiros_passos_dispensado_em from public.oficinas
           where id = current_setting('teste.oficina_b')::uuid) is null, 'B deveria ter desfeito o dela';
end $$;

-- =============================================================================
-- 10) Grants: anon sem nada; authenticated executa as 3; nenhuma aceita oficina por parametro
-- =============================================================================
do $$
begin
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public'
                        and p.proname in ('primeiros_passos', 'dispensar_primeiros_passos', 'desfazer_dispensar_primeiros_passos')
                        and has_function_privilege('anon', p.oid, 'execute')),
    'ANON GANHOU FUNCAO NOVA';
  assert (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public'
             and p.proname in ('primeiros_passos', 'dispensar_primeiros_passos', 'desfazer_dispensar_primeiros_passos')
             and p.pronargs = 0
             and p.prosecdef
             and has_function_privilege('authenticated', p.oid, 'execute')) = 3,
    'authenticated deveria executar as 3 (sem parametro, security definer)';
  assert not has_function_privilege('anon', 'private.exigir_dono()', 'execute'), 'ANON EXECUTA private.exigir_dono';
  assert not has_column_privilege('authenticated', 'public.oficinas', 'primeiros_passos_dispensado_em', 'update'),
    'AUTHENTICATED TEM UPDATE NA COLUNA';
  assert not has_column_privilege('anon', 'public.oficinas', 'primeiros_passos_dispensado_em', 'update'),
    'ANON TEM UPDATE NA COLUNA';
  assert has_column_privilege('authenticated', 'public.oficinas', 'telefone', 'update'),
    'o dono perdeu o UPDATE do telefone';
end $$;

select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $$
begin
  assert public.zz_estado('select public.primeiros_passos()') = '42501', 'ANON LEU PRIMEIROS PASSOS';
  assert public.zz_estado('select public.dispensar_primeiros_passos()') = '42501', 'ANON DISPENSOU';
  assert public.zz_estado('select public.desfazer_dispensar_primeiros_passos()') = '42501', 'ANON DESFEZ';
end $$;

-- =============================================================================
reset role;
select 'FASE 8 OK: primeiros passos passaram' as resultado;

rollback;
