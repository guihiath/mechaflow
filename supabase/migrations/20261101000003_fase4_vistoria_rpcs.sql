-- =============================================================================
-- MechaFlow - Fase 4 - 03 RPCs e views da vistoria (F4-A1, F4-A2, F4-A3)
--
-- Uma RPC por passo da tela; todas idempotentes (reenvio com internet fraca
-- nao duplica nem quebra). Ids de avaria, foto, complemento e assinatura sao
-- gerados no navegador (crypto.randomUUID()) e guardados no rascunho/fila.
--
--   iniciar_vistoria           cria o rascunho (ou devolve o que ja existe)
--   salvar_vistoria            KM/horimetro (gravam na OS: KM unico, 17.6-8),
--                              combustivel, objetos, observacoes
--   marcar_item_vistoria       um item do checklist
--   marcar_itens_restantes_ok  "marcar o resto como ok"
--   salvar_avaria / remover_avaria
--   registrar_foto_vistoria -> upload -> confirmar_foto_vistoria   (como na Fase 3)
--   apagar_foto_vistoria       so em rascunho
--   registrar_assinatura_vistoria -> upload do PNG -> concluir_vistoria
--   concluir_vistoria          confere tudo, copia o KM, grava o hash e TRAVA
--   complementar_vistoria      depois de concluida (texto; fotos pelo registrar)
--   anular_vistoria            so o dono, com motivo
--   conferir_vistoria          recalcula o hash (prova de que nada mudou)
--
-- Quem faz (17.6-5): dono e atendente em qualquer OS aberta; mecanico so na OS
-- atribuida a ele (com ve_todas_os ele VE, mas nao faz). OS entregue/cancelada:
-- ninguem mexe na vistoria (os_fechada); complemento: dono/atendente sempre,
-- mecanico so na OS dele aberta (mesma regra das fotos da Fase 3).
--
-- Trava: sempre a OS primeiro (private.travar_os) e depois a vistoria.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Internas
-- -----------------------------------------------------------------------------

-- Le e TRAVA a vistoria (e antes a OS dela). Confere oficina e se eu vejo a OS.
create or replace function private.travar_vistoria(p_vistoria_id uuid)
returns public.vistorias
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_os_id uuid;
  v       public.vistorias;
begin
  select x.os_id into v_os_id
    from public.vistorias x
   where x.id = p_vistoria_id and x.oficina_id = private.minha_oficina_id();
  if not found then
    raise exception 'vistoria_nao_encontrada';
  end if;
  begin
    perform private.travar_os(v_os_id);
  exception when others then
    if sqlerrm = 'os_nao_encontrada' then
      raise exception 'vistoria_nao_encontrada';
    end if;
    raise;
  end;
  select x.* into v from public.vistorias x where x.id = p_vistoria_id for update;
  return v;
end;
$$;

-- Posso FAZER (editar) esta vistoria agora? Erro com o motivo, ou nada.
create or replace function private.exigir_edicao_vistoria(p_v public.vistorias)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_os public.ordens_servico;
begin
  select o.* into v_os from public.ordens_servico o where o.id = p_v.os_id;
  if private.meu_papel() = 'mecanico' and v_os.mecanico_id is distinct from auth.uid() then
    raise exception 'acesso_negado' using errcode = '42501';
  end if;
  if p_v.status = 'concluida' then
    raise exception 'vistoria_concluida';
  end if;
  if p_v.status = 'anulada' then
    raise exception 'vistoria_anulada';
  end if;
  if v_os.status in ('entregue', 'cancelada') then
    raise exception 'os_fechada';
  end if;
end;
$$;

-- Versao booleana, para as views (o app mostra os botoes so onde pode).
create or replace function private.posso_editar_vistoria(p_v public.vistorias)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select p_v.status = 'rascunho'
       and o.status not in ('entregue', 'cancelada')
       and (private.meu_papel() in ('dono', 'atendente')
            or (private.meu_papel() = 'mecanico' and o.mecanico_id = auth.uid()))
      from public.ordens_servico o
     where o.id = p_v.os_id
       and o.oficina_id = private.minha_oficina_id()
       and (private.vejo_todas_os() or o.mecanico_id = auth.uid())
  ), false)
$$;

-- Posso acrescentar complemento? (vistoria concluida)
create or replace function private.posso_complementar_vistoria(p_v public.vistorias)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select p_v.status = 'concluida'
       and (private.meu_papel() in ('dono', 'atendente')
            or (private.meu_papel() = 'mecanico' and o.mecanico_id = auth.uid()
                and o.status not in ('entregue', 'cancelada')))
      from public.ordens_servico o
     where o.id = p_v.os_id
       and o.oficina_id = private.minha_oficina_id()
       and (private.vejo_todas_os() or o.mecanico_id = auth.uid())
  ), false)
$$;

-- Posso apagar esta foto? So foto ORIGINAL de vistoria em rascunho que eu
-- posso editar; mecanico so as que ele enviou. Complemento e concluida: nunca.
create or replace function private.foto_vistoria_apagavel(p_foto public.vistoria_fotos)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select p_foto.complemento_id is null
       and private.posso_editar_vistoria(v)
       and (private.meu_papel() in ('dono', 'atendente') or p_foto.criado_por = auth.uid())
      from public.vistorias v
     where v.id = p_foto.vistoria_id
       and v.oficina_id = private.minha_oficina_id()
  ), false)
$$;

-- Data em UTC, texto fixo (o hash nao pode depender do fuso da sessao).
create or replace function private.ts_utc(p timestamptz)
returns text
language sql
immutable
set search_path = ''
as $$
  select to_char(p at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
$$;

-- Conteudo que a assinatura/conclusao "prova". Sem complementos e sem anulacao
-- (sao acrescentados depois). Inclui o eTag (MD5) que o Storage guarda de cada
-- arquivo: trocar o arquivo muda o hash. (Arquivo nao muda: nao ha politica de
-- UPDATE no bucket; o eTag e a prova extra.)
create or replace function private.conteudo_vistoria(p_vistoria_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'versao', 1,
    'id', v.id, 'oficina_id', v.oficina_id, 'os_id', v.os_id, 'veiculo_id', v.veiculo_id,
    'tipo', v.tipo, 'km', v.km, 'horimetro', v.horimetro, 'combustivel', v.combustivel,
    'objetos', to_jsonb(v.objetos), 'observacoes', v.observacoes, 'sem_avarias', v.sem_avarias,
    'assinatura_caminho', v.assinatura_caminho,
    'assinatura_tamanho_bytes', v.assinatura_tamanho_bytes,
    'assinatura_etag', (select s.metadata ->> 'eTag' from storage.objects s
                         where s.bucket_id = 'vistorias' and s.name = v.assinatura_caminho),
    'assinado_por_nome', v.assinado_por_nome, 'sem_assinatura_motivo', v.sem_assinatura_motivo,
    'criado_por', v.criado_por, 'criado_em', private.ts_utc(v.criado_em),
    'concluida_por', v.concluida_por, 'concluida_em', private.ts_utc(v.concluida_em),
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object('ordem', i.ordem, 'descricao', i.descricao,
                                          'situacao', i.situacao, 'observacao', i.observacao)
                       order by i.ordem, i.id)
        from public.vistoria_itens i where i.vistoria_id = v.id), '[]'::jsonb),
    'avarias', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'lado', a.lado, 'descricao', a.descricao)
                       order by a.criado_em, a.id)
        from public.vistoria_avarias a where a.vistoria_id = v.id), '[]'::jsonb),
    'fotos', coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'tipo', f.tipo, 'avaria_id', f.avaria_id,
                                          'legenda', f.legenda, 'caminho', f.caminho,
                                          'tamanho_bytes', f.tamanho_bytes,
                                          'etag', (select s.metadata ->> 'eTag' from storage.objects s
                                                    where s.bucket_id = 'vistorias' and s.name = f.caminho))
                       order by f.criado_em, f.id)
        from public.vistoria_fotos f
       where f.vistoria_id = v.id and f.complemento_id is null), '[]'::jsonb)
  )
  from public.vistorias v
  where v.id = p_vistoria_id
$$;

create or replace function private.hash_vistoria(p_vistoria_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select encode(sha256(convert_to(private.conteudo_vistoria(p_vistoria_id)::text, 'UTF8')), 'hex')
$$;

revoke all on function private.travar_vistoria(uuid) from public;
revoke all on function private.exigir_edicao_vistoria(public.vistorias) from public;
revoke all on function private.posso_editar_vistoria(public.vistorias) from public;
revoke all on function private.posso_complementar_vistoria(public.vistorias) from public;
revoke all on function private.foto_vistoria_apagavel(public.vistoria_fotos) from public;
revoke all on function private.ts_utc(timestamptz) from public;
revoke all on function private.conteudo_vistoria(uuid) from public;
revoke all on function private.hash_vistoria(uuid) from public;
-- usadas nas views (security_invoker) e nas politicas do Storage
grant execute on function private.posso_editar_vistoria(public.vistorias) to authenticated, service_role;
grant execute on function private.posso_complementar_vistoria(public.vistorias) to authenticated, service_role;
grant execute on function private.foto_vistoria_apagavel(public.vistoria_fotos) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2) iniciar_vistoria: cria o rascunho e COPIA o checklist do modelo padrao.
--    Ja existe (rascunho ou concluida) do mesmo tipo: devolve ela (ja_existia).
-- -----------------------------------------------------------------------------
create or replace function public.iniciar_vistoria(
  p_os_id uuid,
  p_tipo  public.tipo_vistoria default 'entrada'
)
returns table (vistoria_id uuid, status public.status_vistoria, ja_existia boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_papel  public.papel_usuario;
  v_os     public.ordens_servico;
  v        public.vistorias;
  v_modelo uuid;
begin
  v_papel := private.exigir_papel(array['dono', 'atendente', 'mecanico']::public.papel_usuario[]);
  v_os    := private.travar_os(p_os_id);   -- serializa: dois toques nao criam duas
  if v_papel = 'mecanico' and v_os.mecanico_id is distinct from auth.uid() then
    raise exception 'acesso_negado' using errcode = '42501';
  end if;

  select x.* into v from public.vistorias x
   where x.os_id = v_os.id and x.tipo = coalesce(p_tipo, 'entrada') and x.status <> 'anulada';
  if found then
    return query select v.id, v.status, true;
    return;
  end if;

  if v_os.status in ('entregue', 'cancelada') then
    raise exception 'os_fechada';
  end if;

  insert into public.vistorias (oficina_id, os_id, veiculo_id, tipo, criado_por)
  values (v_os.oficina_id, v_os.id, v_os.veiculo_id, coalesce(p_tipo, 'entrada'), auth.uid())
  returning * into v;

  select m.id into v_modelo from public.checklist_modelos m where m.oficina_id = v_os.oficina_id and m.padrao;
  insert into public.vistoria_itens (oficina_id, vistoria_id, modelo_item_id, ordem, descricao)
  select v.oficina_id, v.id, i.id, row_number() over (order by i.ordem, i.id), i.descricao
    from public.checklist_modelo_itens i
   where i.modelo_id = v_modelo and i.ativo;

  return query select v.id, v.status, false;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3) salvar_vistoria: dados gerais. NULL = nao muda. observacoes '' = apaga;
--    objetos '{}' = nenhum. KM e horimetro gravam NA OS (KM unico, 17.6-8);
--    a vistoria so copia o KM na conclusao. O veiculo e atualizado na conclusao.
--    p_sem_avarias: marca "Sem avarias" (recusado se ja houver avaria).
--    p_assinado_por_nome: guarda o nome de quem vai assinar ('' apaga).
-- -----------------------------------------------------------------------------
create or replace function public.salvar_vistoria(
  p_vistoria_id  uuid,
  p_km           integer default null,
  p_horimetro    integer default null,
  p_combustivel  public.nivel_combustivel default null,
  p_objetos      text[] default null,
  p_observacoes  text default null,
  p_sem_avarias  boolean default null,
  p_assinado_por_nome text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.vistorias;
begin
  perform private.exigir_papel(array['dono', 'atendente', 'mecanico']::public.papel_usuario[]);
  v := private.travar_vistoria(p_vistoria_id);
  perform private.exigir_edicao_vistoria(v);

  if (p_km is not null and (p_km < 0 or p_km > 99999999))
     or (p_horimetro is not null and (p_horimetro < 0 or p_horimetro > 99999999)) then
    raise exception 'km_invalido';
  end if;
  if p_objetos is not null and cardinality(p_objetos) > 30 then
    raise exception 'objetos_demais';
  end if;

  if p_sem_avarias and exists (select 1 from public.vistoria_avarias a where a.vistoria_id = v.id) then
    raise exception 'vistoria_tem_avarias';
  end if;
  if p_assinado_por_nome is not null and char_length(btrim(p_assinado_por_nome)) > 80 then
    raise exception 'nome_assinatura_obrigatorio';
  end if;

  if p_km is not null or p_horimetro is not null then
    update public.ordens_servico o
       set km        = coalesce(p_km, o.km),
           horimetro = coalesce(p_horimetro, o.horimetro)
     where o.id = v.os_id
       and (o.km is distinct from coalesce(p_km, o.km) or o.horimetro is distinct from coalesce(p_horimetro, o.horimetro));
  end if;

  update public.vistorias x
     set combustivel = coalesce(p_combustivel, x.combustivel),
         objetos     = coalesce(p_objetos, x.objetos),
         observacoes = case when p_observacoes is null then x.observacoes else left(p_observacoes, 2000) end,
         sem_avarias = coalesce(p_sem_avarias, x.sem_avarias),
         assinado_por_nome = case when p_assinado_por_nome is null then x.assinado_por_nome
                                  when char_length(btrim(p_assinado_por_nome)) < 2 then null
                                  else p_assinado_por_nome end
   where x.id = v.id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4) Checklist
-- -----------------------------------------------------------------------------
-- p_observacao: NULL = nao muda; '' = apaga.
create or replace function public.marcar_item_vistoria(
  p_item_id    uuid,
  p_situacao   public.situacao_item_vistoria,
  p_observacao text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vistoria uuid;
  v          public.vistorias;
begin
  perform private.exigir_papel(array['dono', 'atendente', 'mecanico']::public.papel_usuario[]);
  select i.vistoria_id into v_vistoria
    from public.vistoria_itens i
   where i.id = p_item_id and i.oficina_id = private.minha_oficina_id();
  if not found then
    raise exception 'item_nao_encontrado';
  end if;
  v := private.travar_vistoria(v_vistoria);
  perform private.exigir_edicao_vistoria(v);
  if p_situacao is null then
    raise exception 'situacao_obrigatoria';
  end if;

  update public.vistoria_itens i
     set situacao    = p_situacao,
         observacao  = case when p_observacao is null then i.observacao
                            else left(nullif(btrim(p_observacao), ''), 500) end,
         marcado_por = auth.uid(),
         marcado_em  = now()
   where i.id = p_item_id;
end;
$$;

-- "Marcar o resto como ok": so os que ainda estao sem marcar. Devolve quantos.
create or replace function public.marcar_itens_restantes_ok(p_vistoria_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.vistorias;
  n integer;
begin
  perform private.exigir_papel(array['dono', 'atendente', 'mecanico']::public.papel_usuario[]);
  v := private.travar_vistoria(p_vistoria_id);
  perform private.exigir_edicao_vistoria(v);

  update public.vistoria_itens i
     set situacao = 'ok', marcado_por = auth.uid(), marcado_em = now()
   where i.vistoria_id = v.id and i.situacao is null;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5) Avarias (id do navegador: criar e editar sao a mesma chamada)
--    p_descricao: NULL = nao muda; '' = apaga.
-- -----------------------------------------------------------------------------
create or replace function public.salvar_avaria(
  p_id          uuid,
  p_vistoria_id uuid,
  p_lado        public.lado_avaria default null,
  p_descricao   text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.vistorias;
  a public.vistoria_avarias;
begin
  perform private.exigir_papel(array['dono', 'atendente', 'mecanico']::public.papel_usuario[]);
  if p_id is null then
    raise exception 'chave_obrigatoria';
  end if;
  v := private.travar_vistoria(p_vistoria_id);
  perform private.exigir_edicao_vistoria(v);

  select x.* into a from public.vistoria_avarias x where x.id = p_id;
  if found then
    if a.vistoria_id <> v.id then
      raise exception 'avaria_nao_encontrada';
    end if;
    update public.vistoria_avarias x
       set lado      = coalesce(p_lado, x.lado),
           descricao = case when p_descricao is null then x.descricao
                            else left(nullif(btrim(p_descricao), ''), 300) end
     where x.id = p_id;
    return;
  end if;

  if p_lado is null then
    raise exception 'lado_obrigatorio';
  end if;
  insert into public.vistoria_avarias (id, oficina_id, vistoria_id, lado, descricao, criado_por)
  values (p_id, v.oficina_id, v.id, p_lado, left(nullif(btrim(p_descricao), ''), 300), auth.uid());
  update public.vistorias x set sem_avarias = false where x.id = v.id and x.sem_avarias;
end;
$$;

-- Remove a avaria e os REGISTROS das fotos dela. O app apaga os arquivos ANTES
-- (storage.remove dos caminhos da vw_vistoria_fotos), como no apagar da Fase 3.
-- true = removeu; false = ja nao existia (reenvio).
create or replace function public.remover_avaria(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vistoria uuid;
  v          public.vistorias;
begin
  perform private.exigir_papel(array['dono', 'atendente', 'mecanico']::public.papel_usuario[]);
  select a.vistoria_id into v_vistoria
    from public.vistoria_avarias a
   where a.id = p_id and a.oficina_id = private.minha_oficina_id();
  if not found then
    return false;
  end if;
  v := private.travar_vistoria(v_vistoria);
  perform private.exigir_edicao_vistoria(v);
  -- mecanico: so se todas as fotos da avaria forem dele (mesma regra de apagar foto)
  if exists (select 1 from public.vistoria_fotos f
              where f.avaria_id = p_id and not private.foto_vistoria_apagavel(f)) then
    raise exception 'foto_nao_pode_apagar';
  end if;
  delete from public.vistoria_avarias a where a.id = p_id;
  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6) Fotos da vistoria (bucket 'vistorias'; fluxo igual ao da Fase 3)
--    Limite (17.6-7): 30 fotos por vistoria, fora das 40 da OS; complementos:
--    mais 10. Registro pendente ha mais de 24 h nao conta.
-- -----------------------------------------------------------------------------
create or replace function public.registrar_foto_vistoria(
  p_id                      uuid,
  p_vistoria_id             uuid,
  p_tipo                    public.tipo_foto_vistoria,
  p_largura                 integer,
  p_altura                  integer,
  p_tamanho_bytes           integer,
  p_tamanho_miniatura_bytes integer,
  p_avaria_id               uuid default null,
  p_complemento_id          uuid default null,
  p_legenda                 text default null
)
returns table (id uuid, caminho text, caminho_miniatura text, enviada boolean, ja_existia boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_papel public.papel_usuario;
  v       public.vistorias;
  f       public.vistoria_fotos;
begin
  v_papel := private.exigir_papel(array['dono', 'atendente', 'mecanico']::public.papel_usuario[]);
  if p_id is null then
    raise exception 'chave_obrigatoria';
  end if;
  v := private.travar_vistoria(p_vistoria_id);   -- serializa: limite exato

  select x.* into f from public.vistoria_fotos x where x.id = p_id;
  if found then
    if f.vistoria_id <> v.id then
      raise exception 'foto_invalida';
    end if;
    return query select f.id, f.caminho, f.caminho_miniatura, f.enviada_em is not null, true;
    return;
  end if;

  if p_complemento_id is null then
    perform private.exigir_edicao_vistoria(v);
  else
    if not exists (select 1 from public.vistoria_complementos c
                    where c.id = p_complemento_id and c.vistoria_id = v.id) then
      raise exception 'complemento_nao_encontrado';
    end if;
    if not private.posso_complementar_vistoria(v) then
      if v.status <> 'concluida' then
        raise exception 'vistoria_nao_concluida';
      end if;
      raise exception 'acesso_negado' using errcode = '42501';
    end if;
  end if;

  if p_tipo is null
     or (p_tipo = 'avaria') <> (p_avaria_id is not null)
     or (p_complemento_id is not null and p_tipo = 'avaria') then
    raise exception 'foto_invalida';
  end if;
  if p_avaria_id is not null
     and not exists (select 1 from public.vistoria_avarias a where a.id = p_avaria_id and a.vistoria_id = v.id) then
    raise exception 'avaria_nao_encontrada';
  end if;
  if p_largura is null or p_altura is null or p_largura not between 1 and 10000 or p_altura not between 1 and 10000
     or p_tamanho_bytes is null or p_tamanho_bytes < 1
     or p_tamanho_miniatura_bytes is null or p_tamanho_miniatura_bytes < 1 then
    raise exception 'foto_invalida';
  end if;
  if p_tamanho_bytes > 5242880 or p_tamanho_miniatura_bytes > 5242880 then
    raise exception 'foto_grande_demais';
  end if;

  -- ate 3 fotos por avaria (DESIGN 12.20)
  if p_avaria_id is not null
     and (select count(*) from public.vistoria_fotos x
           where x.avaria_id = p_avaria_id
             and (x.enviada_em is not null or x.criado_em > now() - interval '24 hours')) >= 3 then
    raise exception 'limite_fotos_avaria';
  end if;

  if (select count(*) from public.vistoria_fotos x
       where x.vistoria_id = v.id
         and (x.complemento_id is null) = (p_complemento_id is null)
         and (x.enviada_em is not null or x.criado_em > now() - interval '24 hours'))
     >= (case when p_complemento_id is null then 30 else 10 end) then
    raise exception 'limite_fotos_vistoria';
  end if;

  insert into public.vistoria_fotos (id, oficina_id, os_id, vistoria_id, tipo, avaria_id, complemento_id, legenda,
                                     largura, altura, tamanho_bytes, tamanho_miniatura_bytes, criado_por)
  values (p_id, v.oficina_id, v.os_id, v.id, p_tipo, p_avaria_id, p_complemento_id,
          left(nullif(btrim(p_legenda), ''), 200),
          p_largura, p_altura, p_tamanho_bytes, p_tamanho_miniatura_bytes, auth.uid())
  returning * into f;

  return query select f.id, f.caminho, f.caminho_miniatura, false, false;
end;
$$;

-- Depois de subir os 2 arquivos: confere no bucket e marca enviada. Idempotente.
create or replace function public.confirmar_foto_vistoria(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  f         public.vistoria_fotos;
  v_tamanho bigint;
  v_n       bigint;
begin
  perform private.exigir_papel(array['dono', 'atendente', 'mecanico']::public.papel_usuario[]);
  select x.* into f from public.vistoria_fotos x
   where x.id = p_id and x.oficina_id = private.minha_oficina_id();
  if not found then
    raise exception 'foto_nao_encontrada';
  end if;
  begin
    perform private.travar_vistoria(f.vistoria_id);
  exception when others then
    if sqlerrm = 'vistoria_nao_encontrada' then
      raise exception 'foto_nao_encontrada';
    end if;
    raise;
  end;
  if f.enviada_em is not null then
    return;
  end if;
  if f.criado_por is distinct from auth.uid() then
    raise exception 'acesso_negado' using errcode = '42501';
  end if;

  select count(*), max(case when s.name = f.caminho then (s.metadata ->> 'size')::bigint end)
    into v_n, v_tamanho
    from storage.objects s
   where s.bucket_id = 'vistorias'
     and s.name in (f.caminho, f.caminho_miniatura);
  if v_n < 2 then
    raise exception 'foto_nao_enviada';
  end if;
  if (select count(*) from public.vistoria_fotos x
       where x.vistoria_id = f.vistoria_id and x.enviada_em is not null
         and (x.complemento_id is null) = (f.complemento_id is null))
     >= (case when f.complemento_id is null then 30 else 10 end) then
    raise exception 'limite_fotos_vistoria';
  end if;

  -- (vistoria ja concluida e foto original: o trigger recusa com vistoria_concluida)
  update public.vistoria_fotos x
     set enviada_em    = now(),
         tamanho_bytes = coalesce(least(v_tamanho, 5242880)::integer, x.tamanho_bytes)
   where x.id = f.id;
end;
$$;

-- So em rascunho (o app apaga os arquivos ANTES). true = apagou; false = nao existia.
create or replace function public.apagar_foto_vistoria(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.vistoria_fotos;
  v public.vistorias;
begin
  perform private.exigir_papel(array['dono', 'atendente', 'mecanico']::public.papel_usuario[]);
  select x.* into f from public.vistoria_fotos x
   where x.id = p_id and x.oficina_id = private.minha_oficina_id();
  if not found then
    return false;
  end if;
  v := private.travar_vistoria(f.vistoria_id);
  if v.status = 'concluida' or f.complemento_id is not null then
    raise exception 'vistoria_concluida';
  end if;
  perform private.exigir_edicao_vistoria(v);
  if not private.foto_vistoria_apagavel(f) then
    raise exception 'foto_nao_pode_apagar';
  end if;
  delete from public.vistoria_fotos x where x.id = f.id;
  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7) Assinatura: registrar -> subir o PNG (upsert: false) -> concluir_vistoria.
--    Assinar de novo = p_assinatura_id NOVO (caminho novo; nada e sobrescrito).
--    Mesmo id de novo = reenvio (so atualiza o nome). Devolve o caminho.
-- -----------------------------------------------------------------------------
create or replace function public.registrar_assinatura_vistoria(
  p_vistoria_id    uuid,
  p_assinatura_id  uuid,
  p_nome           text,
  p_largura        integer,
  p_altura         integer,
  p_tamanho_bytes  integer
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.vistorias;
begin
  perform private.exigir_papel(array['dono', 'atendente', 'mecanico']::public.papel_usuario[]);
  if p_assinatura_id is null then
    raise exception 'chave_obrigatoria';
  end if;
  v := private.travar_vistoria(p_vistoria_id);
  perform private.exigir_edicao_vistoria(v);

  if char_length(btrim(coalesce(p_nome, ''))) < 2 or char_length(btrim(p_nome)) > 80 then
    raise exception 'nome_assinatura_obrigatorio';
  end if;
  if p_largura is null or p_altura is null or p_largura not between 1 and 4000 or p_altura not between 1 and 4000
     or p_tamanho_bytes is null or p_tamanho_bytes not between 1 and 524288 then
    raise exception 'assinatura_invalida';
  end if;

  update public.vistorias x
     set assinatura_id             = p_assinatura_id,
         assinatura_largura        = p_largura,
         assinatura_altura         = p_altura,
         assinatura_tamanho_bytes  = p_tamanho_bytes,
         assinatura_registrada_por = case when x.assinatura_id = p_assinatura_id
                                          then x.assinatura_registrada_por else auth.uid() end,
         assinado_por_nome         = p_nome,
         sem_assinatura_motivo     = null
   where x.id = v.id
  returning * into v;
  return v.assinatura_caminho;
end;
$$;

-- -----------------------------------------------------------------------------
-- 8) concluir_vistoria: confere e TRAVA. Devolve o hash SHA-256 do conteudo.
--    p_sem_assinatura_motivo (17.6-4): 'motorista_ausente' | 'recusou' conclui
--    sem assinatura (a assinatura registrada, se houver, e descartada).
--    Reenvio com a vistoria ja concluida: devolve o mesmo hash.
-- -----------------------------------------------------------------------------
create or replace function public.concluir_vistoria(
  p_vistoria_id           uuid,
  p_sem_assinatura_motivo public.motivo_sem_assinatura default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v      public.vistorias;
  v_os   public.ordens_servico;
  v_hash text;
  v_tipo text;
begin
  perform private.exigir_papel(array['dono', 'atendente', 'mecanico']::public.papel_usuario[]);
  v := private.travar_vistoria(p_vistoria_id);
  if v.status = 'concluida' then
    return v.hash_conteudo;   -- reenvio
  end if;
  perform private.exigir_edicao_vistoria(v);
  select o.* into v_os from public.ordens_servico o where o.id = v.os_id;

  if exists (select 1 from public.vistoria_itens i where i.vistoria_id = v.id and i.situacao is null) then
    raise exception 'vistoria_itens_sem_marcar';
  end if;
  if exists (select 1 from public.vistoria_fotos f
              where f.vistoria_id = v.id and f.complemento_id is null and f.enviada_em is null) then
    raise exception 'vistoria_fotos_pendentes';
  end if;
  -- "Tem avaria?" respondido: pelo menos uma avaria ou "Sem avarias"
  if not v.sem_avarias and not exists (select 1 from public.vistoria_avarias a where a.vistoria_id = v.id) then
    raise exception 'avarias_nao_informadas';
  end if;
  -- avaria precisa de descricao ou de pelo menos uma foto enviada
  if exists (select 1 from public.vistoria_avarias a
              where a.vistoria_id = v.id and a.descricao is null
                and not exists (select 1 from public.vistoria_fotos f where f.avaria_id = a.id)) then
    raise exception 'avaria_incompleta';
  end if;

  if p_sem_assinatura_motivo is null then
    if v.assinatura_id is null or v.assinado_por_nome is null then
      raise exception 'assinatura_obrigatoria';
    end if;
    if not exists (select 1 from storage.objects s
                    where s.bucket_id = 'vistorias' and s.name = v.assinatura_caminho) then
      raise exception 'assinatura_nao_enviada';
    end if;
  end if;

  -- 1o passo (ainda rascunho): copia o KM da OS, define assinatura x motivo, quem/quando
  update public.vistorias x
     set km                        = v_os.km,
         horimetro                 = v_os.horimetro,
         sem_assinatura_motivo     = p_sem_assinatura_motivo,
         assinatura_id             = case when p_sem_assinatura_motivo is null then x.assinatura_id end,
         assinatura_largura        = case when p_sem_assinatura_motivo is null then x.assinatura_largura end,
         assinatura_altura         = case when p_sem_assinatura_motivo is null then x.assinatura_altura end,
         assinatura_tamanho_bytes  = case when p_sem_assinatura_motivo is null then x.assinatura_tamanho_bytes end,
         assinatura_registrada_por = case when p_sem_assinatura_motivo is null then x.assinatura_registrada_por end,
         assinado_por_nome         = case when p_sem_assinatura_motivo is null then x.assinado_por_nome end,
         concluida_em              = now(),
         concluida_por             = auth.uid()
   where x.id = v.id;

  -- 2o passo: hash do conteudo e trava (status concluida; dali em diante o trigger recusa tudo)
  v_hash := private.hash_vistoria(v.id);
  update public.vistorias x
     set status = 'concluida', hash_conteudo = v_hash
   where x.id = v.id;

  -- KM unico (17.6-8): o veiculo recebe o KM/horimetro se for maior (regra F16)
  if v_os.km is not null then
    update public.veiculos ve set km_atual = v_os.km
     where ve.id = v_os.veiculo_id and (ve.km_atual is null or ve.km_atual < v_os.km);
  end if;
  if v_os.horimetro is not null then
    update public.veiculos ve set horimetro_atual = v_os.horimetro
     where ve.id = v_os.veiculo_id and (ve.horimetro_atual is null or ve.horimetro_atual < v_os.horimetro);
  end if;

  v_tipo := case when v.tipo = 'entrada' then 'de entrada' else 'de saída' end;
  perform private.registrar_historico(
    v_os, 'vistoria', v_os.status, v_os.status,
    'Vistoria ' || v_tipo || ' concluída'
      || case p_sem_assinatura_motivo
           when 'motorista_ausente' then ' sem assinatura (motorista ausente)'
           when 'recusou'           then ' sem assinatura (motorista recusou)'
           else '' end);
  return v_hash;
end;
$$;

-- -----------------------------------------------------------------------------
-- 9) complementar_vistoria: texto acrescentado depois de concluida (id do
--    navegador; reenvio nao duplica). Fotos do complemento: registrar_foto_vistoria
--    com p_complemento_id. Nunca muda nem sai.
-- -----------------------------------------------------------------------------
create or replace function public.complementar_vistoria(
  p_id          uuid,
  p_vistoria_id uuid,
  p_texto       text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v    public.vistorias;
  c    public.vistoria_complementos;
  v_os public.ordens_servico;
begin
  perform private.exigir_papel(array['dono', 'atendente', 'mecanico']::public.papel_usuario[]);
  if p_id is null then
    raise exception 'chave_obrigatoria';
  end if;
  v := private.travar_vistoria(p_vistoria_id);

  select x.* into c from public.vistoria_complementos x where x.id = p_id;
  if found then
    if c.vistoria_id <> v.id then
      raise exception 'complemento_nao_encontrado';
    end if;
    return;   -- reenvio
  end if;

  if v.status = 'anulada' then
    raise exception 'vistoria_anulada';
  end if;
  if v.status <> 'concluida' then
    raise exception 'vistoria_nao_concluida';
  end if;
  if not private.posso_complementar_vistoria(v) then
    raise exception 'acesso_negado' using errcode = '42501';
  end if;
  if p_texto is not null and char_length(btrim(p_texto)) > 1000 then
    raise exception 'texto_grande_demais';
  end if;

  insert into public.vistoria_complementos (id, oficina_id, vistoria_id, texto, criado_por)
  values (p_id, v.oficina_id, v.id, p_texto, auth.uid());

  select o.* into v_os from public.ordens_servico o where o.id = v.os_id;
  perform private.registrar_historico(v_os, 'vistoria', v_os.status, v_os.status,
    'Acrescentou à vistoria ' || case when v.tipo = 'entrada' then 'de entrada' else 'de saída' end);
end;
$$;

-- -----------------------------------------------------------------------------
-- 10) anular_vistoria: so o dono, com motivo (vistoria feita na OS errada).
--     A anulada fica guardada (e imutavel); outra pode ser feita na OS.
-- -----------------------------------------------------------------------------
create or replace function public.anular_vistoria(p_vistoria_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v    public.vistorias;
  v_os public.ordens_servico;
begin
  perform private.exigir_papel(array['dono']::public.papel_usuario[]);
  v := private.travar_vistoria(p_vistoria_id);
  if v.status = 'anulada' then
    return;   -- reenvio
  end if;
  if char_length(btrim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'motivo_obrigatorio';
  end if;

  update public.vistorias x
     set status = 'anulada', anulada_em = now(), anulada_por = auth.uid(), motivo_anulacao = left(p_motivo, 500)
   where x.id = v.id;

  select o.* into v_os from public.ordens_servico o where o.id = v.os_id;
  -- historico: o mecanico le o texto do sistema; dono/atendente, com o motivo (F17)
  perform private.registrar_historico(v_os, 'vistoria', v_os.status, v_os.status,
    'Vistoria ' || case when v.tipo = 'entrada' then 'de entrada' else 'de saída' end || ' anulada',
    'Vistoria ' || case when v.tipo = 'entrada' then 'de entrada' else 'de saída' end || ' anulada: ' || btrim(p_motivo));
end;
$$;

-- -----------------------------------------------------------------------------
-- 11) conferir_vistoria: recalcula o hash. true = nada mudou desde a conclusao.
--     NULL = vistoria ainda nao concluida.
-- -----------------------------------------------------------------------------
create or replace function public.conferir_vistoria(p_vistoria_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.vistorias;
begin
  perform private.exigir_papel(array['dono', 'atendente', 'mecanico']::public.papel_usuario[]);
  select x.* into v
    from public.vistorias x
    join public.ordens_servico o on o.id = x.os_id
   where x.id = p_vistoria_id
     and x.oficina_id = private.minha_oficina_id()
     and (private.vejo_todas_os() or o.mecanico_id = auth.uid());
  if not found then
    raise exception 'vistoria_nao_encontrada';
  end if;
  if v.hash_conteudo is null then
    return null;
  end if;
  return private.hash_vistoria(v.id) = v.hash_conteudo;
end;
$$;

-- -----------------------------------------------------------------------------
-- 12) GRANTs das RPCs
-- -----------------------------------------------------------------------------
revoke all on function public.iniciar_vistoria(uuid, public.tipo_vistoria) from public, anon;
revoke all on function public.salvar_vistoria(uuid, integer, integer, public.nivel_combustivel, text[], text, boolean, text) from public, anon;
revoke all on function public.marcar_item_vistoria(uuid, public.situacao_item_vistoria, text) from public, anon;
revoke all on function public.marcar_itens_restantes_ok(uuid) from public, anon;
revoke all on function public.salvar_avaria(uuid, uuid, public.lado_avaria, text) from public, anon;
revoke all on function public.remover_avaria(uuid) from public, anon;
revoke all on function public.registrar_foto_vistoria(uuid, uuid, public.tipo_foto_vistoria, integer, integer, integer, integer, uuid, uuid, text) from public, anon;
revoke all on function public.confirmar_foto_vistoria(uuid) from public, anon;
revoke all on function public.apagar_foto_vistoria(uuid) from public, anon;
revoke all on function public.registrar_assinatura_vistoria(uuid, uuid, text, integer, integer, integer) from public, anon;
revoke all on function public.concluir_vistoria(uuid, public.motivo_sem_assinatura) from public, anon;
revoke all on function public.complementar_vistoria(uuid, uuid, text) from public, anon;
revoke all on function public.anular_vistoria(uuid, text) from public, anon;
revoke all on function public.conferir_vistoria(uuid) from public, anon;

grant execute on function public.iniciar_vistoria(uuid, public.tipo_vistoria) to authenticated;
grant execute on function public.salvar_vistoria(uuid, integer, integer, public.nivel_combustivel, text[], text, boolean, text) to authenticated;
grant execute on function public.marcar_item_vistoria(uuid, public.situacao_item_vistoria, text) to authenticated;
grant execute on function public.marcar_itens_restantes_ok(uuid) to authenticated;
grant execute on function public.salvar_avaria(uuid, uuid, public.lado_avaria, text) to authenticated;
grant execute on function public.remover_avaria(uuid) to authenticated;
grant execute on function public.registrar_foto_vistoria(uuid, uuid, public.tipo_foto_vistoria, integer, integer, integer, integer, uuid, uuid, text) to authenticated;
grant execute on function public.confirmar_foto_vistoria(uuid) to authenticated;
grant execute on function public.apagar_foto_vistoria(uuid) to authenticated;
grant execute on function public.registrar_assinatura_vistoria(uuid, uuid, text, integer, integer, integer) to authenticated;
grant execute on function public.concluir_vistoria(uuid, public.motivo_sem_assinatura) to authenticated;
grant execute on function public.complementar_vistoria(uuid, uuid, text) to authenticated;
grant execute on function public.anular_vistoria(uuid, text) to authenticated;
grant execute on function public.conferir_vistoria(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 13) Views (security_invoker: respeitam a RLS de quem consulta)
-- -----------------------------------------------------------------------------
create view public.vw_vistorias
with (security_invoker = true)
as
select
  v.id,
  v.oficina_id,
  v.os_id,
  o.numero                                  as os_numero,
  v.veiculo_id,
  ve.placa,
  v.tipo,
  v.status,
  -- rascunho: o KM vivo da OS; concluida/anulada: a copia gravada na conclusao
  case when v.status = 'rascunho' then o.km else v.km end               as km,
  case when v.status = 'rascunho' then o.horimetro else v.horimetro end as horimetro,
  v.combustivel,
  v.objetos,
  v.observacoes,
  v.sem_avarias,
  v.assinatura_id,
  v.assinatura_caminho,
  v.assinado_por_nome,
  v.sem_assinatura_motivo,
  v.concluida_em,
  v.concluida_por,
  private.nome_membro(v.concluida_por)      as concluida_por_nome,
  v.hash_conteudo,
  v.anulada_em,
  v.anulada_por,
  private.nome_membro(v.anulada_por)        as anulada_por_nome,
  v.motivo_anulacao,
  v.criado_por,
  private.nome_membro(v.criado_por)         as criado_por_nome,
  v.criado_em,
  v.atualizado_em,
  (select count(*)::integer from public.vistoria_itens i where i.vistoria_id = v.id)                              as itens_total,
  (select count(*)::integer from public.vistoria_itens i where i.vistoria_id = v.id and i.situacao is not null)   as itens_marcados,
  (select count(*)::integer from public.vistoria_itens i where i.vistoria_id = v.id and i.situacao = 'com_problema') as itens_com_problema,
  (select count(*)::integer from public.vistoria_avarias a where a.vistoria_id = v.id)                            as qtd_avarias,
  (select count(*)::integer from public.vistoria_fotos f
    where f.vistoria_id = v.id and f.complemento_id is null and f.enviada_em is not null)                        as qtd_fotos,
  (select count(*)::integer from public.vistoria_fotos f
    where f.vistoria_id = v.id and f.complemento_id is null and f.enviada_em is null)                            as fotos_pendentes,
  (select count(*)::integer from public.vistoria_complementos c where c.vistoria_id = v.id)                       as qtd_complementos,
  private.posso_editar_vistoria(v)          as pode_editar,
  private.posso_complementar_vistoria(v)    as pode_complementar,
  (private.meu_papel() = 'dono' and v.status <> 'anulada') as pode_anular
from public.vistorias v
join public.ordens_servico o on o.id = v.os_id
join public.veiculos ve      on ve.id = v.veiculo_id;

-- Todas as fotos (inclusive pendentes, para a tela mostrar "falta enviar" e
-- deixar descartar). A galeria filtra enviada_em is not null.
create view public.vw_vistoria_fotos
with (security_invoker = true)
as
select
  f.id,
  f.oficina_id,
  f.os_id,
  f.vistoria_id,
  f.tipo,
  f.avaria_id,
  f.complemento_id,
  f.legenda,
  f.largura,
  f.altura,
  f.tamanho_bytes,
  f.caminho,
  f.caminho_miniatura,
  f.criado_por,
  private.nome_membro(f.criado_por)  as criado_por_nome,
  f.criado_em,
  f.enviada_em,
  private.foto_vistoria_apagavel(f)  as pode_apagar
from public.vistoria_fotos f;

create view public.vw_vistoria_complementos
with (security_invoker = true)
as
select
  c.id,
  c.oficina_id,
  c.vistoria_id,
  c.texto,
  c.criado_por,
  private.nome_membro(c.criado_por) as criado_por_nome,
  c.criado_em,
  (select count(*)::integer from public.vistoria_fotos f
    where f.complemento_id = c.id and f.enviada_em is not null) as qtd_fotos
from public.vistoria_complementos c;

revoke all on table public.vw_vistorias, public.vw_vistoria_fotos, public.vw_vistoria_complementos from anon, authenticated;
grant select on public.vw_vistorias, public.vw_vistoria_fotos, public.vw_vistoria_complementos to authenticated;

-- -----------------------------------------------------------------------------
-- 14) vw_os: mesma definicao da migracao 07 + 2 colunas no FIM (o app nao quebra):
--     vistoria_entrada_id / vistoria_entrada_status (NULL = "Sem vistoria").
-- -----------------------------------------------------------------------------
create or replace view public.vw_os
with (security_invoker = true)
as
select
  o.id,
  o.oficina_id,
  o.numero,
  o.modo,
  o.status,
  o.cliente_id,
  private.nome_cliente(o.cliente_id)  as cliente_nome,
  c.telefone                          as cliente_telefone,
  o.veiculo_id,
  v.placa,
  v.tipo                              as veiculo_tipo,
  v.marca                             as veiculo_marca,
  v.modelo                            as veiculo_modelo,
  v.ano_modelo                        as veiculo_ano_modelo,
  o.mecanico_id,
  private.nome_membro(o.mecanico_id)  as mecanico_nome,
  o.km,
  o.horimetro,
  o.sintoma_relatado,
  oc.observacoes,
  o.codigo_falha,
  o.causa_encontrada,
  o.solucao_aplicada,
  o.autorizado_em,
  oc.autorizado_por_nome,
  oc.autorizado_por_telefone,
  private.nome_membro(oc.autorizacao_registrada_por)         as autorizacao_registrada_por_nome,
  o.orcamento_enviado_em,
  o.orcamento_aprovado_em,
  oc.orcamento_aprovacao_canal,
  oc.orcamento_aprovado_por_nome,
  private.nome_membro(oc.orcamento_aprovacao_registrada_por) as orcamento_aprovacao_registrada_por_nome,
  oc.valor_aprovado_centavos,
  oc.forma_pagamento,
  oc.pago_em,
  private.nome_membro(oc.pagamento_registrado_por)           as pagamento_registrado_por_nome,
  o.iniciado_em,
  o.pronta_em,
  o.entregue_em,
  o.cancelado_em,
  private.nome_membro(o.cancelado_por) as cancelado_por_nome,
  coalesce(oc.motivo_cancelamento_texto, o.motivo_cancelamento) as motivo_cancelamento,
  o.criado_por,
  private.nome_membro(o.criado_por)   as criado_por_nome,
  o.criado_em,
  o.atualizado_em,
  t.total_servicos_centavos,
  t.total_pecas_centavos,
  t.total_centavos,
  t.custo_total_centavos,
  t.qtd_itens,
  t.itens_sem_preco,
  t.itens_mecanico,
  t.itens_apos_aprovacao,
  (select count(*)::integer from public.os_fotos f
    where f.os_id = o.id and f.enviada_em is not null) as qtd_fotos,
  -- Fase 4
  vi.id                               as vistoria_entrada_id,
  vi.status                           as vistoria_entrada_status
from public.ordens_servico o
join public.veiculos v           on v.id = o.veiculo_id
left join public.clientes c      on c.id = o.cliente_id
left join public.os_comercial oc on oc.os_id = o.id
left join lateral (
  select tt.* from public.vw_os_totais tt where tt.os_id = o.id
) t on true
left join lateral (
  select x.id, x.status from public.vistorias x
   where x.os_id = o.id and x.tipo = 'entrada' and x.status <> 'anulada'
   limit 1
) vi on true;
