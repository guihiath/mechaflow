-- =============================================================================
-- MechaFlow - Fase 1 - 04 RPCs
-- Tudo que mexe em "quem e de qual oficina e com qual papel" passa por aqui.
-- SECURITY DEFINER + search_path = '' + nomes qualificados.
--
-- Erros: a mensagem e um codigo estavel (ex.: 'convite_usado'); o app traduz
-- para pt-BR. Lista completa em docs/ARQUITETURA.md.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Internas
-- -----------------------------------------------------------------------------

-- Exige usuario logado e nao anonimo; devolve o auth.uid().
create or replace function private.exigir_usuario()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null
     or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'nao_autenticado' using errcode = '28000';
  end if;
  return v_uid;
end;
$$;

-- Grava o aceite dos termos (ip/user-agent por melhor esforco).
create or replace function private.registrar_aceite(
  p_usuario_id uuid,
  p_oficina_id uuid,
  p_versao     text,
  p_autoriza   boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_headers jsonb;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_headers := null;
  end;

  insert into public.termos_aceite (oficina_id, usuario_id, versao, autoriza_uso_anonimizado, ip, user_agent)
  values (
    p_oficina_id,
    p_usuario_id,
    p_versao,
    coalesce(p_autoriza, false),
    nullif(left(btrim(split_part(coalesce(v_headers ->> 'cf-connecting-ip', v_headers ->> 'x-forwarded-for', ''), ',', 1)), 64), ''),
    left(v_headers ->> 'user-agent', 500)
  )
  on conflict (usuario_id, versao) do nothing;
end;
$$;

revoke all on function private.exigir_usuario() from public;
revoke all on function private.registrar_aceite(uuid, uuid, text, boolean) from public;

-- -----------------------------------------------------------------------------
-- criar_oficina: cadastro self-service. Quem chama vira DONO da nova oficina.
-- -----------------------------------------------------------------------------
create or replace function public.criar_oficina(
  p_nome_oficina             text,
  p_nome_dono                text,
  p_versao_termos            text,
  p_autoriza_uso_anonimizado boolean default true,
  p_telefone                 text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := private.exigir_usuario();
  v_oficina uuid;
begin
  if exists (select 1 from public.perfis p where p.id = v_uid) then
    raise exception 'usuario_ja_tem_oficina';
  end if;
  if p_versao_termos is distinct from private.versao_termos_vigente() then
    raise exception 'termos_desatualizados';
  end if;
  if char_length(btrim(coalesce(p_nome_oficina, ''))) < 2 then
    raise exception 'nome_oficina_obrigatorio';
  end if;
  if char_length(btrim(coalesce(p_nome_dono, ''))) < 2 then
    raise exception 'nome_obrigatorio';
  end if;

  insert into public.oficinas (nome, telefone, criado_por)
  values (p_nome_oficina, p_telefone, v_uid)
  returning id into v_oficina;

  insert into public.perfis (id, oficina_id, nome, email, telefone, papel)
  values (v_uid, v_oficina, p_nome_dono, auth.jwt() ->> 'email', p_telefone, 'dono');

  perform private.registrar_aceite(v_uid, v_oficina, p_versao_termos, p_autoriza_uso_anonimizado);

  return v_oficina;
end;
$$;

-- -----------------------------------------------------------------------------
-- criar_convite: dono gera link de uso unico. O token so aparece AQUI.
-- -----------------------------------------------------------------------------
create or replace function public.criar_convite(
  p_papel          public.papel_usuario,
  p_nome_sugerido  text default null,
  p_validade_horas integer default 72
)
returns table (convite_id uuid, token text, expira_em timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid     uuid := private.exigir_usuario();
  v_oficina uuid := private.minha_oficina_id();
  v_token   text;
  v_id      uuid;
  v_expira  timestamptz;
begin
  if v_oficina is null or private.meu_papel() is distinct from 'dono' then
    raise exception 'acesso_negado' using errcode = '42501';
  end if;
  if p_papel is null or p_papel = 'dono' then
    raise exception 'papel_invalido';
  end if;
  if p_validade_horas is null or p_validade_horas not between 1 and 168 then
    raise exception 'validade_invalida';
  end if;
  if (select count(*)
        from public.convites c
       where c.oficina_id = v_oficina
         and c.usado_em is null
         and c.revogado_em is null
         and c.expira_em > now()) >= 20 then
    raise exception 'limite_convites';
  end if;

  -- 64 caracteres hex, ~244 bits aleatorios (gen_random_uuid usa gerador forte).
  v_token  := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_expira := now() + make_interval(hours => p_validade_horas);

  insert into public.convites (oficina_id, token_hash, papel, nome_sugerido, criado_por, expira_em)
  values (v_oficina, sha256(convert_to(v_token, 'UTF8')), p_papel,
          nullif(btrim(p_nome_sugerido), ''), v_uid, v_expira)
  returning id into v_id;

  convite_id := v_id;
  token      := v_token;
  expira_em  := v_expira;
  return next;
end;
$$;

-- -----------------------------------------------------------------------------
-- ver_convite: pagina publica /convite/<token> (funciona SEM login).
-- So devolve nome da oficina, papel e situacao. Nada mais.
-- -----------------------------------------------------------------------------
create or replace function public.ver_convite(p_token text)
returns table (situacao text, oficina_nome text, papel public.papel_usuario, expira_em timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_token text := lower(btrim(coalesce(p_token, '')));
  v_c     record;
begin
  if v_token !~ '^[0-9a-f]{64}$' then
    return query select 'inexistente'::text, null::text, null::public.papel_usuario, null::timestamptz;
    return;
  end if;

  select cv.papel as c_papel, cv.expira_em as c_expira, cv.usado_em as c_usado,
         cv.revogado_em as c_revogado, o.nome as c_oficina
    into v_c
    from public.convites cv
    join public.oficinas o on o.id = cv.oficina_id
   where cv.token_hash = sha256(convert_to(v_token, 'UTF8'));

  if not found then
    return query select 'inexistente'::text, null::text, null::public.papel_usuario, null::timestamptz;
    return;
  end if;

  return query select
    case
      when v_c.c_revogado is not null then 'revogado'
      when v_c.c_usado    is not null then 'usado'
      when v_c.c_expira  <= now()     then 'expirado'
      else 'valido'
    end::text,
    v_c.c_oficina::text,
    v_c.c_papel::public.papel_usuario,
    v_c.c_expira::timestamptz;
end;
$$;

-- -----------------------------------------------------------------------------
-- aceitar_convite: usuario recem-criado (sem oficina) entra na oficina do convite.
-- FOR UPDATE garante uso unico mesmo com dois cliques simultaneos.
-- -----------------------------------------------------------------------------
create or replace function public.aceitar_convite(
  p_token                    text,
  p_nome                     text,
  p_versao_termos            text,
  p_autoriza_uso_anonimizado boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := private.exigir_usuario();
  v_token text := lower(btrim(coalesce(p_token, '')));
  v_conv  public.convites%rowtype;
  v_nome  text;
begin
  if exists (select 1 from public.perfis p where p.id = v_uid) then
    raise exception 'usuario_ja_tem_oficina';
  end if;
  if p_versao_termos is distinct from private.versao_termos_vigente() then
    raise exception 'termos_desatualizados';
  end if;

  select * into v_conv
    from public.convites c
   where c.token_hash = sha256(convert_to(v_token, 'UTF8'))
   for update;

  if not found then
    raise exception 'convite_invalido';
  end if;
  if v_conv.revogado_em is not null then
    raise exception 'convite_revogado';
  end if;
  if v_conv.usado_em is not null then
    raise exception 'convite_usado';
  end if;
  if v_conv.expira_em <= now() then
    raise exception 'convite_expirado';
  end if;

  v_nome := coalesce(nullif(btrim(p_nome), ''), v_conv.nome_sugerido);
  if char_length(coalesce(v_nome, '')) < 2 then
    raise exception 'nome_obrigatorio';
  end if;

  insert into public.perfis (id, oficina_id, nome, email, papel)
  values (v_uid, v_conv.oficina_id, v_nome, auth.jwt() ->> 'email', v_conv.papel);

  update public.convites
     set usado_em = now(), usado_por = v_uid
   where id = v_conv.id;

  perform private.registrar_aceite(v_uid, v_conv.oficina_id, p_versao_termos, p_autoriza_uso_anonimizado);

  return v_conv.oficina_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- revogar_convite: dono cancela um convite ainda nao usado.
-- -----------------------------------------------------------------------------
create or replace function public.revogar_convite(p_convite_id uuid)
returns void
language plpgsql
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

  update public.convites c
     set revogado_em = now()
   where c.id = p_convite_id
     and c.oficina_id = v_oficina
     and c.usado_em is null
     and c.revogado_em is null;

  if not found then
    raise exception 'convite_nao_encontrado';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- atualizar_membro: dono muda papel / ativa-desativa / libera "ve todas as OS".
-- O dono nao altera a si mesmo (evita oficina sem dono).
-- -----------------------------------------------------------------------------
create or replace function public.atualizar_membro(
  p_perfil_id   uuid,
  p_papel       public.papel_usuario default null,
  p_ativo       boolean default null,
  p_ve_todas_os boolean default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := private.exigir_usuario();
  v_oficina uuid := private.minha_oficina_id();
begin
  if v_oficina is null or private.meu_papel() is distinct from 'dono' then
    raise exception 'acesso_negado' using errcode = '42501';
  end if;
  if p_perfil_id = v_uid then
    raise exception 'nao_pode_alterar_a_si_mesmo';
  end if;

  update public.perfis p
     set papel       = coalesce(p_papel, p.papel),
         ativo       = coalesce(p_ativo, p.ativo),
         ve_todas_os = coalesce(p_ve_todas_os, p.ve_todas_os)
   where p.id = p_perfil_id
     and p.oficina_id = v_oficina;

  if not found then
    raise exception 'membro_nao_encontrado';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- aceitar_termos: quando a versao dos termos muda, o usuario aceita de novo.
-- -----------------------------------------------------------------------------
create or replace function public.aceitar_termos(
  p_versao_termos            text,
  p_autoriza_uso_anonimizado boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := private.exigir_usuario();
  v_oficina uuid;
begin
  select p.oficina_id into v_oficina
    from public.perfis p
   where p.id = v_uid and p.ativo;

  if v_oficina is null then
    raise exception 'sem_oficina';
  end if;
  if p_versao_termos is distinct from private.versao_termos_vigente() then
    raise exception 'termos_desatualizados';
  end if;

  perform private.registrar_aceite(v_uid, v_oficina, p_versao_termos, p_autoriza_uso_anonimizado);
end;
$$;

-- -----------------------------------------------------------------------------
-- meu_contexto: 1 chamada depois do login para decidir para onde mandar o usuario.
-- SECURITY INVOKER (usa a propria RLS). Sem perfil => colunas de perfil NULL.
-- -----------------------------------------------------------------------------
create or replace function public.meu_contexto()
returns table (
  usuario_id            uuid,
  email                 text,
  perfil_nome           text,
  papel                 public.papel_usuario,
  ativo                 boolean,
  ve_todas_os           boolean,
  oficina_id            uuid,
  oficina_nome          text,
  versao_termos_vigente text,
  termos_aceitos        boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    u.uid,
    auth.jwt() ->> 'email',
    p.nome,
    p.papel,
    p.ativo,
    p.ve_todas_os,
    p.oficina_id,
    o.nome,
    private.versao_termos_vigente(),
    exists (
      select 1 from public.termos_aceite t
       where t.usuario_id = u.uid
         and t.versao = private.versao_termos_vigente()
    )
  from (select auth.uid() as uid) u
  left join public.perfis p on p.id = u.uid
  left join public.oficinas o on o.id = p.oficina_id
  where u.uid is not null
$$;

-- -----------------------------------------------------------------------------
-- Permissoes de execucao (padrao do Postgres: EXECUTE para PUBLIC => revogar)
-- -----------------------------------------------------------------------------
revoke all on function public.criar_oficina(text, text, text, boolean, text) from public, anon;
revoke all on function public.criar_convite(public.papel_usuario, text, integer) from public, anon;
revoke all on function public.ver_convite(text) from public;
revoke all on function public.aceitar_convite(text, text, text, boolean) from public, anon;
revoke all on function public.revogar_convite(uuid) from public, anon;
revoke all on function public.atualizar_membro(uuid, public.papel_usuario, boolean, boolean) from public, anon;
revoke all on function public.aceitar_termos(text, boolean) from public, anon;
revoke all on function public.meu_contexto() from public, anon;

grant execute on function public.criar_oficina(text, text, text, boolean, text) to authenticated;
grant execute on function public.criar_convite(public.papel_usuario, text, integer) to authenticated;
grant execute on function public.ver_convite(text) to anon, authenticated;
grant execute on function public.aceitar_convite(text, text, text, boolean) to authenticated;
grant execute on function public.revogar_convite(uuid) to authenticated;
grant execute on function public.atualizar_membro(uuid, public.papel_usuario, boolean, boolean) to authenticated;
grant execute on function public.aceitar_termos(text, boolean) to authenticated;
grant execute on function public.meu_contexto() to authenticated;
grant execute on function public.normalizar_placa(text) to anon, authenticated;
