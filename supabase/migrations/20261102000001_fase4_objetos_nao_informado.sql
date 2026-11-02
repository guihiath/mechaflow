-- =============================================================================
-- MechaFlow - Fase 4 - objetos da vistoria: "nao informado" (F4-B9, REVISAO-FASE4 C1)
--
-- Antes, vistorias.objetos nascia '{}', que a tela le como "Nenhum objeto": o
-- motorista assinava essa afirmacao mesmo sem ninguem ter olhado a cabine.
-- Agora:
--   NULL  = nao informado (padrao de toda vistoria nova)
--   '{}'  = "Nenhum objeto" escolhido de proposito
--   lista = os objetos
--
-- Concluir aceita NULL: objetos nao entram no "Para concluir, falta" do DESIGN
-- 12.8, que preve "Nao informado." no resumo. O hash fica consistente sem mudar
-- nada: conteudo_vistoria usa to_jsonb(v.objetos), que grava null para NULL e []
-- para '{}'; vistorias ja concluidas continuam '{}' e o hash delas nao muda.
--
-- Concluidas e anuladas NAO mudam: o UPDATE abaixo so pega status = 'rascunho' e
-- os triggers de imutabilidade continuam ligados.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Coluna: aceita NULL e nasce NULL
-- -----------------------------------------------------------------------------
alter table public.vistorias
  alter column objetos drop not null,
  alter column objetos drop default;

comment on column public.vistorias.objetos is
  'NULL = nao informado; ''{}'' = "Nenhum objeto" escolhido; lista = objetos deixados no veiculo.';

-- -----------------------------------------------------------------------------
-- 2) Normalizacao: nao transforma mais NULL em '{}'.
--    Precisa vir ANTES do UPDATE do passo 3: o trigger antigo devolvia '{}'.
--    Lista so com textos em branco nao e escolha de ninguem: vira NULL.
-- -----------------------------------------------------------------------------
create or replace function private.tg_vistorias_normalizar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.observacoes       := nullif(btrim(new.observacoes), '');
  new.assinado_por_nome := nullif(btrim(regexp_replace(new.assinado_por_nome, '\s+', ' ', 'g')), '');
  new.motivo_anulacao   := nullif(btrim(new.motivo_anulacao), '');
  -- objetos: sem vazios, sem espacos nas pontas, sem repetidos, ate 60 letras cada.
  -- NULL e '{}' passam direto (nao informado / "Nenhum objeto").
  if cardinality(new.objetos) > 0 then
    new.objetos := (
      select array_agg(x.o order by x.primeira)
        from (select left(btrim(t.o), 60) as o, min(t.n) as primeira
                from unnest(new.objetos) with ordinality as t(o, n)
               where nullif(btrim(t.o), '') is not null
               group by left(btrim(t.o), 60)) x
    );
  end if;
  return new;
end;
$$;
revoke all on function private.tg_vistorias_normalizar() from public;

-- -----------------------------------------------------------------------------
-- 3) Rascunhos existentes: o '{}' veio do padrao antigo, nao de uma escolha
--    garantida. Concluidas e anuladas ficam como estao.
-- -----------------------------------------------------------------------------
update public.vistorias
   set objetos = null
 where status = 'rascunho'
   and cardinality(objetos) = 0;

-- -----------------------------------------------------------------------------
-- 4) salvar_vistoria ganha p_limpar_objetos.
--    p_objetos NULL continua significando "nao muda" (cada parte da tela salva
--    separada); voltar a "nao informado" e pedido explicito com p_limpar_objetos
--    = true, que vence p_objetos. Assinatura nova: a antiga sai para nao existirem
--    duas versoes (o PostgREST recusaria a chamada por ambiguidade).
-- -----------------------------------------------------------------------------
drop function public.salvar_vistoria(uuid, integer, integer, public.nivel_combustivel, text[], text, boolean, text);

create function public.salvar_vistoria(
  p_vistoria_id  uuid,
  p_km           integer default null,
  p_horimetro    integer default null,
  p_combustivel  public.nivel_combustivel default null,
  p_objetos      text[] default null,
  p_observacoes  text default null,
  p_sem_avarias  boolean default null,
  p_assinado_por_nome text default null,
  p_limpar_objetos boolean default false
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
         objetos     = case when coalesce(p_limpar_objetos, false) then null
                            else coalesce(p_objetos, x.objetos) end,
         observacoes = case when p_observacoes is null then x.observacoes else left(p_observacoes, 2000) end,
         sem_avarias = coalesce(p_sem_avarias, x.sem_avarias),
         assinado_por_nome = case when p_assinado_por_nome is null then x.assinado_por_nome
                                  when char_length(btrim(p_assinado_por_nome)) < 2 then null
                                  else p_assinado_por_nome end
   where x.id = v.id;
end;
$$;

revoke all on function public.salvar_vistoria(uuid, integer, integer, public.nivel_combustivel, text[], text, boolean, text, boolean) from public, anon;
grant execute on function public.salvar_vistoria(uuid, integer, integer, public.nivel_combustivel, text[], text, boolean, text, boolean) to authenticated;

-- A API (PostgREST) enxerga a assinatura nova sem esperar o proximo recarregamento.
notify pgrst, 'reload schema';
