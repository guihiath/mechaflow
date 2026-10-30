-- =============================================================================
-- MechaFlow - Fase 3 - 05 mecanico lanca itens na OS (F3-A1)
--
-- Ordem das migracoes da Fase 3 (depois das 4 da Fase 2):
--   05_fase3_itens_mecanico -> 06_fase3_fotos -> 07_fase3_observacoes
--
-- Decisoes do CEO (PLANO 16.6):
--   1. o mecanico lanca itens em aguardando_orcamento, aprovada e em_andamento
--      (nao em orcamento_enviado, pronta, entregue, cancelada);
--   2. peca nova do mecanico fica SO na OS (item avulso sem preco; nao cria
--      item de catalogo). Isso substitui a regra F15 da Fase 2;
--   3. item do mecanico que o balcao ja precificou vira SO LEITURA para ele;
--   4. item lancado depois da aprovacao so e marcado (nao bloqueia a entrega);
--   5. mecanico com ve_todas_os ve todas, mas so lanca nas atribuidas a ele.
--
-- Como fica:
--   * o mecanico NAO escreve mais direto em os_itens (RLS so para dono e
--     atendente). Ele lanca, altera e remove so pelas RPCs
--     adicionar_item_os / alterar_item_mecanico / remover_item_mecanico, que
--     conferem status, dono do item e "ja precificado" (ele nao le precos, a
--     RLS nao conseguiria conferir isso por ele);
--   * item do catalogo recebe preco e custo do catalogo dentro da RPC (como na
--     Fase 2); item avulso ou catalogo sem preco fica SEM PRECO (pendencia);
--   * os_itens ganha: lancado_pelo_mecanico, apos_aprovacao,
--     precificado_pelo_balcao_em (gravados por trigger, ninguem edita);
--   * vw_os_totais ganha itens_mecanico e itens_apos_aprovacao (o mecanico
--     continua recebendo 0 linhas); vw_os_itens ganha as 3 colunas e
--     mecanico_pode_alterar.
--   * o total aprovado continua em os_comercial.valor_aprovado_centavos (nada
--     aqui mexe nele) e o status nao volta sozinho.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Colunas novas em os_itens
-- -----------------------------------------------------------------------------
alter table public.os_itens
  add column lancado_pelo_mecanico       boolean not null default false,
  add column apos_aprovacao              boolean not null default false,
  add column precificado_pelo_balcao_em  timestamptz;

comment on column public.os_itens.lancado_pelo_mecanico is
  'Lancado por alguem com papel mecanico (gravado pelo trigger). Dono/atendente veem "lancado pelo mecanico".';
comment on column public.os_itens.apos_aprovacao is
  'OS com_orcamento: item entrou depois da aprovacao do cliente (gravado pelo trigger; zera quando a OS e aprovada de novo ou volta para antes da aprovacao).';
comment on column public.os_itens.precificado_pelo_balcao_em is
  'Quando o dono/atendente deu (ou mudou) o preco. A partir dai o item e so leitura para o mecanico.';

-- Dados ja gravados (staging: so dados de teste). Os triggers de OS fechada e
-- atualizado_em ficam desligados so durante a conversao.
alter table public.os_itens disable trigger os_itens_exige_os_aberta;
alter table public.os_itens disable trigger os_itens_atualizado_em;

update public.os_itens i
   set lancado_pelo_mecanico = true
  from public.perfis p
 where p.id = i.lancado_por and p.papel = 'mecanico';

-- item do mecanico que ja tem preco: tratado como precificado (conservador: so leitura para ele)
update public.os_itens i
   set precificado_pelo_balcao_em = pr.atualizado_em
  from public.os_itens_precos pr
 where pr.item_id = i.id and i.lancado_pelo_mecanico;

update public.os_itens i
   set apos_aprovacao = true
  from public.ordens_servico o
 where o.id = i.os_id
   and o.modo = 'com_orcamento'
   and o.orcamento_aprovado_em is not null
   and i.criado_em > o.orcamento_aprovado_em;

alter table public.os_itens enable trigger os_itens_exige_os_aberta;
alter table public.os_itens enable trigger os_itens_atualizado_em;

-- -----------------------------------------------------------------------------
-- 2) Triggers
-- -----------------------------------------------------------------------------

-- Ao inserir item (por RPC ou insert direto do balcao):
--   lancado_por = quem esta logado; lancado_pelo_mecanico pelo papel;
--   apos_aprovacao = OS com_orcamento ja aprovada; precificado = vazio.
-- DEFINER: le perfis/ordens_servico mesmo quando quem grava nao os enxerga.
create or replace function private.tg_os_itens_origem()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_os public.ordens_servico;
begin
  new.lancado_por := coalesce(auth.uid(), new.lancado_por);
  new.lancado_pelo_mecanico := coalesce(
    (select p.papel = 'mecanico' from public.perfis p where p.id = new.lancado_por), false);

  select o.* into v_os from public.ordens_servico o where o.id = new.os_id;
  new.apos_aprovacao := coalesce(v_os.modo = 'com_orcamento' and v_os.orcamento_aprovado_em is not null, false);
  new.precificado_pelo_balcao_em := null;
  return new;
end;
$$;
revoke all on function private.tg_os_itens_origem() from public;

create trigger os_itens_origem before insert on public.os_itens
  for each row execute function private.tg_os_itens_origem();

-- Preco gravado/alterado por dono ou atendente => o item fica "precificado
-- pelo balcao" (so leitura para o mecanico). O preco que a RPC copia do
-- catalogo quando o MECANICO lanca nao conta (ele ainda pode corrigir a
-- quantidade ou remover).
create or replace function private.tg_os_itens_precos_balcao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.meu_papel() in ('dono', 'atendente') then
    update public.os_itens i
       set precificado_pelo_balcao_em = now()
     where i.id = new.item_id
       and i.precificado_pelo_balcao_em is null;
  end if;
  return null;
end;
$$;
revoke all on function private.tg_os_itens_precos_balcao() from public;

create trigger os_itens_precos_balcao after insert or update on public.os_itens_precos
  for each row execute function private.tg_os_itens_precos_balcao();

-- -----------------------------------------------------------------------------
-- 3) RLS de os_itens: escrita direta so dono/atendente (o mecanico usa RPC)
-- -----------------------------------------------------------------------------
drop policy os_itens_insert on public.os_itens;
drop policy os_itens_update on public.os_itens;
drop policy os_itens_delete on public.os_itens;

create policy os_itens_insert on public.os_itens
  for insert to authenticated
  with check (
    oficina_id = (select private.minha_oficina_id())
    and (select private.meu_papel()) in ('dono', 'atendente')
    and os_id in (select o.id from public.ordens_servico o)
  );

create policy os_itens_update on public.os_itens
  for update to authenticated
  using (
    oficina_id = (select private.minha_oficina_id())
    and (select private.meu_papel()) in ('dono', 'atendente')
  )
  with check (oficina_id = (select private.minha_oficina_id()));

create policy os_itens_delete on public.os_itens
  for delete to authenticated
  using (
    oficina_id = (select private.minha_oficina_id())
    and (select private.meu_papel()) in ('dono', 'atendente')
  );

-- -----------------------------------------------------------------------------
-- 4) Internas
-- -----------------------------------------------------------------------------

-- Status em que o MECANICO lanca/altera/remove itens (decisao 1 do CEO).
create or replace function private.mecanico_lanca_itens(p_status public.status_os)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_status in ('aguardando_orcamento', 'aprovada', 'em_andamento')
$$;
revoke all on function private.mecanico_lanca_itens(public.status_os) from public;
grant execute on function private.mecanico_lanca_itens(public.status_os) to authenticated, service_role;

-- aplicar_status (mesma assinatura e corpo da migracao 04) + zera a marca
-- "apos a aprovacao" quando a OS e aprovada (o valor aprovado novo ja inclui
-- os itens) ou volta para antes da aprovacao.
create or replace function private.aplicar_status(
  p_os                  public.ordens_servico,
  p_para                public.status_os,
  p_evento              text,
  p_observacao          text default null,
  p_motivo_cancelamento text default null,
  p_motivo_texto        text default null,
  p_observacao_interna  text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.ordens_servico o
     set status                = p_para,
         orcamento_enviado_em  = case when p_para = 'orcamento_enviado' then now() else o.orcamento_enviado_em end,
         orcamento_aprovado_em = case when p_para = 'aprovada' then now()
                                      when p_para in ('aguardando_orcamento', 'orcamento_enviado') then null
                                      else o.orcamento_aprovado_em end,
         iniciado_em           = case when p_para = 'em_andamento' then coalesce(o.iniciado_em, now()) else o.iniciado_em end,
         pronta_em             = case when p_para = 'pronta' then now() else o.pronta_em end,
         entregue_em           = case when p_para = 'entregue' then now() else o.entregue_em end,
         cancelado_em          = case when p_para = 'cancelada' then now() else o.cancelado_em end,
         cancelado_por         = case when p_para = 'cancelada' then auth.uid() else o.cancelado_por end,
         motivo_cancelamento   = case when p_para = 'cancelada' then p_motivo_cancelamento else o.motivo_cancelamento end
   where o.id = p_os.id;

  if p_para = 'cancelada' then
    update public.os_comercial c
       set motivo_cancelamento_texto = left(nullif(btrim(p_motivo_texto), ''), 500)
     where c.os_id = p_os.id;
  end if;

  -- Voltou para antes da aprovacao: apaga a aprovacao registrada.
  if p_para in ('aguardando_orcamento', 'orcamento_enviado') then
    update public.os_comercial c
       set orcamento_aprovado_por_nome        = null,
           orcamento_aprovacao_canal          = null,
           orcamento_aprovacao_registrada_por = null,
           valor_aprovado_centavos            = null
     where c.os_id = p_os.id;
  end if;

  -- Fase 3: aprovacao nova (ou desfeita) => nenhum item e "apos a aprovacao".
  if p_para in ('aprovada', 'aguardando_orcamento', 'orcamento_enviado') then
    update public.os_itens i
       set apos_aprovacao = false
     where i.os_id = p_os.id and i.apos_aprovacao;
  end if;

  perform private.registrar_historico(p_os, p_evento, p_os.status, p_para, p_observacao, p_observacao_interna);
end;
$$;

-- Le e TRAVA um item que o MECANICO quer alterar/remover, conferindo tudo.
-- Devolve NULL se o item nao existe (ou nao e visivel para ele).
create or replace function private.travar_item_do_mecanico(p_item_id uuid)
returns public.os_itens
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.os_itens;
  v_os   public.ordens_servico;
begin
  select i.* into v_item
    from public.os_itens i
   where i.id = p_item_id
     and i.oficina_id = private.minha_oficina_id();
  if not found then
    return null;
  end if;

  -- trava a OS (mesma ordem de travas do adicionar_item_os) e depois o item
  v_os := private.travar_os(v_item.os_id);
  select i.* into v_item from public.os_itens i where i.id = p_item_id for update;
  if not found then
    return null;
  end if;

  if v_os.mecanico_id is distinct from auth.uid() then
    raise exception 'acesso_negado' using errcode = '42501';
  end if;
  if v_os.status in ('entregue', 'cancelada') then
    raise exception 'os_fechada';
  end if;
  if not private.mecanico_lanca_itens(v_os.status) then
    raise exception 'status_nao_permite_itens';
  end if;
  if not v_item.lancado_pelo_mecanico or v_item.lancado_por is distinct from auth.uid() then
    raise exception 'item_de_outra_pessoa';
  end if;
  if v_item.precificado_pelo_balcao_em is not null then
    raise exception 'item_ja_precificado';
  end if;
  return v_item;
end;
$$;
revoke all on function private.travar_item_do_mecanico(uuid) from public;

-- -----------------------------------------------------------------------------
-- 5) adicionar_item_os (mesma assinatura): regras novas do mecanico
--    * OS atribuida a ele, em aguardando_orcamento / aprovada / em_andamento;
--    * sem enviar preco nem custo (acesso_negado);
--    * servico ou peca do catalogo => preco/custo copiados do catalogo;
--    * servico ou peca AVULSOS => descricao obrigatoria, fica sem preco.
-- -----------------------------------------------------------------------------
create or replace function public.adicionar_item_os(
  p_chave_idempotencia      uuid,
  p_os_id                   uuid,
  p_tipo                    public.tipo_item_os,
  p_servico_id              uuid default null,
  p_peca_id                 uuid default null,
  p_descricao               text default null,
  p_quantidade              numeric default 1,
  p_unidade                 text default null,
  p_preco_unitario_centavos integer default null,
  p_custo_unitario_centavos integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid;
  v_papel     public.papel_usuario;
  v_os        public.ordens_servico;
  v_item_id   uuid;
  v_nome      text;
  v_unidade   text;
  v_preco_cat integer;
  v_custo_cat integer;
  v_preco     integer;
  v_custo     integer;
  v_descricao text;
begin
  v_papel := private.exigir_papel(array['dono', 'atendente', 'mecanico']::public.papel_usuario[]);
  v_uid   := auth.uid();

  if p_chave_idempotencia is null then
    raise exception 'chave_obrigatoria';
  end if;

  -- trava a OS: serializa reenvios simultaneos do mesmo item
  v_os := private.travar_os(p_os_id);

  select i.id into v_item_id
    from public.os_itens i
   where i.oficina_id = v_os.oficina_id and i.chave_idempotencia = p_chave_idempotencia;
  if found then
    return v_item_id;  -- reenvio
  end if;

  if v_papel = 'mecanico' then
    -- com ve_todas_os ele ve a OS, mas so lanca nas atribuidas a ele
    if v_os.mecanico_id is distinct from v_uid then
      raise exception 'acesso_negado' using errcode = '42501';
    end if;
    if p_preco_unitario_centavos is not null or p_custo_unitario_centavos is not null then
      raise exception 'acesso_negado' using errcode = '42501';
    end if;
  end if;

  if v_os.status in ('entregue', 'cancelada') then
    raise exception 'os_fechada';
  end if;

  if v_papel = 'mecanico' and not private.mecanico_lanca_itens(v_os.status) then
    raise exception 'status_nao_permite_itens';
  elsif v_papel = 'atendente' and p_custo_unitario_centavos is not null then
    raise exception 'acesso_negado' using errcode = '42501';
  end if;

  if p_tipo is null
     or (p_tipo = 'servico' and p_peca_id is not null)
     or (p_tipo = 'peca' and p_servico_id is not null) then
    raise exception 'item_invalido';
  end if;
  if p_quantidade is null or p_quantidade <= 0 or p_quantidade > 9999999 then
    raise exception 'quantidade_invalida';
  end if;
  if coalesce(p_preco_unitario_centavos, 0) < 0 or coalesce(p_custo_unitario_centavos, 0) < 0 then
    raise exception 'valor_invalido';
  end if;

  if p_servico_id is not null then
    select s.nome, sp.preco_padrao_centavos into v_nome, v_preco_cat
      from public.catalogo_servicos s
      left join public.catalogo_servicos_precos sp on sp.servico_id = s.id
     where s.id = p_servico_id and s.oficina_id = v_os.oficina_id;
    if not found then
      raise exception 'catalogo_item_nao_encontrado';
    end if;
  elsif p_peca_id is not null then
    select pc.nome, pc.unidade, pp.preco_venda_centavos, ck.custo_centavos
      into v_nome, v_unidade, v_preco_cat, v_custo_cat
      from public.catalogo_pecas pc
      left join public.catalogo_pecas_precos pp on pp.peca_id = pc.id
      left join public.catalogo_pecas_custos ck on ck.peca_id = pc.id
     where pc.id = p_peca_id and pc.oficina_id = v_os.oficina_id;
    if not found then
      raise exception 'catalogo_item_nao_encontrado';
    end if;
  end if;

  v_descricao := coalesce(nullif(btrim(p_descricao), ''), v_nome);
  if v_descricao is null then
    raise exception 'descricao_obrigatoria';
  end if;
  v_unidade := coalesce(nullif(btrim(p_unidade), ''), v_unidade, 'un');
  if v_unidade not in ('un', 'par', 'jogo', 'kit', 'l', 'kg', 'm', 'h') then
    raise exception 'unidade_invalida';
  end if;

  insert into public.os_itens (oficina_id, os_id, chave_idempotencia, tipo, servico_id, peca_id,
                               descricao, quantidade, unidade, lancado_por)
  values (v_os.oficina_id, v_os.id, p_chave_idempotencia, p_tipo, p_servico_id, p_peca_id,
          left(v_descricao, 200), p_quantidade, v_unidade, v_uid)
  returning id into v_item_id;

  v_preco := coalesce(case when v_papel <> 'mecanico' then p_preco_unitario_centavos end, v_preco_cat);
  if v_preco is not null then
    insert into public.os_itens_precos (item_id, oficina_id, preco_unitario_centavos)
    values (v_item_id, v_os.oficina_id, v_preco);
  end if;

  v_custo := coalesce(case when v_papel = 'dono' then p_custo_unitario_centavos end, v_custo_cat);
  if v_custo is not null then
    insert into public.os_itens_custos (item_id, oficina_id, custo_unitario_centavos)
    values (v_item_id, v_os.oficina_id, v_custo);
  end if;

  return v_item_id;  -- o mecanico recebe so o id (nenhum valor)
end;
$$;

-- -----------------------------------------------------------------------------
-- 6) RPCs novas do mecanico: alterar e remover os itens DELE
--    (dono/atendente continuam com update/delete direto em os_itens)
-- -----------------------------------------------------------------------------

-- NULL = nao muda aquele campo. Reenvio com os mesmos valores nao faz nada de errado.
create or replace function public.alterar_item_mecanico(
  p_item_id    uuid,
  p_quantidade numeric default null,
  p_descricao  text default null,
  p_unidade    text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item      public.os_itens;
  v_descricao text := nullif(btrim(p_descricao), '');
  v_unidade   text := nullif(btrim(p_unidade), '');
begin
  perform private.exigir_papel(array['mecanico']::public.papel_usuario[]);

  if p_quantidade is not null and (p_quantidade <= 0 or p_quantidade > 9999999) then
    raise exception 'quantidade_invalida';
  end if;
  if p_descricao is not null and v_descricao is null then
    raise exception 'descricao_obrigatoria';
  end if;
  if v_unidade is not null and v_unidade not in ('un', 'par', 'jogo', 'kit', 'l', 'kg', 'm', 'h') then
    raise exception 'unidade_invalida';
  end if;

  v_item := private.travar_item_do_mecanico(p_item_id);
  if v_item.id is null then
    raise exception 'item_nao_encontrado';
  end if;

  update public.os_itens i
     set quantidade = coalesce(p_quantidade, i.quantidade),
         descricao  = coalesce(left(v_descricao, 200), i.descricao),
         unidade    = coalesce(v_unidade, i.unidade)
   where i.id = v_item.id;
end;
$$;

-- Devolve true se removeu, false se o item ja nao existia (reenvio).
create or replace function public.remover_item_mecanico(p_item_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.os_itens;
begin
  perform private.exigir_papel(array['mecanico']::public.papel_usuario[]);

  v_item := private.travar_item_do_mecanico(p_item_id);
  if v_item.id is null then
    return false;
  end if;

  delete from public.os_itens i where i.id = v_item.id;  -- preco/custo vao junto (cascade)
  return true;
end;
$$;

revoke all on function public.alterar_item_mecanico(uuid, numeric, text, text) from public, anon;
revoke all on function public.remover_item_mecanico(uuid) from public, anon;
grant execute on function public.alterar_item_mecanico(uuid, numeric, text, text) to authenticated;
grant execute on function public.remover_item_mecanico(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 7) Views (colunas novas sempre NO FIM: create or replace mantem as antigas)
-- -----------------------------------------------------------------------------

-- Mecanico: continua 0 linhas.
create or replace view public.vw_os_totais
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
               as pecas_sem_custo,
  -- Fase 3
  count(i.id) filter (where i.lancado_pelo_mecanico)::integer
               as itens_mecanico,
  count(i.id) filter (where i.apos_aprovacao)::integer
               as itens_apos_aprovacao
from public.ordens_servico o
left join public.os_itens i        on i.os_id = o.id
left join public.os_itens_precos p on p.item_id = i.id
left join public.os_itens_custos k on k.item_id = i.id
where (select private.meu_papel()) in ('dono', 'atendente')
group by o.id, o.oficina_id;

-- Mecanico: valores NULL (como antes). mecanico_pode_alterar = o app mostra
-- "editar/remover" so quando for true (o banco confere de novo na RPC).
create or replace view public.vw_os_itens
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
  k.custo_unitario_centavos,
  -- Fase 3
  i.lancado_pelo_mecanico,
  i.apos_aprovacao,
  i.precificado_pelo_balcao_em,
  (    (select private.meu_papel()) = 'mecanico'
   and i.lancado_pelo_mecanico
   and i.lancado_por = (select auth.uid())
   and i.precificado_pelo_balcao_em is null
   and o.mecanico_id = (select auth.uid())
   and private.mecanico_lanca_itens(o.status)) as mecanico_pode_alterar
from public.os_itens i
join public.ordens_servico o       on o.id = i.os_id
left join public.os_itens_precos p on p.item_id = i.id
left join public.os_itens_custos k on k.item_id = i.id
left join public.catalogo_pecas cp on cp.id = i.peca_id;

-- (create or replace mantem os GRANTs: select para authenticated, nada para anon)
