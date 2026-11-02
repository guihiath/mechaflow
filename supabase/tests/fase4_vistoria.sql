-- =============================================================================
-- MechaFlow - Fase 4 - Teste do banco: vistoria do veiculo
--
-- O que prova:
--   * checklist padrao de caminhao (16 itens) em toda oficina; o dono adiciona,
--     renomeia, sobe/desce e desativa; atendente/mecanico nao mexem; ninguem apaga;
--   * uma vistoria de entrada por OS (reenvio devolve a mesma; anulada libera
--     outra); checklist COPIADO (editar o modelo nao muda a vistoria);
--   * quem faz: dono/atendente em qualquer OS aberta, mecanico so na OS dele;
--     mecanico com ve_todas_os ve mas nao faz; mecanico sem acesso nao ve nada;
--   * KM unico: salvar na vistoria grava na OS; a conclusao copia o KM e
--     atualiza o veiculo;
--   * objetos: nasce NULL (nao informado); '{}' so por escolha ("Nenhum objeto");
--     limpar volta a NULL; concluir com NULL e com '{}' mantem cada um e o hash confere;
--   * concluir recusado sem marcar itens, com foto pendente, com avaria vazia,
--     sem assinatura/nome, sem o arquivo da assinatura; "sem assinatura" com motivo;
--   * DEPOIS DE CONCLUIDA: nada muda nem sai - dono, atendente, mecanico e ate
--     o postgres - em vistorias, itens, avarias, fotos e storage.objects;
--     hash SHA-256 confere e acusa alteracao feita com o trigger desligado;
--   * complemento: so acrescenta (texto + foto), nunca muda;
--   * anular: so o dono, com motivo; anulada fica guardada e imutavel;
--   * obrigatoriedade: chave ligada bloqueia pronta e entregue sem vistoria de
--     entrada concluida;
--   * isolamento A x B (tabelas, views, RPCs, Storage) e anon.
--
-- [STORAGE] As secoes marcadas usam o schema storage do Supabase. No PGlite
-- rodam contra uma copia minima (buckets/objects); o resultado que vale para
-- o Storage e o do STAGING. Limite de tamanho e tipo do arquivo: API (testar-staging).
-- [ADMIN] A secao 7 desliga um trigger dentro da transacao (como dono das
-- tabelas) para provar que o hash acusa a alteracao; tudo volta no ROLLBACK.
--
-- Como rodar: SQL Editor do Supabase STAGING (usuario postgres), DEPOIS das
-- migracoes 20261101000001..04 e 20261102000001 da Fase 4. Colar tudo e executar.
-- Resultado esperado: 'FASE 4 OK: vistoria passou'.
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
    ('00000000-0000-4000-8000-0000000004a1', 'f4.dono.a@teste.invalid'),
    ('00000000-0000-4000-8000-0000000004a2', 'f4.mec.a@teste.invalid'),
    ('00000000-0000-4000-8000-0000000004a3', 'f4.atd.a@teste.invalid'),
    ('00000000-0000-4000-8000-0000000004a4', 'f4.mec2.a@teste.invalid'),
    ('00000000-0000-4000-8000-0000000004a5', 'f4.mec3.a@teste.invalid'),
    ('00000000-0000-4000-8000-0000000004b1', 'f4.dono.b@teste.invalid')
  ) as u(id, email);

-- [STORAGE] bucket proprio, privado, 5 MB, JPEG + PNG
do $$
begin
  assert exists (select 1 from storage.buckets where id = 'vistorias' and public = false
                   and file_size_limit = 5242880 and allowed_mime_types = array['image/jpeg', 'image/png']),
    'bucket vistorias deveria ser PRIVADO, 5 MB, image/jpeg + image/png';
  -- semente idempotente e para oficina que ja existia (simulada aqui)
  insert into public.oficinas (id, nome) values ('f4000000-0000-4000-8000-0000000000ff', 'Oficina antiga');
  perform private.semear_checklist_padrao('f4000000-0000-4000-8000-0000000000ff');
  perform private.semear_checklist_padrao('f4000000-0000-4000-8000-0000000000ff');
  assert (select count(*) from public.checklist_modelos where oficina_id = 'f4000000-0000-4000-8000-0000000000ff') = 1,
    'semente duplicou o modelo';
  assert (select count(*) from public.checklist_modelo_itens where oficina_id = 'f4000000-0000-4000-8000-0000000000ff') = 16,
    'semente deveria ter 16 itens';
  -- a migracao 01 semeou todas as oficinas que existiam
  assert not exists (select 1 from public.oficinas o
                      where not exists (select 1 from public.checklist_modelos m where m.oficina_id = o.id and m.padrao)),
    'existe oficina sem o checklist padrao';
end $$;

-- =============================================================================
-- 1) DONO A: oficina, equipe, veiculo, OS
-- =============================================================================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004a1","role":"authenticated"}', true);
set local role authenticated;

select set_config('teste.oficina_a', public.criar_oficina('Oficina A F4', 'Dono A', private.versao_termos_vigente())::text, true);
select set_config('teste.tk_mec',  (select token from public.criar_convite('mecanico', 'Mecanico A')), true);
select set_config('teste.tk_atd',  (select token from public.criar_convite('atendente', 'Atendente A')), true);
select set_config('teste.tk_mec2', (select token from public.criar_convite('mecanico', 'Mecanico A2')), true);
select set_config('teste.tk_mec3', (select token from public.criar_convite('mecanico', 'Mecanico A3')), true);

with c as (insert into public.clientes (nome, telefone) values ('Transportadora F4', '11988887777') returning id)
select set_config('teste.cliente', (select id::text from c), true);
with v as (insert into public.veiculos (cliente_id, placa) values (current_setting('teste.cliente')::uuid, 'FTR4A44') returning id)
select set_config('teste.veiculo', (select id::text from v), true);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004a2","role":"authenticated"}', true);
select public.aceitar_convite(current_setting('teste.tk_mec'), 'Mecanico A', private.versao_termos_vigente());
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004a3","role":"authenticated"}', true);
select public.aceitar_convite(current_setting('teste.tk_atd'), 'Atendente A', private.versao_termos_vigente());
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004a4","role":"authenticated"}', true);
select public.aceitar_convite(current_setting('teste.tk_mec2'), 'Mecanico A2', private.versao_termos_vigente());
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004a5","role":"authenticated"}', true);
select public.aceitar_convite(current_setting('teste.tk_mec3'), 'Mecanico A3', private.versao_termos_vigente());

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004a1","role":"authenticated"}', true);
select public.atualizar_membro('00000000-0000-4000-8000-0000000004a4', p_ve_todas_os => true);

-- OS A: com orcamento, mecanico a2, KM 1000 (vistoria completa)
select set_config('teste.osA', (select os_id::text from public.abrir_os('f4000000-0000-4000-8000-00000000000a',
  p_veiculo_id => current_setting('teste.veiculo')::uuid, p_mecanico_id => '00000000-0000-4000-8000-0000000004a2',
  p_km => 1000)), true);
-- OS D: direta (em_andamento), mecanico a2 (obrigatoriedade, anular)
select set_config('teste.osD', (select os_id::text from public.abrir_os('f4000000-0000-4000-8000-00000000000d',
  p_veiculo_id => current_setting('teste.veiculo')::uuid, p_mecanico_id => '00000000-0000-4000-8000-0000000004a2',
  p_modo => 'direto', p_autorizado_por_nome => 'Joao motorista')), true);
-- OS X: mecanico a4 (nao e do a2)
select set_config('teste.osX', (select os_id::text from public.abrir_os('f4000000-0000-4000-8000-00000000000b',
  p_veiculo_id => current_setting('teste.veiculo')::uuid, p_mecanico_id => '00000000-0000-4000-8000-0000000004a4')), true);

-- =============================================================================
-- 2) CHECKLIST: semente, editor do dono, quem nao pode
-- =============================================================================
do $$
declare
  v_modelo uuid;
  v_novo   uuid;
begin
  select id into v_modelo from public.checklist_modelos where padrao;
  assert v_modelo is not null, 'oficina nova sem modelo padrao';
  perform set_config('teste.modelo', v_modelo::text, true);
  assert (select count(*) from public.checklist_modelo_itens where modelo_id = v_modelo) = 16, 'modelo padrao deveria ter 16 itens';
  assert (select descricao from public.checklist_modelo_itens where modelo_id = v_modelo and ordem = 1) = 'Estepe', '1o item deveria ser Estepe';
  assert (select descricao from public.checklist_modelo_itens where modelo_id = v_modelo and ordem = 16) = 'Painel (luzes de alerta)',
    'ultimo item deveria ser o painel';

  -- adicionar (vai para o fim), renomear, subir, desativar
  insert into public.checklist_modelo_itens (modelo_id, descricao) values (v_modelo, '  Lona   de cobertura ')
    returning id into v_novo;
  perform set_config('teste.item_novo', v_novo::text, true);
  assert (select ordem = 17 and descricao = 'Lona de cobertura' from public.checklist_modelo_itens where id = v_novo),
    'item novo deveria ir para o fim, normalizado';
  perform public.mover_item_checklist(v_novo, 'subir');
  perform public.mover_item_checklist(v_novo, 'subir');
  perform public.mover_item_checklist(v_novo, 'descer');
  assert (select ordem from public.checklist_modelo_itens where id = v_novo) = 16, 'subir/descer nao trocou a ordem';
  assert (select ordem from public.checklist_modelo_itens where modelo_id = v_modelo and descricao = 'Painel (luzes de alerta)') = 17,
    'vizinho deveria ter descido';
  perform public.mover_item_checklist((select id from public.checklist_modelo_itens where modelo_id = v_modelo and ordem = 1), 'subir');
  assert (select descricao from public.checklist_modelo_itens where modelo_id = v_modelo and ordem = 1) = 'Estepe', 'subir na ponta mudou algo';
  assert public.zz_erro(format($q$ select public.mover_item_checklist(%L, 'pular') $q$, v_novo)) = 'direcao_invalida', 'direcao invalida aceita';
  assert public.zz_afetadas($q$ update public.checklist_modelo_itens set ativo = false where descricao = 'Tacógrafo' $q$) = 1,
    'dono deveria desativar item';
  assert public.zz_estado(format($q$ delete from public.checklist_modelo_itens where id = %L $q$, v_novo)) = '42501',
    'dono apagou item do checklist (deveria so desativar)';
  assert public.zz_estado(format($q$ update public.checklist_modelo_itens set ordem = 1 where id = %L $q$, v_novo)) = '42501',
    'ordem mudou por UPDATE direto (deveria ser pela RPC)';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004a3","role":"authenticated"}', true);
do $$
begin
  assert (select count(*) from public.checklist_modelo_itens) = 17, 'atendente deveria ler o checklist';
  assert public.zz_estado(format($q$ insert into public.checklist_modelo_itens (modelo_id, descricao) values (%L, 'X item') $q$,
                                 current_setting('teste.modelo'))) = '42501', 'atendente adicionou item ao checklist';
  assert public.zz_afetadas($q$ update public.checklist_modelo_itens set descricao = 'Mudou' $q$) = 0, 'atendente renomeou item';
  assert public.zz_estado(format($q$ select public.mover_item_checklist(%L, 'subir') $q$, current_setting('teste.item_novo'))) = '42501',
    'atendente reordenou o checklist';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004a2","role":"authenticated"}', true);
do $$
begin
  assert (select count(*) from public.checklist_modelo_itens) = 17, 'mecanico deveria ler o checklist';
  assert public.zz_afetadas($q$ update public.checklist_modelo_itens set ativo = false $q$) = 0, 'mecanico desativou item';
end $$;

-- =============================================================================
-- 3) INICIAR: atendente cria a vistoria da OS A; checklist copiado
-- =============================================================================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004a3","role":"authenticated"}', true);
do $$
declare
  r record;
  osA uuid := current_setting('teste.osA')::uuid;
begin
  select * into r from public.iniciar_vistoria(osA);
  assert r.status = 'rascunho' and not r.ja_existia, 'vistoria nova deveria nascer rascunho';
  perform set_config('teste.vA', r.vistoria_id::text, true);
  select * into r from public.iniciar_vistoria(osA);
  assert r.ja_existia and r.vistoria_id = current_setting('teste.vA')::uuid, 'reenvio do iniciar deveria devolver a mesma';
  assert (select count(*) from public.vistorias where os_id = osA) = 1, 'reenvio duplicou a vistoria';

  assert (select count(*) from public.vistoria_itens where vistoria_id = r.vistoria_id) = 16,
    'checklist copiado deveria ter 16 itens (17 ativos menos o desativado)';
  assert not exists (select 1 from public.vistoria_itens where vistoria_id = r.vistoria_id and descricao = 'Tacógrafo'),
    'item desativado entrou na vistoria';
  assert (select string_agg(descricao, '|' order by ordem) from public.vistoria_itens where vistoria_id = r.vistoria_id)
         like 'Estepe|Macaco e chave de roda|%|Lona de cobertura|Painel (luzes de alerta)', 'ordem do checklist copiada errada';
  assert (select status from public.vw_os where id = osA) is not null
     and (select vistoria_entrada_status from public.vw_os where id = osA) = 'rascunho', 'vw_os deveria mostrar o rascunho';
  assert (select pode_editar from public.vw_vistorias where id = r.vistoria_id), 'atendente deveria poder editar';
  -- objetos: ninguem escolheu nada ainda (DESIGN 12.8)
  assert (select objetos from public.vistorias where id = r.vistoria_id) is null, 'vistoria nova deveria nascer com objetos NULL';
  assert (select objetos from public.vw_vistorias where id = r.vistoria_id) is null, 'vw_vistorias deveria mostrar objetos NULL';
  assert (select column_default is null and is_nullable = 'YES' from information_schema.columns
           where table_schema = 'public' and table_name = 'vistorias' and column_name = 'objetos'),
    'coluna objetos deveria aceitar NULL e nascer NULL';
end $$;

-- dono renomeia o item do modelo: a vistoria continua com a descricao copiada
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004a1","role":"authenticated"}', true);
do $$
begin
  update public.checklist_modelo_itens set descricao = 'Estepe e roda reserva' where descricao = 'Estepe';
  assert (select descricao from public.vistoria_itens where vistoria_id = current_setting('teste.vA')::uuid and ordem = 1) = 'Estepe',
    'renomear o modelo mudou a vistoria';
end $$;

-- =============================================================================
-- 4) MECANICO A (a2) faz a vistoria da OS dele
-- =============================================================================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004a2","role":"authenticated"}', true);
do $$
declare
  vA  uuid := current_setting('teste.vA')::uuid;
  osA uuid := current_setting('teste.osA')::uuid;
  it  uuid;
  r   record;
begin
  assert (select count(*) from public.vw_vistorias where id = vA) = 1, 'mecanico deveria ver a vistoria da OS dele';
  assert (select pode_editar from public.vw_vistorias where id = vA), 'mecanico deveria poder editar a vistoria da OS dele';
  assert public.zz_erro(format($q$ select public.iniciar_vistoria(%L) $q$, current_setting('teste.osX'))) = 'os_nao_encontrada',
    'mecanico iniciou vistoria em OS que nao ve';

  -- KM unico: grava na OS
  perform public.salvar_vistoria(vA, p_km => 1200, p_combustivel => 'meio',
                                 p_objetos => array[' Rádio ', '', 'Documentos', 'Rádio'], p_observacoes => '  Cabine suja ');
  perform public.salvar_vistoria(vA, p_km => 1200);   -- reenvio
  assert (select km from public.ordens_servico where id = osA) = 1200, 'KM da vistoria nao gravou na OS';
  assert (select km from public.vw_vistorias where id = vA) = 1200, 'rascunho deveria mostrar o KM da OS';
  assert (select objetos from public.vistorias where id = vA) = array['Rádio', 'Documentos'], 'objetos nao normalizados';
  -- objetos: NULL = nao informado; '{}' = "Nenhum objeto"; limpar e pedido explicito
  perform public.salvar_vistoria(vA, p_limpar_objetos => true);
  assert (select objetos from public.vistorias where id = vA) is null, 'limpar deveria voltar a NULL';
  perform public.salvar_vistoria(vA, p_limpar_objetos => true);   -- reenvio
  assert (select objetos from public.vistorias where id = vA) is null, 'reenvio do limpar deveria continuar NULL';
  perform public.salvar_vistoria(vA, p_km => 1200);
  assert (select objetos from public.vistorias where id = vA) is null, 'salvar outra parte nao deveria inventar objetos';
  perform public.salvar_vistoria(vA, p_objetos => '{}');
  assert (select objetos from public.vistorias where id = vA) = '{}'::text[], '"Nenhum objeto" deveria gravar lista vazia';
  perform public.salvar_vistoria(vA, p_km => 1200, p_objetos => null);
  assert (select objetos from public.vistorias where id = vA) = '{}'::text[], 'p_objetos NULL sem limpar nao deveria mudar';
  perform public.salvar_vistoria(vA, p_objetos => array['  ', '']);
  assert (select objetos from public.vistorias where id = vA) is null, 'lista so com brancos nao e "Nenhum objeto"';
  perform public.salvar_vistoria(vA, p_objetos => array['Rádio'], p_limpar_objetos => true);
  assert (select objetos from public.vistorias where id = vA) is null, 'limpar deveria vencer p_objetos';
  perform public.salvar_vistoria(vA, p_objetos => array['Rádio', 'Documentos'], p_limpar_objetos => null);
  assert (select objetos from public.vistorias where id = vA) = array['Rádio', 'Documentos'], 'objetos deveriam voltar';
  assert public.zz_erro(format($q$ select public.salvar_vistoria(%L, p_objetos => array_fill('x'::text, array[31])) $q$, vA)) = 'objetos_demais',
    'mais de 30 objetos aceitos';
  assert (select observacoes from public.vistorias where id = vA) = 'Cabine suja', 'observacoes nao normalizadas';
  assert (select combustivel from public.vistorias where id = vA) = 'meio', 'combustivel nao gravou';
  assert public.zz_erro(format($q$ select public.salvar_vistoria(%L, p_km => -1) $q$, vA)) = 'km_invalido', 'KM negativo aceito';
  perform public.salvar_vistoria(vA, p_observacoes => '');
  assert (select observacoes from public.vistorias where id = vA) is null, 'observacao vazia deveria apagar';

  -- checklist
  select id into it from public.vistoria_itens where vistoria_id = vA and ordem = 1;
  perform public.marcar_item_vistoria(it, 'com_problema', '  Estepe careca ');
  perform public.marcar_item_vistoria(it, 'com_problema', '  Estepe careca ');   -- reenvio
  assert (select situacao = 'com_problema' and observacao = 'Estepe careca' and marcado_por = auth.uid()
            from public.vistoria_itens where id = it), 'item nao marcado';
  assert public.zz_erro(format($q$ select public.marcar_item_vistoria(%L, null) $q$, it)) = 'situacao_obrigatoria', 'situacao nula aceita';
  perform public.marcar_item_vistoria((select id from public.vistoria_itens where vistoria_id = vA and ordem = 2), 'nao_se_aplica');

  -- avarias (id do navegador)
  perform public.salvar_avaria('f4a00000-0000-4000-8000-000000000001', vA, 'lateral_esquerda', ' Risco na porta ');
  perform public.salvar_avaria('f4a00000-0000-4000-8000-000000000001', vA, 'lateral_esquerda', ' Risco na porta ');  -- reenvio
  assert (select count(*) from public.vistoria_avarias where vistoria_id = vA) = 1, 'reenvio duplicou a avaria';
  perform public.salvar_avaria('f4a00000-0000-4000-8000-000000000001', vA, p_descricao => 'Risco fundo na porta');
  assert (select lado = 'lateral_esquerda' and descricao = 'Risco fundo na porta' from public.vistoria_avarias
           where id = 'f4a00000-0000-4000-8000-000000000001'), 'avaria nao editada';
  assert public.zz_erro(format($q$ select public.salvar_avaria(gen_random_uuid(), %L) $q$, vA)) = 'lado_obrigatorio', 'avaria sem lado';
  -- avaria 2: so o lado (vai impedir a conclusao)
  perform public.salvar_avaria('f4a00000-0000-4000-8000-000000000002', vA, 'frente');

  -- fotos: avaria e painel (pendentes ate subir o arquivo)
  select * into r from public.registrar_foto_vistoria('f4f00000-0000-4000-8000-000000000001', vA, 'avaria', 1600, 1200, 400000, 30000,
                                                      p_avaria_id => 'f4a00000-0000-4000-8000-000000000001');
  assert r.caminho = current_setting('teste.oficina_a') || '/' || osA || '/' || vA || '/f4f00000-0000-4000-8000-000000000001.jpg',
    'caminho da foto da vistoria errado: ' || r.caminho;
  assert not r.enviada and not r.ja_existia, 'foto nova deveria vir pendente';
  perform set_config('teste.vf1', r.caminho, true);
  perform set_config('teste.vf1_mini', r.caminho_miniatura, true);
  select * into r from public.registrar_foto_vistoria('f4f00000-0000-4000-8000-000000000001', vA, 'avaria', 1600, 1200, 400000, 30000,
                                                      p_avaria_id => 'f4a00000-0000-4000-8000-000000000001');
  assert r.ja_existia, 'reenvio do registro deveria devolver ja_existia';
  select * into r from public.registrar_foto_vistoria('f4f00000-0000-4000-8000-000000000002', vA, 'painel', 1600, 1200, 300000, 20000);
  perform set_config('teste.vf2', r.caminho, true);
  perform set_config('teste.vf2_mini', r.caminho_miniatura, true);
  assert public.zz_erro(format($q$ select public.registrar_foto_vistoria(gen_random_uuid(), %L, 'avaria', 1, 1, 1, 1) $q$, vA)) = 'foto_invalida',
    'foto de avaria sem avaria aceita';
  assert public.zz_erro(format($q$ select public.registrar_foto_vistoria(gen_random_uuid(), %L, 'painel', 1, 1, 6000000, 1) $q$, vA)) = 'foto_grande_demais',
    'foto > 5 MB aceita';
  assert public.zz_erro(format($q$ select public.registrar_foto_vistoria(gen_random_uuid(), %L, 'avaria', 1, 1, 1, 1, p_avaria_id => gen_random_uuid()) $q$, vA))
    = 'avaria_nao_encontrada', 'foto em avaria inexistente aceita';
  assert public.zz_erro(format($q$ select public.confirmar_foto_vistoria(%L) $q$, 'f4f00000-0000-4000-8000-000000000001')) = 'foto_nao_enviada',
    'confirmou foto sem arquivo';
  assert public.zz_erro(format($q$ select public.salvar_vistoria(%L, p_sem_avarias => true) $q$, vA)) = 'vistoria_tem_avarias',
    'marcou "sem avarias" com avaria registrada';
  -- ate 3 fotos por avaria (as 2 extras sao apagadas logo depois)
  perform public.registrar_foto_vistoria('f4f00000-0000-4000-8000-000000000005', vA, 'avaria', 1, 1, 1, 1, p_avaria_id => 'f4a00000-0000-4000-8000-000000000001');
  perform public.registrar_foto_vistoria('f4f00000-0000-4000-8000-000000000006', vA, 'avaria', 1, 1, 1, 1, p_avaria_id => 'f4a00000-0000-4000-8000-000000000001');
  assert public.zz_erro(format($q$ select public.registrar_foto_vistoria(gen_random_uuid(), %L, 'avaria', 1, 1, 1, 1,
                                    p_avaria_id => 'f4a00000-0000-4000-8000-000000000001') $q$, vA)) = 'limite_fotos_avaria', 'aceitou a 4a foto da avaria';
  assert public.apagar_foto_vistoria('f4f00000-0000-4000-8000-000000000005') and public.apagar_foto_vistoria('f4f00000-0000-4000-8000-000000000006'),
    'mecanico deveria apagar as fotos extras dele';
  -- nome de quem vai assinar guardado no rascunho
  perform public.salvar_vistoria(vA, p_assinado_por_nome => 'Jose');
  assert (select assinado_por_nome from public.vistorias where id = vA) = 'Jose', 'nome de quem assina nao guardado no rascunho';
  -- nao fotos da OS: a galeria da OS nao mistura
  assert (select count(*) from public.os_fotos where os_id = osA) = 0, 'foto da vistoria caiu em os_fotos';

  -- escrita direta recusada
  assert public.zz_estado(format($q$ update public.vistorias set observacoes = 'x' where id = %L $q$, vA)) = '42501', 'mecanico alterou vistoria direto';
  assert public.zz_estado(format($q$ insert into public.vistorias (oficina_id, os_id, veiculo_id) values (%L, %L, %L) $q$,
                                 current_setting('teste.oficina_a'), osA, current_setting('teste.veiculo'))) = '42501', 'mecanico inseriu vistoria direto';
  assert public.zz_estado(format($q$ update public.vistoria_itens set situacao = 'ok' where vistoria_id = %L $q$, vA)) = '42501', 'mecanico marcou item direto';
  assert public.zz_estado(format($q$ delete from public.vistoria_avarias where vistoria_id = %L $q$, vA)) = '42501', 'mecanico apagou avaria direto';
  assert public.zz_estado(format($q$ delete from public.vistoria_fotos where vistoria_id = %L $q$, vA)) = '42501', 'mecanico apagou foto direto';
  -- sem nenhum valor em dinheiro nas leituras da vistoria
  assert not exists (select 1 from public.vw_vistorias v where row_to_json(v)::text ~ 'centavos|preco|custo|pagamento'),
    'vw_vistorias traz valor';
end $$;

-- a4 (ve todas): ve, mas nao faz | a5: nao ve nada
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004a4","role":"authenticated"}', true);
do $$
declare vA uuid := current_setting('teste.vA')::uuid;
begin
  assert (select count(*) from public.vistorias where id = vA) = 1, 'a4 (ve todas) deveria ver a vistoria';
  assert (select count(*) from public.vistoria_itens where vistoria_id = vA) = 16, 'a4 deveria ver os itens';
  assert not (select pode_editar from public.vw_vistorias where id = vA), 'a4 nao deveria poder editar';
  assert public.zz_estado(format($q$ select public.salvar_vistoria(%L, p_km => 5) $q$, vA)) = '42501', 'a4 editou vistoria de OS que nao e dele';
  assert public.zz_estado(format($q$ select public.marcar_itens_restantes_ok(%L) $q$, vA)) = '42501', 'a4 marcou itens';
  assert public.zz_estado(format($q$ select public.iniciar_vistoria(%L) $q$, current_setting('teste.osA'))) = '42501', 'a4 iniciou vistoria em OS de outro';
  assert public.zz_estado(format($q$ select public.registrar_foto_vistoria(gen_random_uuid(), %L, 'painel', 1, 1, 1, 1) $q$, vA)) = '42501',
    'a4 registrou foto na vistoria de outro';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004a5","role":"authenticated"}', true);
do $$
declare vA uuid := current_setting('teste.vA')::uuid;
begin
  assert (select count(*) from public.vistorias) = 0, 'MECANICO SEM ACESSO VE VISTORIA';
  assert (select count(*) from public.vistoria_itens) = 0, 'MECANICO SEM ACESSO VE ITENS';
  assert (select count(*) from public.vistoria_avarias) = 0, 'MECANICO SEM ACESSO VE AVARIAS';
  assert (select count(*) from public.vistoria_fotos) = 0, 'MECANICO SEM ACESSO VE FOTOS';
  assert (select count(*) from public.vw_vistorias) = 0, 'MECANICO SEM ACESSO VE vw_vistorias';
  assert public.zz_erro(format($q$ select public.salvar_vistoria(%L, p_km => 5) $q$, vA)) = 'vistoria_nao_encontrada', 'a5 mexeu na vistoria';
end $$;

-- dono registra uma foto; o mecanico nao apaga a do dono, apaga a dele
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004a1","role":"authenticated"}', true);
select public.registrar_foto_vistoria('f4f00000-0000-4000-8000-000000000003', current_setting('teste.vA')::uuid, 'outro', 800, 600, 1000, 100);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004a2","role":"authenticated"}', true);
do $$
begin
  assert public.zz_erro($q$ select public.apagar_foto_vistoria('f4f00000-0000-4000-8000-000000000003') $q$) = 'foto_nao_pode_apagar',
    'mecanico apagou foto do dono na vistoria';
  assert not (select pode_apagar from public.vw_vistoria_fotos where id = 'f4f00000-0000-4000-8000-000000000003'), 'pode_apagar errado';
  perform public.registrar_foto_vistoria('f4f00000-0000-4000-8000-000000000004', current_setting('teste.vA')::uuid, 'outro', 800, 600, 1000, 100);
  assert public.apagar_foto_vistoria('f4f00000-0000-4000-8000-000000000004'), 'mecanico deveria apagar a foto dele em rascunho';
  assert not public.apagar_foto_vistoria('f4f00000-0000-4000-8000-000000000004'), 'reenvio do apagar deveria devolver false';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004a1","role":"authenticated"}', true);
select public.apagar_foto_vistoria('f4f00000-0000-4000-8000-000000000003');

-- =============================================================================
-- 5) [STORAGE] subir os arquivos; CONCLUIR com tudo conferido
-- =============================================================================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004a2","role":"authenticated"}', true);
do $$
declare
  vA   uuid := current_setting('teste.vA')::uuid;
  e    text;
  r    record;
  pasta text := current_setting('teste.oficina_a') || '/' || current_setting('teste.osA') || '/' || current_setting('teste.vA') || '/';
begin
  -- itens sem marcar
  assert public.zz_erro(format($q$ select public.concluir_vistoria(%L) $q$, vA)) = 'vistoria_itens_sem_marcar', 'concluiu com item sem marcar';
  assert public.marcar_itens_restantes_ok(vA) = 14, 'marcar o resto deveria marcar 14';
  assert public.marcar_itens_restantes_ok(vA) = 0, 'reenvio do marcar o resto deveria marcar 0';
  assert (select situacao from public.vistoria_itens where vistoria_id = vA and ordem = 1) = 'com_problema', 'marcar o resto mexeu em item ja marcado';

  -- foto pendente
  assert public.zz_erro(format($q$ select public.concluir_vistoria(%L) $q$, vA)) = 'vistoria_fotos_pendentes', 'concluiu com foto pendente';

  -- subir os arquivos (como o Storage faz, com o JWT de quem envia)
  e := public.zz_erro(format($q$ insert into storage.objects (bucket_id, name, metadata) values
         ('vistorias', %L, '{"size": 398000, "eTag": "\"aaa1\""}'), ('vistorias', %L, '{"size": 30000, "eTag": "\"aaa2\""}'),
         ('vistorias', %L, '{"size": 300000, "eTag": "\"bbb1\""}'), ('vistorias', %L, '{"size": 20000, "eTag": "\"bbb2\""}') $q$,
         current_setting('teste.vf1'), current_setting('teste.vf1_mini'), current_setting('teste.vf2'), current_setting('teste.vf2_mini')));
  assert e is null, 'mecanico deveria subir as fotos registradas por ele: ' || coalesce(e, '');
  assert public.zz_estado(format($q$ insert into storage.objects (bucket_id, name) values ('vistorias', %L) $q$,
                                 pasta || gen_random_uuid() || '.jpg')) = '42501', 'subiu arquivo sem registro na pasta da vistoria';
  assert public.zz_estado(format($q$ insert into storage.objects (bucket_id, name) values ('os-fotos', %L) $q$,
                                 current_setting('teste.vf1'))) = '42501', 'subiu o caminho da vistoria no bucket os-fotos';
  perform public.confirmar_foto_vistoria('f4f00000-0000-4000-8000-000000000001');
  perform public.confirmar_foto_vistoria('f4f00000-0000-4000-8000-000000000001');   -- reenvio
  perform public.confirmar_foto_vistoria('f4f00000-0000-4000-8000-000000000002');
  assert (select qtd_fotos = 2 and fotos_pendentes = 0 from public.vw_vistorias where id = vA), 'contagem de fotos errada';
  assert (select tamanho_bytes from public.vistoria_fotos where id = 'f4f00000-0000-4000-8000-000000000001') = 398000,
    'confirmacao deveria gravar o tamanho do Storage';
  assert (select count(*) from storage.objects where bucket_id = 'vistorias') = 4, 'mecanico deveria listar os 4 arquivos';

  -- avaria sem descricao e sem foto
  assert public.zz_erro(format($q$ select public.concluir_vistoria(%L) $q$, vA)) = 'avaria_incompleta', 'concluiu com avaria vazia';
  assert public.remover_avaria('f4a00000-0000-4000-8000-000000000002'), 'deveria remover a avaria vazia';
  assert not public.remover_avaria('f4a00000-0000-4000-8000-000000000002'), 'reenvio do remover deveria devolver false';

  -- assinatura
  assert public.zz_erro(format($q$ select public.concluir_vistoria(%L) $q$, vA)) = 'assinatura_obrigatoria', 'concluiu sem assinatura';
  assert public.zz_erro(format($q$ select public.registrar_assinatura_vistoria(%L, gen_random_uuid(), ' ', 900, 300, 20000) $q$, vA))
    = 'nome_assinatura_obrigatorio', 'assinatura sem nome aceita';
  assert public.zz_erro(format($q$ select public.registrar_assinatura_vistoria(%L, gen_random_uuid(), 'Ze', 900, 300, 600000) $q$, vA))
    = 'assinatura_invalida', 'assinatura > 512 KB aceita';
  -- 1a assinatura (o cliente pede "Limpar" e assina de novo: id novo)
  perform public.registrar_assinatura_vistoria(vA, 'f4500000-0000-4000-8000-000000000001', 'Jose Motorista', 900, 300, 20000);
  perform set_config('teste.ass', public.registrar_assinatura_vistoria(vA, 'f4500000-0000-4000-8000-000000000002',
                     '  Jose   da Silva ', 900, 300, 18000), true);
  assert current_setting('teste.ass') = pasta || 'assinatura_f4500000-0000-4000-8000-000000000002.png',
    'caminho da assinatura errado: ' || current_setting('teste.ass');
  assert (select assinado_por_nome from public.vistorias where id = vA) = 'Jose da Silva', 'nome de quem assinou nao normalizado';
  assert public.zz_erro(format($q$ select public.concluir_vistoria(%L) $q$, vA)) = 'assinatura_nao_enviada', 'concluiu sem o PNG da assinatura';
  -- o caminho da 1a assinatura nao e mais aceito
  assert public.zz_estado(format($q$ insert into storage.objects (bucket_id, name) values ('vistorias', %L) $q$,
                                 pasta || 'assinatura_f4500000-0000-4000-8000-000000000001.png')) = '42501', 'subiu assinatura descartada';
  e := public.zz_erro(format($q$ insert into storage.objects (bucket_id, name, metadata) values ('vistorias', %L, '{"size": 18000, "eTag": "\"ccc1\""}') $q$,
                             current_setting('teste.ass')));
  assert e is null, 'mecanico deveria subir a assinatura: ' || coalesce(e, '');

  -- CONCLUIR
  perform set_config('teste.hash', public.concluir_vistoria(vA), true);
  assert current_setting('teste.hash') ~ '^[0-9a-f]{64}$', 'hash invalido';
  assert public.concluir_vistoria(vA) = current_setting('teste.hash'), 'reenvio do concluir deveria devolver o mesmo hash';
  assert public.conferir_vistoria(vA), 'hash nao confere logo depois de concluir';
  select * into r from public.vw_vistorias where id = vA;
  assert r.status = 'concluida' and r.km = 1200 and r.concluida_por_nome = 'Mecanico A' and not r.pode_editar and r.pode_complementar,
    'vistoria concluida com dados errados';
  assert (select km_atual from public.veiculos where id = current_setting('teste.veiculo')::uuid) = 1200,
    'conclusao deveria atualizar o KM do veiculo';
  assert (select vistoria_entrada_status from public.vw_os where id = current_setting('teste.osA')::uuid) = 'concluida', 'vw_os sem a vistoria';
  assert (select count(*) from public.vw_os_historico where os_id = current_setting('teste.osA')::uuid and evento = 'vistoria'
           and observacao = 'Vistoria de entrada concluída') = 1, 'evento de vistoria concluida no historico';
end $$;

-- =============================================================================
-- 6) IMUTAVEL: nenhum papel muda nada (RPC, tabela, Storage)
-- =============================================================================
-- (funcao auxiliar criada como postgres, como as zz_* do topo)
reset role;
create function public.zz_imutavel(p_nome text) returns void language plpgsql as $$
declare
  vA  uuid := current_setting('teste.vA')::uuid;
  it  uuid := (select id from public.vistoria_itens where vistoria_id = current_setting('teste.vA')::uuid and ordem = 1);
begin
  assert public.zz_erro(format($q$ select public.salvar_vistoria(%L, p_km => 9) $q$, vA)) = 'vistoria_concluida', p_nome || ': salvar_vistoria depois de concluida';
  assert public.zz_erro(format($q$ select public.salvar_vistoria(%L, p_observacoes => 'x') $q$, vA)) = 'vistoria_concluida', p_nome || ': observacao depois de concluida';
  assert public.zz_erro(format($q$ select public.marcar_item_vistoria(%L, 'ok') $q$, it)) = 'vistoria_concluida', p_nome || ': marcar item depois de concluida';
  assert public.zz_erro(format($q$ select public.marcar_itens_restantes_ok(%L) $q$, vA)) = 'vistoria_concluida', p_nome || ': marcar o resto depois de concluida';
  assert public.zz_erro(format($q$ select public.salvar_avaria('f4a00000-0000-4000-8000-000000000001', %L, 'frente') $q$, vA)) = 'vistoria_concluida',
    p_nome || ': editou avaria depois de concluida';
  assert public.zz_erro(format($q$ select public.salvar_avaria(gen_random_uuid(), %L, 'frente') $q$, vA)) = 'vistoria_concluida', p_nome || ': avaria nova depois de concluida';
  assert public.zz_erro($q$ select public.remover_avaria('f4a00000-0000-4000-8000-000000000001') $q$) = 'vistoria_concluida', p_nome || ': removeu avaria';
  assert public.zz_erro($q$ select public.apagar_foto_vistoria('f4f00000-0000-4000-8000-000000000001') $q$) = 'vistoria_concluida', p_nome || ': apagou foto';
  assert public.zz_erro(format($q$ select public.registrar_foto_vistoria(gen_random_uuid(), %L, 'painel', 1, 1, 1, 1) $q$, vA)) = 'vistoria_concluida',
    p_nome || ': foto nova (sem ser complemento) depois de concluida';
  assert public.zz_erro(format($q$ select public.registrar_assinatura_vistoria(%L, gen_random_uuid(), 'Outro', 9, 9, 9) $q$, vA)) = 'vistoria_concluida',
    p_nome || ': trocou a assinatura';
  -- escrita direta: sem GRANT
  assert public.zz_estado(format($q$ update public.vistorias set observacoes = 'x' where id = %L $q$, vA)) = '42501', p_nome || ': UPDATE direto em vistorias';
  assert public.zz_estado(format($q$ delete from public.vistorias where id = %L $q$, vA)) = '42501', p_nome || ': DELETE direto em vistorias';
  assert public.zz_estado(format($q$ update public.vistoria_itens set situacao = 'ok' where id = %L $q$, it)) = '42501', p_nome || ': UPDATE direto em itens';
  assert public.zz_estado(format($q$ delete from public.vistoria_fotos where vistoria_id = %L $q$, vA)) = '42501', p_nome || ': DELETE direto em fotos';
  -- [STORAGE] nao apaga, nao sobrescreve, nao acrescenta arquivo na pasta
  perform set_config('storage.allow_delete_query', 'true', true);
  assert public.zz_afetadas(format($q$ delete from storage.objects where bucket_id = 'vistorias' and name in (%L, %L, %L) $q$,
                                   current_setting('teste.vf1'), current_setting('teste.vf1_mini'), current_setting('teste.ass'))) = 0,
    p_nome || ': APAGOU ARQUIVO DA VISTORIA CONCLUIDA';
  assert public.zz_afetadas(format($q$ update storage.objects set name = name || '.x' where bucket_id = 'vistorias' and name = %L $q$,
                                   current_setting('teste.ass'))) = 0, p_nome || ': MOVEU A ASSINATURA';
  assert public.zz_estado(format($q$ insert into storage.objects (bucket_id, name) values ('vistorias', %L) $q$, current_setting('teste.ass'))) in ('42501', '23505'),
    p_nome || ': SOBRESCREVEU A ASSINATURA';
  assert public.zz_estado(format($q$ insert into storage.objects (bucket_id, name) values ('vistorias', %L) $q$,
                                 current_setting('teste.oficina_a') || '/' || current_setting('teste.osA') || '/' || vA || '/' || gen_random_uuid() || '.jpg')) = '42501',
    p_nome || ': acrescentou arquivo na vistoria concluida';
  assert (select count(*) from storage.objects where bucket_id = 'vistorias' and name = current_setting('teste.ass')) = 1,
    p_nome || ': deveria continuar vendo a assinatura';
end $$;
grant execute on function public.zz_imutavel(text) to authenticated;
set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004a1","role":"authenticated"}', true);
select public.zz_imutavel('dono');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004a3","role":"authenticated"}', true);
select public.zz_imutavel('atendente');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004a2","role":"authenticated"}', true);
select public.zz_imutavel('mecanico');

-- dono muda o KM da OS depois: a vistoria guarda o KM da conclusao
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004a1","role":"authenticated"}', true);
do $$
begin
  update public.ordens_servico set km = 1300 where id = current_setting('teste.osA')::uuid;
  assert (select km from public.vw_vistorias where id = current_setting('teste.vA')::uuid) = 1200, 'KM da vistoria concluida mudou com a OS';
  assert public.conferir_vistoria(current_setting('teste.vA')::uuid), 'hash deixou de conferir com o KM da OS mudando';
end $$;

-- =============================================================================
-- 7) Nem o postgres (sem papel do app) altera; hash acusa alteracao [ADMIN]
-- =============================================================================
reset role;
do $$
declare
  vA uuid := current_setting('teste.vA')::uuid;
begin
  assert public.zz_erro(format($q$ update public.vistorias set observacoes = 'adulterado' where id = %L $q$, vA)) = 'vistoria_concluida',
    'POSTGRES ALTEROU A VISTORIA CONCLUIDA';
  assert public.zz_erro(format($q$ delete from public.vistorias where id = %L $q$, vA)) = 'vistoria_concluida', 'POSTGRES APAGOU A VISTORIA';
  assert public.zz_erro(format($q$ update public.vistoria_itens set situacao = 'ok' where vistoria_id = %L $q$, vA)) = 'vistoria_concluida',
    'POSTGRES ALTEROU ITEM';
  assert public.zz_erro(format($q$ delete from public.vistoria_itens where vistoria_id = %L $q$, vA)) = 'vistoria_concluida', 'POSTGRES APAGOU ITEM';
  assert public.zz_erro(format($q$ insert into public.vistoria_itens (oficina_id, vistoria_id, ordem, descricao) values (%L, %L, 99, 'X') $q$,
                               current_setting('teste.oficina_a'), vA)) = 'vistoria_concluida', 'POSTGRES ACRESCENTOU ITEM';
  assert public.zz_erro(format($q$ update public.vistoria_avarias set descricao = 'x' where vistoria_id = %L $q$, vA)) = 'vistoria_concluida',
    'POSTGRES ALTEROU AVARIA';
  assert public.zz_erro(format($q$ update public.vistoria_fotos set legenda = 'x' where vistoria_id = %L $q$, vA)) = 'vistoria_concluida',
    'POSTGRES ALTEROU FOTO';
  assert public.zz_erro(format($q$ delete from public.vistoria_fotos where vistoria_id = %L $q$, vA)) = 'vistoria_concluida', 'POSTGRES APAGOU FOTO';
  assert public.zz_erro('truncate public.vistoria_fotos cascade') is not null, 'POSTGRES TRUNCOU AS FOTOS';
  assert public.zz_erro(format($q$ update public.vistorias set status = 'rascunho' where id = %L $q$, vA)) = 'vistoria_concluida',
    'POSTGRES DESTRAVOU A VISTORIA';
  -- anular nao pode levar outra mudanca junto
  assert public.zz_erro(format($q$ update public.vistorias set status = 'anulada', anulada_em = now(), anulada_por = '00000000-0000-4000-8000-0000000004a1',
                                  motivo_anulacao = 'xyz', observacoes = 'x' where id = %L $q$, vA)) is not null,
    'anulacao levou outra mudanca junto';
  -- uma entrada por OS (sem ser anulada)
  assert public.zz_estado(format($q$ insert into public.vistorias (oficina_id, os_id, veiculo_id) values (%L, %L, %L) $q$,
                                 current_setting('teste.oficina_a'), current_setting('teste.osA'), current_setting('teste.veiculo'))) = '23505',
    'aceitou 2a vistoria de entrada na mesma OS';

  -- hash: alteracao com o trigger desligado (admin) e detectada
  alter table public.vistoria_itens disable trigger vistoria_itens_a_proteger;
  update public.vistoria_itens set situacao = 'ok' where vistoria_id = vA and ordem = 1;
  alter table public.vistoria_itens enable trigger vistoria_itens_a_proteger;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004a1","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  assert not public.conferir_vistoria(current_setting('teste.vA')::uuid), 'HASH NAO ACUSOU A ALTERACAO';
end $$;
reset role;
do $$
begin
  alter table public.vistoria_itens disable trigger vistoria_itens_a_proteger;
  update public.vistoria_itens set situacao = 'com_problema' where vistoria_id = current_setting('teste.vA')::uuid and ordem = 1;
  alter table public.vistoria_itens enable trigger vistoria_itens_a_proteger;
end $$;
set local role authenticated;
do $$
begin
  assert public.conferir_vistoria(current_setting('teste.vA')::uuid), 'hash deveria voltar a conferir com o valor original';
end $$;

-- =============================================================================
-- 8) COMPLEMENTO: so acrescenta
-- =============================================================================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004a2","role":"authenticated"}', true);
do $$
declare
  vA uuid := current_setting('teste.vA')::uuid;
  r  record;
  e  text;
begin
  perform public.complementar_vistoria('f4c00000-0000-4000-8000-000000000001', vA, '  Cliente avisou que o farol ja estava queimado ');
  perform public.complementar_vistoria('f4c00000-0000-4000-8000-000000000001', vA, 'outro texto');   -- reenvio: nao muda
  assert (select count(*) from public.vistoria_complementos where vistoria_id = vA) = 1, 'reenvio duplicou o complemento';
  assert (select count(*) from public.vw_os_historico where os_id = current_setting('teste.osA')::uuid
           and observacao = 'Acrescentou à vistoria de entrada' and por_nome = 'Mecanico A') = 1, 'evento do complemento (uma vez so)';
  assert (select texto from public.vistoria_complementos where id = 'f4c00000-0000-4000-8000-000000000001')
         = 'Cliente avisou que o farol ja estava queimado', 'complemento errado';
  -- foto do complemento
  select * into r from public.registrar_foto_vistoria('f4f00000-0000-4000-8000-000000000010', vA, 'outro', 1600, 1200, 300000, 20000,
                                                      p_complemento_id => 'f4c00000-0000-4000-8000-000000000001');
  e := public.zz_erro(format($q$ insert into storage.objects (bucket_id, name, metadata) values ('vistorias', %L, '{"size": 300000}'),
                                ('vistorias', %L, '{"size": 20000}') $q$, r.caminho, r.caminho_miniatura));
  assert e is null, 'deveria subir a foto do complemento: ' || coalesce(e, '');
  perform public.confirmar_foto_vistoria('f4f00000-0000-4000-8000-000000000010');
  assert (select qtd_fotos from public.vw_vistoria_complementos where id = 'f4c00000-0000-4000-8000-000000000001') = 1, 'foto do complemento';
  assert (select qtd_fotos from public.vw_vistorias where id = vA) = 2, 'foto do complemento contou como original';
  assert public.zz_erro($q$ select public.apagar_foto_vistoria('f4f00000-0000-4000-8000-000000000010') $q$) = 'vistoria_concluida',
    'apagou foto do complemento';
  perform set_config('storage.allow_delete_query', 'true', true);
  assert public.zz_afetadas(format($q$ delete from storage.objects where bucket_id = 'vistorias' and name = %L $q$, r.caminho)) = 0,
    'apagou o arquivo da foto do complemento';
  assert public.zz_erro(format($q$ select public.registrar_foto_vistoria(gen_random_uuid(), %L, 'avaria', 1, 1, 1, 1,
                                    p_avaria_id => 'f4a00000-0000-4000-8000-000000000001', p_complemento_id => 'f4c00000-0000-4000-8000-000000000001') $q$, vA))
    = 'foto_invalida', 'foto de avaria como complemento';
  assert public.zz_erro(format($q$ select public.registrar_foto_vistoria(gen_random_uuid(), %L, 'outro', 1, 1, 1, 1, p_complemento_id => gen_random_uuid()) $q$, vA))
    = 'complemento_nao_encontrado', 'foto em complemento inexistente';
  assert public.zz_estado($q$ update public.vistoria_complementos set texto = 'x' $q$) = '42501', 'mecanico editou complemento';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004a4","role":"authenticated"}', true);
do $$
begin
  assert (select count(*) from public.vw_vistoria_complementos) = 1, 'a4 (ve todas) deveria ver o complemento';
  assert public.zz_estado(format($q$ select public.complementar_vistoria(gen_random_uuid(), %L, 'x') $q$, current_setting('teste.vA'))) = '42501',
    'a4 complementou vistoria de OS que nao e dele';
end $$;

reset role;
do $$
begin
  assert public.zz_erro($q$ update public.vistoria_complementos set texto = 'adulterado' $q$) = 'vistoria_concluida', 'POSTGRES EDITOU COMPLEMENTO';
  assert public.zz_erro($q$ delete from public.vistoria_complementos $q$) = 'vistoria_concluida', 'POSTGRES APAGOU COMPLEMENTO';
  assert public.zz_erro($q$ update public.vistoria_fotos set legenda = 'x' where id = 'f4f00000-0000-4000-8000-000000000010' $q$) = 'vistoria_concluida',
    'POSTGRES EDITOU FOTO DO COMPLEMENTO';
end $$;
set local role authenticated;

-- =============================================================================
-- 9) OBRIGATORIEDADE + ANULAR (OS D, direta em andamento)
-- =============================================================================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004a1","role":"authenticated"}', true);
do $$
begin
  assert public.zz_afetadas($q$ update public.oficinas set vistoria_obrigatoria = true $q$) = 1, 'dono deveria ligar a vistoria obrigatoria';
  assert (select vistoria_entrada_status from public.vw_os where id = current_setting('teste.osD')::uuid) is null, 'OS D deveria estar "Sem vistoria"';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004a2","role":"authenticated"}', true);
do $$
begin
  assert public.zz_erro(format($q$ select public.marcar_pronta(%L) $q$, current_setting('teste.osD'))) = 'vistoria_obrigatoria',
    'marcou pronta sem vistoria com a chave ligada';
  assert public.zz_erro(format($q$ select public.mudar_status_os(%L, 'em_andamento', 'pronta') $q$, current_setting('teste.osD'))) = 'vistoria_obrigatoria',
    'mudar_status_os passou por cima da obrigatoriedade';
  -- concluir com rascunho em andamento tambem nao basta: tem de estar concluida
  perform public.iniciar_vistoria(current_setting('teste.osD')::uuid);
  assert public.zz_erro(format($q$ select public.marcar_pronta(%L) $q$, current_setting('teste.osD'))) = 'vistoria_obrigatoria',
    'rascunho liberou a OS';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004a3","role":"authenticated"}', true);
do $$
declare vD uuid := (select id from public.vistorias where os_id = current_setting('teste.osD')::uuid);
begin
  perform set_config('teste.vD', vD::text, true);
  perform public.marcar_itens_restantes_ok(vD);
  assert public.zz_erro(format($q$ select public.concluir_vistoria(%L, 'motorista_ausente') $q$, vD)) = 'avarias_nao_informadas',
    'concluiu sem dizer se tem avaria';
  perform public.salvar_vistoria(vD, p_sem_avarias => true);
  perform public.salvar_avaria('f4a00000-0000-4000-8000-0000000000d1', vD, 'outro', 'Teste');
  assert not (select sem_avarias from public.vistorias where id = vD), 'avaria nova deveria desmarcar "sem avarias"';
  perform public.remover_avaria('f4a00000-0000-4000-8000-0000000000d1');
  perform public.salvar_vistoria(vD, p_sem_avarias => true);
  assert public.concluir_vistoria(vD, 'motorista_ausente') ~ '^[0-9a-f]{64}$', 'concluir sem assinatura com motivo';
  assert (select sem_assinatura_motivo = 'motorista_ausente' and assinatura_id is null from public.vistorias where id = vD),
    'motivo de sem assinatura nao gravado';
  assert public.zz_estado(format($q$ select public.anular_vistoria(%L, 'OS errada') $q$, vD)) = '42501', 'atendente anulou vistoria';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004a2","role":"authenticated"}', true);
select public.marcar_pronta(current_setting('teste.osD')::uuid);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004a1","role":"authenticated"}', true);
do $$
declare
  vD  uuid := current_setting('teste.vD')::uuid;
  osD uuid := current_setting('teste.osD')::uuid;
  r   record;
begin
  assert (select status from public.ordens_servico where id = osD) = 'pronta', 'OS D deveria estar pronta';
  assert public.zz_erro(format($q$ select public.anular_vistoria(%L, ' x ') $q$, vD)) = 'motivo_obrigatorio', 'anulou sem motivo';
  perform public.anular_vistoria(vD, 'Vistoria feita na OS errada');
  perform public.anular_vistoria(vD, 'Vistoria feita na OS errada');   -- reenvio
  assert (select status = 'anulada' and anulada_por_nome = 'Dono A' and not pode_anular from public.vw_vistorias where id = vD), 'anulacao';
  assert (select vistoria_entrada_status from public.vw_os where id = osD) is null, 'OS com vistoria anulada deveria voltar a "Sem vistoria"';
  assert public.zz_erro(format($q$ select public.entregar_os(%L, 'Causa ok', 'Solucao ok', 'pix', true) $q$, osD)) = 'vistoria_obrigatoria',
    'entregou com a vistoria anulada';
  assert public.zz_erro(format($q$ select public.complementar_vistoria(gen_random_uuid(), %L, 'x') $q$, vD)) = 'vistoria_anulada',
    'complementou vistoria anulada';
  -- outra vistoria na mesma OS
  select * into r from public.iniciar_vistoria(osD);
  assert not r.ja_existia and r.vistoria_id <> vD, 'anulada deveria liberar uma vistoria nova';
  perform public.marcar_itens_restantes_ok(r.vistoria_id);
  perform public.salvar_vistoria(r.vistoria_id, p_sem_avarias => true);
  perform public.concluir_vistoria(r.vistoria_id, 'recusou');
  perform public.entregar_os(osD, 'Causa ok', 'Solucao ok', 'pix', true);
  assert (select status from public.ordens_servico where id = osD) = 'entregue', 'OS D deveria ser entregue com a vistoria nova';
  assert (select count(*) from public.vistorias where os_id = osD) = 2, 'a anulada deveria continuar guardada';
  assert (select count(*) from public.os_historico where os_id = osD and evento = 'vistoria') = 3, 'historico da vistoria (concluida, anulada, concluida)';
  assert exists (select 1 from public.vw_os_historico where os_id = osD and observacao = 'Vistoria de entrada anulada: Vistoria feita na OS errada'),
    'dono deveria ler o motivo da anulacao no historico';
  -- OS entregue: nao inicia vistoria (de saida) nem mexe; dono/atendente complementam
  assert public.zz_erro(format($q$ select public.iniciar_vistoria(%L, 'saida') $q$, osD)) = 'os_fechada', 'iniciou vistoria em OS entregue';
  perform public.complementar_vistoria(gen_random_uuid(), r.vistoria_id, 'Cliente buscou sem reclamar');
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004a2","role":"authenticated"}', true);
do $$
begin
  assert exists (select 1 from public.vw_os_historico where os_id = current_setting('teste.osD')::uuid and observacao = 'Vistoria de entrada anulada'),
    'mecanico deveria ler so o texto do sistema da anulacao';
  assert not exists (select 1 from public.vw_os_historico where os_id = current_setting('teste.osD')::uuid and observacao like '%OS errada%'),
    'MECANICO LE O MOTIVO DA ANULACAO NO HISTORICO';
  assert public.zz_estado(format($q$ select public.complementar_vistoria(gen_random_uuid(), %L, 'x') $q$,
                                 (select id from public.vistorias where os_id = current_setting('teste.osD')::uuid and status = 'concluida'))) = '42501',
    'mecanico complementou vistoria de OS entregue';
end $$;

reset role;
do $$
begin
  assert public.zz_erro(format($q$ update public.vistorias set status = 'concluida' where id = %L $q$, current_setting('teste.vD'))) = 'vistoria_concluida',
    'POSTGRES REATIVOU A VISTORIA ANULADA';
  assert public.zz_erro(format($q$ update public.vistorias set motivo_anulacao = 'outro' where id = %L $q$, current_setting('teste.vD'))) = 'vistoria_concluida',
    'POSTGRES MUDOU O MOTIVO DA ANULACAO';
end $$;
set local role authenticated;

-- =============================================================================
-- 10) DONO B: nada da A (tabelas, views, RPCs, Storage com o caminho na mao)
-- =============================================================================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004b1","role":"authenticated"}', true);
select set_config('teste.oficina_b', public.criar_oficina('Oficina B F4', 'Dono B', private.versao_termos_vigente())::text, true);
do $$
declare vA uuid := current_setting('teste.vA')::uuid;
begin
  assert (select count(*) from public.checklist_modelo_itens) = 16, 'dono B deveria ver so o checklist dele (16)';
  assert not exists (select 1 from public.checklist_modelo_itens where descricao = 'Lona de cobertura'), 'DONO B VE CHECKLIST DA A';
  assert public.zz_afetadas(format($q$ update public.checklist_modelo_itens set ativo = false where modelo_id = %L $q$, current_setting('teste.modelo'))) = 0,
    'DONO B MEXEU NO CHECKLIST DA A';
  assert public.zz_erro(format($q$ select public.mover_item_checklist(%L, 'subir') $q$, current_setting('teste.item_novo'))) = 'item_nao_encontrado',
    'DONO B REORDENOU O CHECKLIST DA A';
  assert public.zz_estado(format($q$ insert into public.checklist_modelo_itens (modelo_id, descricao) values (%L, 'Invasao') $q$,
                                 current_setting('teste.modelo'))) is not null, 'DONO B INSERIU NO CHECKLIST DA A';
  assert (select count(*) from public.vistorias) = 0, 'DONO B VE VISTORIA DA A';
  assert (select count(*) from public.vistoria_itens) = 0, 'DONO B VE ITENS DA A';
  assert (select count(*) from public.vistoria_avarias) = 0, 'DONO B VE AVARIAS DA A';
  assert (select count(*) from public.vistoria_fotos) = 0, 'DONO B VE FOTOS DA A';
  assert (select count(*) from public.vistoria_complementos) = 0, 'DONO B VE COMPLEMENTOS DA A';
  assert (select count(*) from public.vw_vistorias) + (select count(*) from public.vw_vistoria_fotos)
         + (select count(*) from public.vw_vistoria_complementos) = 0, 'DONO B VE VIEWS DA A';
  assert public.zz_erro(format($q$ select public.salvar_vistoria(%L, p_km => 1) $q$, vA)) = 'vistoria_nao_encontrada', 'DONO B EDITOU VISTORIA DA A';
  assert public.zz_erro(format($q$ select public.conferir_vistoria(%L) $q$, vA)) = 'vistoria_nao_encontrada', 'DONO B CONFERIU VISTORIA DA A';
  assert public.zz_erro(format($q$ select public.complementar_vistoria(gen_random_uuid(), %L, 'x') $q$, vA)) = 'vistoria_nao_encontrada',
    'DONO B COMPLEMENTOU VISTORIA DA A';
  assert public.zz_erro(format($q$ select public.anular_vistoria(%L, 'invasao') $q$, vA)) = 'vistoria_nao_encontrada', 'DONO B ANULOU VISTORIA DA A';
  assert public.zz_erro(format($q$ select public.iniciar_vistoria(%L) $q$, current_setting('teste.osA'))) = 'os_nao_encontrada', 'DONO B INICIOU NA OS DA A';
  assert public.zz_erro($q$ select public.confirmar_foto_vistoria('f4f00000-0000-4000-8000-000000000001') $q$) = 'foto_nao_encontrada', 'DONO B CONFIRMOU FOTO DA A';
  assert not public.apagar_foto_vistoria('f4f00000-0000-4000-8000-000000000001'), 'DONO B APAGOU FOTO DA A';
  assert not public.remover_avaria('f4a00000-0000-4000-8000-000000000001'), 'DONO B REMOVEU AVARIA DA A';
  -- [STORAGE]
  assert (select count(*) from storage.objects where bucket_id = 'vistorias') = 0, 'DONO B LISTA ARQUIVOS DE VISTORIA DA A';
  assert not exists (select 1 from storage.objects where name = current_setting('teste.ass')), 'DONO B ABRE A ASSINATURA DA A COM O CAMINHO';
  assert public.zz_estado(format($q$ insert into storage.objects (bucket_id, name) values ('vistorias', %L) $q$,
                                 current_setting('teste.oficina_a') || '/' || current_setting('teste.osA') || '/' || vA || '/' || gen_random_uuid() || '.jpg')) = '42501',
    'DONO B SUBIU ARQUIVO NA PASTA DA A';
  perform set_config('storage.allow_delete_query', 'true', true);
  assert public.zz_afetadas($q$ delete from storage.objects where bucket_id = 'vistorias' $q$) = 0, 'DONO B APAGOU ARQUIVO DA A';
end $$;

-- a5 (mecanico sem acesso a OS): nada no Storage
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004a5","role":"authenticated"}', true);
do $$
begin
  assert (select count(*) from storage.objects where bucket_id = 'vistorias') = 0, 'MECANICO SEM ACESSO LISTA ARQUIVOS DA VISTORIA';
  assert not exists (select 1 from storage.objects where name = current_setting('teste.ass')), 'MECANICO SEM ACESSO ABRE A ASSINATURA';
end $$;

-- =============================================================================
-- 10b) OBJETOS NA CONCLUSAO: NULL e '{}' ficam como estao, o hash distingue e confere
-- =============================================================================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004a1","role":"authenticated"}', true);
select set_config('teste.osN', (select os_id::text from public.abrir_os('f4000000-0000-4000-8000-00000000001a',
  p_veiculo_id => current_setting('teste.veiculo')::uuid)), true);
select set_config('teste.osV', (select os_id::text from public.abrir_os('f4000000-0000-4000-8000-00000000001b',
  p_veiculo_id => current_setting('teste.veiculo')::uuid)), true);
do $$
declare
  vN uuid;
  vV uuid;
  hN text;
begin
  select vistoria_id into vN from public.iniciar_vistoria(current_setting('teste.osN')::uuid);
  perform public.marcar_itens_restantes_ok(vN);
  perform public.salvar_vistoria(vN, p_sem_avarias => true);
  hN := public.concluir_vistoria(vN, 'recusou');
  assert hN ~ '^[0-9a-f]{64}$', 'concluir com objetos nao informados deveria dar hash';
  assert (select status = 'concluida' and objetos is null from public.vistorias where id = vN), 'concluida deveria manter objetos NULL';
  assert public.conferir_vistoria(vN), 'hash com objetos NULL deveria conferir';
  assert public.concluir_vistoria(vN) = hN, 'reenvio do concluir com objetos NULL deveria devolver o mesmo hash';

  select vistoria_id into vV from public.iniciar_vistoria(current_setting('teste.osV')::uuid);
  perform public.marcar_itens_restantes_ok(vV);
  perform public.salvar_vistoria(vV, p_sem_avarias => true, p_objetos => '{}');
  perform public.concluir_vistoria(vV, 'recusou');
  assert (select status = 'concluida' and objetos = '{}'::text[] from public.vistorias where id = vV), 'concluida deveria manter "Nenhum objeto"';
  assert public.conferir_vistoria(vV), 'hash com "Nenhum objeto" deveria conferir';

  assert public.zz_erro(format($q$ select public.salvar_vistoria(%L, p_limpar_objetos => true) $q$, vV)) = 'vistoria_concluida', 'LIMPOU OBJETOS DE VISTORIA CONCLUIDA';
  assert public.zz_erro(format($q$ select public.salvar_vistoria(%L, p_objetos => '{}') $q$, vN)) = 'vistoria_concluida', 'MUDOU OBJETOS DE VISTORIA CONCLUIDA';
  perform set_config('teste.vN', vN::text, true);
  perform set_config('teste.vV', vV::text, true);

  -- anular passa pelo trigger que compara o resto da linha: NULL nao pode atrapalhar
  perform public.anular_vistoria(vN, 'Feita na OS errada: teste');
  assert (select status = 'anulada' and objetos is null from public.vistorias where id = vN), 'anulada deveria manter objetos NULL';
end $$;

reset role;
do $$
declare
  vN uuid := current_setting('teste.vN')::uuid;
  vV uuid := current_setting('teste.vV')::uuid;
begin
  -- o conteudo assinado distingue "nao informado" de "Nenhum objeto"
  assert private.conteudo_vistoria(vN) -> 'objetos' = 'null'::jsonb, 'conteudo deveria ter objetos null';
  assert private.conteudo_vistoria(vV) -> 'objetos' = '[]'::jsonb, 'conteudo deveria ter objetos []';
  -- nem o postgres troca um pelo outro depois de concluida
  assert public.zz_erro(format($q$ update public.vistorias set objetos = null where id = %L $q$, vV)) = 'vistoria_concluida',
    'POSTGRES LIMPOU OBJETOS DE VISTORIA CONCLUIDA';
  assert public.zz_erro(format($q$ update public.vistorias set objetos = '{}' where id = %L $q$, vN)) = 'vistoria_concluida',
    'POSTGRES MARCOU NENHUM OBJETO EM VISTORIA ANULADA';
  -- so existe a assinatura nova da RPC, com as mesmas permissoes
  assert (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'salvar_vistoria') = 1, 'salvar_vistoria deveria ter uma versao so';
  assert (select prosecdef and proconfig = array['search_path=""'] from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'salvar_vistoria'), 'salvar_vistoria deveria ser security definer com search_path vazio';
  assert not has_function_privilege('anon', 'public.salvar_vistoria(uuid, integer, integer, public.nivel_combustivel, text[], text, boolean, text, boolean)', 'execute'),
    'ANON PODE CHAMAR salvar_vistoria';
  assert has_function_privilege('authenticated', 'public.salvar_vistoria(uuid, integer, integer, public.nivel_combustivel, text[], text, boolean, text, boolean)', 'execute'),
    'authenticated deveria chamar salvar_vistoria';
end $$;
set local role authenticated;

-- =============================================================================
-- 11) Anon
-- =============================================================================
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $$
begin
  assert public.zz_estado('select 1 from public.vistorias') = '42501', 'ANON LEU vistorias';
  assert public.zz_estado('select 1 from public.vistoria_itens') = '42501', 'ANON LEU vistoria_itens';
  assert public.zz_estado('select 1 from public.vistoria_fotos') = '42501', 'ANON LEU vistoria_fotos';
  assert public.zz_estado('select 1 from public.vw_vistorias') = '42501', 'ANON LEU vw_vistorias';
  assert public.zz_estado('select 1 from public.checklist_modelo_itens') = '42501', 'ANON LEU o checklist';
  assert public.zz_estado($q$ select public.iniciar_vistoria(gen_random_uuid()) $q$) = '42501', 'ANON CHAMOU iniciar_vistoria';
  assert public.zz_estado($q$ select public.concluir_vistoria(gen_random_uuid()) $q$) = '42501', 'ANON CHAMOU concluir_vistoria';
  assert public.zz_estado($q$ select public.conferir_vistoria(gen_random_uuid()) $q$) = '42501', 'ANON CHAMOU conferir_vistoria';
  -- [STORAGE]
  assert coalesce(public.zz_estado($q$ do $d$ begin
           if (select count(*) from storage.objects where bucket_id = 'vistorias') > 0 then raise exception 'viu'; end if;
         end $d$ $q$), '42501') = '42501', 'ANON VE ARQUIVOS DA VISTORIA';
end $$;

-- =============================================================================
reset role;
select 'FASE 4 OK: vistoria passou' as resultado;

rollback;
