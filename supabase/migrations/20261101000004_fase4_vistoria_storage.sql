-- =============================================================================
-- MechaFlow - Fase 4 - 04 bucket privado 'vistorias' + politicas de Storage (F4-A2)
--
-- Bucket proprio (nao o 'os-fotos'):
--   * aceita image/png (assinatura) alem de image/jpeg, sem abrir PNG nas fotos da OS;
--   * as politicas do 'os-fotos' (dono apaga foto de OS fechada) nao alcancam a
--     vistoria: aqui NINGUEM apaga arquivo de vistoria concluida;
--   * o uso de espaco da vistoria aparece separado no painel (risco 17.5).
--
-- Caminhos (calculados pelo banco, colunas geradas):
--   foto:        <oficina_id>/<os_id>/<vistoria_id>/<foto_id>.jpg  (+ _mini.jpg)
--   assinatura:  <oficina_id>/<os_id>/<vistoria_id>/assinatura_<assinatura_id>.png
--
-- Regras:
--   SELECT (baixar, listar, URL assinada): quem ve a OS (mecanico: as dele, ou
--     todas com ve_todas_os) e so arquivo registrado (foto ou assinatura atual).
--   INSERT (subir): so no caminho de um registro PENDENTE criado por mim:
--     foto original -> vistoria em rascunho que eu posso editar;
--     foto de complemento -> vistoria concluida que eu posso complementar;
--     assinatura -> vistoria em rascunho, assinatura registrada por mim.
--   DELETE: so foto ORIGINAL de vistoria em RASCUNHO (mesma regra de
--     apagar_foto_vistoria). Assinatura: ninguem. Concluida/anulada: ninguem.
--   UPDATE: sem politica => ninguem sobrescreve nem move (upsert: false).
--   anon: nenhuma politica.
--
-- Precisa do schema storage do Supabase (no PGlite: copia minima no teste).
-- Ordem: depois de 03_fase4_vistoria_rpcs.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vistorias', 'vistorias', false, 5242880, array['image/jpeg', 'image/png'])
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- -----------------------------------------------------------------------------
-- Funcoes das politicas (DEFINER: leem as tabelas sem depender da RLS de quem
-- chama, mas sempre filtrando pela oficina e pelo papel de quem esta logado)
-- -----------------------------------------------------------------------------
create or replace function private.pode_ver_arquivo_vistoria(p_nome text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.vistoria_fotos f
      join public.ordens_servico o on o.id = f.os_id
     where (f.caminho = p_nome or f.caminho_miniatura = p_nome)
       and f.oficina_id = private.minha_oficina_id()
       and o.oficina_id = f.oficina_id
       and (private.vejo_todas_os() or o.mecanico_id = auth.uid())
  ) or exists (
    select 1
      from public.vistorias v
      join public.ordens_servico o on o.id = v.os_id
     where v.assinatura_caminho = p_nome
       and v.oficina_id = private.minha_oficina_id()
       and o.oficina_id = v.oficina_id
       and (private.vejo_todas_os() or o.mecanico_id = auth.uid())
  )
$$;

create or replace function private.pode_subir_arquivo_vistoria(p_nome text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.vistoria_fotos f
      join public.vistorias v on v.id = f.vistoria_id
     where (f.caminho = p_nome or f.caminho_miniatura = p_nome)
       and f.oficina_id = private.minha_oficina_id()
       and f.criado_por = auth.uid()
       and f.enviada_em is null
       and case when f.complemento_id is null then private.posso_editar_vistoria(v)
                else private.posso_complementar_vistoria(v) end
  ) or exists (
    select 1
      from public.vistorias v
     where v.assinatura_caminho = p_nome
       and v.oficina_id = private.minha_oficina_id()
       and v.assinatura_registrada_por = auth.uid()
       and private.posso_editar_vistoria(v)
  )
$$;

create or replace function private.pode_apagar_arquivo_vistoria(p_nome text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select private.foto_vistoria_apagavel(f)
      from public.vistoria_fotos f
     where (f.caminho = p_nome or f.caminho_miniatura = p_nome)
       and f.oficina_id = private.minha_oficina_id()
  ), false)
$$;

revoke all on function private.pode_ver_arquivo_vistoria(text) from public;
revoke all on function private.pode_subir_arquivo_vistoria(text) from public;
revoke all on function private.pode_apagar_arquivo_vistoria(text) from public;
grant execute on function private.pode_ver_arquivo_vistoria(text) to authenticated, service_role;
grant execute on function private.pode_subir_arquivo_vistoria(text) to authenticated, service_role;
grant execute on function private.pode_apagar_arquivo_vistoria(text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Politicas (o prefixo "<minha oficina>/" corta barato as outras oficinas)
-- -----------------------------------------------------------------------------
create policy vistorias_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'vistorias'
    and name like (select private.minha_oficina_id())::text || '/%'
    and private.pode_ver_arquivo_vistoria(name)
  );

create policy vistorias_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'vistorias'
    and name like (select private.minha_oficina_id())::text || '/%'
    and private.pode_subir_arquivo_vistoria(name)
  );

create policy vistorias_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'vistorias'
    and name like (select private.minha_oficina_id())::text || '/%'
    and private.pode_apagar_arquivo_vistoria(name)
  );

-- Sem politica de UPDATE: ninguem sobrescreve nem move arquivo.
