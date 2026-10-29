-- =============================================================================
-- MechaFlow - Fase 2 - 04 texto livre do balcao fora do alcance do mecanico (I5)
--
-- Problema (REVISAO-FASE2, I5): o motivo de cancelamento ("Outro motivo") e o
-- motivo de recusa sao texto livre digitado no balcao, e e ali que se escreve
-- "achou caro, o outro cobrou R$ 2.800". O app ja nao mostra esse texto ao
-- mecanico, mas pela API ele ainda lia:
--   * ordens_servico.motivo_cancelamento (e vw_os.motivo_cancelamento)
--   * os_historico.observacao            (e vw_os_historico.observacao)
--
-- Solucao: o MESMO padrao de preco/custo (ARQUITETURA D6 / F1): a RLS filtra
-- linha, nao coluna, entao o texto livre vai para tabelas que o mecanico nao le.
--
--   ordens_servico.motivo_cancelamento  -> agora so o MOTIVO FIXO (codigo):
--       'Cliente desistiu' | 'Orçamento recusado' | 'Aberta por engano' | 'Outro motivo'
--       (CHECK). Continua obrigatorio na OS cancelada. Todos leem.
--   os_comercial.motivo_cancelamento_texto -> texto livre (dono + atendente).
--
--   os_historico.observacao   -> so texto do sistema (canal, nomes, motivo fixo).
--   os_historico_textos (NOVA) -> observacao completa quando ha texto livre
--       (dono + atendente). 1:1 opcional com os_historico.
--
--   vw_os.motivo_cancelamento   = coalesce(texto livre, motivo fixo)
--   vw_os_historico.observacao  = coalesce(observacao completa, observacao do sistema)
--   => dono/atendente recebem EXATAMENTE o que recebiam antes (o app nao muda);
--      mecanico recebe so o motivo fixo / texto do sistema.
--
-- RPCs: registrar_historico, aplicar_status, mudar_status_os e
-- registrar_resposta_orcamento passam a separar texto do sistema e texto livre.
-- Dados ja gravados (staging) sao migrados aqui mesmo.
--
-- Ordem: depois de 01_fase2_os_base, 02_fase2_os_rls, 03_fase2_os_rpcs.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Motivo fixo: o banco conhece a lista (a mesma de MOTIVOS_CANCELAMENTO no app)
-- -----------------------------------------------------------------------------
create or replace function private.motivo_cancelamento_fixo(p_texto text)
returns text
language sql
immutable
set search_path = ''
as $$
  select m
    from (values ('Cliente desistiu'), ('Orçamento recusado'), ('Aberta por engano'), ('Outro motivo')) as v(m)
   where m = btrim(p_texto)
$$;
revoke all on function private.motivo_cancelamento_fixo(text) from public;

-- -----------------------------------------------------------------------------
-- 2) Novas colunas / tabela
-- -----------------------------------------------------------------------------
alter table public.os_comercial
  add column motivo_cancelamento_texto text check (char_length(motivo_cancelamento_texto) <= 500);
comment on column public.os_comercial.motivo_cancelamento_texto is
  'Motivo de cancelamento como foi digitado (texto livre, pode ter valor). So dono e atendente leem. O motivo fixo fica em ordens_servico.motivo_cancelamento.';

alter table public.os_historico
  add constraint os_historico_id_oficina_uk unique (id, oficina_id);

create table public.os_historico_textos (
  historico_id  uuid primary key,
  oficina_id    uuid not null,
  observacao    text not null check (char_length(observacao) <= 500),
  constraint os_historico_textos_historico_fk foreign key (historico_id, oficina_id)
    references public.os_historico (id, oficina_id) on delete cascade
);
alter table public.os_historico_textos enable row level security;
create index os_historico_textos_oficina_idx on public.os_historico_textos (oficina_id);
comment on table public.os_historico_textos is
  'Observacao completa de um evento do historico quando ela tem texto livre do balcao (motivo de recusa/cancelamento). So dono e atendente leem; so RPCs gravam.';

revoke all on table public.os_historico_textos from anon, authenticated;
grant select on public.os_historico_textos to authenticated;

create policy os_historico_textos_select on public.os_historico_textos
  for select to authenticated
  using (
    oficina_id = (select private.minha_oficina_id())
    and (select private.meu_papel()) in ('dono', 'atendente')
  );

-- -----------------------------------------------------------------------------
-- 3) Dados ja gravados
-- -----------------------------------------------------------------------------

-- 3a) OS canceladas: texto livre -> os_comercial; na OS fica so o motivo fixo.
insert into public.os_comercial (os_id, oficina_id, motivo_cancelamento_texto)
select o.id, o.oficina_id, left(o.motivo_cancelamento, 500)
  from public.ordens_servico o
 where o.motivo_cancelamento is not null
   and private.motivo_cancelamento_fixo(o.motivo_cancelamento) is null
   and o.motivo_cancelamento <> 'Orcamento recusado'   -- texto antigo da RPC, sem texto livre
on conflict (os_id) do update set motivo_cancelamento_texto = excluded.motivo_cancelamento_texto;

update public.ordens_servico o
   set motivo_cancelamento = case
         when o.motivo_cancelamento ~* '^or(c|ç)amento recusado' then 'Orçamento recusado'
         else 'Outro motivo'
       end
 where o.motivo_cancelamento is not null
   and private.motivo_cancelamento_fixo(o.motivo_cancelamento) is null;

alter table public.ordens_servico
  -- lista escrita aqui (e nao a funcao): o CHECK roda tambem no UPDATE direto do
  -- dono/atendente, que nao tem EXECUTE nas funcoes de private.
  add constraint ordens_servico_motivo_fixo_ck check (
    motivo_cancelamento in ('Cliente desistiu', 'Orçamento recusado', 'Aberta por engano', 'Outro motivo')
  );
comment on column public.ordens_servico.motivo_cancelamento is
  'Motivo FIXO do cancelamento (Cliente desistiu / Orçamento recusado / Aberta por engano / Outro motivo). Todos leem. O texto livre fica em os_comercial.motivo_cancelamento_texto.';

-- 3b) Historico: texto livre -> os_historico_textos; fica so o texto do sistema.
--   cancelada: observacao = motivo digitado      -> fica o motivo fixo ou 'Outro motivo'
--   recusa:    'Cliente recusou por <canal>: <motivo>' -> fica 'Cliente recusou por <canal>'
--   status/desfazer/criada/entregue: observacao so podia vir do p_motivo livre -> fica NULL
insert into public.os_historico_textos (historico_id, oficina_id, observacao)
select h.id, h.oficina_id, h.observacao
  from public.os_historico h
 where h.observacao is not null
   and (   (h.evento = 'cancelada' and private.motivo_cancelamento_fixo(h.observacao) is null)
        or (h.evento = 'recusa' and h.observacao ~ '^Cliente recusou por [a-z]+: ')
        or  h.evento in ('status', 'desfazer', 'criada', 'entregue'));

update public.os_historico h
   set observacao = case
         when h.evento = 'cancelada' then 'Outro motivo'
         when h.evento = 'recusa'    then substring(h.observacao from '^(Cliente recusou por [a-z]+)')
         else null
       end
 where exists (select 1 from public.os_historico_textos t where t.historico_id = h.id);

comment on table public.os_historico is
  'Linha do tempo da OS. So as RPCs gravam; ninguem altera ou apaga. "observacao" e so texto do sistema (o mecanico le); texto livre do balcao fica em os_historico_textos.';

-- -----------------------------------------------------------------------------
-- 4) Views (mesmas colunas, na mesma ordem: o app nao muda)
-- -----------------------------------------------------------------------------
create or replace view public.vw_os
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
  -- dono/atendente: o texto digitado; mecanico: so o motivo fixo (os_comercial volta NULL para ele)
  coalesce(oc.motivo_cancelamento_texto, o.motivo_cancelamento) as motivo_cancelamento,
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

create or replace view public.vw_os_historico
with (security_invoker = true)
as
select
  h.id,
  h.oficina_id,
  h.os_id,
  h.evento,
  h.de_status,
  h.para_status,
  -- dono/atendente: observacao completa; mecanico: so o texto do sistema
  coalesce(ht.observacao, h.observacao) as observacao,
  h.por,
  private.nome_membro(h.por) as por_nome,
  h.em
from public.os_historico h
left join public.os_historico_textos ht on ht.historico_id = h.id;

-- (create or replace mantem os GRANTs: select para authenticated, nada para anon)

-- -----------------------------------------------------------------------------
-- 5) RPCs internas: texto do sistema x texto livre
--    (drop + create: a assinatura muda e um overload com default ficaria ambiguo)
-- -----------------------------------------------------------------------------
drop function private.registrar_historico(public.ordens_servico, text, public.status_os, public.status_os, text);
create function private.registrar_historico(
  p_os                  public.ordens_servico,
  p_evento              text,
  p_de                  public.status_os,
  p_para                public.status_os,
  p_observacao          text default null,   -- texto do sistema: o mecanico le
  p_observacao_interna  text default null    -- observacao completa com texto livre: so dono/atendente
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.os_historico (oficina_id, os_id, evento, de_status, para_status, observacao, por)
  values (p_os.oficina_id, p_os.id, p_evento, p_de, p_para, left(p_observacao, 500), auth.uid())
  returning id into v_id;

  if nullif(btrim(p_observacao_interna), '') is not null then
    insert into public.os_historico_textos (historico_id, oficina_id, observacao)
    values (v_id, p_os.oficina_id, left(p_observacao_interna, 500));
  end if;
end;
$$;

drop function private.aplicar_status(public.ordens_servico, public.status_os, text, text, text);
create function private.aplicar_status(
  p_os                  public.ordens_servico,
  p_para                public.status_os,
  p_evento              text,
  p_observacao          text default null,   -- historico: texto do sistema
  p_motivo_cancelamento text default null,   -- motivo FIXO (ver private.motivo_cancelamento_fixo)
  p_motivo_texto        text default null,   -- motivo digitado (so dono/atendente)
  p_observacao_interna  text default null    -- historico: observacao completa
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

  perform private.registrar_historico(p_os, p_evento, p_os.status, p_para, p_observacao, p_observacao_interna);
end;
$$;

revoke all on function private.registrar_historico(public.ordens_servico, text, public.status_os, public.status_os, text, text) from public;
revoke all on function private.aplicar_status(public.ordens_servico, public.status_os, text, text, text, text, text) from public;

-- -----------------------------------------------------------------------------
-- 6) RPCs publicas (mesma assinatura e mesmo comportamento para o app)
-- -----------------------------------------------------------------------------

-- mudar_status_os: o p_motivo e texto livre.
--   Cancelar: motivo fixo da lista -> vai como esta; outro texto -> fixo
--   'Outro motivo' + texto em os_comercial / os_historico_textos.
--   Outras transicoes: p_motivo (se vier) so no historico interno.
create or replace function public.mudar_status_os(
  p_os_id  uuid,
  p_de     public.status_os,
  p_para   public.status_os,
  p_motivo text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_papel  public.papel_usuario;
  v_os     public.ordens_servico;
  v_evento text;
  v_motivo text := nullif(btrim(p_motivo), '');
  v_fixo   text;
  v_livre  text;
  v_mec_ok boolean;
begin
  v_papel := private.exigir_papel(array['dono', 'atendente', 'mecanico']::public.papel_usuario[]);
  v_os    := private.travar_os(p_os_id);

  if v_os.status = p_para then
    return;  -- ja esta la (reenvio)
  end if;
  if v_os.status in ('entregue', 'cancelada') then
    raise exception 'os_fechada';
  end if;
  if v_os.status <> p_de then
    raise exception 'status_mudou';
  end if;

  v_evento := case
    when p_de = 'aguardando_orcamento' and p_para = 'orcamento_enviado'                 then 'status'
    when p_de = 'orcamento_enviado'    and p_para = 'aguardando_orcamento'              then 'desfazer'
    when p_de = 'aprovada'             and p_para in ('aguardando_orcamento', 'orcamento_enviado') then 'desfazer'
    when p_de = 'aprovada'             and p_para = 'em_andamento'                      then 'status'
    when p_de = 'em_andamento'         and p_para = 'aprovada' and v_os.modo = 'com_orcamento' then 'desfazer'
    when p_de = 'em_andamento'         and p_para = 'pronta'                            then 'status'
    when p_de = 'pronta'               and p_para = 'em_andamento'                      then 'desfazer'
    when p_para = 'cancelada'                                                           then 'cancelada'
  end;
  if v_evento is null then
    raise exception 'transicao_invalida';
  end if;

  -- Mecanico: so na OS atribuida a ele, e so comecar / pronta / desfazer esses dois.
  if v_papel = 'mecanico' then
    v_mec_ok := v_os.mecanico_id = auth.uid() and (
         (p_de = 'aprovada'     and p_para = 'em_andamento')
      or (p_de = 'em_andamento' and p_para = 'aprovada')
      or (p_de = 'em_andamento' and p_para = 'pronta')
      or (p_de = 'pronta'       and p_para = 'em_andamento'));
    if not coalesce(v_mec_ok, false) then
      raise exception 'acesso_negado' using errcode = '42501';
    end if;
  end if;

  if p_para = 'orcamento_enviado' and (private.totais_os(v_os.id)).qtd_itens = 0 then
    raise exception 'orcamento_sem_itens';
  end if;

  if p_para = 'cancelada' then
    if char_length(coalesce(v_motivo, '')) < 3 then
      raise exception 'motivo_obrigatorio';
    end if;
    v_fixo  := coalesce(private.motivo_cancelamento_fixo(v_motivo), 'Outro motivo');
    v_livre := case when private.motivo_cancelamento_fixo(v_motivo) is null then v_motivo end;
    perform private.aplicar_status(v_os, 'cancelada', 'cancelada', v_fixo, v_fixo, v_livre, v_livre);
  else
    perform private.aplicar_status(v_os, p_para, v_evento, null, null, null, v_motivo);
  end if;
end;
$$;

-- registrar_resposta_orcamento: o motivo da recusa e texto livre.
--   Historico (todos): 'Cliente recusou por <canal>'.
--   Historico interno (dono/atendente): 'Cliente recusou por <canal>: <motivo>'.
--   Recusa com cancelamento: motivo fixo 'Orçamento recusado';
--   texto 'Orçamento recusado: <motivo>' em os_comercial.
create or replace function public.registrar_resposta_orcamento(
  p_os_id          uuid,
  p_de             public.status_os,
  p_aprovou        boolean,
  p_canal          public.canal_resposta,
  p_quem_respondeu text default null,
  p_motivo         text default null,
  p_cancelar       boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_os      public.ordens_servico;
  v_tot     record;
  v_motivo  text := nullif(btrim(p_motivo), '');
  v_obs     text;
  v_obs_int text;
begin
  perform private.exigir_papel(array['dono', 'atendente']::public.papel_usuario[]);
  v_os := private.travar_os(p_os_id);

  if p_aprovou is null then
    raise exception 'resposta_obrigatoria';
  end if;
  if p_canal is null or p_canal = 'link' then
    raise exception 'canal_invalido';
  end if;
  if v_os.modo <> 'com_orcamento' then
    raise exception 'transicao_invalida';
  end if;
  if p_de not in ('aguardando_orcamento', 'orcamento_enviado') then
    raise exception 'transicao_invalida';
  end if;

  if p_aprovou then
    if v_os.status = 'aprovada' then
      return;  -- reenvio
    end if;
    if v_os.status in ('entregue', 'cancelada') then
      raise exception 'os_fechada';
    end if;
    if v_os.status <> p_de then
      raise exception 'status_mudou';
    end if;

    v_tot := private.totais_os(v_os.id);
    if v_tot.qtd_itens = 0 then
      raise exception 'orcamento_sem_itens';
    end if;
    if v_tot.itens_sem_preco > 0 then
      raise exception 'os_itens_sem_preco';
    end if;

    perform private.aplicar_status(v_os, 'aprovada', 'aprovacao', 'por ' || p_canal::text);

    update public.os_comercial c
       set orcamento_aprovado_por_nome        = left(nullif(btrim(p_quem_respondeu), ''), 120),
           orcamento_aprovacao_canal          = p_canal,
           orcamento_aprovacao_registrada_por = auth.uid(),
           valor_aprovado_centavos            = v_tot.total_centavos
     where c.os_id = v_os.id;
    return;
  end if;

  -- Recusa
  if p_cancelar and v_os.status = 'cancelada' then
    return;  -- reenvio
  end if;
  if v_os.status in ('entregue', 'cancelada') then
    raise exception 'os_fechada';
  end if;
  if not p_cancelar and p_de = 'orcamento_enviado' and v_os.status = 'aguardando_orcamento' then
    return;  -- reenvio
  end if;
  if v_os.status <> p_de then
    raise exception 'status_mudou';
  end if;

  v_obs     := 'Cliente recusou por ' || p_canal::text;
  v_obs_int := case when v_motivo is not null then v_obs || ': ' || v_motivo end;

  if p_cancelar then
    perform private.aplicar_status(v_os, 'cancelada', 'recusa', v_obs,
                                   'Orçamento recusado',
                                   case when v_motivo is not null then 'Orçamento recusado: ' || v_motivo end,
                                   v_obs_int);
  elsif v_os.status = 'orcamento_enviado' then
    perform private.aplicar_status(v_os, 'aguardando_orcamento', 'recusa', v_obs, null, null, v_obs_int);
  else
    perform private.registrar_historico(v_os, 'recusa', v_os.status, v_os.status, v_obs, v_obs_int);
  end if;
end;
$$;

-- create or replace mantem os GRANTs de mudar_status_os e registrar_resposta_orcamento
-- (execute para authenticated; nada para anon/public), definidos no arquivo 03.
