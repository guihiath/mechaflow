-- =============================================================================
-- MechaFlow - Fase 4 - 01 modelo de checklist da vistoria (F4-A1)
--
--   checklist_modelos       1 modelo padrao por oficina ("Caminhao (padrao)")
--   checklist_modelo_itens  itens do modelo (descricao, ordem, ativo)
--
-- * O modelo padrao de caminhao do PLANO 5 (16 itens) e semeado:
--     - em toda oficina NOVA: criar_oficina chama private.semear_checklist_padrao;
--     - em toda oficina que JA EXISTE: no fim desta migracao.
--   A funcao e idempotente (oficina que ja tem modelo nao ganha outro).
-- * O dono edita o modelo direto pela API (PostgREST):
--     adicionar: insert { modelo_id, descricao }   (ordem = fim da lista, pelo trigger)
--     renomear:  update { descricao }
--     desativar: update { ativo: false }            (sem DELETE: so desativa)
--     subir/descer: rpc('mover_item_checklist', { p_item_id, p_direcao })
-- * A vistoria COPIA a descricao do item (vistoria_itens.descricao, migracao 02):
--   renomear ou desativar um item do modelo nao muda vistoria antiga.
-- * Todos da oficina leem o modelo; so o dono escreve.
--
-- Ordem da Fase 4: 01_fase4_checklist -> 02_fase4_vistorias ->
--                  03_fase4_vistoria_rpcs -> 04_fase4_vistoria_storage
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Tabelas
-- -----------------------------------------------------------------------------
create table public.checklist_modelos (
  id             uuid primary key default gen_random_uuid(),
  oficina_id     uuid not null default private.minha_oficina_id()
                 references public.oficinas (id) on delete restrict,
  nome           text not null check (char_length(nome) between 2 and 80),
  padrao         boolean not null default true,   -- o usado pela vistoria
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  constraint checklist_modelos_id_oficina_uk unique (id, oficina_id)
);
alter table public.checklist_modelos enable row level security;
-- um modelo padrao por oficina (outros modelos, ex. onibus, ficam para depois)
create unique index checklist_modelos_padrao_uk on public.checklist_modelos (oficina_id) where padrao;
comment on table public.checklist_modelos is
  'Modelo de checklist da vistoria. Um padrao por oficina, semeado por criar_oficina. O dono renomeia.';

create trigger checklist_modelos_atualizado_em before update on public.checklist_modelos
  for each row execute function private.tg_atualizado_em();

create table public.checklist_modelo_itens (
  id             uuid primary key default gen_random_uuid(),
  oficina_id     uuid not null default private.minha_oficina_id()
                 references public.oficinas (id) on delete restrict,
  modelo_id      uuid not null,
  descricao      text not null check (char_length(descricao) between 2 and 80),
  ordem          integer not null check (ordem > 0),
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  constraint checklist_modelo_itens_modelo_fk foreign key (modelo_id, oficina_id)
    references public.checklist_modelos (id, oficina_id) on delete restrict
);
alter table public.checklist_modelo_itens enable row level security;
create index checklist_modelo_itens_modelo_idx on public.checklist_modelo_itens (modelo_id, ordem);
create index checklist_modelo_itens_oficina_idx on public.checklist_modelo_itens (oficina_id);
comment on table public.checklist_modelo_itens is
  'Itens do modelo de checklist. Sem DELETE (desativar). A vistoria copia a descricao: editar aqui nao muda vistoria antiga.';

-- Normaliza a descricao e poe o item novo no fim da lista.
create or replace function private.tg_checklist_item_normalizar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.descricao := btrim(regexp_replace(new.descricao, '\s+', ' ', 'g'));
  if tg_op = 'INSERT' and new.ordem is null then
    select coalesce(max(i.ordem), 0) + 1 into new.ordem
      from public.checklist_modelo_itens i
     where i.modelo_id = new.modelo_id;
  end if;
  return new;
end;
$$;
revoke all on function private.tg_checklist_item_normalizar() from public;

create trigger checklist_modelo_itens_normalizar before insert or update on public.checklist_modelo_itens
  for each row execute function private.tg_checklist_item_normalizar();
create trigger checklist_modelo_itens_atualizado_em before update on public.checklist_modelo_itens
  for each row execute function private.tg_atualizado_em();

-- -----------------------------------------------------------------------------
-- 2) GRANT + RLS
-- -----------------------------------------------------------------------------
revoke all on table public.checklist_modelos, public.checklist_modelo_itens from anon, authenticated;
grant select on public.checklist_modelos, public.checklist_modelo_itens to authenticated;
grant update (nome) on public.checklist_modelos to authenticated;
grant insert (modelo_id, descricao) on public.checklist_modelo_itens to authenticated;
grant update (descricao, ativo) on public.checklist_modelo_itens to authenticated;

create policy checklist_modelos_select on public.checklist_modelos
  for select to authenticated
  using (oficina_id = (select private.minha_oficina_id()));

create policy checklist_modelos_update on public.checklist_modelos
  for update to authenticated
  using (oficina_id = (select private.minha_oficina_id()) and (select private.meu_papel()) = 'dono')
  with check (oficina_id = (select private.minha_oficina_id()));

create policy checklist_modelo_itens_select on public.checklist_modelo_itens
  for select to authenticated
  using (oficina_id = (select private.minha_oficina_id()));

create policy checklist_modelo_itens_insert on public.checklist_modelo_itens
  for insert to authenticated
  with check (oficina_id = (select private.minha_oficina_id()) and (select private.meu_papel()) = 'dono');

create policy checklist_modelo_itens_update on public.checklist_modelo_itens
  for update to authenticated
  using (oficina_id = (select private.minha_oficina_id()) and (select private.meu_papel()) = 'dono')
  with check (oficina_id = (select private.minha_oficina_id()));
-- DELETE: sem politica e sem GRANT => ninguem apaga (desativar).

-- -----------------------------------------------------------------------------
-- 3) Semente: modelo padrao de caminhao (PLANO 5). Idempotente.
-- -----------------------------------------------------------------------------
create or replace function private.semear_checklist_padrao(p_oficina_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_modelo uuid;
begin
  select m.id into v_modelo from public.checklist_modelos m where m.oficina_id = p_oficina_id and m.padrao;
  if found then
    return v_modelo;
  end if;

  insert into public.checklist_modelos (oficina_id, nome, padrao)
  values (p_oficina_id, 'Caminhão (padrão)', true)
  returning id into v_modelo;

  insert into public.checklist_modelo_itens (oficina_id, modelo_id, descricao, ordem)
  select p_oficina_id, v_modelo, d.descricao, d.ordem
    from (values
      (1,  'Estepe'),
      (2,  'Macaco e chave de roda'),
      (3,  'Triângulo'),
      (4,  'Extintor'),
      (5,  'Documento do veículo'),
      (6,  'Tacógrafo'),
      (7,  'Rádio / multimídia'),
      (8,  'Faróis e lanternas'),
      (9,  'Retrovisores'),
      (10, 'Para-brisa'),
      (11, 'Pneus (estado geral)'),
      (12, 'Tanque de arla'),
      (13, 'Baterias'),
      (14, 'Carroceria / baú'),
      (15, 'Engate / quinta roda'),
      (16, 'Painel (luzes de alerta)')
    ) as d(ordem, descricao);

  return v_modelo;
end;
$$;
revoke all on function private.semear_checklist_padrao(uuid) from public;

-- -----------------------------------------------------------------------------
-- 4) criar_oficina: mesma assinatura e comportamento da Fase 1 + semente.
--    (create or replace mantem os GRANTs da Fase 1.)
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

  -- Fase 4: checklist padrao de caminhao
  perform private.semear_checklist_padrao(v_oficina);

  return v_oficina;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5) subir/descer um item (troca a ordem com o vizinho, numa transacao so).
--    Na ponta da lista nao faz nada. So o dono.
-- -----------------------------------------------------------------------------
create or replace function public.mover_item_checklist(p_item_id uuid, p_direcao text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item    public.checklist_modelo_itens;
  v_vizinho public.checklist_modelo_itens;
begin
  perform private.exigir_papel(array['dono']::public.papel_usuario[]);
  if p_direcao not in ('subir', 'descer') then
    raise exception 'direcao_invalida';
  end if;

  select i.* into v_item
    from public.checklist_modelo_itens i
   where i.id = p_item_id and i.oficina_id = private.minha_oficina_id();
  if not found then
    raise exception 'item_nao_encontrado';
  end if;
  -- trava o modelo: dois toques seguidos nao embaralham a ordem
  perform 1 from public.checklist_modelos m where m.id = v_item.modelo_id for update;
  select i.* into v_item from public.checklist_modelo_itens i where i.id = p_item_id;

  if p_direcao = 'subir' then
    select i.* into v_vizinho from public.checklist_modelo_itens i
     where i.modelo_id = v_item.modelo_id and i.ordem < v_item.ordem
     order by i.ordem desc, i.id limit 1;
  else
    select i.* into v_vizinho from public.checklist_modelo_itens i
     where i.modelo_id = v_item.modelo_id and i.ordem > v_item.ordem
     order by i.ordem, i.id limit 1;
  end if;
  if v_vizinho.id is null then
    return;  -- ja esta na ponta
  end if;

  update public.checklist_modelo_itens i
     set ordem = case when i.id = v_item.id then v_vizinho.ordem else v_item.ordem end
   where i.id in (v_item.id, v_vizinho.id);
end;
$$;
revoke all on function public.mover_item_checklist(uuid, text) from public, anon;
grant execute on function public.mover_item_checklist(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 6) Oficinas que ja existem ganham o modelo padrao
-- -----------------------------------------------------------------------------
select private.semear_checklist_padrao(o.id) from public.oficinas o;
