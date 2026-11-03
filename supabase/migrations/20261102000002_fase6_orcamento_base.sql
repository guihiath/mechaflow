-- =============================================================================
-- MechaFlow - Fase 6 - 02 orcamento por link: tabelas, imutabilidade, RLS
--
-- Ordem das migracoes da Fase 6 (depois da 20261102000001):
--   02_fase6_orcamento_base -> 03_fase6_orcamento_convivencia -> 04_fase6_orcamento_rpcs
--
-- Desenho completo: docs/ARQUITETURA.md, secao "13. Fase 6 - Orcamento por link".
--
--   orcamento_versoes        versao congelada (sem custo), so INSERT. Hash SHA-256.
--   orcamento_links          token SO em hash; revogar e a unica mudanca aceita.
--   orcamento_respostas      prova da resposta; so INSERT + marca "desfeita" (1 vez).
--   orcamento_resposta_rede  IP e navegador; separado porque tem prazo de guarda.
--   private.orcamento_tentativas  contador do limite por link (fora da API).
--
-- Imutabilidade por TRIGGER (como a vistoria): vale para dono, atendente, mecanico,
-- service_role e postgres. Leitura: so dono e atendente. Mecanico: 0 linhas.
-- Anon: nada aqui (so EXECUTE nas 2 RPCs publicas, migracao 04).
-- =============================================================================

create type public.origem_versao_orcamento as enum ('link', 'manual');
create type public.motivo_revogacao_link as enum (
  'substituido',      -- link novo para a mesma versao (reenviar)
  'alterado',         -- orcamento reaberto para alteracao
  'manual',           -- balcao cancelou o link
  'cancelada',        -- OS cancelada
  'modo_direto',      -- OS trocou para servico direto
  'desfeito',         -- aprovacao desfeita
  'resposta_manual'   -- balcao registrou a resposta a mao
);

-- -----------------------------------------------------------------------------
-- 1) orcamento_versoes: o que o cliente viu. Nunca tem custo.
-- -----------------------------------------------------------------------------
create table public.orcamento_versoes (
  id                          uuid primary key default gen_random_uuid(),
  oficina_id                  uuid not null references public.oficinas (id) on delete restrict,
  os_id                       uuid not null,
  numero                      integer not null check (numero > 0),
  origem                      public.origem_versao_orcamento not null,
  conteudo                    jsonb not null check (jsonb_typeof(conteudo) = 'object'),
  subtotal_servicos_centavos  bigint not null check (subtotal_servicos_centavos >= 0),
  subtotal_pecas_centavos     bigint not null check (subtotal_pecas_centavos >= 0),
  total_centavos              bigint not null check (total_centavos >= 0),
  hash_conteudo               text not null check (hash_conteudo ~ '^[0-9a-f]{64}$'),
  congelada_em                timestamptz not null default now(),
  congelada_por               uuid,   -- sem FK: a prova sobrevive a exclusao do usuario
  constraint orcamento_versoes_id_os_uk unique (id, os_id, oficina_id),
  constraint orcamento_versoes_numero_uk unique (os_id, numero),
  constraint orcamento_versoes_os_fk foreign key (os_id, oficina_id)
    references public.ordens_servico (id, oficina_id) on delete restrict,
  constraint orcamento_versoes_total_ck check (
    total_centavos = subtotal_servicos_centavos + subtotal_pecas_centavos
    and (conteudo ->> 'total_centavos')::bigint = total_centavos
  )
);
alter table public.orcamento_versoes enable row level security;
create index orcamento_versoes_oficina_idx on public.orcamento_versoes (oficina_id, congelada_em desc);
comment on table public.orcamento_versoes is
  'Versao congelada do orcamento: itens, subtotais, total, oficina, veiculo, cliente (nome), prazo e condicoes. NUNCA custo. So INSERT (trigger).';

-- -----------------------------------------------------------------------------
-- 2) orcamento_links: 1 token = 1 linha. Token SO em hash.
--    No maximo 1 link nao revogado por OS (indice unico parcial).
--    Link respondido continua nao revogado: o cliente ve a resposta ate vencer.
-- -----------------------------------------------------------------------------
create table public.orcamento_links (
  id                  uuid primary key default gen_random_uuid(),
  oficina_id          uuid not null references public.oficinas (id) on delete restrict,
  os_id               uuid not null,
  versao_id           uuid not null,
  token_hash          bytea not null unique check (octet_length(token_hash) = 32),
  chave_idempotencia  uuid not null,
  expira_em           timestamptz not null,
  criado_por          uuid,
  criado_em           timestamptz not null default now(),
  revogado_em         timestamptz,
  revogado_por        uuid,
  revogado_motivo     public.motivo_revogacao_link,
  constraint orcamento_links_id_oficina_uk unique (id, os_id, oficina_id),
  constraint orcamento_links_versao_fk foreign key (versao_id, os_id, oficina_id)
    references public.orcamento_versoes (id, os_id, oficina_id) on delete restrict,
  constraint orcamento_links_revogado_ck check ((revogado_em is null) = (revogado_motivo is null))
);
alter table public.orcamento_links enable row level security;
create unique index orcamento_links_um_por_os_uk on public.orcamento_links (os_id) where revogado_em is null;
create index orcamento_links_os_idx on public.orcamento_links (os_id, criado_em desc);
create index orcamento_links_oficina_idx on public.orcamento_links (oficina_id);
comment on table public.orcamento_links is
  'Link publico do orcamento. Guarda so o SHA-256 do token (256 bits gerados no banco e mostrados uma unica vez).';
comment on column public.orcamento_links.expira_em is
  'Calculada no envio (10 dias). A expiracao e conferida em cada leitura e resposta, sem rotina agendada.';

-- Versao que vale agora para a OS em orcamento_enviado. NULL = nenhuma (antes do
-- envio, OS antiga, ou a OS ja saiu de orcamento_enviado). Quem grava: RPCs.
alter table public.os_comercial
  add column orcamento_versao_vigente_id uuid,
  add constraint os_comercial_versao_vigente_fk foreign key (orcamento_versao_vigente_id, os_id, oficina_id)
    references public.orcamento_versoes (id, os_id, oficina_id) on delete restrict;
create index os_comercial_versao_vigente_idx on public.os_comercial (orcamento_versao_vigente_id)
  where orcamento_versao_vigente_id is not null;
comment on column public.os_comercial.orcamento_versao_vigente_id is
  'Versao enviada que trava os itens enquanto a OS esta em orcamento_enviado (link ativo, vencido ou cancelado).';

-- -----------------------------------------------------------------------------
-- 3) orcamento_respostas: a prova. Link ou mao.
-- -----------------------------------------------------------------------------
create table public.orcamento_respostas (
  id                 uuid primary key default gen_random_uuid(),
  oficina_id         uuid not null references public.oficinas (id) on delete restrict,
  os_id              uuid not null,
  versao_id          uuid not null,
  link_id            uuid unique,      -- unique: uma resposta por link
  canal              public.canal_resposta not null,
  aprovou            boolean not null,
  respondente_nome   text check (char_length(respondente_nome) between 1 and 120),
  motivo             text check (char_length(motivo) <= 500),
  valor_centavos     bigint not null check (valor_centavos >= 0),
  hash_versao        text not null check (hash_versao ~ '^[0-9a-f]{64}$'),
  hash_resposta      text not null check (hash_resposta ~ '^[0-9a-f]{64}$'),
  respondido_em      timestamptz not null default now(),
  registrada_por     uuid,             -- NULL = o proprio cliente, pelo link
  desfeita_em        timestamptz,
  desfeita_por       uuid,
  desfeita_por_nome  text,
  constraint orcamento_respostas_versao_fk foreign key (versao_id, os_id, oficina_id)
    references public.orcamento_versoes (id, os_id, oficina_id) on delete restrict,
  constraint orcamento_respostas_link_fk foreign key (link_id, os_id, oficina_id)
    references public.orcamento_links (id, os_id, oficina_id) on delete restrict,
  constraint orcamento_respostas_canal_ck check (
    (canal = 'link') = (link_id is not null)
    and (canal <> 'link' or registrada_por is null)
    and (canal = 'link' or registrada_por is not null)
  ),
  -- pelo link: aprovar exige nome (2 a 80); recusar aceita sem nome
  constraint orcamento_respostas_nome_ck check (
    canal <> 'link' or (
      coalesce(char_length(respondente_nome), 0) <= 80
      and (not aprovou or coalesce(char_length(respondente_nome), 0) >= 2)
    )
  ),
  constraint orcamento_respostas_desfeita_ck check ((desfeita_em is null) = (desfeita_por is null))
);
alter table public.orcamento_respostas enable row level security;
create index orcamento_respostas_os_idx on public.orcamento_respostas (os_id, respondido_em desc);
create index orcamento_respostas_oficina_idx on public.orcamento_respostas (oficina_id, respondido_em desc);
create index orcamento_respostas_versao_idx on public.orcamento_respostas (versao_id);
comment on table public.orcamento_respostas is
  'Prova da resposta do cliente. So INSERT; a unica mudanca aceita e marcar "desfeita" uma vez. Desfazer nunca apaga.';
comment on column public.orcamento_respostas.hash_resposta is
  'SHA-256 da versao + resposta (canal, aprovou, nome, motivo, valor, data). IP e navegador ficam fora: tem prazo de guarda e seriam apagados.';

-- -----------------------------------------------------------------------------
-- 4) orcamento_resposta_rede: IP e navegador, com prazo de guarda (LGPD, 12 meses)
-- -----------------------------------------------------------------------------
create table public.orcamento_resposta_rede (
  resposta_id  uuid primary key references public.orcamento_respostas (id) on delete restrict,
  oficina_id   uuid not null references public.oficinas (id) on delete restrict,
  ip           text check (char_length(ip) <= 64),
  ip_fonte     text check (ip_fonte in ('cf-connecting-ip', 'x-forwarded-for')),
  user_agent   text check (char_length(user_agent) <= 500),
  apagar_em    timestamptz not null
);
alter table public.orcamento_resposta_rede enable row level security;
create index orcamento_resposta_rede_apagar_idx on public.orcamento_resposta_rede (apagar_em);
create index orcamento_resposta_rede_oficina_idx on public.orcamento_resposta_rede (oficina_id);
comment on table public.orcamento_resposta_rede is
  'IP e navegador de quem respondeu pelo link. Sao lidos dos cabecalhos da requisicao, nunca de parametro. Apagados depois de apagar_em.';

-- -----------------------------------------------------------------------------
-- 5) Limite de tentativas POR LINK (fora da API). Uma linha por link: a janela
--    atual. Por que nao por IP: ARQUITETURA 13.5.
-- -----------------------------------------------------------------------------
create table private.orcamento_tentativas (
  link_id    uuid primary key references public.orcamento_links (id) on delete cascade,
  janela     timestamptz not null,
  leituras   integer not null default 0,
  respostas  integer not null default 0
);
alter table private.orcamento_tentativas enable row level security;
revoke all on table private.orcamento_tentativas from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 6) Imutabilidade
-- -----------------------------------------------------------------------------
create or replace function private.tg_orcamento_imutavel()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'orcamento_imutavel';
end;
$$;
revoke all on function private.tg_orcamento_imutavel() from public;

-- Link: so nao revogado -> revogado, sem nenhuma outra mudanca junto.
create or replace function private.tg_orcamento_links_proteger()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_campos text[] := array['revogado_em', 'revogado_por', 'revogado_motivo'];
begin
  if tg_op = 'UPDATE'
     and old.revogado_em is null
     and new.revogado_em is not null
     and (to_jsonb(new) - v_campos) = (to_jsonb(old) - v_campos) then
    return new;
  end if;
  raise exception 'orcamento_imutavel';
end;
$$;
revoke all on function private.tg_orcamento_links_proteger() from public;

-- Resposta: so a marca "desfeita", uma vez, sem nenhuma outra mudanca junto.
create or replace function private.tg_orcamento_respostas_proteger()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_campos text[] := array['desfeita_em', 'desfeita_por', 'desfeita_por_nome'];
begin
  if tg_op = 'UPDATE'
     and old.desfeita_em is null
     and new.desfeita_em is not null
     and (to_jsonb(new) - v_campos) = (to_jsonb(old) - v_campos) then
    return new;
  end if;
  raise exception 'orcamento_imutavel';
end;
$$;
revoke all on function private.tg_orcamento_respostas_proteger() from public;

-- Rede: nao muda; apagar so depois do prazo de guarda.
create or replace function private.tg_orcamento_rede_proteger()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and old.apagar_em <= now() then
    return old;
  end if;
  raise exception 'orcamento_imutavel';
end;
$$;
revoke all on function private.tg_orcamento_rede_proteger() from public;

create trigger orcamento_versoes_a_proteger before update or delete on public.orcamento_versoes
  for each row execute function private.tg_orcamento_imutavel();
create trigger orcamento_links_a_proteger before update or delete on public.orcamento_links
  for each row execute function private.tg_orcamento_links_proteger();
create trigger orcamento_respostas_a_proteger before update or delete on public.orcamento_respostas
  for each row execute function private.tg_orcamento_respostas_proteger();
create trigger orcamento_resposta_rede_a_proteger before update or delete on public.orcamento_resposta_rede
  for each row execute function private.tg_orcamento_rede_proteger();

create trigger orcamento_versoes_sem_truncate before truncate on public.orcamento_versoes
  for each statement execute function private.tg_orcamento_imutavel();
create trigger orcamento_links_sem_truncate before truncate on public.orcamento_links
  for each statement execute function private.tg_orcamento_imutavel();
create trigger orcamento_respostas_sem_truncate before truncate on public.orcamento_respostas
  for each statement execute function private.tg_orcamento_imutavel();
create trigger orcamento_resposta_rede_sem_truncate before truncate on public.orcamento_resposta_rede
  for each statement execute function private.tg_orcamento_imutavel();

-- -----------------------------------------------------------------------------
-- 7) Bloqueio de edicao por trigger: os_itens e os_itens_precos aceitam escrita
--    direta, entao a RPC sozinha nao bastaria. Vale para todo mundo.
--    Travado: OS em orcamento_enviado com versao vigente, com link ativo, vencido
--    ou cancelado (senao reenviar mandaria a versao velha com itens novos).
--    O caminho para mudar e alterar_orcamento. OS em orcamento_enviado sem versao
--    (antiga, da Fase 2) continua editavel.
--    Custo fica livre: nao esta na versao e o cliente nao ve.
-- -----------------------------------------------------------------------------
create or replace function private.os_orcamento_travado(p_os_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.ordens_servico o
      join public.os_comercial c on c.os_id = o.id
     where o.id = p_os_id
       and o.status = 'orcamento_enviado'
       and c.orcamento_versao_vigente_id is not null
  )
$$;
revoke all on function private.os_orcamento_travado(uuid) from public;

create or replace function private.tg_orcamento_trava_itens()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_os_ids uuid[];
begin
  if tg_table_name = 'os_itens' then
    -- marcas gravadas pelo sistema (apos_aprovacao, precificado...) nao sao edicao
    if tg_op = 'UPDATE'
       and new.os_id = old.os_id
       and new.descricao = old.descricao
       and new.quantidade = old.quantidade
       and new.unidade = old.unidade
       and new.tipo = old.tipo
       and new.servico_id is not distinct from old.servico_id
       and new.peca_id is not distinct from old.peca_id then
      return new;
    end if;
    v_os_ids := array[old.os_id, new.os_id];
  else
    select array_agg(i.os_id) into v_os_ids
      from public.os_itens i
     where i.id in (old.item_id, new.item_id);
  end if;

  -- FOR SHARE: espera o enviar_orcamento que estiver em curso (ele trava a OS).
  perform 1 from public.ordens_servico o where o.id = any (v_os_ids) for share;
  if exists (select 1 from unnest(v_os_ids) as x(id) where private.os_orcamento_travado(x.id)) then
    raise exception 'orcamento_travado';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function private.tg_orcamento_trava_itens() from public;

create trigger os_itens_orcamento_trava before insert or update or delete on public.os_itens
  for each row execute function private.tg_orcamento_trava_itens();
create trigger os_itens_precos_orcamento_trava before insert or update or delete on public.os_itens_precos
  for each row execute function private.tg_orcamento_trava_itens();

-- -----------------------------------------------------------------------------
-- 8) GRANT + RLS: so dono e atendente leem; escrita so por RPC; anon nada.
--    token_hash fica fora do GRANT de coluna: nem o balcao recebe.
-- -----------------------------------------------------------------------------
revoke all on table public.orcamento_versoes, public.orcamento_links,
  public.orcamento_respostas, public.orcamento_resposta_rede from anon, authenticated;

grant select on public.orcamento_versoes, public.orcamento_respostas, public.orcamento_resposta_rede to authenticated;
grant select (id, oficina_id, os_id, versao_id, chave_idempotencia, expira_em, criado_por, criado_em,
              revogado_em, revogado_por, revogado_motivo)
  on public.orcamento_links to authenticated;

create policy orcamento_versoes_select on public.orcamento_versoes
  for select to authenticated
  using (oficina_id = (select private.minha_oficina_id())
         and (select private.meu_papel()) in ('dono', 'atendente'));

create policy orcamento_links_select on public.orcamento_links
  for select to authenticated
  using (oficina_id = (select private.minha_oficina_id())
         and (select private.meu_papel()) in ('dono', 'atendente'));

create policy orcamento_respostas_select on public.orcamento_respostas
  for select to authenticated
  using (oficina_id = (select private.minha_oficina_id())
         and (select private.meu_papel()) in ('dono', 'atendente'));

-- depois do prazo de guarda ninguem le, mesmo antes de a linha ser apagada
create policy orcamento_resposta_rede_select on public.orcamento_resposta_rede
  for select to authenticated
  using (oficina_id = (select private.minha_oficina_id())
         and (select private.meu_papel()) in ('dono', 'atendente')
         and apagar_em > now());

-- -----------------------------------------------------------------------------
-- 9) Historico: evento novo (texto do sistema, sem valor; o mecanico le)
-- -----------------------------------------------------------------------------
alter table public.os_historico drop constraint os_historico_evento_check;
alter table public.os_historico add constraint os_historico_evento_check check (evento in (
  'criada', 'status', 'desfazer', 'mecanico', 'modo', 'aprovacao', 'recusa',
  'cancelada', 'entregue', 'pagamento', 'vistoria',
  'orcamento_link'));   -- Fase 6: link gerado / reenviado / cancelado / orcamento reaberto
