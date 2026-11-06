-- =============================================================================
-- MechaFlow - Fase 7 - 03 dados do PDF da OS e evento de preco (F7-A3)
--
-- dados_pdf_os: lista fechada do PDF enviado ao cliente (decisao 20.6-8). Gerado na
-- hora, nao congelado: itens, precos, causa e solucao travam na entrega, entao o
-- valor nao muda. Cabecalho e situacao do pagamento refletem o momento da geracao.
--
-- Evento 'preco' (F7-B8): trigger, porque os_itens_precos aceita escrita direta.
-- Sem valor. Vale so daqui para a frente. Sem efeito em orcamento_travado (a trava
-- e BEFORE e recusa antes) nem nas versoes congeladas (nao toca nelas).
--
-- os_historico: a RLS passa a esconder do mecanico os eventos 'preco' e 'pagamento'.
-- 'pagamento' ja nao aparecia na tela dele, mas chegava pela API: isso fecha o furo.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) dados_pdf_os. Nunca acrescentar: custo, margem, CPF da oficina, telefone ou
--    documento do cliente, mecanico, fotos, sintoma, codigo de falha, observacoes,
--    quem registrou o pagamento, ids. Documento da oficina: so CNPJ (14 digitos).
-- -----------------------------------------------------------------------------
create or replace function public.dados_pdf_os(p_os_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_o public.ordens_servico;
  v_c public.os_comercial;
  v_r jsonb;
begin
  if private.meu_papel() is null or private.meu_papel() not in ('dono', 'atendente') then
    raise exception 'acesso_negado' using errcode = '42501';
  end if;

  select o.* into v_o
    from public.ordens_servico o
   where o.id = p_os_id
     and o.oficina_id = private.minha_oficina_id();
  if not found then
    raise exception 'os_nao_encontrada';
  end if;
  if v_o.status = 'cancelada' then
    raise exception 'os_cancelada_sem_pdf';
  end if;
  select c.* into v_c from public.os_comercial c where c.os_id = v_o.id;

  select jsonb_build_object(
    'tipo_documento',  case when v_o.status = 'entregue' then 'resumo_final' else 'ordem_servico' end,
    'oficina_nome',     f.nome,
    'oficina_telefone', f.telefone,
    'oficina_cnpj',     case when f.documento ~ '^[0-9]{14}$' then f.documento end,
    'fuso',             f.fuso_horario,
    'os_numero',        v_o.numero,
    'status',           v_o.status,
    'criado_em',        v_o.criado_em,
    'entregue_em',      v_o.entregue_em,
    'gerado_em',        now(),
    'cliente_nome',     c.nome,
    'veiculo_placa',    v.placa,
    'veiculo_marca',    v.marca,
    'veiculo_modelo',   v.modelo,
    'veiculo_ano',      v.ano_modelo,
    'km',               v_o.km,
    'causa_encontrada', v_o.causa_encontrada,
    'solucao_aplicada', v_o.solucao_aplicada,
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
               'tipo',                    i.tipo,
               'descricao',               i.descricao,
               'quantidade',              i.quantidade,
               'unidade',                 i.unidade,
               'preco_unitario_centavos', p.preco_unitario_centavos,
               'subtotal_centavos',       round(i.quantidade * p.preco_unitario_centavos)::bigint
             ) order by i.tipo, i.criado_em, i.id)
        from public.os_itens i
        left join public.os_itens_precos p on p.item_id = i.id
       where i.os_id = v_o.id
    ), '[]'::jsonb),
    'subtotal_servicos_centavos', t.total_servicos_centavos,
    'subtotal_pecas_centavos',    t.total_pecas_centavos,
    'total_centavos',             t.total_centavos,
    'itens_sem_preco',            t.itens_sem_preco,
    'forma_pagamento',    v_c.forma_pagamento,
    'situacao_pagamento', case when v_o.status <> 'entregue' then null
                               when v_c.pago_em is not null then 'pago'
                               else 'a_receber' end,
    'pago_em',            case when v_o.status = 'entregue' then v_c.pago_em end
  ) into v_r
    from public.oficinas f
    join public.veiculos v on v.id = v_o.veiculo_id
    left join public.clientes c on c.id = v_o.cliente_id
    cross join lateral (select tt.* from public.vw_os_totais tt where tt.os_id = v_o.id) t
   where f.id = v_o.oficina_id;

  return v_r;
end;
$$;

revoke all on function public.dados_pdf_os(uuid) from public, anon;
grant execute on function public.dados_pdf_os(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 2) Evento novo no historico
-- -----------------------------------------------------------------------------
alter table public.os_historico drop constraint os_historico_evento_check;
alter table public.os_historico add constraint os_historico_evento_check check (evento in (
  'criada', 'status', 'desfazer', 'mecanico', 'modo', 'aprovacao', 'recusa',
  'cancelada', 'entregue', 'pagamento', 'vistoria', 'orcamento_link',
  'preco'));   -- Fase 7: Fulano definiu ou mudou o preco (sem valor; o mecanico nao le)

-- Mecanico nao le 'preco' nem 'pagamento'. Dono e atendente: tudo, como antes.
drop policy os_historico_select on public.os_historico;
create policy os_historico_select on public.os_historico
  for select to authenticated
  using (
    oficina_id = (select private.minha_oficina_id())
    and os_id in (select o.id from public.ordens_servico o)
    and ((select private.meu_papel()) in ('dono', 'atendente')
         or evento not in ('preco', 'pagamento'))
  );

-- -----------------------------------------------------------------------------
-- 3) Trigger do evento. Registra quando o balcao define ou muda o preco de um item
--    que ja existia. Nao registra:
--      * item novo com preco no mesmo pedido (adicionar_item_os: mesma transacao,
--        criado_em = now()), que e so lancamento;
--      * preco copiado do catalogo quando o mecanico lanca (papel mecanico);
--      * regravar o mesmo valor;
--      * escrita sem usuario (migracao, administrador).
--    Agrupamento: um evento por OS e usuario em 5 minutos. Os seguintes sao
--    descartados, e nao somados, porque os_historico nao se altera.
-- -----------------------------------------------------------------------------
create or replace function private.tg_os_itens_precos_evento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_os_id   uuid;
  v_criado  timestamptz;
  v_status  public.status_os;
begin
  if v_uid is null or coalesce(private.meu_papel()::text, '') not in ('dono', 'atendente') then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.preco_unitario_centavos = old.preco_unitario_centavos then
    return null;
  end if;

  select i.os_id, i.criado_em into v_os_id, v_criado
    from public.os_itens i where i.id = new.item_id;
  if tg_op = 'INSERT' and v_criado = now() then
    return null;
  end if;

  if exists (select 1 from public.os_historico h
              where h.os_id = v_os_id and h.evento = 'preco' and h.por = v_uid
                and h.em > now() - interval '5 minutes') then
    return null;
  end if;

  select o.status into v_status from public.ordens_servico o where o.id = v_os_id;
  insert into public.os_historico (oficina_id, os_id, evento, de_status, para_status, observacao, por)
  values (new.oficina_id, v_os_id, 'preco', v_status, v_status, null, v_uid);
  return null;
end;
$$;
revoke all on function private.tg_os_itens_precos_evento() from public;

create trigger os_itens_precos_evento after insert or update on public.os_itens_precos
  for each row execute function private.tg_os_itens_precos_evento();
