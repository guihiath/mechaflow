-- =============================================================================
-- MechaFlow - Fase 3 - 06 fotos da OS + bucket privado + politicas de Storage (F3-A2)
--
-- Fluxo de envio (o navegador gera o id da foto com crypto.randomUUID() e o
-- guarda na fila do aparelho - IndexedDB - junto com o arquivo):
--   1. rpc('registrar_foto', { p_id, p_os_id, p_categoria, ... })
--        -> confere papel/OS/status/limite de 40 e devolve os caminhos
--           <oficina_id>/<os_id>/<id>.jpg e <oficina_id>/<os_id>/<id>_mini.jpg
--        (idempotente: o mesmo p_id devolve o mesmo registro)
--   2. storage.from('os-fotos').upload(caminho_miniatura) e upload(caminho)
--        com upsert: false. A politica de INSERT so aceita um caminho que
--        tenha registro PENDENTE criado pela MESMA pessoa: ninguem sobe arquivo
--        fora de um registro, nem em pasta de outra OS/oficina.
--        Reenvio que da "ja existe" (409) = o arquivo chegou: segue para o 3.
--   3. rpc('confirmar_foto', { p_id }) -> confere que os 2 arquivos estao no
--        bucket e marca enviada_em. So foto enviada aparece na galeria.
-- Editar categoria/legenda: rpc('editar_foto') (mesma regra de apagar, so foto enviada).
-- Apagar: storage.remove([caminho, caminho_miniatura]) e depois
--   rpc('apagar_foto', { p_id }) (a politica de DELETE do Storage usa a mesma
--   regra da RPC; os dois passos sao idempotentes).
--
-- Bucket 'os-fotos': PRIVADO, 5 MB, so image/jpeg. Leitura so por URL
-- assinada (createSignedUrl / createSignedUrls), que exige a politica de
-- SELECT abaixo no momento de gerar.
--
-- Regras (CONTEXTO "Escopo da Fase 3" + PLANO 16.6):
--   * ve: quem ve a OS (mecanico: as dele; com ve_todas_os, todas);
--   * envia: dono/atendente em qualquer OS da oficina (inclusive entregue e
--     cancelada); mecanico so na OS atribuida a ele e com a OS aberta;
--   * apaga: OS aberta -> dono/atendente qualquer foto, mecanico so as que ele
--     enviou; OS entregue/cancelada -> so o dono. Apagar apaga de vez.
--   * limite provisorio: 40 fotos por OS (registro pendente ha mais de 24 h
--     sem envio nao conta).
--
-- Precisa do schema storage do Supabase (no PGlite: copia minima no teste).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Tipo e tabela
-- -----------------------------------------------------------------------------
create type public.categoria_foto as enum (
  'diagnostico', 'peca_defeituosa', 'peca_trocada', 'antes', 'depois', 'entrega', 'outro'
);

create table public.os_fotos (
  id                       uuid primary key,          -- gerado no navegador (chave de idempotencia)
  oficina_id               uuid not null references public.oficinas (id) on delete restrict,
  os_id                    uuid not null,
  categoria                public.categoria_foto not null default 'outro',
  legenda                  text check (char_length(legenda) <= 200),
  largura                  integer not null check (largura between 1 and 10000),
  altura                   integer not null check (altura between 1 and 10000),
  tamanho_bytes            integer not null check (tamanho_bytes between 1 and 5242880),
  tamanho_miniatura_bytes  integer not null check (tamanho_miniatura_bytes between 1 and 5242880),
  -- caminhos calculados pelo banco (ninguem escolhe a pasta)
  caminho                  text generated always as
                             (oficina_id::text || '/' || os_id::text || '/' || id::text || '.jpg') stored,
  caminho_miniatura        text generated always as
                             (oficina_id::text || '/' || os_id::text || '/' || id::text || '_mini.jpg') stored,
  criado_por               uuid default auth.uid() references auth.users (id) on delete set null,
  criado_em                timestamptz not null default now(),
  enviada_em               timestamptz,               -- NULL = pendente (arquivo ainda nao confirmado)
  constraint os_fotos_os_fk foreign key (os_id, oficina_id)
    references public.ordens_servico (id, oficina_id) on delete cascade,
  constraint os_fotos_caminho_uk unique (caminho),
  constraint os_fotos_caminho_mini_uk unique (caminho_miniatura)
);
alter table public.os_fotos enable row level security;
create index os_fotos_os_idx on public.os_fotos (os_id, criado_em);
create index os_fotos_oficina_idx on public.os_fotos (oficina_id);
comment on table public.os_fotos is
  'Fotos da OS (arquivo no bucket privado os-fotos). Escrita so pelas RPCs registrar_foto / confirmar_foto / editar_foto / apagar_foto.';

-- Leitura: fotos das OS que eu enxergo. Escrita: so RPC.
revoke all on table public.os_fotos from anon, authenticated;
grant select on public.os_fotos to authenticated;

create policy os_fotos_select on public.os_fotos
  for select to authenticated
  using (
    oficina_id = (select private.minha_oficina_id())
    and os_id in (select o.id from public.ordens_servico o)
  );

-- -----------------------------------------------------------------------------
-- 2) Regras (usadas pelas RPCs E pelas politicas do Storage)
--    DEFINER: leem a OS e a foto sem depender da RLS de quem chama, mas
--    sempre filtrando pela oficina e pelo papel de quem esta logado.
-- -----------------------------------------------------------------------------

-- Posso apagar esta foto?
create or replace function private.foto_apagavel(p_foto public.os_fotos)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
             when o.status in ('entregue', 'cancelada') then private.meu_papel() = 'dono'
             when private.meu_papel() in ('dono', 'atendente') then true
             when private.meu_papel() = 'mecanico' then p_foto.criado_por = auth.uid()
             else false
           end
      from public.ordens_servico o
     where o.id = p_foto.os_id
       and o.oficina_id = private.minha_oficina_id()
       and p_foto.oficina_id = o.oficina_id
       and (private.vejo_todas_os() or o.mecanico_id = auth.uid())
  ), false)
$$;

-- Storage SELECT (baixar, listar, gerar URL assinada): o arquivo e de uma foto
-- registrada de OS que eu vejo.
create or replace function private.pode_ver_foto(p_nome text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.os_fotos f
      join public.ordens_servico o on o.id = f.os_id
     where (f.caminho = p_nome or f.caminho_miniatura = p_nome)
       and f.oficina_id = private.minha_oficina_id()
       and o.oficina_id = f.oficina_id
       and (private.vejo_todas_os() or o.mecanico_id = auth.uid())
  )
$$;

-- Storage INSERT: o caminho e de um registro PENDENTE que EU criei, na minha oficina.
create or replace function private.pode_subir_foto(p_nome text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.os_fotos f
     where (f.caminho = p_nome or f.caminho_miniatura = p_nome)
       and f.oficina_id = private.minha_oficina_id()
       and f.criado_por = auth.uid()
       and f.enviada_em is null
  )
$$;

-- Storage DELETE: mesma regra da RPC apagar_foto.
create or replace function private.pode_apagar_foto(p_nome text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select private.foto_apagavel(f)
      from public.os_fotos f
     where (f.caminho = p_nome or f.caminho_miniatura = p_nome)
       and f.oficina_id = private.minha_oficina_id()
  ), false)
$$;

revoke all on function private.foto_apagavel(public.os_fotos) from public;
revoke all on function private.pode_ver_foto(text) from public;
revoke all on function private.pode_subir_foto(text) from public;
revoke all on function private.pode_apagar_foto(text) from public;
grant execute on function private.foto_apagavel(public.os_fotos) to authenticated, service_role;
grant execute on function private.pode_ver_foto(text) to authenticated, service_role;
grant execute on function private.pode_subir_foto(text) to authenticated, service_role;
grant execute on function private.pode_apagar_foto(text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3) RPCs
-- -----------------------------------------------------------------------------

-- Registra a foto ANTES do envio do arquivo. Idempotente por p_id.
create or replace function public.registrar_foto(
  p_id                      uuid,
  p_os_id                   uuid,
  p_largura                 integer,
  p_altura                  integer,
  p_tamanho_bytes           integer,
  p_tamanho_miniatura_bytes integer,
  p_categoria               public.categoria_foto default 'outro',
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
  v_os    public.ordens_servico;
  v_foto  public.os_fotos;
begin
  v_papel := private.exigir_papel(array['dono', 'atendente', 'mecanico']::public.papel_usuario[]);
  if p_id is null then
    raise exception 'chave_obrigatoria';
  end if;

  -- trava a OS: serializa registros simultaneos (limite de 40 exato)
  v_os := private.travar_os(p_os_id);

  select f.* into v_foto from public.os_fotos f where f.id = p_id;
  if found then
    if v_foto.os_id <> v_os.id then
      raise exception 'foto_invalida';
    end if;
    return query select v_foto.id, v_foto.caminho, v_foto.caminho_miniatura, v_foto.enviada_em is not null, true;
    return;
  end if;

  if v_papel = 'mecanico' then
    if v_os.mecanico_id is distinct from auth.uid() then
      raise exception 'acesso_negado' using errcode = '42501';
    end if;
    if v_os.status in ('entregue', 'cancelada') then
      raise exception 'os_fechada';
    end if;
  end if;

  if p_largura is null or p_altura is null or p_largura not between 1 and 10000 or p_altura not between 1 and 10000
     or p_tamanho_bytes is null or p_tamanho_bytes < 1
     or p_tamanho_miniatura_bytes is null or p_tamanho_miniatura_bytes < 1 then
    raise exception 'foto_invalida';
  end if;
  if p_tamanho_bytes > 5242880 or p_tamanho_miniatura_bytes > 5242880 then
    raise exception 'foto_grande_demais';
  end if;

  if (select count(*) from public.os_fotos f
       where f.os_id = v_os.id
         and (f.enviada_em is not null or f.criado_em > now() - interval '24 hours')) >= 40 then
    raise exception 'limite_fotos';
  end if;

  insert into public.os_fotos (id, oficina_id, os_id, categoria, legenda, largura, altura,
                               tamanho_bytes, tamanho_miniatura_bytes, criado_por)
  values (p_id, v_os.oficina_id, v_os.id, coalesce(p_categoria, 'outro'),
          left(nullif(btrim(p_legenda), ''), 200), p_largura, p_altura,
          p_tamanho_bytes, p_tamanho_miniatura_bytes, auth.uid())
  returning * into v_foto;

  return query select v_foto.id, v_foto.caminho, v_foto.caminho_miniatura, false, false;
end;
$$;

-- Depois de subir os 2 arquivos: confere que estao no bucket e marca enviada.
-- Idempotente (foto ja enviada: nao faz nada).
create or replace function public.confirmar_foto(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_foto     public.os_fotos;
  v_tamanho  bigint;
  v_n        bigint;
begin
  perform private.exigir_papel(array['dono', 'atendente', 'mecanico']::public.papel_usuario[]);

  select f.* into v_foto
    from public.os_fotos f
   where f.id = p_id and f.oficina_id = private.minha_oficina_id();
  if not found then
    raise exception 'foto_nao_encontrada';
  end if;
  perform private.travar_os(v_foto.os_id);   -- tambem confere que eu vejo a OS
  if v_foto.enviada_em is not null then
    return;
  end if;
  if v_foto.criado_por is distinct from auth.uid() then
    raise exception 'acesso_negado' using errcode = '42501';
  end if;

  select count(*), max(case when s.name = v_foto.caminho then (s.metadata ->> 'size')::bigint end)
    into v_n, v_tamanho
    from storage.objects s
   where s.bucket_id = 'os-fotos'
     and s.name in (v_foto.caminho, v_foto.caminho_miniatura);
  if v_n < 2 then
    raise exception 'foto_nao_enviada';
  end if;
  -- registro pendente antigo (mais de 24 h) nao contou no limite: confere de novo
  if (select count(*) from public.os_fotos f
       where f.os_id = v_foto.os_id and f.enviada_em is not null) >= 40 then
    raise exception 'limite_fotos';
  end if;

  update public.os_fotos f
     set enviada_em    = now(),
         -- tamanho real informado pelo Storage, quando houver
         tamanho_bytes = coalesce(least(v_tamanho, 5242880)::integer, f.tamanho_bytes)
   where f.id = v_foto.id;
end;
$$;

-- Apaga o registro (o app apaga os arquivos no Storage ANTES; ver topo).
-- true = apagou; false = ja nao existia (reenvio).
create or replace function public.apagar_foto(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_foto public.os_fotos;
begin
  perform private.exigir_papel(array['dono', 'atendente', 'mecanico']::public.papel_usuario[]);

  select f.* into v_foto
    from public.os_fotos f
   where f.id = p_id and f.oficina_id = private.minha_oficina_id();
  if not found then
    return false;
  end if;
  perform private.travar_os(v_foto.os_id);   -- os_nao_encontrada se eu nao vejo a OS

  if not private.foto_apagavel(v_foto) then
    raise exception 'foto_nao_pode_apagar';
  end if;

  delete from public.os_fotos f where f.id = v_foto.id;
  return true;
end;
$$;

-- Edita categoria e/ou legenda de uma foto ENVIADA, com a mesma regra de apagar
-- (private.foto_apagavel). NULL = nao muda; legenda '' = apaga a legenda.
-- Idempotente (mandar os mesmos valores de novo nao faz nada de errado).
create or replace function public.editar_foto(
  p_id        uuid,
  p_categoria public.categoria_foto default null,
  p_legenda   text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_foto public.os_fotos;
begin
  perform private.exigir_papel(array['dono', 'atendente', 'mecanico']::public.papel_usuario[]);

  select f.* into v_foto
    from public.os_fotos f
   where f.id = p_id
     and f.oficina_id = private.minha_oficina_id()
     and f.enviada_em is not null;
  if not found then
    raise exception 'foto_nao_encontrada';
  end if;
  perform private.travar_os(v_foto.os_id);   -- os_nao_encontrada se eu nao vejo a OS

  if not private.foto_apagavel(v_foto) then
    raise exception 'foto_nao_pode_editar';
  end if;

  update public.os_fotos f
     set categoria = coalesce(p_categoria, f.categoria),
         legenda   = case when p_legenda is null then f.legenda
                          else left(nullif(btrim(p_legenda), ''), 200) end
   where f.id = v_foto.id;
end;
$$;

revoke all on function public.editar_foto(uuid, public.categoria_foto, text) from public, anon;
grant execute on function public.editar_foto(uuid, public.categoria_foto, text) to authenticated;

revoke all on function public.registrar_foto(uuid, uuid, integer, integer, integer, integer, public.categoria_foto, text) from public, anon;
revoke all on function public.confirmar_foto(uuid) from public, anon;
revoke all on function public.apagar_foto(uuid) from public, anon;
grant execute on function public.registrar_foto(uuid, uuid, integer, integer, integer, integer, public.categoria_foto, text) to authenticated;
grant execute on function public.confirmar_foto(uuid) to authenticated;
grant execute on function public.apagar_foto(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 4) View para a galeria (so fotos enviadas; nome de quem enviou e se EU posso apagar)
-- -----------------------------------------------------------------------------
create view public.vw_os_fotos
with (security_invoker = true)
as
select
  f.id,
  f.oficina_id,
  f.os_id,
  f.categoria,
  f.legenda,
  f.largura,
  f.altura,
  f.tamanho_bytes,
  f.caminho,
  f.caminho_miniatura,
  f.criado_por,
  private.nome_membro(f.criado_por) as criado_por_nome,
  f.criado_em,
  f.enviada_em,
  private.foto_apagavel(f)          as pode_apagar
from public.os_fotos f
where f.enviada_em is not null;

revoke all on table public.vw_os_fotos from anon, authenticated;
grant select on public.vw_os_fotos to authenticated;

-- -----------------------------------------------------------------------------
-- 5) Bucket privado + politicas de storage.objects
--    (o Supabase ja liga a RLS em storage.objects; nao mexer na tabela)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('os-fotos', 'os-fotos', false, 5242880, array['image/jpeg'])
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- O prefixo "<minha oficina>/" vem primeiro: corta barato as pastas das outras
-- oficinas (o "(select ...)" e calculado uma vez por consulta).
create policy os_fotos_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'os-fotos'
    and name like (select private.minha_oficina_id())::text || '/%'
    and private.pode_ver_foto(name)
  );

create policy os_fotos_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'os-fotos'
    and name like (select private.minha_oficina_id())::text || '/%'
    and private.pode_subir_foto(name)
  );

create policy os_fotos_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'os-fotos'
    and name like (select private.minha_oficina_id())::text || '/%'
    and private.pode_apagar_foto(name)
  );

-- Sem politica de UPDATE: ninguem sobrescreve nem move arquivo (upsert: false).
-- anon: nenhuma politica => nao le, nao lista, nao sobe, nao apaga.
