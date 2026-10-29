-- =============================================================================
-- MechaFlow - Fase 2 - 01 OS: tipos, tabelas, triggers e views
--
-- Ordem das migracoes da Fase 2 (depois das 4 da Fase 1):
--   01_fase2_os_base -> 02_fase2_os_rls -> 03_fase2_os_rpcs
--
-- Mesmo padrao da Fase 1:
--   * oficina_id com default private.minha_oficina_id(); FKs compostas (x_id, oficina_id)
--   * dinheiro em centavos (integer por item, bigint em somas)
--   * a RLS filtra LINHAS, nao colunas. Por isso o que o mecanico NAO pode ver
--     fica em tabelas separadas:
--       ordens_servico   -> todos (sem valor, sem contato do cliente)
--       os_comercial     -> dono + atendente (pagamento, valor aprovado, quem
--                           autorizou/aprovou do lado do cliente, telefones)
--       os_itens         -> todos (sem valor)
--       os_itens_precos  -> dono + atendente
--       os_itens_custos  -> so dono
--   * total calculado no banco (view vw_os_totais), nunca gravado pelo app
--   * status, numero, autorizacao, aprovacao, pagamento e cancelamento so
--     mudam por RPC (arquivo 03)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
create type public.modo_os as enum ('com_orcamento', 'direto');

-- Modo com_orcamento: aguardando_orcamento -> orcamento_enviado (opcional) -> aprovada
--                     -> em_andamento -> pronta -> entregue
-- Modo direto:        em_andamento (ja nasce autorizada) -> pronta -> entregue
-- cancelada: de qualquer status antes de entregue.
create type public.status_os as enum (
  'aguardando_orcamento',
  'orcamento_enviado',
  'aprovada',
  'em_andamento',
  'pronta',
  'entregue',
  'cancelada'
);

create type public.tipo_item_os as enum ('servico', 'peca');

create type public.forma_pagamento as enum (
  'pix', 'dinheiro', 'cartao_debito', 'cartao_credito', 'boleto', 'faturado'
);

-- Canal da resposta do cliente ao orcamento. 'link' fica reservado para a
-- Fase 6 (aprovacao pelo link publico); a RPC manual recusa 'link'.
create type public.canal_resposta as enum ('telefone', 'whatsapp', 'presencial', 'link');

-- -----------------------------------------------------------------------------
-- Funcoes auxiliares (RLS e views)
-- -----------------------------------------------------------------------------

-- "Eu vejo todas as OS da oficina?" dono/atendente: sim; mecanico: so com ve_todas_os.
create or replace function private.vejo_todas_os()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select p.papel in ('dono', 'atendente') or p.ve_todas_os
      from public.perfis p
     where p.id = auth.uid()
       and p.ativo
  ), false)
$$;

-- Nome de um colega da MESMA oficina (o mecanico nao le perfis de colegas,
-- mas precisa ver "Mecanico: Joao" e "29/10 08:14 - Ana" no historico).
create or replace function private.nome_membro(p_perfil_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.nome
    from public.perfis p
   where p.id = p_perfil_id
     and p.oficina_id = private.minha_oficina_id()
$$;

-- Nome do cliente da MESMA oficina. A partir da Fase 2 o mecanico nao le a
-- tabela clientes (telefone/documento), mas ve o nome na OS e na placa.
create or replace function private.nome_cliente(p_cliente_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select c.nome
    from public.clientes c
   where c.id = p_cliente_id
     and c.oficina_id = private.minha_oficina_id()
$$;

revoke all on function private.vejo_todas_os() from public;
revoke all on function private.nome_membro(uuid) from public;
revoke all on function private.nome_cliente(uuid) from public;
grant execute on function private.vejo_todas_os() to authenticated, service_role;
grant execute on function private.nome_membro(uuid) to authenticated, service_role;
grant execute on function private.nome_cliente(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Contador do numero da OS por oficina (schema private: a API nao enxerga).
-- A RPC abrir_os trava a linha da oficina (SELECT ... FOR UPDATE) ANTES de
-- tudo e so grava ultimo_numero + 1 no fim, na mesma transacao:
--   * duas OS simultaneas nunca recebem o mesmo numero (a 2a espera a 1a);
--   * se algo falhar, a transacao volta inteira e o numero nao e "gasto";
--   * a mesma trava serializa a checagem da chave de idempotencia.
-- Rede de seguranca: unique (oficina_id, numero) em ordens_servico.
-- -----------------------------------------------------------------------------
create table private.os_contadores (
  oficina_id     uuid primary key references public.oficinas (id) on delete cascade,
  ultimo_numero  integer not null check (ultimo_numero >= 0)
);
revoke all on table private.os_contadores from public;
comment on table private.os_contadores is 'Ultimo numero de OS usado por oficina. So a RPC abrir_os mexe aqui.';

-- -----------------------------------------------------------------------------
-- ordens_servico: SEM valor em dinheiro e SEM dados de contato (o mecanico le).
-- autorizado_em / orcamento_aprovado_em ficam aqui (so a data, sem quem) porque
-- o banco exige: modo direto nao anda sem autorizacao; com_orcamento nao anda
-- sem aprovacao (check constraint abaixo).
-- -----------------------------------------------------------------------------
create table public.ordens_servico (
  id                     uuid primary key default gen_random_uuid(),
  oficina_id             uuid not null default private.minha_oficina_id()
                         references public.oficinas (id) on delete restrict,
  numero                 integer not null check (numero > 0),
  chave_idempotencia     uuid not null,      -- gerada no navegador; reenvio devolve a mesma OS
  cliente_id             uuid not null,
  veiculo_id             uuid not null,
  mecanico_id            uuid,               -- qualquer perfil ativo da oficina (dono tambem)
  modo                   public.modo_os not null,
  status                 public.status_os not null,

  -- entrada
  km                     integer check (km >= 0),
  horimetro              integer check (horimetro >= 0),
  sintoma_relatado       text check (char_length(sintoma_relatado) <= 2000),
  observacoes            text check (char_length(observacoes) <= 2000),

  -- diagnostico / fechamento (dados para a IA, desde o dia 1)
  codigo_falha           text check (char_length(codigo_falha) <= 200),   -- SPN/FMI etc.
  causa_encontrada       text check (char_length(causa_encontrada) <= 4000),
  solucao_aplicada       text check (char_length(solucao_aplicada) <= 4000),

  -- marcos (quem/como/valor ficam em os_comercial)
  autorizado_em          timestamptz,        -- modo direto
  orcamento_enviado_em   timestamptz,
  orcamento_aprovado_em  timestamptz,        -- modo com_orcamento
  iniciado_em            timestamptz,        -- 1a vez em em_andamento
  pronta_em              timestamptz,        -- ultima vez em pronta
  entregue_em            timestamptz,

  -- cancelamento
  cancelado_em           timestamptz,
  cancelado_por          uuid references auth.users (id) on delete set null,
  motivo_cancelamento    text check (char_length(motivo_cancelamento) <= 500),

  criado_por             uuid default auth.uid() references auth.users (id) on delete set null,
  criado_em              timestamptz not null default now(),
  atualizado_em          timestamptz not null default now(),

  constraint ordens_servico_id_oficina_uk unique (id, oficina_id),
  constraint ordens_servico_numero_uk unique (oficina_id, numero),
  constraint ordens_servico_chave_uk unique (oficina_id, chave_idempotencia),
  constraint ordens_servico_cliente_fk foreign key (cliente_id, oficina_id)
    references public.clientes (id, oficina_id) on delete restrict,
  constraint ordens_servico_veiculo_fk foreign key (veiculo_id, oficina_id)
    references public.veiculos (id, oficina_id) on delete restrict,
  constraint ordens_servico_mecanico_fk foreign key (mecanico_id, oficina_id)
    references public.perfis (id, oficina_id) on delete set null (mecanico_id),
  -- modo direto: so em_andamento/pronta/entregue/cancelada, e sempre autorizada
  constraint ordens_servico_direto_ck check (
    modo <> 'direto'
    or (status in ('em_andamento', 'pronta', 'entregue', 'cancelada') and autorizado_em is not null)
  ),
  -- com_orcamento: de aprovada em diante exige a aprovacao registrada
  constraint ordens_servico_aprovacao_ck check (
    modo <> 'com_orcamento'
    or status not in ('aprovada', 'em_andamento', 'pronta', 'entregue')
    or orcamento_aprovado_em is not null
  ),
  constraint ordens_servico_cancelada_ck check (
    status <> 'cancelada' or (cancelado_em is not null and motivo_cancelamento is not null)
  )
);
alter table public.ordens_servico enable row level security;
comment on table public.ordens_servico is 'Ordem de servico. Criada so pela RPC abrir_os; status so muda por RPC. Sem valores nem contatos (ver os_comercial e vw_os_totais).';

-- Lista por status/data, "minhas OS", historico do veiculo e do cliente.
create index ordens_servico_oficina_status_idx on public.ordens_servico (oficina_id, status, criado_em desc);
create index ordens_servico_oficina_criado_idx on public.ordens_servico (oficina_id, criado_em desc);
create index ordens_servico_mecanico_idx on public.ordens_servico (mecanico_id, status) where mecanico_id is not null;
create index ordens_servico_veiculo_idx on public.ordens_servico (veiculo_id, criado_em desc);
create index ordens_servico_cliente_idx on public.ordens_servico (cliente_id, criado_em desc);
-- (oficina_id, numero) ja tem indice pela constraint unique (busca por numero).

-- Normaliza textos e trava a OS fechada:
--   entregue / cancelada: por UPDATE direto so "observacoes" muda.
-- (status, numero etc. nem tem GRANT de UPDATE; so as RPCs mudam.)
create or replace function private.tg_os_normalizar_proteger()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.sintoma_relatado    := nullif(btrim(new.sintoma_relatado), '');
  new.observacoes         := nullif(btrim(new.observacoes), '');
  new.codigo_falha        := nullif(upper(btrim(new.codigo_falha)), '');
  new.causa_encontrada    := nullif(btrim(new.causa_encontrada), '');
  new.solucao_aplicada    := nullif(btrim(new.solucao_aplicada), '');
  new.motivo_cancelamento := nullif(btrim(new.motivo_cancelamento), '');

  if tg_op = 'UPDATE'
     and old.status in ('entregue', 'cancelada')
     and new.status = old.status
     and (   new.km is distinct from old.km
          or new.horimetro is distinct from old.horimetro
          or new.sintoma_relatado is distinct from old.sintoma_relatado
          or new.codigo_falha is distinct from old.codigo_falha
          or new.causa_encontrada is distinct from old.causa_encontrada
          or new.solucao_aplicada is distinct from old.solucao_aplicada) then
    raise exception 'os_fechada';
  end if;

  return new;
end;
$$;

create trigger ordens_servico_normalizar before insert or update on public.ordens_servico
  for each row execute function private.tg_os_normalizar_proteger();
create trigger ordens_servico_atualizado_em before update on public.ordens_servico
  for each row execute function private.tg_atualizado_em();

-- -----------------------------------------------------------------------------
-- os_comercial (1:1 com a OS) - SO dono + atendente. Escrita so por RPC.
-- Tudo que e dinheiro, pagamento ou contato/identidade de quem autorizou.
-- Fase 6: o link publico vai gravar aqui a aprovacao com canal 'link' e
-- orcamento_aprovacao_registrada_por NULL.
-- -----------------------------------------------------------------------------
create table public.os_comercial (
  os_id                               uuid primary key,
  oficina_id                          uuid not null default private.minha_oficina_id(),

  -- modo direto: quem do lado do cliente autorizou e quem registrou no app
  autorizado_por_nome                 text check (char_length(autorizado_por_nome) between 2 and 120),
  autorizado_por_telefone             text check (autorizado_por_telefone ~ '^[0-9]{10,13}$'),
  autorizacao_registrada_por          uuid references auth.users (id) on delete set null,

  -- com_orcamento: aprovacao manual (Fase 2) ou pelo link (Fase 6)
  orcamento_aprovado_por_nome         text check (char_length(orcamento_aprovado_por_nome) <= 120),
  orcamento_aprovacao_canal           public.canal_resposta,
  orcamento_aprovacao_registrada_por  uuid references auth.users (id) on delete set null,
  valor_aprovado_centavos             bigint check (valor_aprovado_centavos >= 0),

  -- pagamento
  forma_pagamento                     public.forma_pagamento,
  pago_em                             timestamptz,
  pagamento_registrado_por            uuid references auth.users (id) on delete set null,

  atualizado_em                       timestamptz not null default now(),
  constraint os_comercial_os_fk foreign key (os_id, oficina_id)
    references public.ordens_servico (id, oficina_id) on delete cascade,
  constraint os_comercial_pago_forma_ck check (pago_em is null or forma_pagamento is not null)
);
alter table public.os_comercial enable row level security;
create index os_comercial_oficina_idx on public.os_comercial (oficina_id);
-- contas a receber (Fase 7): OS entregues sem pago_em
create index os_comercial_a_receber_idx on public.os_comercial (oficina_id) where pago_em is null;
comment on table public.os_comercial is 'Dados comerciais da OS (pagamento, valor aprovado, quem autorizou/aprovou). So dono e atendente leem; so RPCs gravam.';

create trigger os_comercial_atualizado_em before update on public.os_comercial
  for each row execute function private.tg_atualizado_em();

-- -----------------------------------------------------------------------------
-- os_itens (SEM dinheiro: o mecanico le e, na Fase 3, lanca)
-- Catalogo com on delete RESTRICT de proposito: item ja usado em OS nao se
-- apaga (desativar com ativo = false). Preserva historico e "mais usados".
-- -----------------------------------------------------------------------------
create table public.os_itens (
  id                  uuid primary key default gen_random_uuid(),
  oficina_id          uuid not null default private.minha_oficina_id()
                      references public.oficinas (id) on delete restrict,
  os_id               uuid not null,
  chave_idempotencia  uuid,           -- preenchida pela RPC adicionar_item_os
  tipo                public.tipo_item_os not null,
  servico_id          uuid,           -- do catalogo (NULL = avulso)
  peca_id             uuid,           -- do catalogo (NULL = avulsa)
  descricao           text not null check (char_length(descricao) between 1 and 200),
  quantidade          numeric(10, 3) not null default 1 check (quantidade > 0 and quantidade <= 9999999),
  unidade             text not null default 'un'
                      check (unidade in ('un', 'par', 'jogo', 'kit', 'l', 'kg', 'm', 'h')),
  lancado_por         uuid default auth.uid() references auth.users (id) on delete set null,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now(),
  constraint os_itens_id_oficina_uk unique (id, oficina_id),
  constraint os_itens_chave_uk unique (oficina_id, chave_idempotencia),
  constraint os_itens_os_fk foreign key (os_id, oficina_id)
    references public.ordens_servico (id, oficina_id) on delete cascade,
  constraint os_itens_servico_fk foreign key (servico_id, oficina_id)
    references public.catalogo_servicos (id, oficina_id) on delete restrict,
  constraint os_itens_peca_fk foreign key (peca_id, oficina_id)
    references public.catalogo_pecas (id, oficina_id) on delete restrict,
  constraint os_itens_tipo_ck check (
    (tipo = 'servico' and peca_id is null) or (tipo = 'peca' and servico_id is null)
  )
);
alter table public.os_itens enable row level security;
create index os_itens_os_idx on public.os_itens (os_id, criado_em);
create index os_itens_servico_idx on public.os_itens (servico_id) where servico_id is not null;
create index os_itens_peca_idx on public.os_itens (peca_id) where peca_id is not null;
comment on table public.os_itens is 'Itens (servico/peca) da OS, sem valores. Preco em os_itens_precos, custo em os_itens_custos.';

create or replace function private.tg_os_itens_normalizar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.descricao := btrim(new.descricao);
  return new;
end;
$$;

create trigger os_itens_normalizar before insert or update on public.os_itens
  for each row execute function private.tg_os_itens_normalizar();
create trigger os_itens_atualizado_em before update on public.os_itens
  for each row execute function private.tg_atualizado_em();

-- -----------------------------------------------------------------------------
-- os_itens_precos (dono + atendente) e os_itens_custos (so dono)
-- Valores UNITARIOS. Subtotal = round(quantidade * unitario).
-- -----------------------------------------------------------------------------
create table public.os_itens_precos (
  item_id                  uuid primary key,
  oficina_id               uuid not null default private.minha_oficina_id(),
  preco_unitario_centavos  integer not null check (preco_unitario_centavos >= 0),
  atualizado_em            timestamptz not null default now(),
  constraint os_itens_precos_item_fk foreign key (item_id, oficina_id)
    references public.os_itens (id, oficina_id) on delete cascade
);
alter table public.os_itens_precos enable row level security;
create index os_itens_precos_oficina_id_idx on public.os_itens_precos (oficina_id);
create trigger os_itens_precos_atualizado_em before update on public.os_itens_precos
  for each row execute function private.tg_atualizado_em();

create table public.os_itens_custos (
  item_id                  uuid primary key,
  oficina_id               uuid not null default private.minha_oficina_id(),
  custo_unitario_centavos  integer not null check (custo_unitario_centavos >= 0),
  atualizado_em            timestamptz not null default now(),
  constraint os_itens_custos_item_fk foreign key (item_id, oficina_id)
    references public.os_itens (id, oficina_id) on delete cascade
);
alter table public.os_itens_custos enable row level security;
create index os_itens_custos_oficina_id_idx on public.os_itens_custos (oficina_id);
create trigger os_itens_custos_atualizado_em before update on public.os_itens_custos
  for each row execute function private.tg_atualizado_em();

-- Item e preco so mudam com a OS aberta (de aguardando_orcamento ate pronta).
-- O custo continua editavel pelo dono depois (nota do fornecedor chega depois;
-- nao muda o que o cliente paga).
-- DEFINER: precisa ler a OS mesmo quando quem grava nao a enxerga pela RLS.
create or replace function private.tg_os_item_exige_os_aberta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_os_id  uuid;
  v_status public.status_os;
begin
  if tg_table_name = 'os_itens' then
    v_os_id := case when tg_op = 'DELETE' then old.os_id else new.os_id end;
  else
    select i.os_id into v_os_id
      from public.os_itens i
     where i.id = case when tg_op = 'DELETE' then old.item_id else new.item_id end;
  end if;

  select o.status into v_status from public.ordens_servico o where o.id = v_os_id;
  if v_status in ('entregue', 'cancelada') then
    raise exception 'os_fechada';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
revoke all on function private.tg_os_item_exige_os_aberta() from public;

create trigger os_itens_exige_os_aberta before insert or update or delete on public.os_itens
  for each row execute function private.tg_os_item_exige_os_aberta();
create trigger os_itens_precos_exige_os_aberta before insert or update or delete on public.os_itens_precos
  for each row execute function private.tg_os_item_exige_os_aberta();

-- -----------------------------------------------------------------------------
-- os_historico: linha do tempo. Gravado so pelas RPCs; ninguem altera ou apaga.
-- Eventos que NAO mudam status tambem entram (mecanico, recusa, pagamento...).
-- "observacao" nunca leva valor em dinheiro nem telefone (o mecanico le).
-- Sem FK em "por": o log sobrevive a exclusao do usuario.
-- -----------------------------------------------------------------------------
create table public.os_historico (
  id           uuid primary key default gen_random_uuid(),
  oficina_id   uuid not null,
  os_id        uuid not null,
  evento       text not null check (evento in (
                 'criada',        -- abertura
                 'status',        -- avancou no fluxo
                 'desfazer',      -- voltou um passo (Desfazer / reabrir)
                 'mecanico',      -- trocou/tirou mecanico
                 'modo',          -- trocou o modo
                 'aprovacao',     -- cliente aprovou (com_orcamento)
                 'recusa',        -- cliente recusou (sem mudar status, ou com cancelamento)
                 'cancelada',
                 'entregue',
                 'pagamento')),   -- pagamento registrado
  de_status    public.status_os,
  para_status  public.status_os,
  observacao   text check (char_length(observacao) <= 500),
  por          uuid default auth.uid(),
  em           timestamptz not null default now(),
  constraint os_historico_os_fk foreign key (os_id, oficina_id)
    references public.ordens_servico (id, oficina_id) on delete cascade
);
alter table public.os_historico enable row level security;
create index os_historico_os_idx on public.os_historico (os_id, em);
create index os_historico_oficina_idx on public.os_historico (oficina_id);
comment on table public.os_historico is 'Linha do tempo da OS. So as RPCs gravam; ninguem altera ou apaga.';

-- -----------------------------------------------------------------------------
-- Views (security_invoker: respeitam a RLS de quem consulta)
-- -----------------------------------------------------------------------------

-- Totais da OS. Mecanico: 0 linhas (filtro por papel + RLS dos precos).
-- custo_total/itens_sem_custo: so o dono (NULL para o atendente).
create view public.vw_os_totais
with (security_invoker = true)
as
select
  o.id         as os_id,
  o.oficina_id,
  coalesce(sum(round(i.quantidade * p.preco_unitario_centavos)) filter (where i.tipo = 'servico'), 0)::bigint
               as total_servicos_centavos,
  coalesce(sum(round(i.quantidade * p.preco_unitario_centavos)) filter (where i.tipo = 'peca'), 0)::bigint
               as total_pecas_centavos,
  coalesce(sum(round(i.quantidade * p.preco_unitario_centavos)), 0)::bigint
               as total_centavos,
  count(i.id)::integer
               as qtd_itens,
  count(i.id) filter (where p.item_id is null)::integer
               as itens_sem_preco,
  case when (select private.meu_papel()) = 'dono'
       then coalesce(sum(round(i.quantidade * k.custo_unitario_centavos)), 0)::bigint end
               as custo_total_centavos,
  case when (select private.meu_papel()) = 'dono'
       then (count(i.id) filter (where i.tipo = 'peca' and k.item_id is null))::integer end
               as pecas_sem_custo
from public.ordens_servico o
left join public.os_itens i        on i.os_id = o.id
left join public.os_itens_precos p on p.item_id = i.id
left join public.os_itens_custos k on k.item_id = i.id
where (select private.meu_papel()) in ('dono', 'atendente')
group by o.id, o.oficina_id;

-- Itens com valores. Mecanico: preco/subtotal/custo NULL. Atendente: custo NULL.
create view public.vw_os_itens
with (security_invoker = true)
as
select
  i.id,
  i.oficina_id,
  i.os_id,
  i.tipo,
  i.servico_id,
  i.peca_id,
  i.descricao,
  i.quantidade,
  i.unidade,
  i.lancado_por,
  private.nome_membro(i.lancado_por) as lancado_por_nome,
  i.criado_em,
  i.atualizado_em,
  cp.pendente_precificacao           as peca_pendente_precificacao,
  p.preco_unitario_centavos,
  round(i.quantidade * p.preco_unitario_centavos)::bigint as subtotal_centavos,
  k.custo_unitario_centavos
from public.os_itens i
left join public.os_itens_precos p on p.item_id = i.id
left join public.os_itens_custos k on k.item_id = i.id
left join public.catalogo_pecas cp on cp.id = i.peca_id;

-- Lista e detalhe da OS (uma view para os dois).
-- Mecanico: cliente_telefone, autorizacao/aprovacao (quem), pagamento e todos
-- os valores voltam NULL (vem de clientes/os_comercial/vw_os_totais, que ele
-- nao le). Os LEFT JOINs sao de proposito: com INNER o mecanico perderia a linha.
create view public.vw_os
with (security_invoker = true)
as
select
  o.id,
  o.oficina_id,
  o.numero,
  o.modo,
  o.status,
  o.cliente_id,
  private.nome_cliente(o.cliente_id)  as cliente_nome,
  c.telefone                          as cliente_telefone,
  o.veiculo_id,
  v.placa,
  v.tipo                              as veiculo_tipo,
  v.marca                             as veiculo_marca,
  v.modelo                            as veiculo_modelo,
  v.ano_modelo                        as veiculo_ano_modelo,
  o.mecanico_id,
  private.nome_membro(o.mecanico_id)  as mecanico_nome,
  o.km,
  o.horimetro,
  o.sintoma_relatado,
  o.observacoes,
  o.codigo_falha,
  o.causa_encontrada,
  o.solucao_aplicada,
  o.autorizado_em,
  oc.autorizado_por_nome,
  oc.autorizado_por_telefone,
  private.nome_membro(oc.autorizacao_registrada_por)         as autorizacao_registrada_por_nome,
  o.orcamento_enviado_em,
  o.orcamento_aprovado_em,
  oc.orcamento_aprovacao_canal,
  oc.orcamento_aprovado_por_nome,
  private.nome_membro(oc.orcamento_aprovacao_registrada_por) as orcamento_aprovacao_registrada_por_nome,
  oc.valor_aprovado_centavos,
  oc.forma_pagamento,
  oc.pago_em,
  private.nome_membro(oc.pagamento_registrado_por)           as pagamento_registrado_por_nome,
  o.iniciado_em,
  o.pronta_em,
  o.entregue_em,
  o.cancelado_em,
  private.nome_membro(o.cancelado_por) as cancelado_por_nome,
  o.motivo_cancelamento,
  o.criado_por,
  private.nome_membro(o.criado_por)   as criado_por_nome,
  o.criado_em,
  o.atualizado_em,
  t.total_servicos_centavos,
  t.total_pecas_centavos,
  t.total_centavos,
  t.custo_total_centavos,
  t.qtd_itens,
  t.itens_sem_preco
from public.ordens_servico o
join public.veiculos v           on v.id = o.veiculo_id
left join public.clientes c      on c.id = o.cliente_id
left join public.os_comercial oc on oc.os_id = o.id
left join lateral (
  select tt.* from public.vw_os_totais tt where tt.os_id = o.id
) t on true;

-- Linha do tempo com o nome de quem fez.
create view public.vw_os_historico
with (security_invoker = true)
as
select
  h.id,
  h.oficina_id,
  h.os_id,
  h.evento,
  h.de_status,
  h.para_status,
  h.observacao,
  h.por,
  private.nome_membro(h.por) as por_nome,
  h.em
from public.os_historico h;

-- "Mais usados" do catalogo (contagem em os_itens). Sem valores.
create view public.vw_catalogo_mais_usados
with (security_invoker = true)
as
select
  i.oficina_id,
  i.tipo,
  coalesce(i.servico_id, i.peca_id) as catalogo_id,
  count(*)::integer                 as usos,
  max(i.criado_em)                  as ultimo_uso_em
from public.os_itens i
where i.servico_id is not null or i.peca_id is not null
group by i.oficina_id, i.tipo, coalesce(i.servico_id, i.peca_id);
