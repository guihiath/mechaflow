-- =============================================================================
-- MechaFlow - Fase 1 - 02 cadastros
-- clientes, veiculos, catalogo de servicos e pecas.
--
-- Precos e custos ficam em tabelas SEPARADAS ("satelites") porque a RLS do
-- Postgres filtra linhas, nao colunas:
--   catalogo_servicos_precos  -> dono + atendente
--   catalogo_pecas_precos     -> dono + atendente
--   catalogo_pecas_custos     -> so dono
-- As views vw_catalogo_* (security_invoker) juntam tudo: para quem nao pode
-- ver, as colunas de valor voltam NULL.
--
-- FKs compostas (x_id, oficina_id) impedem apontar para registro de OUTRA
-- oficina (a checagem de FK ignora RLS, entao isso precisa estar no schema).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- clientes
-- -----------------------------------------------------------------------------
create table public.clientes (
  id             uuid primary key default gen_random_uuid(),
  oficina_id     uuid not null default private.minha_oficina_id()
                 references public.oficinas (id) on delete restrict,
  nome           text not null check (char_length(nome) between 2 and 120),
  documento      text check (documento ~ '^([0-9]{11}|[0-9]{14})$'),   -- CPF/CNPJ so digitos (opcional)
  telefone       text check (telefone ~ '^[0-9]{10,13}$'),
  email          text check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  modo_padrao    public.modo_atendimento_cliente not null default 'exige_orcamento',
  observacoes    text check (char_length(observacoes) <= 2000),
  criado_por     uuid default auth.uid() references auth.users (id) on delete set null,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  constraint clientes_id_oficina_uk unique (id, oficina_id)
);
alter table public.clientes enable row level security;
create index clientes_oficina_nome_idx on public.clientes (oficina_id, lower(nome));
create unique index clientes_oficina_documento_uk on public.clientes (oficina_id, documento)
  where documento is not null;

create or replace function private.tg_clientes_normalizar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.nome      := btrim(new.nome);
  new.documento := private.so_digitos(new.documento);
  new.telefone  := private.so_digitos(new.telefone);
  new.email     := nullif(lower(btrim(new.email)), '');
  return new;
end;
$$;

create trigger clientes_normalizar before insert or update on public.clientes
  for each row execute function private.tg_clientes_normalizar();
create trigger clientes_atualizado_em before update on public.clientes
  for each row execute function private.tg_atualizado_em();

-- -----------------------------------------------------------------------------
-- veiculos
-- Placa: antigo AAA9999 e Mercosul AAA9A99 => ^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$
-- -----------------------------------------------------------------------------
create table public.veiculos (
  id               uuid primary key default gen_random_uuid(),
  oficina_id       uuid not null default private.minha_oficina_id()
                   references public.oficinas (id) on delete restrict,
  cliente_id       uuid not null,
  placa            text not null check (placa ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'),
  tipo             public.tipo_veiculo not null default 'caminhao',
  marca            text check (char_length(marca) <= 60),
  modelo           text check (char_length(modelo) <= 80),
  ano_fabricacao   smallint check (ano_fabricacao between 1950 and 2100),
  ano_modelo       smallint check (ano_modelo between 1950 and 2100),
  chassi           text check (chassi ~ '^[A-Z0-9]{6,20}$'),
  km_atual         integer check (km_atual >= 0),
  horimetro_atual  integer check (horimetro_atual >= 0),
  observacoes      text check (char_length(observacoes) <= 2000),
  criado_por       uuid default auth.uid() references auth.users (id) on delete set null,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  constraint veiculos_oficina_placa_uk unique (oficina_id, placa),
  constraint veiculos_id_oficina_uk unique (id, oficina_id),
  constraint veiculos_cliente_mesma_oficina_fk foreign key (cliente_id, oficina_id)
    references public.clientes (id, oficina_id) on delete restrict
);
alter table public.veiculos enable row level security;
create index veiculos_cliente_id_idx on public.veiculos (cliente_id);
-- (oficina_id, placa) ja tem indice pela constraint unique.

create or replace function private.tg_veiculos_normalizar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.placa  := public.normalizar_placa(new.placa);
  new.chassi := nullif(upper(regexp_replace(new.chassi, '[^A-Za-z0-9]', '', 'g')), '');
  new.marca  := nullif(btrim(new.marca), '');
  new.modelo := nullif(btrim(new.modelo), '');
  return new;
end;
$$;

create trigger veiculos_normalizar before insert or update on public.veiculos
  for each row execute function private.tg_veiculos_normalizar();
create trigger veiculos_atualizado_em before update on public.veiculos
  for each row execute function private.tg_atualizado_em();

-- -----------------------------------------------------------------------------
-- catalogo_servicos (sem preco) + catalogo_servicos_precos
-- -----------------------------------------------------------------------------
create table public.catalogo_servicos (
  id             uuid primary key default gen_random_uuid(),
  oficina_id     uuid not null default private.minha_oficina_id()
                 references public.oficinas (id) on delete restrict,
  nome           text not null check (char_length(nome) between 2 and 120),
  descricao      text check (char_length(descricao) <= 1000),
  ativo          boolean not null default true,
  criado_por     uuid default auth.uid() references auth.users (id) on delete set null,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  constraint catalogo_servicos_id_oficina_uk unique (id, oficina_id)
);
alter table public.catalogo_servicos enable row level security;
create unique index catalogo_servicos_oficina_nome_uk on public.catalogo_servicos (oficina_id, lower(nome));

create trigger catalogo_servicos_atualizado_em before update on public.catalogo_servicos
  for each row execute function private.tg_atualizado_em();

create table public.catalogo_servicos_precos (
  servico_id             uuid primary key,
  oficina_id             uuid not null default private.minha_oficina_id(),
  preco_padrao_centavos  integer not null check (preco_padrao_centavos >= 0),
  atualizado_em          timestamptz not null default now(),
  constraint catalogo_servicos_precos_servico_fk foreign key (servico_id, oficina_id)
    references public.catalogo_servicos (id, oficina_id) on delete cascade
);
alter table public.catalogo_servicos_precos enable row level security;
create index catalogo_servicos_precos_oficina_id_idx on public.catalogo_servicos_precos (oficina_id);

create trigger catalogo_servicos_precos_atualizado_em before update on public.catalogo_servicos_precos
  for each row execute function private.tg_atualizado_em();

-- -----------------------------------------------------------------------------
-- catalogo_pecas (sem valores) + catalogo_pecas_precos + catalogo_pecas_custos
-- pendente_precificacao nasce TRUE; vira FALSE quando o dono grava o preco de venda.
-- -----------------------------------------------------------------------------
create table public.catalogo_pecas (
  id                     uuid primary key default gen_random_uuid(),
  oficina_id             uuid not null default private.minha_oficina_id()
                         references public.oficinas (id) on delete restrict,
  nome                   text not null check (char_length(nome) between 2 and 120),
  codigo                 text check (char_length(codigo) <= 60),
  fornecedor             text check (char_length(fornecedor) <= 120),
  unidade                text not null default 'un'
                         check (unidade in ('un', 'par', 'jogo', 'kit', 'l', 'kg', 'm')),
  pendente_precificacao  boolean not null default true,
  ativo                  boolean not null default true,
  criado_por             uuid default auth.uid() references auth.users (id) on delete set null,
  criado_em              timestamptz not null default now(),
  atualizado_em          timestamptz not null default now(),
  constraint catalogo_pecas_id_oficina_uk unique (id, oficina_id)
);
alter table public.catalogo_pecas enable row level security;
create index catalogo_pecas_oficina_nome_idx on public.catalogo_pecas (oficina_id, lower(nome));
create index catalogo_pecas_oficina_codigo_idx on public.catalogo_pecas (oficina_id, codigo) where codigo is not null;
create index catalogo_pecas_pendentes_idx on public.catalogo_pecas (oficina_id) where pendente_precificacao;

create trigger catalogo_pecas_atualizado_em before update on public.catalogo_pecas
  for each row execute function private.tg_atualizado_em();

create table public.catalogo_pecas_precos (
  peca_id               uuid primary key,
  oficina_id            uuid not null default private.minha_oficina_id(),
  preco_venda_centavos  integer not null check (preco_venda_centavos >= 0),
  atualizado_em         timestamptz not null default now(),
  constraint catalogo_pecas_precos_peca_fk foreign key (peca_id, oficina_id)
    references public.catalogo_pecas (id, oficina_id) on delete cascade
);
alter table public.catalogo_pecas_precos enable row level security;
create index catalogo_pecas_precos_oficina_id_idx on public.catalogo_pecas_precos (oficina_id);

create trigger catalogo_pecas_precos_atualizado_em before update on public.catalogo_pecas_precos
  for each row execute function private.tg_atualizado_em();

create table public.catalogo_pecas_custos (
  peca_id         uuid primary key,
  oficina_id      uuid not null default private.minha_oficina_id(),
  custo_centavos  integer not null check (custo_centavos >= 0),
  atualizado_em   timestamptz not null default now(),
  constraint catalogo_pecas_custos_peca_fk foreign key (peca_id, oficina_id)
    references public.catalogo_pecas (id, oficina_id) on delete cascade
);
alter table public.catalogo_pecas_custos enable row level security;
create index catalogo_pecas_custos_oficina_id_idx on public.catalogo_pecas_custos (oficina_id);

create trigger catalogo_pecas_custos_atualizado_em before update on public.catalogo_pecas_custos
  for each row execute function private.tg_atualizado_em();

-- Dono gravou preco de venda => a peca deixa de estar pendente.
-- Roda com os direitos de quem gravou (so o dono pode gravar preco, e o dono pode
-- atualizar catalogo_pecas).
create or replace function private.tg_peca_precificada()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.catalogo_pecas
     set pendente_precificacao = false
   where id = new.peca_id
     and pendente_precificacao;
  return new;
end;
$$;

create trigger catalogo_pecas_precos_marca_precificada
  after insert or update on public.catalogo_pecas_precos
  for each row execute function private.tg_peca_precificada();

-- -----------------------------------------------------------------------------
-- Views de leitura do catalogo (security_invoker: respeitam a RLS de quem consulta)
-- Mecanico: preco/custo = NULL. Atendente: custo = NULL. Dono: tudo.
-- -----------------------------------------------------------------------------
create view public.vw_catalogo_servicos
with (security_invoker = true)
as
select
  s.id,
  s.oficina_id,
  s.nome,
  s.descricao,
  s.ativo,
  s.criado_em,
  s.atualizado_em,
  sp.preco_padrao_centavos
from public.catalogo_servicos s
left join public.catalogo_servicos_precos sp on sp.servico_id = s.id;

create view public.vw_catalogo_pecas
with (security_invoker = true)
as
select
  p.id,
  p.oficina_id,
  p.nome,
  p.codigo,
  p.fornecedor,
  p.unidade,
  p.pendente_precificacao,
  p.ativo,
  p.criado_por,
  p.criado_em,
  p.atualizado_em,
  pp.preco_venda_centavos,
  pc.custo_centavos
from public.catalogo_pecas p
left join public.catalogo_pecas_precos pp on pp.peca_id = p.id
left join public.catalogo_pecas_custos pc on pc.peca_id = p.id;
