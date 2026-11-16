-- Texto novo de /termos e /privacidade para o piloto (branch piloto-termos-privacidade).
-- Tem que bater com TERMOS_VERSAO em src/lib/termos.ts. Todos aceitam de novo na proxima entrada.
-- Aplicar ANTES do deploy do app com a versao nova: senao o aceite e recusado (versao diferente).
create or replace function private.versao_termos_vigente()
returns text
language sql
immutable
set search_path = ''
as $$
  select '2026-11-16'::text
$$;
