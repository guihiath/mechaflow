-- =============================================================================
-- MechaFlow - Fase 6 - 03 convivencia do link com a aprovacao a mao
--
-- Muda (mesma assinatura, o app nao quebra):
--   private.aplicar_status            desfazer e cancelar revogam o link; desfazer
--                                     marca a resposta como desfeita e nunca apaga.
--                                     os_comercial continua limpo ao desfazer (estado
--                                     atual da OS); a prova fica em orcamento_respostas.
--   registrar_resposta_orcamento      a mao revoga o link e congela (ou reaproveita)
--                                     a versao; grava a prova.
--   trocar_modo_os                    trocar para direto revoga o link.
-- mudar_status_os NAO muda: passa por aplicar_status.
-- OS sem link (antiga) continua funcionando como na Fase 2.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Internas
-- -----------------------------------------------------------------------------
create or replace function private.hash_texto(p_texto text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(p_texto, 'UTF8')), 'hex')
$$;
revoke all on function private.hash_texto(text) from public;

-- Documento do orcamento, montado campo a campo (lista fechada, ARQUITETURA 13.3).
-- NUNCA acrescentar aqui: custo, margem, documento ou telefone do cliente, sintoma,
-- observacoes, mecanico, ids internos. Usado para congelar e para a previa do balcao.
create or replace function private.montar_documento_orcamento(
  p_os_id     uuid,
  p_prazo     text default null,
  p_condicoes text default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'oficina_nome',     f.nome,
    'oficina_telefone', f.telefone,
    'os_numero',        o.numero,
    'veiculo_placa',    v.placa,
    'veiculo_marca',    v.marca,
    'veiculo_modelo',   v.modelo,
    'cliente_nome',     c.nome,
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
       where i.os_id = o.id
    ), '[]'::jsonb),
    'subtotal_servicos_centavos', (
      select coalesce(sum(round(i.quantidade * p.preco_unitario_centavos)), 0)::bigint
        from public.os_itens i join public.os_itens_precos p on p.item_id = i.id
       where i.os_id = o.id and i.tipo = 'servico'),
    'subtotal_pecas_centavos', (
      select coalesce(sum(round(i.quantidade * p.preco_unitario_centavos)), 0)::bigint
        from public.os_itens i join public.os_itens_precos p on p.item_id = i.id
       where i.os_id = o.id and i.tipo = 'peca'),
    'total_centavos', (
      select coalesce(sum(round(i.quantidade * p.preco_unitario_centavos)), 0)::bigint
        from public.os_itens i join public.os_itens_precos p on p.item_id = i.id
       where i.os_id = o.id),
    'prazo_estimado',      nullif(btrim(p_prazo), ''),
    'condicoes_pagamento', nullif(btrim(p_condicoes), '')
  )
    from public.ordens_servico o
    join public.oficinas f on f.id = o.oficina_id
    join public.veiculos v on v.id = o.veiculo_id
    left join public.clientes c on c.id = o.cliente_id
   where o.id = p_os_id
$$;
revoke all on function private.montar_documento_orcamento(uuid, text, text) from public;

-- Congela o orcamento atual numa versao nova. Quem chama ja travou a OS e validou.
create or replace function private.congelar_versao_orcamento(
  p_os        public.ordens_servico,
  p_origem    public.origem_versao_orcamento,
  p_prazo     text default null,
  p_condicoes text default null
)
returns public.orcamento_versoes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc    jsonb := private.montar_documento_orcamento(p_os.id, p_prazo, p_condicoes);
  v_versao public.orcamento_versoes;
begin
  insert into public.orcamento_versoes (
    oficina_id, os_id, numero, origem, conteudo,
    subtotal_servicos_centavos, subtotal_pecas_centavos, total_centavos,
    hash_conteudo, congelada_por
  ) values (
    p_os.oficina_id, p_os.id,
    (select coalesce(max(x.numero), 0) + 1 from public.orcamento_versoes x where x.os_id = p_os.id),
    p_origem, v_doc,
    (v_doc ->> 'subtotal_servicos_centavos')::bigint,
    (v_doc ->> 'subtotal_pecas_centavos')::bigint,
    (v_doc ->> 'total_centavos')::bigint,
    private.hash_texto(v_doc::text),
    auth.uid()
  )
  returning * into v_versao;
  return v_versao;
end;
$$;
revoke all on function private.congelar_versao_orcamento(public.ordens_servico, public.origem_versao_orcamento, text, text) from public;

-- Versao vigente da OS. Campos NULL = nao ha.
create or replace function private.versao_vigente(p_os_id uuid)
returns public.orcamento_versoes
language sql
stable
security definer
set search_path = ''
as $$
  select v.*
    from public.os_comercial c
    join public.orcamento_versoes v on v.id = c.orcamento_versao_vigente_id
   where c.os_id = p_os_id
$$;
revoke all on function private.versao_vigente(uuid) from public;

-- O link que vale ja tem resposta do cliente (aprovou ou recusou, sem ter sido
-- desfeito nem substituido). Serve para dar a mensagem certa ao balcao.
create or replace function private.cliente_respondeu_por_link(p_os_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.orcamento_links l
      join public.orcamento_respostas r on r.link_id = l.id
     where l.os_id = p_os_id and l.revogado_em is null
  )
$$;
revoke all on function private.cliente_respondeu_por_link(uuid) from public;

-- Link nao revogado e sem resposta (mesmo vencido). Campos NULL = nao ha.
create or replace function private.link_ativo(p_os_id uuid)
returns public.orcamento_links
language sql
stable
security definer
set search_path = ''
as $$
  select l.*
    from public.orcamento_links l
   where l.os_id = p_os_id
     and l.revogado_em is null
     and not exists (select 1 from public.orcamento_respostas r where r.link_id = l.id)
$$;
revoke all on function private.link_ativo(uuid) from public;

-- Revoga o link nao revogado da OS. p_so_sem_resposta: preserva link ja respondido.
create or replace function private.revogar_links_os(
  p_os_id           uuid,
  p_motivo          public.motivo_revogacao_link,
  p_so_sem_resposta boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  update public.orcamento_links l
     set revogado_em = now(), revogado_por = auth.uid(), revogado_motivo = p_motivo
   where l.os_id = p_os_id
     and l.revogado_em is null
     and (not p_so_sem_resposta
          or not exists (select 1 from public.orcamento_respostas r where r.link_id = l.id));
  get diagnostics n = row_count;
  return n > 0;
end;
$$;
revoke all on function private.revogar_links_os(uuid, public.motivo_revogacao_link, boolean) from public;

-- Grava a prova da resposta. Devolve o id.
create or replace function private.gravar_resposta_orcamento(
  p_versao  public.orcamento_versoes,
  p_link_id uuid,
  p_canal   public.canal_resposta,
  p_aprovou boolean,
  p_nome    text,
  p_motivo  text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_em   timestamptz := clock_timestamp();
  v_nome text := left(nullif(btrim(p_nome), ''), 120);
  v_mot  text := left(nullif(btrim(p_motivo), ''), 500);
  v_id   uuid;
begin
  insert into public.orcamento_respostas (
    oficina_id, os_id, versao_id, link_id, canal, aprovou, respondente_nome, motivo,
    valor_centavos, hash_versao, hash_resposta, respondido_em, registrada_por
  ) values (
    p_versao.oficina_id, p_versao.os_id, p_versao.id, p_link_id, p_canal, p_aprovou, v_nome, v_mot,
    p_versao.total_centavos, p_versao.hash_conteudo,
    private.hash_texto(jsonb_build_object(
      'hash_versao', p_versao.hash_conteudo,
      'versao_id',   p_versao.id,
      'canal',       p_canal,
      'aprovou',     p_aprovou,
      'nome',        v_nome,
      'motivo',      v_mot,
      'valor',       p_versao.total_centavos,
      'em',          to_char(v_em at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
    )::text),
    v_em,
    case when p_canal = 'link' then null else auth.uid() end
  )
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function private.gravar_resposta_orcamento(public.orcamento_versoes, uuid, public.canal_resposta, boolean, text, text) from public;

-- -----------------------------------------------------------------------------
-- 2) aplicar_status (mesma assinatura da migracao 05)
-- -----------------------------------------------------------------------------
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
  -- Fase 6: o link para antes de a OS sair do estado em que ele valia.
  if p_para = 'cancelada' then
    perform private.revogar_links_os(p_os.id, 'cancelada');
  elsif p_os.status = 'aprovada' and p_para in ('aguardando_orcamento', 'orcamento_enviado') then
    -- Desfazer a aprovacao: a prova fica, marcada como desfeita; o link nao volta a valer.
    perform private.revogar_links_os(p_os.id, 'desfeito');
    update public.orcamento_respostas r
       set desfeita_em = now(),
           desfeita_por = auth.uid(),
           desfeita_por_nome = (select pf.nome from public.perfis pf where pf.id = auth.uid())
     where r.os_id = p_os.id and r.aprovou and r.desfeita_em is null;
  elsif p_os.status = 'orcamento_enviado' and p_para = 'aguardando_orcamento' then
    -- Voltou para alterar. Link ja respondido (recusa pelo link) continua mostrando a resposta.
    perform private.revogar_links_os(p_os.id, 'alterado', true);
  end if;

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

  -- Voltou para antes da aprovacao: limpa o ESTADO atual. A prova nao esta aqui.
  if p_para in ('aguardando_orcamento', 'orcamento_enviado') then
    update public.os_comercial c
       set orcamento_aprovado_por_nome        = null,
           orcamento_aprovacao_canal          = null,
           orcamento_aprovacao_registrada_por = null,
           valor_aprovado_centavos            = null
     where c.os_id = p_os.id;
  end if;

  -- Fase 6: saiu do estado em que a versao valia. enviar_orcamento grava depois.
  update public.os_comercial c
     set orcamento_versao_vigente_id = null
   where c.os_id = p_os.id and c.orcamento_versao_vigente_id is not null;

  -- Fase 3: aprovacao nova (ou desfeita) => nenhum item e "apos a aprovacao".
  if p_para in ('aprovada', 'aguardando_orcamento', 'orcamento_enviado') then
    update public.os_itens i
       set apos_aprovacao = false
     where i.os_id = p_os.id and i.apos_aprovacao;
  end if;

  perform private.registrar_historico(p_os, p_evento, p_os.status, p_para, p_observacao, p_observacao_interna);
end;
$$;

-- -----------------------------------------------------------------------------
-- 3) registrar_resposta_orcamento (mesma assinatura da migracao 04)
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
  v_os      public.ordens_servico;
  v_tot     record;
  v_motivo  text := nullif(btrim(p_motivo), '');
  v_obs     text;
  v_obs_int text;
  v_versao  public.orcamento_versoes;
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

  -- O cliente respondeu pelo link enquanto a tela estava aberta: a primeira resposta vale.
  if v_os.status <> p_de and v_os.status in ('aprovada', 'aguardando_orcamento')
     and private.cliente_respondeu_por_link(v_os.id) then
    raise exception 'cliente_ja_respondeu';
  end if;

  v_versao := private.versao_vigente(v_os.id);

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

    -- Com versao vigente os itens estao travados: vale a que o cliente recebeu.
    if v_versao.id is null then
      v_versao := private.congelar_versao_orcamento(v_os, 'manual');
    end if;
    perform private.revogar_links_os(v_os.id, 'resposta_manual');
    perform private.gravar_resposta_orcamento(v_versao, null, p_canal, true, p_quem_respondeu, null);

    perform private.aplicar_status(v_os, 'aprovada', 'aprovacao', 'por ' || p_canal::text);

    update public.os_comercial c
       set orcamento_aprovado_por_nome        = left(nullif(btrim(p_quem_respondeu), ''), 120),
           orcamento_aprovacao_canal          = p_canal,
           orcamento_aprovacao_registrada_por = auth.uid(),
           valor_aprovado_centavos            = v_versao.total_centavos
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

  -- Recusa a mao com versao vigente: para o link e guarda a prova contra essa versao.
  -- Sem versao nada foi mostrado ao cliente: fica so o historico, como na Fase 2.
  if v_versao.id is not null then
    perform private.revogar_links_os(v_os.id, 'resposta_manual');
    perform private.gravar_resposta_orcamento(v_versao, null, p_canal, false, p_quem_respondeu, v_motivo);
  end if;

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

-- -----------------------------------------------------------------------------
-- 4) trocar_modo_os (mesma assinatura da migracao 03): direto revoga o link
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

    perform private.revogar_links_os(v_os.id, 'modo_direto');

    update public.ordens_servico o
       set modo = 'direto', status = 'em_andamento',
           autorizado_em = now(), iniciado_em = coalesce(o.iniciado_em, now())
     where o.id = v_os.id;
    update public.os_comercial c
       set autorizado_por_nome = v_aut_nome,
           autorizado_por_telefone = v_aut_tel,
           autorizacao_registrada_por = auth.uid(),
           orcamento_versao_vigente_id = null
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

-- (create or replace mantem os GRANTs: execute para authenticated, nada para anon/public)
