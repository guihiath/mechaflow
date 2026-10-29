-- =============================================================================
-- MechaFlow - Fase 1 - 01 base
-- Tipos, utilitarios, oficinas, perfis, funcoes auxiliares de RLS,
-- termos_aceite e convites.
--
-- Ordem das migracoes da Fase 1:
--   01_fase1_base -> 02_fase1_cadastros -> 03_fase1_rls -> 04_fase1_rpcs
--
-- Convencoes:
--   * dinheiro em centavos (integer); datas em timestamptz (UTC)
--   * toda tabela nasce com RLS ligado (as politicas ficam no arquivo 03)
--   * funcoes SECURITY DEFINER sempre com search_path = '' e nomes qualificados
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Schema privado: funcoes auxiliares que NAO devem ser expostas pela API
-- (o schema "private" nao esta na lista de schemas expostos do PostgREST).
-- -----------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;
comment on schema private is 'Funcoes internas do MechaFlow (RLS, triggers). Nao exposto pela Data API.';

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
create type public.papel_usuario as enum ('dono', 'atendente', 'mecanico');
create type public.modo_atendimento_cliente as enum ('exige_orcamento', 'servico_direto');
create type public.tipo_veiculo as enum ('caminhao', 'carreta', 'onibus', 'utilitario', 'outro');

-- -----------------------------------------------------------------------------
-- Utilitarios
-- -----------------------------------------------------------------------------

-- Placa: maiusculas, sem traco/espaco. 'abc-1d23' -> 'ABC1D23'.
create or replace function public.normalizar_placa(p_placa text)
returns text
language sql
immutable strict parallel safe
set search_path = ''
as $$
  select upper(regexp_replace(p_placa, '[^A-Za-z0-9]', '', 'g'))
$$;
comment on function public.normalizar_placa(text) is 'Padroniza a placa: maiusculas, so letras e numeros.';

-- Mantem so os digitos; string vazia vira NULL. '(11) 98888-7777' -> '11988887777'.
create or replace function private.so_digitos(p_texto text)
returns text
language sql
immutable strict parallel safe
set search_path = ''
as $$
  select nullif(regexp_replace(p_texto, '[^0-9]', '', 'g'), '')
$$;

-- Atualiza a coluna atualizado_em em todo UPDATE.
create or replace function private.tg_atualizado_em()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

-- Versao vigente dos termos de uso + politica de privacidade.
-- Mudou o texto dos termos? Nova migracao alterando esta data. O app manda a
-- versao que o usuario leu; as RPCs recusam versao diferente desta.
create or replace function private.versao_termos_vigente()
returns text
language sql
immutable
set search_path = ''
as $$
  select '2026-10-28'::text
$$;

-- -----------------------------------------------------------------------------
-- oficinas
-- -----------------------------------------------------------------------------
create table public.oficinas (
  id                    uuid primary key default gen_random_uuid(),
  nome                  text not null check (char_length(nome) between 2 and 120),
  documento             text check (documento ~ '^([0-9]{11}|[0-9]{14})$'),  -- CPF ou CNPJ, so digitos
  telefone              text check (telefone ~ '^[0-9]{10,13}$'),
  logo_path             text,                                                -- caminho no Storage (bucket privado), Fase futura
  plano                 text not null default 'teste',                        -- definido na Fase 8; o dono NAO altera
  vistoria_obrigatoria  boolean not null default false,
  fuso_horario          text not null default 'America/Sao_Paulo',
  criado_por            uuid references auth.users (id) on delete set null,
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now()
);
alter table public.oficinas enable row level security;
comment on table public.oficinas is 'Cada oficina e um inquilino (tenant). Criada pela RPC criar_oficina.';

create or replace function private.tg_oficinas_normalizar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.nome      := btrim(new.nome);
  new.documento := private.so_digitos(new.documento);
  new.telefone  := private.so_digitos(new.telefone);
  return new;
end;
$$;

create trigger oficinas_normalizar before insert or update on public.oficinas
  for each row execute function private.tg_oficinas_normalizar();
create trigger oficinas_atualizado_em before update on public.oficinas
  for each row execute function private.tg_atualizado_em();

-- -----------------------------------------------------------------------------
-- perfis (1 usuario = 1 oficina = 1 papel)
-- -----------------------------------------------------------------------------
create table public.perfis (
  id             uuid primary key references auth.users (id) on delete cascade,
  oficina_id     uuid not null references public.oficinas (id) on delete restrict,
  nome           text not null check (char_length(nome) between 2 and 80),
  email          text,                         -- copia do login no momento da entrada (para o dono identificar a equipe)
  telefone       text check (telefone ~ '^[0-9]{10,13}$'),
  papel          public.papel_usuario not null,
  ativo          boolean not null default true,
  ve_todas_os    boolean not null default false, -- mecanico ve todas as OS (Fase 2)
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  -- permite FK composta (perfil_id, oficina_id) nas tabelas da Fase 2 (ex.: OS.mecanico_id)
  constraint perfis_id_oficina_uk unique (id, oficina_id)
);
alter table public.perfis enable row level security;
create index perfis_oficina_id_idx on public.perfis (oficina_id);
comment on table public.perfis is 'Usuario do app dentro de uma oficina. Criado so pelas RPCs criar_oficina e aceitar_convite.';

create or replace function private.tg_perfis_normalizar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.nome     := btrim(new.nome);
  new.telefone := private.so_digitos(new.telefone);
  return new;
end;
$$;

create trigger perfis_normalizar before insert or update on public.perfis
  for each row execute function private.tg_perfis_normalizar();
create trigger perfis_atualizado_em before update on public.perfis
  for each row execute function private.tg_atualizado_em();

-- -----------------------------------------------------------------------------
-- Funcoes auxiliares de RLS
-- SECURITY DEFINER: leem perfis sem passar pela RLS de perfis (evita recursao).
-- STABLE + uso nas politicas como (select private.x()) => o Postgres calcula
-- uma vez por consulta (initPlan), nao uma vez por linha.
-- Usuario desativado (ativo = false) => retornam NULL => nao ve nada.
-- -----------------------------------------------------------------------------
create or replace function private.minha_oficina_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.oficina_id
  from public.perfis p
  where p.id = auth.uid()
    and p.ativo
$$;

create or replace function private.meu_papel()
returns public.papel_usuario
language sql
stable
security definer
set search_path = ''
as $$
  select p.papel
  from public.perfis p
  where p.id = auth.uid()
    and p.ativo
$$;

revoke all on function private.minha_oficina_id() from public;
revoke all on function private.meu_papel() from public;
revoke all on function private.versao_termos_vigente() from public;
revoke all on function private.so_digitos(text) from public;
grant execute on function private.minha_oficina_id() to authenticated, service_role;
grant execute on function private.meu_papel() to authenticated, service_role;
grant execute on function private.versao_termos_vigente() to authenticated, service_role;
grant execute on function private.so_digitos(text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- termos_aceite (prova de aceite LGPD; imutavel)
-- Sem FK para auth.users de proposito: o registro de aceite sobrevive se o
-- usuario for excluido.
-- -----------------------------------------------------------------------------
create table public.termos_aceite (
  id                        uuid primary key default gen_random_uuid(),
  oficina_id                uuid not null references public.oficinas (id) on delete restrict,
  usuario_id                uuid not null,
  versao                    text not null,
  autoriza_uso_anonimizado  boolean not null,
  aceito_em                 timestamptz not null default now(),
  ip                        text,   -- melhor esforco (cabecalhos da requisicao)
  user_agent                text,
  constraint termos_aceite_usuario_versao_uk unique (usuario_id, versao)
);
alter table public.termos_aceite enable row level security;
create index termos_aceite_oficina_id_idx on public.termos_aceite (oficina_id);
comment on table public.termos_aceite is 'Aceite dos termos de uso e politica de privacidade (inclui uso anonimizado). Gravado so por RPC; ninguem altera ou apaga.';

-- -----------------------------------------------------------------------------
-- convites (link de uso unico, sem e-mail)
-- O token em texto so existe na resposta da RPC criar_convite; aqui fica o hash.
-- -----------------------------------------------------------------------------
create table public.convites (
  id             uuid primary key default gen_random_uuid(),
  oficina_id     uuid not null references public.oficinas (id) on delete cascade,
  token_hash     bytea not null,
  papel          public.papel_usuario not null check (papel <> 'dono'),
  nome_sugerido  text check (char_length(nome_sugerido) <= 80),
  criado_por     uuid references auth.users (id) on delete set null,
  criado_em      timestamptz not null default now(),
  expira_em      timestamptz not null,
  usado_em       timestamptz,
  usado_por      uuid references auth.users (id) on delete set null,
  revogado_em    timestamptz,
  constraint convites_token_hash_uk unique (token_hash),
  constraint convites_expira_depois_check check (expira_em > criado_em)
);
alter table public.convites enable row level security;
create index convites_oficina_criado_idx on public.convites (oficina_id, criado_em desc);
comment on table public.convites is 'Convite de funcionario por link. Uso unico, expira, revogavel. Criado/aceito so por RPC.';
