-- =============================================================================
-- MechaFlow - F8-B2 - "Primeiros passos" do /inicio (DESIGN 15.4, ARQUITETURA 15.15)
--
-- O que entra:
--   * oficinas.primeiros_passos_dispensado_em (timestamptz, null = nao dispensado).
--     Por OFICINA (nao por perfil): o dono usa celular e computador e o cartao
--     nao pode voltar no outro aparelho (DESIGN 15.4.3).
--     Protecao: o GRANT de UPDATE em oficinas e por coluna (fase1_rls:
--     nome, documento, telefone, logo_path, vistoria_obrigatoria). Coluna nova
--     NAO entra nessa lista => UPDATE direto do app da 42501. So as RPCs abaixo
--     (SECURITY DEFINER) gravam nela. Leitura segue o SELECT da tabela (membro
--     da oficina), sem dado sensivel.
--   * public.primeiros_passos()                      -> jsonb com os 4 passos + dispensado
--   * public.dispensar_primeiros_passos()            -> void, idempotente
--   * public.desfazer_dispensar_primeiros_passos()   -> void, idempotente
--   As tres: so DONO ativo; outros papeis / sem oficina => 'acesso_negado' 42501;
--   sem login => 'nao_autenticado' 28000 (private.exigir_usuario); anon sem EXECUTE.
--
-- Regras de "feito" (DESIGN 15.4.1), tudo calculado dos dados, com EXISTS
-- (para no 1o registro; usa os indices que comecam por oficina_id):
--   1 dados_oficina : oficinas.telefone preenchido
--   2 equipe        : >= 1 convite criado (qualquer estado) OU > 1 perfil ativo
--   3 catalogo      : >= 1 servico ativo OU >= 1 peca ativa
--   4 primeira_os   : >= 1 OS na oficina, em qualquer status (inclusive cancelada)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Coluna
-- -----------------------------------------------------------------------------
alter table public.oficinas
  add column if not exists primeiros_passos_dispensado_em timestamptz;

comment on column public.oficinas.primeiros_passos_dispensado_em is
  'Quando o dono dispensou o cartao "Primeiros passos" (null = nao dispensado). Gravada so pelas RPCs dispensar_primeiros_passos / desfazer_dispensar_primeiros_passos.';

-- Reforco explicito: nenhum papel do app grava a coluna direto. (O UPDATE de
-- authenticated ja e por coluna e nao a inclui; isto so documenta e garante.)
revoke update (primeiros_passos_dispensado_em) on public.oficinas from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Interna: devolve a oficina do dono que chama, ou 42501.
-- -----------------------------------------------------------------------------
create or replace function private.exigir_dono()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_oficina uuid;
begin
  perform private.exigir_usuario();
  v_oficina := private.minha_oficina_id();
  if v_oficina is null or private.meu_papel() is distinct from 'dono' then
    raise exception 'acesso_negado' using errcode = '42501';
  end if;
  return v_oficina;
end;
$$;

revoke all on function private.exigir_dono() from public, anon;
grant execute on function private.exigir_dono() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- primeiros_passos(): leitura do cartao (so dono)
-- -----------------------------------------------------------------------------
create or replace function public.primeiros_passos()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_oficina uuid := private.exigir_dono();
begin
  return (
    select jsonb_build_object(
      'dados_oficina', nullif(btrim(coalesce(f.telefone, '')), '') is not null,
      'equipe',
           exists (select 1 from public.convites c where c.oficina_id = v_oficina)
        or (select count(*) from (select 1 from public.perfis p
                                   where p.oficina_id = v_oficina and p.ativo
                                   limit 2) s) > 1,
      'catalogo',
           exists (select 1 from public.catalogo_servicos s where s.oficina_id = v_oficina and s.ativo)
        or exists (select 1 from public.catalogo_pecas pc where pc.oficina_id = v_oficina and pc.ativo),
      'primeira_os',
           exists (select 1 from public.ordens_servico o where o.oficina_id = v_oficina),
      'dispensado', f.primeiros_passos_dispensado_em is not null
    )
    from public.oficinas f
    where f.id = v_oficina
  );
end;
$$;

comment on function public.primeiros_passos() is
  'Cartao Primeiros passos (DESIGN 15.4): {dados_oficina, equipe, catalogo, primeira_os, dispensado}, todos boolean. So dono; outros 42501.';

-- -----------------------------------------------------------------------------
-- dispensar_primeiros_passos(): grava a data na 1a vez; repetir nao muda nada
-- -----------------------------------------------------------------------------
create or replace function public.dispensar_primeiros_passos()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_oficina uuid := private.exigir_dono();
begin
  update public.oficinas f
     set primeiros_passos_dispensado_em = now()
   where f.id = v_oficina
     and f.primeiros_passos_dispensado_em is null;   -- idempotente; nao mexe em atualizado_em a toa
end;
$$;

-- -----------------------------------------------------------------------------
-- desfazer_dispensar_primeiros_passos(): limpa a coluna; repetir nao muda nada
-- -----------------------------------------------------------------------------
create or replace function public.desfazer_dispensar_primeiros_passos()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_oficina uuid := private.exigir_dono();
begin
  update public.oficinas f
     set primeiros_passos_dispensado_em = null
   where f.id = v_oficina
     and f.primeiros_passos_dispensado_em is not null;
end;
$$;

-- -----------------------------------------------------------------------------
-- Grants (o Supabase da EXECUTE a anon por padrao em funcao nova do public)
-- -----------------------------------------------------------------------------
revoke all on function public.primeiros_passos() from public, anon;
revoke all on function public.dispensar_primeiros_passos() from public, anon;
revoke all on function public.desfazer_dispensar_primeiros_passos() from public, anon;

grant execute on function public.primeiros_passos() to authenticated;
grant execute on function public.dispensar_primeiros_passos() to authenticated;
grant execute on function public.desfazer_dispensar_primeiros_passos() to authenticated;
