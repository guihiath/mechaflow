-- =============================================================================
-- MechaFlow - Fase 2 - 03 RPCs da OS
-- SECURITY DEFINER + search_path = '' + nomes qualificados (padrao da Fase 1).
-- Erros: a mensagem e um codigo estavel (ex.: 'status_mudou'); o app traduz
-- em src/lib/erros.ts. Lista em docs/ARQUITETURA.md (Fase 2).
--
-- Regras gerais:
--   * toda RPC que muda status confere o status de ORIGEM (p_de). Se a OS ja
--     esta no status pedido, nao faz nada (reenvio por internet fraca nao
--     quebra). Se esta em outro, erro 'status_mudou' (outra pessoa mexeu).
--   * abrir_os e adicionar_item_os sao idempotentes por chave uuid gerada no
--     navegador.
--   * o mecanico nunca recebe nem grava valor.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Internas
-- -----------------------------------------------------------------------------

-- Exige login + perfil ativo com um dos papeis. Devolve o papel.
create or replace function private.exigir_papel(p_papeis public.papel_usuario[])
returns public.papel_usuario
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_papel public.papel_usuario;
begin
  perform private.exigir_usuario();
  v_papel := private.meu_papel();
  if v_papel is null or not (v_papel = any (p_papeis)) then
    raise exception 'acesso_negado' using errcode = '42501';
  end if;
  return v_papel;
end;
$$;

-- Le e TRAVA a OS (FOR UPDATE) se quem chama pode ve-la. Senao: os_nao_encontrada.
create or replace function private.travar_os(p_os_id uuid)
returns public.ordens_servico
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_os public.ordens_servico;
begin
  select o.* into v_os
    from public.ordens_servico o
   where o.id = p_os_id
     and o.oficina_id = private.minha_oficina_id()
     and (private.vejo_todas_os() or o.mecanico_id = auth.uid())
   for update;
  if not found then
    raise exception 'os_nao_encontrada';
  end if;
  return v_os;
end;
$$;

-- Totais calculados no banco (mesma conta da vw_os_totais), sem RLS.
create or replace function private.totais_os(
  p_os_id uuid,
  out qtd_itens integer,
  out itens_sem_preco integer,
  out total_centavos bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select count(i.id)::integer,
         (count(i.id) filter (where p.item_id is null))::integer,
         coalesce(sum(round(i.quantidade * p.preco_unitario_centavos)), 0)::bigint
    from public.os_itens i
    left join public.os_itens_precos p on p.item_id = i.id
   where i.os_id = p_os_id
$$;

create or replace function private.registrar_historico(
  p_os          public.ordens_servico,
  p_evento      text,
  p_de          public.status_os,
  p_para        public.status_os,
  p_observacao  text default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.os_historico (oficina_id, os_id, evento, de_status, para_status, observacao, por)
  values (p_os.oficina_id, p_os.id, p_evento, p_de, p_para, left(p_observacao, 500), auth.uid())
$$;

-- Aplica a troca de status (datas do fluxo + historico). Quem chama ja validou.
create or replace function private.aplicar_status(
  p_os         public.ordens_servico,
  p_para       public.status_os,
  p_evento     text,
  p_observacao text default null,
  p_motivo_cancelamento text default null
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

  -- Voltou para antes da aprovacao: apaga a aprovacao registrada.
  if p_para in ('aguardando_orcamento', 'orcamento_enviado') then
    update public.os_comercial c
       set orcamento_aprovado_por_nome        = null,
           orcamento_aprovacao_canal          = null,
           orcamento_aprovacao_registrada_por = null,
           valor_aprovado_centavos            = null
     where c.os_id = p_os.id;
  end if;

  perform private.registrar_historico(p_os, p_evento, p_os.status, p_para, p_observacao);
end;
$$;

revoke all on function private.exigir_papel(public.papel_usuario[]) from public;
revoke all on function private.travar_os(uuid) from public;
revoke all on function private.totais_os(uuid) from public;
revoke all on function private.registrar_historico(public.ordens_servico, text, public.status_os, public.status_os, text) from public;
revoke all on function private.aplicar_status(public.ordens_servico, public.status_os, text, text, text) from public;

-- -----------------------------------------------------------------------------
-- abrir_os: atomica e idempotente.
--   * p_veiculo_id (placa conhecida) OU p_placa + cliente (p_cliente_id ou
--     p_cliente_nome) para cadastrar veiculo/cliente novos na mesma transacao.
--   * modo: p_modo ou o padrao do cliente.
--   * modo direto EXIGE p_autorizado_por_nome: a OS ja nasce em_andamento.
--   * reenvio com a mesma p_chave_idempotencia devolve a OS ja criada
--     (ja_existia = true), sem criar outra nem gastar numero.
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
    km, horimetro, sintoma_relatado, codigo_falha, observacoes,
    autorizado_em, iniciado_em, criado_por
  ) values (
    v_oficina, v_numero, p_chave_idempotencia, v_cliente, v_veiculo, p_mecanico_id, v_modo, v_status,
    p_km, p_horimetro, p_sintoma_relatado, p_codigo_falha, p_observacoes,
    case when v_modo = 'direto' then now() end,
    case when v_modo = 'direto' then now() end,
    v_uid
  )
  returning * into v_os;

  insert into public.os_comercial (os_id, oficina_id, autorizado_por_nome, autorizado_por_telefone, autorizacao_registrada_por)
  values (v_os.id, v_oficina,
          case when v_modo = 'direto' then v_aut_nome end,
          case when v_modo = 'direto' then v_aut_tel end,
          case when v_modo = 'direto' then v_uid end);

  perform private.registrar_historico(v_os, 'criada', null, v_status, null);

  return query select v_os.id, v_os.numero, false;
end;
$$;

-- -----------------------------------------------------------------------------
-- mudar_status_os: transicoes simples (ver tabela no ARQUITETURA, Fase 2).
--   Aprovar/recusar => registrar_resposta_orcamento. Entregar => entregar_os.
--   Pronta com causa/solucao => marcar_pronta (aqui tambem pode, sem textos).
--   Cancelar => p_para = 'cancelada' com p_motivo.
-- -----------------------------------------------------------------------------
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
    perform private.aplicar_status(v_os, 'cancelada', 'cancelada', v_motivo, v_motivo);
  else
    perform private.aplicar_status(v_os, p_para, v_evento, v_motivo);
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- registrar_resposta_orcamento: aprovacao/recusa MANUAL (telefone, WhatsApp,
-- pessoalmente). Na aprovacao guarda valor_aprovado_centavos = total do momento.
-- Recusa: vira evento no historico; volta para aguardando_orcamento (refazer)
-- ou cancela (p_cancelar = true).
-- -----------------------------------------------------------------------------
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
  v_os     public.ordens_servico;
  v_tot    record;
  v_motivo text := nullif(btrim(p_motivo), '');
  v_obs    text;
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

  v_obs := 'Cliente recusou por ' || p_canal::text || coalesce(': ' || v_motivo, '');

  if p_cancelar then
    perform private.aplicar_status(v_os, 'cancelada', 'recusa', v_obs,
                                   left('Orcamento recusado' || coalesce(': ' || v_motivo, ''), 500));
  elsif v_os.status = 'orcamento_enviado' then
    perform private.aplicar_status(v_os, 'aguardando_orcamento', 'recusa', v_obs);
  else
    perform private.registrar_historico(v_os, 'recusa', v_os.status, v_os.status, v_obs);
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- marcar_pronta: em_andamento -> pronta, gravando SO status + causa/solucao
-- (opcionais; texto vazio nao apaga o que ja existia). Mecanico: OS dele.
-- -----------------------------------------------------------------------------
create or replace function public.marcar_pronta(
  p_os_id   uuid,
  p_causa   text default null,
  p_solucao text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_papel public.papel_usuario;
  v_os    public.ordens_servico;
begin
  v_papel := private.exigir_papel(array['dono', 'atendente', 'mecanico']::public.papel_usuario[]);
  v_os    := private.travar_os(p_os_id);

  if v_papel = 'mecanico' and v_os.mecanico_id is distinct from auth.uid() then
    raise exception 'acesso_negado' using errcode = '42501';
  end if;
  if v_os.status = 'pronta' then
    return;  -- reenvio
  end if;
  if v_os.status in ('entregue', 'cancelada') then
    raise exception 'os_fechada';
  end if;
  if v_os.status <> 'em_andamento' then
    raise exception 'status_mudou';
  end if;

  update public.ordens_servico o
     set causa_encontrada = coalesce(nullif(btrim(p_causa), ''), o.causa_encontrada),
         solucao_aplicada = coalesce(nullif(btrim(p_solucao), ''), o.solucao_aplicada)
   where o.id = v_os.id;

  perform private.aplicar_status(v_os, 'pronta', 'status');
end;
$$;

-- -----------------------------------------------------------------------------
-- entregar_os: pronta -> entregue (fechamento). Exige causa, solucao, forma de
-- pagamento, "pago agora?" e todos os itens com preco. Atualiza o km_atual do
-- veiculo com o KM da OS (se maior).
-- -----------------------------------------------------------------------------
create or replace function public.entregar_os(
  p_os_id            uuid,
  p_causa            text,
  p_solucao          text,
  p_forma_pagamento  public.forma_pagamento,
  p_pago             boolean,
  p_codigo_falha     text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_os public.ordens_servico;
begin
  perform private.exigir_papel(array['dono', 'atendente']::public.papel_usuario[]);
  v_os := private.travar_os(p_os_id);

  if v_os.status = 'entregue' then
    return;  -- reenvio
  end if;
  if v_os.status = 'cancelada' then
    raise exception 'os_fechada';
  end if;
  if v_os.status <> 'pronta' then
    raise exception 'status_mudou';
  end if;
  if char_length(btrim(coalesce(p_causa, ''))) < 3 then
    raise exception 'causa_obrigatoria';
  end if;
  if char_length(btrim(coalesce(p_solucao, ''))) < 3 then
    raise exception 'solucao_obrigatoria';
  end if;
  if p_forma_pagamento is null then
    raise exception 'forma_pagamento_obrigatoria';
  end if;
  if p_pago is null then
    raise exception 'pagamento_obrigatorio';
  end if;
  if (private.totais_os(v_os.id)).itens_sem_preco > 0 then
    raise exception 'os_itens_sem_preco';
  end if;

  update public.ordens_servico o
     set causa_encontrada = p_causa,
         solucao_aplicada = p_solucao,
         codigo_falha     = coalesce(nullif(btrim(p_codigo_falha), ''), o.codigo_falha)
   where o.id = v_os.id;

  update public.os_comercial c
     set forma_pagamento          = p_forma_pagamento,
         pago_em                  = case when p_pago then now() end,
         pagamento_registrado_por = case when p_pago then auth.uid() end
   where c.os_id = v_os.id;

  if v_os.km is not null then
    update public.veiculos v
       set km_atual = v_os.km
     where v.id = v_os.veiculo_id
       and (v.km_atual is null or v.km_atual < v_os.km);
  end if;
  if v_os.horimetro is not null then
    update public.veiculos v
       set horimetro_atual = v_os.horimetro
     where v.id = v_os.veiculo_id
       and (v.horimetro_atual is null or v.horimetro_atual < v_os.horimetro);
  end if;

  perform private.aplicar_status(v_os, 'entregue', 'entregue');
  if p_pago then
    perform private.registrar_historico(v_os, 'pagamento', 'entregue', 'entregue', null);
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- registrar_pagamento: OS entregue "a receber" -> paga (dono e atendente).
-- p_pago_em = NULL volta para "a receber" (corrigir engano).
-- -----------------------------------------------------------------------------
create or replace function public.registrar_pagamento(
  p_os_id           uuid,
  p_forma_pagamento public.forma_pagamento,
  p_pago_em         timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_os public.ordens_servico;
begin
  perform private.exigir_papel(array['dono', 'atendente']::public.papel_usuario[]);
  v_os := private.travar_os(p_os_id);

  if v_os.status <> 'entregue' then
    raise exception 'os_nao_entregue';
  end if;
  if p_forma_pagamento is null then
    raise exception 'forma_pagamento_obrigatoria';
  end if;
  if p_pago_em is not null
     and (p_pago_em > now() + interval '1 day' or p_pago_em < v_os.criado_em - interval '1 day') then
    raise exception 'data_pagamento_invalida';
  end if;

  update public.os_comercial c
     set forma_pagamento          = p_forma_pagamento,
         pago_em                  = p_pago_em,
         pagamento_registrado_por = auth.uid()
   where c.os_id = v_os.id;

  perform private.registrar_historico(v_os, 'pagamento', 'entregue', 'entregue',
    case when p_pago_em is null then 'Voltou para a receber' end);
end;
$$;

-- -----------------------------------------------------------------------------
-- atribuir_mecanico: qualquer perfil ativo da oficina (ou NULL = sem mecanico).
-- -----------------------------------------------------------------------------
create or replace function public.atribuir_mecanico(
  p_os_id       uuid,
  p_mecanico_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_os public.ordens_servico;
begin
  perform private.exigir_papel(array['dono', 'atendente']::public.papel_usuario[]);
  v_os := private.travar_os(p_os_id);

  if v_os.status in ('entregue', 'cancelada') then
    raise exception 'os_fechada';
  end if;
  if v_os.mecanico_id is not distinct from p_mecanico_id then
    return;
  end if;
  if p_mecanico_id is not null and not exists (
       select 1 from public.perfis p
        where p.id = p_mecanico_id and p.oficina_id = v_os.oficina_id and p.ativo) then
    raise exception 'mecanico_invalido';
  end if;

  update public.ordens_servico o set mecanico_id = p_mecanico_id where o.id = v_os.id;

  perform private.registrar_historico(v_os, 'mecanico', v_os.status, v_os.status,
    coalesce(private.nome_membro(v_os.mecanico_id), 'Sem mecanico') || ' -> ' ||
    coalesce(private.nome_membro(p_mecanico_id), 'Sem mecanico'));
end;
$$;

-- -----------------------------------------------------------------------------
-- trocar_modo_os: so antes de o servico comecar.
--   com_orcamento (aguardando_orcamento/orcamento_enviado) -> direto: exige
--     quem autorizou; a OS vai para em_andamento.
--   direto (em_andamento, ainda SEM itens) -> com_orcamento: volta para
--     aguardando_orcamento e apaga a autorizacao.
-- -----------------------------------------------------------------------------
create or replace function public.trocar_modo_os(
  p_os_id                   uuid,
  p_modo                    public.modo_os,
  p_autorizado_por_nome     text default null,
  p_autorizado_por_telefone text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_os       public.ordens_servico;
  v_aut_nome text := nullif(btrim(p_autorizado_por_nome), '');
  v_aut_tel  text := private.so_digitos(p_autorizado_por_telefone);
begin
  perform private.exigir_papel(array['dono', 'atendente']::public.papel_usuario[]);
  v_os := private.travar_os(p_os_id);

  if p_modo is null then
    raise exception 'transicao_invalida';
  end if;
  if v_os.modo = p_modo then
    return;
  end if;
  if v_os.status in ('entregue', 'cancelada') then
    raise exception 'os_fechada';
  end if;

  if p_modo = 'direto' then
    if v_os.status not in ('aguardando_orcamento', 'orcamento_enviado') then
      raise exception 'troca_modo_nao_permitida';
    end if;
    if char_length(coalesce(v_aut_nome, '')) < 2 then
      raise exception 'autorizacao_obrigatoria';
    end if;
    if v_aut_tel is not null and v_aut_tel !~ '^[0-9]{10,13}$' then
      raise exception 'telefone_invalido';
    end if;

    update public.ordens_servico o
       set modo = 'direto', status = 'em_andamento',
           autorizado_em = now(), iniciado_em = coalesce(o.iniciado_em, now())
     where o.id = v_os.id;
    update public.os_comercial c
       set autorizado_por_nome = v_aut_nome,
           autorizado_por_telefone = v_aut_tel,
           autorizacao_registrada_por = auth.uid()
     where c.os_id = v_os.id;
    perform private.registrar_historico(v_os, 'modo', v_os.status, 'em_andamento', 'Servico direto');
  else
    if v_os.status <> 'em_andamento' or (private.totais_os(v_os.id)).qtd_itens > 0 then
      raise exception 'troca_modo_nao_permitida';
    end if;

    update public.ordens_servico o
       set modo = 'com_orcamento', status = 'aguardando_orcamento',
           autorizado_em = null, iniciado_em = null
     where o.id = v_os.id;
    update public.os_comercial c
       set autorizado_por_nome = null, autorizado_por_telefone = null, autorizacao_registrada_por = null
     where c.os_id = v_os.id;
    perform private.registrar_historico(v_os, 'modo', v_os.status, 'aguardando_orcamento', 'Com orcamento');
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- adicionar_item_os: idempotente por chave. Preenche preco e custo do catalogo
-- sozinho (inclusive quando quem lanca nao pode ver: atendente nao ve custo,
-- mecanico nao ve nada). Mecanico (Fase 3): OS dele em_andamento, sem enviar
-- valor, peca so do catalogo.
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

  if v_os.status in ('entregue', 'cancelada') then
    raise exception 'os_fechada';
  end if;

  if v_papel = 'mecanico' then
    if v_os.mecanico_id is distinct from v_uid then
      raise exception 'acesso_negado' using errcode = '42501';
    end if;
    if v_os.status <> 'em_andamento' then
      raise exception 'os_nao_esta_em_andamento';
    end if;
    if p_preco_unitario_centavos is not null or p_custo_unitario_centavos is not null then
      raise exception 'acesso_negado' using errcode = '42501';
    end if;
    if p_tipo = 'peca' and p_peca_id is null then
      raise exception 'peca_do_catalogo_obrigatoria';
    end if;
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

  return v_item_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- dados_da_placa: autopreenchimento ao abrir OS e "Buscar placa".
-- SECURITY INVOKER: respeita a RLS de quem chama. 0 linhas = placa nova.
-- Mecanico: recebe o nome do cliente, mas telefone/modo_padrao voltam NULL, e
-- as OS consideradas sao so as que ele enxerga.
-- -----------------------------------------------------------------------------
create or replace function public.dados_da_placa(p_placa text)
returns table (
  veiculo_id             uuid,
  placa                  text,
  veiculo_tipo           public.tipo_veiculo,
  veiculo_marca          text,
  veiculo_modelo         text,
  veiculo_ano_modelo     smallint,
  cliente_id             uuid,
  cliente_nome           text,
  cliente_telefone       text,
  cliente_modo_padrao    public.modo_atendimento_cliente,
  ultimo_km              integer,
  ultimo_km_em           timestamptz,
  ultima_os_id           uuid,
  ultima_os_numero       integer,
  ultima_os_entregue_em  timestamptz,
  ultimo_servico         text,
  os_aberta_id           uuid,
  os_aberta_numero       integer,
  os_aberta_status       public.status_os
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    v.id,
    v.placa,
    v.tipo,
    v.marca,
    v.modelo,
    v.ano_modelo,
    v.cliente_id,
    private.nome_cliente(v.cliente_id),
    c.telefone,
    c.modo_padrao,
    case when k.km is not null and (v.km_atual is null or k.km >= v.km_atual) then k.km else v.km_atual end,
    case when k.km is not null and (v.km_atual is null or k.km >= v.km_atual) then k.criado_em
         when v.km_atual is not null then v.atualizado_em end,
    u.id,
    u.numero,
    u.entregue_em,
    u.resumo,
    a.id,
    a.numero,
    a.status
  from public.veiculos v
  left join public.clientes c on c.id = v.cliente_id
  left join lateral (
    select o.km, o.criado_em
      from public.ordens_servico o
     where o.veiculo_id = v.id and o.km is not null and o.status <> 'cancelada'
     order by o.km desc, o.criado_em desc
     limit 1
  ) k on true
  left join lateral (
    select o.id, o.numero, o.entregue_em,
           coalesce(o.solucao_aplicada,
                    (select string_agg(i.descricao, ', ' order by i.criado_em)
                       from public.os_itens i
                      where i.os_id = o.id and i.tipo = 'servico')) as resumo
      from public.ordens_servico o
     where o.veiculo_id = v.id and o.status = 'entregue'
     order by o.entregue_em desc
     limit 1
  ) u on true
  left join lateral (
    select o.id, o.numero, o.status
      from public.ordens_servico o
     where o.veiculo_id = v.id and o.status not in ('entregue', 'cancelada')
     order by o.criado_em desc
     limit 1
  ) a on true
  where v.placa = public.normalizar_placa(p_placa)
$$;

-- -----------------------------------------------------------------------------
-- Permissoes de execucao
-- -----------------------------------------------------------------------------
revoke all on function public.abrir_os(uuid, uuid, text, uuid, text, text, public.modo_atendimento_cliente,
  public.tipo_veiculo, text, text, public.modo_os, integer, integer, text, text, uuid, text, text, text) from public, anon;
revoke all on function public.mudar_status_os(uuid, public.status_os, public.status_os, text) from public, anon;
revoke all on function public.registrar_resposta_orcamento(uuid, public.status_os, boolean, public.canal_resposta, text, text, boolean) from public, anon;
revoke all on function public.marcar_pronta(uuid, text, text) from public, anon;
revoke all on function public.entregar_os(uuid, text, text, public.forma_pagamento, boolean, text) from public, anon;
revoke all on function public.registrar_pagamento(uuid, public.forma_pagamento, timestamptz) from public, anon;
revoke all on function public.atribuir_mecanico(uuid, uuid) from public, anon;
revoke all on function public.trocar_modo_os(uuid, public.modo_os, text, text) from public, anon;
revoke all on function public.adicionar_item_os(uuid, uuid, public.tipo_item_os, uuid, uuid, text, numeric, text, integer, integer) from public, anon;
revoke all on function public.dados_da_placa(text) from public, anon;

grant execute on function public.abrir_os(uuid, uuid, text, uuid, text, text, public.modo_atendimento_cliente,
  public.tipo_veiculo, text, text, public.modo_os, integer, integer, text, text, uuid, text, text, text) to authenticated;
grant execute on function public.mudar_status_os(uuid, public.status_os, public.status_os, text) to authenticated;
grant execute on function public.registrar_resposta_orcamento(uuid, public.status_os, boolean, public.canal_resposta, text, text, boolean) to authenticated;
grant execute on function public.marcar_pronta(uuid, text, text) to authenticated;
grant execute on function public.entregar_os(uuid, text, text, public.forma_pagamento, boolean, text) to authenticated;
grant execute on function public.registrar_pagamento(uuid, public.forma_pagamento, timestamptz) to authenticated;
grant execute on function public.atribuir_mecanico(uuid, uuid) to authenticated;
grant execute on function public.trocar_modo_os(uuid, public.modo_os, text, text) to authenticated;
grant execute on function public.adicionar_item_os(uuid, uuid, public.tipo_item_os, uuid, uuid, text, numeric, text, integer, integer) to authenticated;
grant execute on function public.dados_da_placa(text) to authenticated;
