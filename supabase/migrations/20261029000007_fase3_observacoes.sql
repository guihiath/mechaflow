-- =============================================================================
-- MechaFlow - Fase 3 - 07 observacao do balcao fora do alcance do mecanico (F3-A3)
--
-- Problema (ARQUITETURA F2.11): ordens_servico.observacoes (observacao do
-- balcao na abertura) era legivel pelo mecanico pela API. Mesmo padrao da
-- migracao 04 (F17): a RLS filtra linha, nao coluna, entao o texto vai para a
-- tabela que o mecanico nao le.
--
--   ordens_servico.observacoes -> os_comercial.observacoes (dono + atendente)
--   vw_os.observacoes          =  os_comercial.observacoes (mesma coluna, mesmo
--                                 lugar: dono/atendente recebem o mesmo texto;
--                                 o mecanico recebe NULL)
--   abrir_os(p_observacoes)    -> grava em os_comercial (mesma assinatura)
--   UPDATE direto (dono/atendente): from('os_comercial').update({ observacoes })
--     (antes era em ordens_servico). Continua editavel com a OS entregue.
--
-- Aproveita para refazer a vw_os uma vez so com as colunas novas da Fase 3
-- (itens_mecanico, itens_apos_aprovacao, qtd_fotos), sempre no fim.
-- Ordem: depois de 05_fase3_itens_mecanico e 06_fase3_fotos.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Coluna nova + dados antigos
-- -----------------------------------------------------------------------------
alter table public.os_comercial
  add column observacoes text check (char_length(observacoes) <= 2000);
comment on column public.os_comercial.observacoes is
  'Observacao do balcao na OS (texto livre, pode ter valor ou telefone). So dono e atendente leem.';

insert into public.os_comercial (os_id, oficina_id, observacoes)
select o.id, o.oficina_id, o.observacoes
  from public.ordens_servico o
 where o.observacoes is not null
on conflict (os_id) do update set observacoes = excluded.observacoes;

-- Normaliza como antes (espacos nas pontas; vazio = NULL).
create or replace function private.tg_os_comercial_normalizar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.observacoes := nullif(btrim(new.observacoes), '');
  return new;
end;
$$;
revoke all on function private.tg_os_comercial_normalizar() from public;

create trigger os_comercial_normalizar before insert or update on public.os_comercial
  for each row execute function private.tg_os_comercial_normalizar();

-- Dono/atendente editam a observacao direto (so essa coluna; o resto e RPC).
grant update (observacoes) on public.os_comercial to authenticated;

create policy os_comercial_update on public.os_comercial
  for update to authenticated
  using (
    oficina_id = (select private.minha_oficina_id())
    and (select private.meu_papel()) in ('dono', 'atendente')
  )
  with check (oficina_id = (select private.minha_oficina_id()));

-- -----------------------------------------------------------------------------
-- 2) vw_os: observacoes vem de os_comercial; colunas novas da Fase 3 no fim
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
  -- Fase 3: dono/atendente: o texto do balcao; mecanico: NULL (nao le os_comercial)
  oc.observacoes,
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
  t.itens_sem_preco,
  -- Fase 3 (mecanico: NULL nas duas primeiras, como os outros totais)
  t.itens_mecanico,
  t.itens_apos_aprovacao,
  (select count(*)::integer from public.os_fotos f
    where f.os_id = o.id and f.enviada_em is not null) as qtd_fotos
from public.ordens_servico o
join public.veiculos v           on v.id = o.veiculo_id
left join public.clientes c      on c.id = o.cliente_id
left join public.os_comercial oc on oc.os_id = o.id
left join lateral (
  select tt.* from public.vw_os_totais tt where tt.os_id = o.id
) t on true;

-- -----------------------------------------------------------------------------
-- 3) Trigger da OS sem a coluna (mesma regra de OS fechada de antes)
-- -----------------------------------------------------------------------------
create or replace function private.tg_os_normalizar_proteger()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.sintoma_relatado    := nullif(btrim(new.sintoma_relatado), '');
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

-- -----------------------------------------------------------------------------
-- 4) A coluna sai da tabela que o mecanico le (o GRANT de update dela vai junto)
-- -----------------------------------------------------------------------------
alter table public.ordens_servico drop column observacoes;

-- -----------------------------------------------------------------------------
-- 5) abrir_os: mesma assinatura e mesmo comportamento; p_observacoes vai para
--    os_comercial. (create or replace mantem os GRANTs do arquivo 03.)
-- -----------------------------------------------------------------------------
create or replace function public.abrir_os(
  p_chave_idempotencia      uuid,
  p_veiculo_id              uuid default null,
  p_placa                   text default null,
  p_cliente_id              uuid default null,
  p_cliente_nome            text default null,
  p_cliente_telefone        text default null,
  p_cliente_modo_padrao     public.modo_atendimento_cliente default null,
  p_veiculo_tipo            public.tipo_veiculo default null,
  p_veiculo_marca           text default null,
  p_veiculo_modelo          text default null,
  p_modo                    public.modo_os default null,
  p_km                      integer default null,
  p_horimetro               integer default null,
  p_sintoma_relatado        text default null,
  p_codigo_falha            text default null,
  p_mecanico_id             uuid default null,
  p_autorizado_por_nome     text default null,
  p_autorizado_por_telefone text default null,
  p_observacoes             text default null
)
returns table (os_id uuid, numero integer, ja_existia boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid       uuid;
  v_oficina   uuid;
  v_numero    integer;
  v_veiculo   uuid;
  v_cliente   uuid;
  v_placa     text;
  v_modo      public.modo_os;
  v_status    public.status_os;
  v_aut_nome  text := nullif(btrim(p_autorizado_por_nome), '');
  v_aut_tel   text := private.so_digitos(p_autorizado_por_telefone);
  v_cli_tel   text := private.so_digitos(p_cliente_telefone);
  v_os        public.ordens_servico;
begin
  perform private.exigir_papel(array['dono', 'atendente']::public.papel_usuario[]);
  v_uid     := auth.uid();
  v_oficina := private.minha_oficina_id();

  if p_chave_idempotencia is null then
    raise exception 'chave_obrigatoria';
  end if;

  -- Trava o contador da oficina: serializa aberturas (numero e idempotencia).
  insert into private.os_contadores (oficina_id, ultimo_numero)
  values (v_oficina, 0)
  on conflict on constraint os_contadores_pkey do nothing;

  select c.ultimo_numero into v_numero
    from private.os_contadores c
   where c.oficina_id = v_oficina
   for update;

  -- Reenvio do mesmo pedido: devolve a OS que ja existe.
  select o.* into v_os
    from public.ordens_servico o
   where o.oficina_id = v_oficina
     and o.chave_idempotencia = p_chave_idempotencia;
  if found then
    return query select v_os.id, v_os.numero, true;
    return;
  end if;

  -- Validacoes simples
  if p_km is not null and p_km < 0 then
    raise exception 'km_invalido';
  end if;
  if p_horimetro is not null and p_horimetro < 0 then
    raise exception 'km_invalido';
  end if;
  if v_aut_tel is not null and v_aut_tel !~ '^[0-9]{10,13}$' then
    raise exception 'telefone_invalido';
  end if;
  if v_cli_tel is not null and v_cli_tel !~ '^[0-9]{10,13}$' then
    raise exception 'telefone_invalido';
  end if;

  -- Veiculo e cliente
  if p_veiculo_id is not null then
    select v.id, v.cliente_id into v_veiculo, v_cliente
      from public.veiculos v
     where v.id = p_veiculo_id and v.oficina_id = v_oficina;
    if not found then
      raise exception 'veiculo_nao_encontrado';
    end if;
  else
    v_placa := public.normalizar_placa(coalesce(p_placa, ''));
    if v_placa !~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$' then
      raise exception 'placa_invalida';
    end if;
    if exists (select 1 from public.veiculos v where v.oficina_id = v_oficina and v.placa = v_placa) then
      raise exception 'placa_ja_cadastrada';
    end if;

    if p_cliente_id is not null then
      select c.id into v_cliente
        from public.clientes c
       where c.id = p_cliente_id and c.oficina_id = v_oficina;
      if not found then
        raise exception 'cliente_nao_encontrado';
      end if;
    elsif char_length(btrim(coalesce(p_cliente_nome, ''))) >= 2 then
      insert into public.clientes (oficina_id, nome, telefone, modo_padrao, criado_por)
      values (v_oficina, p_cliente_nome, v_cli_tel,
              coalesce(p_cliente_modo_padrao, 'exige_orcamento'), v_uid)
      returning id into v_cliente;
    else
      raise exception 'cliente_obrigatorio';
    end if;

    insert into public.veiculos (oficina_id, cliente_id, placa, tipo, marca, modelo, km_atual, horimetro_atual, criado_por)
    values (v_oficina, v_cliente, v_placa, coalesce(p_veiculo_tipo, 'caminhao'),
            p_veiculo_marca, p_veiculo_modelo, p_km, p_horimetro, v_uid)
    returning id into v_veiculo;
  end if;

  -- Mecanico: qualquer perfil ATIVO da oficina (dono tambem)
  if p_mecanico_id is not null and not exists (
       select 1 from public.perfis p
        where p.id = p_mecanico_id and p.oficina_id = v_oficina and p.ativo) then
    raise exception 'mecanico_invalido';
  end if;

  -- Modo e status inicial
  select coalesce(p_modo,
                  case c.modo_padrao when 'servico_direto' then 'direto'::public.modo_os
                                     else 'com_orcamento'::public.modo_os end)
    into v_modo
    from public.clientes c
   where c.id = v_cliente;

  if v_modo = 'direto' then
    if char_length(coalesce(v_aut_nome, '')) < 2 then
      raise exception 'autorizacao_obrigatoria';
    end if;
    v_status := 'em_andamento';
  else
    v_status := 'aguardando_orcamento';
  end if;

  -- Numero (a linha do contador ja esta travada desde o inicio)
  v_numero := v_numero + 1;
  update private.os_contadores c set ultimo_numero = v_numero where c.oficina_id = v_oficina;

  insert into public.ordens_servico (
    oficina_id, numero, chave_idempotencia, cliente_id, veiculo_id, mecanico_id, modo, status,
    km, horimetro, sintoma_relatado, codigo_falha,
    autorizado_em, iniciado_em, criado_por
  ) values (
    v_oficina, v_numero, p_chave_idempotencia, v_cliente, v_veiculo, p_mecanico_id, v_modo, v_status,
    p_km, p_horimetro, p_sintoma_relatado, p_codigo_falha,
    case when v_modo = 'direto' then now() end,
    case when v_modo = 'direto' then now() end,
    v_uid
  )
  returning * into v_os;

  -- Fase 3 (F3-A3): a observacao do balcao fica em os_comercial (o mecanico nao le)
  insert into public.os_comercial (os_id, oficina_id, autorizado_por_nome, autorizado_por_telefone, autorizacao_registrada_por,
                                   observacoes)
  values (v_os.id, v_oficina,
          case when v_modo = 'direto' then v_aut_nome end,
          case when v_modo = 'direto' then v_aut_tel end,
          case when v_modo = 'direto' then v_uid end,
          left(nullif(btrim(p_observacoes), ''), 2000));

  perform private.registrar_historico(v_os, 'criada', null, v_status, null);

  return query select v_os.id, v_os.numero, false;
end;
$$;
