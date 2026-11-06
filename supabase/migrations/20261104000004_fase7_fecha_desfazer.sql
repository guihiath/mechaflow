-- =============================================================================
-- MechaFlow - Fase 7 - 04 fecha aprovada -> orcamento_enviado (PLANO 19.6, decisao 3)
--                       + registrar_pagamento com p_so_se_a_receber (DESIGN 14.4)
--
-- Desfazer a aprovacao volta sempre para aguardando_orcamento. O app publicado ja
-- manda esse destino desde o F6-B5 (src/acoes/os.ts troca o destino antigo).
-- mudar_status_os: mesma assinatura e mesmo corpo da migracao 04 da Fase 2; muda so
-- a linha do desfazer. Os GRANTs ficam como estao.
-- =============================================================================

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
    when p_de = 'aprovada'             and p_para = 'aguardando_orcamento'              then 'desfazer'
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

-- =============================================================================
-- registrar_pagamento: parametro novo p_so_se_a_receber (DESIGN 14.4, "outra pessoa
-- ja registrou"). Com true, OS ja paga recusa com 'pagamento_ja_registrado' e nada
-- muda; a tela rele vw_os (pago_em, pagamento_registrado_por_nome) para a mensagem.
-- Default false = comportamento de antes (corrigir e voltar para a receber), entao o
-- app publicado, que chama com argumentos nomeados, continua funcionando.
-- drop + create: com create or replace, a assinatura nova viraria um overload ambiguo.
-- =============================================================================
drop function public.registrar_pagamento(uuid, public.forma_pagamento, timestamptz);

create function public.registrar_pagamento(
  p_os_id           uuid,
  p_forma_pagamento public.forma_pagamento,
  p_pago_em         timestamptz default now(),
  p_so_se_a_receber boolean default false
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
  if coalesce(p_so_se_a_receber, false)
     and exists (select 1 from public.os_comercial c where c.os_id = v_os.id and c.pago_em is not null) then
    raise exception 'pagamento_ja_registrado';
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

revoke all on function public.registrar_pagamento(uuid, public.forma_pagamento, timestamptz, boolean) from public, anon;
grant execute on function public.registrar_pagamento(uuid, public.forma_pagamento, timestamptz, boolean) to authenticated;
