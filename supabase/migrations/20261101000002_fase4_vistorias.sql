-- =============================================================================
-- MechaFlow - Fase 4 - 02 vistoria: tabelas, imutabilidade e obrigatoriedade
-- (F4-A1, F4-A2, F4-A3)
--
--   vistorias               1 por OS e tipo (entrada/saida), fora as anuladas
--   vistoria_itens          checklist COPIADO do modelo (descricao copiada)
--   vistoria_avarias        lado fixo + descricao (id gerado no navegador)
--   vistoria_fotos          fotos de avaria, painel e de complemento (bucket
--                           proprio 'vistorias', migracao 04). NAO usa os_fotos:
--                           regras de apagar, limite e galeria sao outras
--                           (ver ARQUITETURA 12.3).
--   vistoria_complementos   texto acrescentado DEPOIS de concluida (so insert)
--
-- Imutabilidade (PLANO 5 + 17.6-6): depois de concluida, TRIGGER recusa
-- UPDATE/DELETE em vistorias, vistoria_itens, vistoria_avarias e vistoria_fotos
-- para QUALQUER papel (inclusive o dono e inclusive o postgres/service_role):
-- erro 'vistoria_concluida'. Unicas excecoes, conferidas no trigger:
--   * concluida -> anulada (so as colunas da anulacao mudam; RPC so do dono);
--   * foto de COMPLEMENTO: entra com a vistoria concluida e so muda uma vez,
--     de pendente para enviada (confirmar).
-- Complemento: so INSERT; nunca muda nem sai.
--
-- Obrigatoriedade (17.6-3): com oficinas.vistoria_obrigatoria ligada, a OS nao
-- vai para 'pronta' nem 'entregue' sem vistoria de ENTRADA CONCLUIDA (trigger
-- em ordens_servico; vale para toda RPC que muda status). Erro 'vistoria_obrigatoria'.
--
-- Colunas "por" (criado_por, concluida_por...) SEM FK para auth.users, como o
-- os_historico: um "on delete set null" viraria UPDATE e o trigger de
-- imutabilidade travaria a exclusao do usuario.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Tipos
-- -----------------------------------------------------------------------------
create type public.tipo_vistoria as enum ('entrada', 'saida');
create type public.status_vistoria as enum ('rascunho', 'concluida', 'anulada');
create type public.nivel_combustivel as enum ('reserva', 'um_quarto', 'meio', 'tres_quartos', 'cheio');
create type public.situacao_item_vistoria as enum ('ok', 'com_problema', 'nao_se_aplica');
create type public.lado_avaria as enum ('frente', 'traseira', 'lateral_esquerda', 'lateral_direita', 'cabine', 'outro');
create type public.tipo_foto_vistoria as enum ('avaria', 'painel', 'outro');
create type public.motivo_sem_assinatura as enum ('motorista_ausente', 'recusou');

-- -----------------------------------------------------------------------------
-- 2) vistorias
-- -----------------------------------------------------------------------------
create table public.vistorias (
  id                        uuid primary key default gen_random_uuid(),
  oficina_id                uuid not null references public.oficinas (id) on delete restrict,
  os_id                     uuid not null,
  veiculo_id                uuid not null,       -- copiado da OS (historico por veiculo)
  tipo                      public.tipo_vistoria not null default 'entrada',
  status                    public.status_vistoria not null default 'rascunho',

  -- KM: a fonte e ordens_servico.km (17.6-8). Aqui fica a COPIA gravada na
  -- conclusao (prova). Em rascunho a view mostra o KM da OS.
  km                        integer check (km >= 0),
  horimetro                 integer check (horimetro >= 0),
  combustivel               public.nivel_combustivel,
  objetos                   text[] not null default '{}'
                            check (cardinality(objetos) <= 30),
  observacoes               text check (char_length(observacoes) <= 2000),
  sem_avarias               boolean not null default false,   -- "Sem avarias" marcado (DESIGN 12.20)

  -- assinatura (PNG no bucket 'vistorias'); id gerado no navegador.
  -- Assinar de novo (Limpar) = id novo: o caminho muda e nada e sobrescrito.
  assinatura_id             uuid,
  assinatura_caminho        text generated always as
                              (oficina_id::text || '/' || os_id::text || '/' || id::text
                               || '/assinatura_' || assinatura_id::text || '.png') stored,
  assinatura_largura        integer check (assinatura_largura between 1 and 4000),
  assinatura_altura         integer check (assinatura_altura between 1 and 4000),
  assinatura_tamanho_bytes  integer check (assinatura_tamanho_bytes between 1 and 524288),
  assinatura_registrada_por uuid,
  assinado_por_nome         text check (char_length(assinado_por_nome) between 2 and 80),
  sem_assinatura_motivo     public.motivo_sem_assinatura,

  -- conclusao
  concluida_em              timestamptz,
  concluida_por             uuid,
  hash_conteudo             text check (hash_conteudo ~ '^[0-9a-f]{64}$'),   -- SHA-256

  -- anulacao (so o dono; vistoria feita na OS errada)
  anulada_em                timestamptz,
  anulada_por               uuid,
  motivo_anulacao           text check (char_length(motivo_anulacao) between 3 and 500),

  criado_por                uuid default auth.uid(),
  criado_em                 timestamptz not null default now(),
  atualizado_em             timestamptz not null default now(),

  constraint vistorias_id_oficina_uk unique (id, oficina_id),
  constraint vistorias_os_fk foreign key (os_id, oficina_id)
    references public.ordens_servico (id, oficina_id) on delete restrict,
  constraint vistorias_veiculo_fk foreign key (veiculo_id, oficina_id)
    references public.veiculos (id, oficina_id) on delete restrict,
  -- concluida: tem data, quem, hash e (assinatura + nome) OU motivo de "sem assinatura"
  constraint vistorias_concluida_ck check (
    status = 'rascunho'
    or (concluida_em is not null and concluida_por is not null and hash_conteudo is not null
        and (sem_assinatura_motivo is not null
             or (assinatura_id is not null and assinatura_tamanho_bytes is not null and assinado_por_nome is not null)))
    or (status = 'anulada' and concluida_em is null)          -- anulada ainda em rascunho
  ),
  constraint vistorias_assinatura_ck check (
    sem_assinatura_motivo is null or assinatura_id is null
  ),
  constraint vistorias_anulada_ck check (
    status <> 'anulada' or (anulada_em is not null and anulada_por is not null and motivo_anulacao is not null)
  )
);
alter table public.vistorias enable row level security;
-- uma vistoria de cada tipo por OS (a anulada nao conta: outra pode ser feita)
create unique index vistorias_os_tipo_uk on public.vistorias (os_id, tipo) where status <> 'anulada';
create unique index vistorias_assinatura_caminho_uk on public.vistorias (assinatura_caminho) where assinatura_caminho is not null;
create index vistorias_oficina_idx on public.vistorias (oficina_id, criado_em desc);
create index vistorias_veiculo_idx on public.vistorias (veiculo_id, criado_em desc);
comment on table public.vistorias is
  'Vistoria do veiculo (entrada/saida). Escrita so por RPC. Concluida = imutavel (trigger), inclusive para o dono.';

-- -----------------------------------------------------------------------------
-- 3) Filhas
-- -----------------------------------------------------------------------------
create table public.vistoria_itens (
  id              uuid primary key default gen_random_uuid(),
  oficina_id      uuid not null,
  vistoria_id     uuid not null,
  modelo_item_id  uuid references public.checklist_modelo_itens (id) on delete restrict,
  ordem           integer not null check (ordem > 0),
  descricao       text not null check (char_length(descricao) between 1 and 80),   -- COPIA do modelo
  situacao        public.situacao_item_vistoria,                                    -- NULL = nao marcado
  observacao      text check (char_length(observacao) <= 500),
  marcado_por     uuid,
  marcado_em      timestamptz,
  constraint vistoria_itens_vistoria_fk foreign key (vistoria_id, oficina_id)
    references public.vistorias (id, oficina_id) on delete cascade
);
alter table public.vistoria_itens enable row level security;
create index vistoria_itens_vistoria_idx on public.vistoria_itens (vistoria_id, ordem);
create index vistoria_itens_oficina_idx on public.vistoria_itens (oficina_id);
create index vistoria_itens_modelo_item_idx on public.vistoria_itens (modelo_item_id);

create table public.vistoria_avarias (
  id             uuid primary key,             -- gerado no navegador (idempotencia)
  oficina_id     uuid not null,
  vistoria_id    uuid not null,
  lado           public.lado_avaria not null,
  descricao      text check (char_length(descricao) <= 300),
  criado_por     uuid default auth.uid(),
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  constraint vistoria_avarias_id_vistoria_uk unique (id, vistoria_id),
  constraint vistoria_avarias_vistoria_fk foreign key (vistoria_id, oficina_id)
    references public.vistorias (id, oficina_id) on delete cascade
);
alter table public.vistoria_avarias enable row level security;
create index vistoria_avarias_vistoria_idx on public.vistoria_avarias (vistoria_id, criado_em);
create index vistoria_avarias_oficina_idx on public.vistoria_avarias (oficina_id);

create table public.vistoria_complementos (
  id           uuid primary key,               -- gerado no navegador (idempotencia)
  oficina_id   uuid not null,
  vistoria_id  uuid not null,
  texto        text check (char_length(texto) <= 1000),
  criado_por   uuid default auth.uid(),
  criado_em    timestamptz not null default now(),
  constraint vistoria_complementos_id_vistoria_uk unique (id, vistoria_id),
  constraint vistoria_complementos_vistoria_fk foreign key (vistoria_id, oficina_id)
    references public.vistorias (id, oficina_id) on delete restrict
);
alter table public.vistoria_complementos enable row level security;
create index vistoria_complementos_vistoria_idx on public.vistoria_complementos (vistoria_id, criado_em);
create index vistoria_complementos_oficina_idx on public.vistoria_complementos (oficina_id);

create table public.vistoria_fotos (
  id                       uuid primary key,   -- gerado no navegador (chave de idempotencia)
  oficina_id               uuid not null,
  os_id                    uuid not null,      -- so para o caminho (copiado da vistoria)
  vistoria_id              uuid not null,
  tipo                     public.tipo_foto_vistoria not null,
  avaria_id                uuid,               -- obrigatorio quando tipo = 'avaria'
  complemento_id           uuid,               -- foto acrescentada depois da conclusao
  legenda                  text check (char_length(legenda) <= 200),
  largura                  integer not null check (largura between 1 and 10000),
  altura                   integer not null check (altura between 1 and 10000),
  tamanho_bytes            integer not null check (tamanho_bytes between 1 and 5242880),
  tamanho_miniatura_bytes  integer not null check (tamanho_miniatura_bytes between 1 and 5242880),
  caminho                  text generated always as
                             (oficina_id::text || '/' || os_id::text || '/' || vistoria_id::text || '/' || id::text || '.jpg') stored,
  caminho_miniatura        text generated always as
                             (oficina_id::text || '/' || os_id::text || '/' || vistoria_id::text || '/' || id::text || '_mini.jpg') stored,
  criado_por               uuid default auth.uid(),
  criado_em                timestamptz not null default now(),
  enviada_em               timestamptz,        -- NULL = pendente
  constraint vistoria_fotos_vistoria_fk foreign key (vistoria_id, oficina_id)
    references public.vistorias (id, oficina_id) on delete cascade,
  constraint vistoria_fotos_avaria_fk foreign key (avaria_id, vistoria_id)
    references public.vistoria_avarias (id, vistoria_id) on delete cascade,
  constraint vistoria_fotos_complemento_fk foreign key (complemento_id, vistoria_id)
    references public.vistoria_complementos (id, vistoria_id) on delete restrict,
  constraint vistoria_fotos_tipo_ck check ((tipo = 'avaria') = (avaria_id is not null)),
  constraint vistoria_fotos_complemento_ck check (complemento_id is null or avaria_id is null),
  constraint vistoria_fotos_caminho_uk unique (caminho),
  constraint vistoria_fotos_caminho_mini_uk unique (caminho_miniatura)
);
alter table public.vistoria_fotos enable row level security;
create index vistoria_fotos_vistoria_idx on public.vistoria_fotos (vistoria_id, criado_em);
create index vistoria_fotos_avaria_idx on public.vistoria_fotos (avaria_id) where avaria_id is not null;
create index vistoria_fotos_complemento_idx on public.vistoria_fotos (complemento_id) where complemento_id is not null;
create index vistoria_fotos_oficina_idx on public.vistoria_fotos (oficina_id);
comment on table public.vistoria_fotos is
  'Fotos da vistoria (bucket privado vistorias). Escrita so por RPC. Imutavel depois da conclusao (trigger).';

-- -----------------------------------------------------------------------------
-- 4) Normalizacao + atualizado_em
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
  -- objetos: sem vazios, sem espacos nas pontas, sem repetidos, ate 60 letras cada
  new.objetos := coalesce((
    select array_agg(x.o order by x.primeira)
      from (select left(btrim(t.o), 60) as o, min(t.n) as primeira
              from unnest(new.objetos) with ordinality as t(o, n)
             where nullif(btrim(t.o), '') is not null
             group by left(btrim(t.o), 60)) x
  ), '{}');
  return new;
end;
$$;
revoke all on function private.tg_vistorias_normalizar() from public;

-- -----------------------------------------------------------------------------
-- 5) IMUTABILIDADE (triggers; valem para todo mundo, inclusive service_role)
-- -----------------------------------------------------------------------------

-- vistorias: rascunho muda a vontade (pelas RPCs); concluida so vira anulada;
-- anulada nao muda mais. DELETE so de rascunho (nao ha caminho pela API).
create or replace function private.tg_vistorias_proteger()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- (colunas geradas vem NULL no NEW de um trigger BEFORE: ficam fora da comparacao)
  v_anulacao text[] := array['status', 'anulada_em', 'anulada_por', 'motivo_anulacao', 'atualizado_em',
                             'assinatura_caminho'];
begin
  if tg_op = 'DELETE' then
    if old.status <> 'rascunho' then
      raise exception 'vistoria_concluida';
    end if;
    return old;
  end if;

  if old.status = 'rascunho' then
    return new;
  end if;
  if old.status = 'concluida' and new.status = 'anulada'
     and (to_jsonb(new) - v_anulacao) = (to_jsonb(old) - v_anulacao) then
    return new;
  end if;
  raise exception 'vistoria_concluida';
end;
$$;
revoke all on function private.tg_vistorias_proteger() from public;

-- itens e avarias: so com a vistoria em rascunho.
create or replace function private.tg_vistoria_filha_proteger()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_vistoria uuid := case when tg_op = 'DELETE' then old.vistoria_id else new.vistoria_id end;
  v_status   public.status_vistoria;
begin
  if tg_op = 'UPDATE' and new.vistoria_id is distinct from old.vistoria_id then
    raise exception 'vistoria_concluida';   -- nao muda de vistoria
  end if;
  select v.status into v_status from public.vistorias v where v.id = v_vistoria for share;
  -- DELETE em cascata de uma vistoria em rascunho apagada: a mae ja nao aparece
  if v_status is not null and v_status <> 'rascunho' then
    raise exception 'vistoria_concluida';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function private.tg_vistoria_filha_proteger() from public;

-- fotos: original so em rascunho; foto de complemento entra com a vistoria
-- concluida e so muda uma vez (pendente -> enviada). Nunca sai depois.
create or replace function private.tg_vistoria_fotos_proteger()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_vistoria uuid := case when tg_op = 'DELETE' then old.vistoria_id else new.vistoria_id end;
  v_status   public.status_vistoria;
  v_fixas    text[] := array['enviada_em', 'tamanho_bytes', 'caminho', 'caminho_miniatura'];  -- geradas: NULL no NEW
begin
  select v.status into v_status from public.vistorias v where v.id = v_vistoria for share;

  if tg_op = 'INSERT' then
    if new.complemento_id is null and v_status <> 'rascunho' then
      raise exception 'vistoria_concluida';
    end if;
    if new.complemento_id is not null and v_status is distinct from 'concluida' then
      raise exception 'vistoria_nao_concluida';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.vistoria_id is distinct from old.vistoria_id or new.complemento_id is distinct from old.complemento_id then
      raise exception 'vistoria_concluida';
    end if;
    if v_status = 'rascunho' then
      return new;
    end if;
    -- complemento: so a confirmacao do envio (pendente -> enviada)
    if old.complemento_id is not null and old.enviada_em is null and new.enviada_em is not null
       and (to_jsonb(new) - v_fixas) = (to_jsonb(old) - v_fixas) then
      return new;
    end if;
    raise exception 'vistoria_concluida';
  end if;

  -- DELETE
  if v_status is not null and (v_status <> 'rascunho' or old.complemento_id is not null) then
    raise exception 'vistoria_concluida';
  end if;
  return old;
end;
$$;
revoke all on function private.tg_vistoria_fotos_proteger() from public;

-- complemento: so insert, e so em vistoria concluida.
create or replace function private.tg_vistoria_complementos_proteger()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if (select v.status from public.vistorias v where v.id = new.vistoria_id for share) is distinct from 'concluida' then
      raise exception 'vistoria_nao_concluida';
    end if;
    new.texto := nullif(btrim(new.texto), '');
    return new;
  end if;
  raise exception 'vistoria_concluida';
end;
$$;
revoke all on function private.tg_vistoria_complementos_proteger() from public;

-- Ordem dos triggers BEFORE: alfabetica. "a_proteger" roda antes dos outros.
create trigger vistorias_a_proteger before update or delete on public.vistorias
  for each row execute function private.tg_vistorias_proteger();
create trigger vistorias_normalizar before insert or update on public.vistorias
  for each row execute function private.tg_vistorias_normalizar();
create trigger vistorias_atualizado_em before update on public.vistorias
  for each row execute function private.tg_atualizado_em();

create trigger vistoria_itens_a_proteger before insert or update or delete on public.vistoria_itens
  for each row execute function private.tg_vistoria_filha_proteger();
create trigger vistoria_avarias_a_proteger before insert or update or delete on public.vistoria_avarias
  for each row execute function private.tg_vistoria_filha_proteger();
create trigger vistoria_avarias_atualizado_em before update on public.vistoria_avarias
  for each row execute function private.tg_atualizado_em();
create trigger vistoria_fotos_a_proteger before insert or update or delete on public.vistoria_fotos
  for each row execute function private.tg_vistoria_fotos_proteger();
create trigger vistoria_complementos_a_proteger before insert or update or delete on public.vistoria_complementos
  for each row execute function private.tg_vistoria_complementos_proteger();

-- TRUNCATE tambem nao (nem o postgres por engano)
create or replace function private.tg_vistoria_sem_truncate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'vistoria_concluida';
end;
$$;
revoke all on function private.tg_vistoria_sem_truncate() from public;
create trigger vistorias_sem_truncate before truncate on public.vistorias
  for each statement execute function private.tg_vistoria_sem_truncate();
create trigger vistoria_itens_sem_truncate before truncate on public.vistoria_itens
  for each statement execute function private.tg_vistoria_sem_truncate();
create trigger vistoria_avarias_sem_truncate before truncate on public.vistoria_avarias
  for each statement execute function private.tg_vistoria_sem_truncate();
create trigger vistoria_fotos_sem_truncate before truncate on public.vistoria_fotos
  for each statement execute function private.tg_vistoria_sem_truncate();
create trigger vistoria_complementos_sem_truncate before truncate on public.vistoria_complementos
  for each statement execute function private.tg_vistoria_sem_truncate();

-- -----------------------------------------------------------------------------
-- 6) GRANT + RLS: todos leem a vistoria das OS que veem (mecanico: as OS dele,
--    ou todas com ve_todas_os - 17.6-5). Escrita: so RPC.
-- -----------------------------------------------------------------------------
revoke all on table public.vistorias, public.vistoria_itens, public.vistoria_avarias,
  public.vistoria_fotos, public.vistoria_complementos from anon, authenticated;
grant select on public.vistorias, public.vistoria_itens, public.vistoria_avarias,
  public.vistoria_fotos, public.vistoria_complementos to authenticated;

create policy vistorias_select on public.vistorias
  for select to authenticated
  using (
    oficina_id = (select private.minha_oficina_id())
    and os_id in (select o.id from public.ordens_servico o)      -- RLS da OS: mecanico so as dele
  );

create policy vistoria_itens_select on public.vistoria_itens
  for select to authenticated
  using (
    oficina_id = (select private.minha_oficina_id())
    and vistoria_id in (select v.id from public.vistorias v)
  );

create policy vistoria_avarias_select on public.vistoria_avarias
  for select to authenticated
  using (
    oficina_id = (select private.minha_oficina_id())
    and vistoria_id in (select v.id from public.vistorias v)
  );

create policy vistoria_fotos_select on public.vistoria_fotos
  for select to authenticated
  using (
    oficina_id = (select private.minha_oficina_id())
    and vistoria_id in (select v.id from public.vistorias v)
  );

create policy vistoria_complementos_select on public.vistoria_complementos
  for select to authenticated
  using (
    oficina_id = (select private.minha_oficina_id())
    and vistoria_id in (select v.id from public.vistorias v)
  );

-- -----------------------------------------------------------------------------
-- 7) Obrigatoriedade (17.6-3): pronta / entregue exigem vistoria de entrada
--    concluida quando a oficina ligou a chave. Trigger: vale para marcar_pronta,
--    mudar_status_os, entregar_os e qualquer RPC futura.
-- -----------------------------------------------------------------------------
create or replace function private.tg_os_exige_vistoria()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('pronta', 'entregue')
     and new.status is distinct from old.status
     and (select f.vistoria_obrigatoria from public.oficinas f where f.id = new.oficina_id)
     and not exists (select 1 from public.vistorias v
                      where v.os_id = new.id and v.tipo = 'entrada' and v.status = 'concluida') then
    raise exception 'vistoria_obrigatoria';
  end if;
  return new;
end;
$$;
revoke all on function private.tg_os_exige_vistoria() from public;

create trigger ordens_servico_exige_vistoria before update of status on public.ordens_servico
  for each row execute function private.tg_os_exige_vistoria();

-- -----------------------------------------------------------------------------
-- 8) Historico: evento novo 'vistoria' (concluida / anulada)
-- -----------------------------------------------------------------------------
alter table public.os_historico drop constraint os_historico_evento_check;
alter table public.os_historico add constraint os_historico_evento_check check (evento in (
  'criada', 'status', 'desfazer', 'mecanico', 'modo', 'aprovacao', 'recusa',
  'cancelada', 'entregue', 'pagamento',
  'vistoria'));   -- Fase 4: vistoria concluida / anulada (texto do sistema)
