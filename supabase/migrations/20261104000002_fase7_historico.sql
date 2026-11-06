-- =============================================================================
-- MechaFlow - Fase 7 - 02 historico por placa (F7-A2, decisao 20.6-7)
--
-- O mecanico passa a ver TODAS as OS da placa, so leitura, em lista fechada
-- (ARQUITETURA 14.6, alinhada ao DESIGN 14.7): sem valor, sem cliente nem telefone,
-- sem observacao do balcao, sem motivo de cancelamento, sem nome de outro mecanico,
-- sem assinatura nem quem assinou. Da vistoria ele recebe o que ja via na Fase 4
-- (observacoes gerais e complementos), menos assinatura, motivo da anulacao e nomes.
--
-- A RLS das tabelas NAO muda. Abrir ordens_servico para ele mudaria tambem vw_os,
-- os_itens, os_historico, vistorias, /minhas-os e o detalhe da OS, e ele passaria a
-- ler colunas e linhas que hoje nao le. Em vez disso:
--   * duas RPCs SECURITY DEFINER que montam o JSON campo a campo, por papel
--     (a chave que o papel nao pode ver nem existe na resposta);
--   * so a LEITURA do Storage e alargada: quem da URL assinada e a politica, e ela
--     so conhece o caminho do arquivo. Ver ARQUITETURA 14.4.
--
-- Nada aqui escreve. Escrita (foto, vistoria, item) continua com as regras antigas.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) historico_placa: lista paginada de OS. Sem itens, fotos nem vistorias:
--    isso so chega ao abrir a OS (historico_os).
--    Pagina: passar em p_antes_criado_em / p_antes_id o "proximo" da resposta.
-- -----------------------------------------------------------------------------
create or replace function public.historico_placa(
  p_placa           text,
  p_limite          integer default 10,
  p_antes_criado_em timestamptz default null,
  p_antes_id        uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_papel   public.papel_usuario;
  v_oficina uuid;
  v_limite  integer := least(greatest(coalesce(p_limite, 10), 1), 50);
  v_veiculo public.veiculos;
  v_balcao  boolean;
  v_lista   jsonb;
  v_prox    jsonb := null;
  v_resumo  jsonb;
begin
  v_papel   := private.exigir_papel(array['dono', 'atendente', 'mecanico']::public.papel_usuario[]);
  v_oficina := private.minha_oficina_id();
  v_balcao  := v_papel in ('dono', 'atendente');

  select v.* into v_veiculo
    from public.veiculos v
   where v.oficina_id = v_oficina
     and v.placa = public.normalizar_placa(coalesce(p_placa, ''));
  if not found then
    return jsonb_build_object('veiculo', null, 'resumo', null, 'os', '[]'::jsonb, 'proximo', null);
  end if;

  -- resumo do veiculo inteiro (nao da pagina): "12 OS · 9 vistorias · desde 2024"
  select jsonb_build_object(
           'qtd_os',        count(*)::integer,
           'qtd_vistorias', coalesce(sum((select count(*) from public.vistorias w
                                           where w.os_id = o.id and w.status = 'concluida')), 0)::integer,
           'primeira_os_em', min(o.criado_em))
    into v_resumo
    from public.ordens_servico o
   where o.oficina_id = v_oficina and o.veiculo_id = v_veiculo.id;

  with pagina as (
    select o.*
      from public.ordens_servico o
     where o.oficina_id = v_oficina
       and o.veiculo_id = v_veiculo.id
       and (p_antes_criado_em is null or p_antes_id is null
            or (o.criado_em, o.id) < (p_antes_criado_em, p_antes_id))
     order by o.criado_em desc, o.id desc
     limit v_limite + 1
  ),
  numerada as (
    select p.*, row_number() over (order by p.criado_em desc, p.id desc) as n from pagina p
  )
  select
    coalesce(jsonb_agg(
      -- lista fechada comum aos 3 papeis
      jsonb_build_object(
        'id',                 x.id,
        'numero',             x.numero,
        'status',             x.status,
        'criado_em',          x.criado_em,
        'entregue_em',        x.entregue_em,
        'cancelado_em',       x.cancelado_em,
        'km',                 x.km,
        'horimetro',          x.horimetro,
        'sintoma_relatado',   x.sintoma_relatado,
        'codigo_falha',       x.codigo_falha,
        'causa_encontrada',   x.causa_encontrada,
        'solucao_aplicada',   x.solucao_aplicada,
        'abre_detalhe',       (private.vejo_todas_os() or x.mecanico_id is not distinct from auth.uid()),
        'qtd_itens',          (select count(*)::integer from public.os_itens i where i.os_id = x.id),
        'qtd_fotos',          (select count(*)::integer from public.os_fotos f where f.os_id = x.id and f.enviada_em is not null),
        'qtd_vistorias',      (select count(*)::integer from public.vistorias w where w.os_id = x.id and w.status <> 'rascunho')
      )
      -- dono e atendente
      || case when v_balcao then jsonb_build_object(
        'mecanico_nome',   private.nome_membro(x.mecanico_id),
        'motivo_cancelamento', coalesce((select c.motivo_cancelamento_texto from public.os_comercial c where c.os_id = x.id),
                                        x.motivo_cancelamento),
        'cliente_nome',    private.nome_cliente(x.cliente_id),
        'observacoes',     (select c.observacoes from public.os_comercial c where c.os_id = x.id),
        'total_centavos',  (private.totais_os(x.id)).total_centavos,
        'forma_pagamento', (select c.forma_pagamento from public.os_comercial c where c.os_id = x.id),
        'pago_em',         (select c.pago_em from public.os_comercial c where c.os_id = x.id)
      ) else '{}'::jsonb end
      -- so o dono
      || case when v_papel = 'dono' then jsonb_build_object(
        'custo_total_centavos', (select coalesce(sum(round(i.quantidade * k.custo_unitario_centavos)), 0)::bigint
                                   from public.os_itens i
                                   join public.os_itens_custos k on k.item_id = i.id
                                  where i.os_id = x.id)
      ) else '{}'::jsonb end
      order by x.n
    ) filter (where x.n <= v_limite), '[]'::jsonb),
    (select jsonb_build_object('antes_criado_em', l.criado_em, 'antes_id', l.id)
       from numerada l
      where l.n = v_limite
        and exists (select 1 from numerada m where m.n = v_limite + 1))
    into v_lista, v_prox
    from numerada x;

  return jsonb_build_object(
    'veiculo',
      jsonb_build_object(
        'id',              v_veiculo.id,
        'placa',           v_veiculo.placa,
        'tipo',            v_veiculo.tipo,
        'marca',           v_veiculo.marca,
        'modelo',          v_veiculo.modelo,
        'ano_modelo',      v_veiculo.ano_modelo,
        'km_atual',        v_veiculo.km_atual,
        'horimetro_atual', v_veiculo.horimetro_atual
      ) || case when v_balcao then jsonb_build_object(
        'cliente_id',   v_veiculo.cliente_id,
        'cliente_nome', private.nome_cliente(v_veiculo.cliente_id)
      ) else '{}'::jsonb end,
    'resumo',  v_resumo,
    'os',      v_lista,
    'proximo', v_prox
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 2) historico_os: itens, fotos e vistorias de UMA OS, ao abrir o cartao.
--    O app assina as URLs depois (15 min), com a sessao do usuario.
-- -----------------------------------------------------------------------------
create or replace function public.historico_os(p_os_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_papel  public.papel_usuario;
  v_balcao boolean;
  v_os_id  uuid;
begin
  v_papel  := private.exigir_papel(array['dono', 'atendente', 'mecanico']::public.papel_usuario[]);
  v_balcao := v_papel in ('dono', 'atendente');

  select o.id into v_os_id
    from public.ordens_servico o
   where o.id = p_os_id
     and o.oficina_id = private.minha_oficina_id();
  if not found then
    raise exception 'os_nao_encontrada';
  end if;

  return jsonb_build_object(
    'os_id', v_os_id,

    'itens', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',         i.id,
          'tipo',       i.tipo,
          'descricao',  i.descricao,
          'quantidade', i.quantidade,
          'unidade',    i.unidade
        )
        || case when v_balcao then jsonb_build_object(
          'preco_unitario_centavos', p.preco_unitario_centavos,
          'subtotal_centavos',       round(i.quantidade * p.preco_unitario_centavos)::bigint
        ) else '{}'::jsonb end
        || case when v_papel = 'dono' then jsonb_build_object(
          'custo_unitario_centavos', k.custo_unitario_centavos
        ) else '{}'::jsonb end
        order by i.tipo, i.criado_em, i.id)
        from public.os_itens i
        left join public.os_itens_precos p on p.item_id = i.id
        left join public.os_itens_custos k on k.item_id = i.id
       where i.os_id = v_os_id
    ), '[]'::jsonb),

    'fotos', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id',                f.id,
          'categoria',         f.categoria,
          'legenda',           f.legenda,
          'largura',           f.largura,
          'altura',            f.altura,
          'caminho',           f.caminho,
          'caminho_miniatura', f.caminho_miniatura,
          'criado_em',         f.criado_em
        ) order by f.criado_em, f.id)
        from public.os_fotos f
       where f.os_id = v_os_id and f.enviada_em is not null
    ), '[]'::jsonb),

    -- concluidas e anuladas; rascunho nao e historico
    'vistorias', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',                 v.id,
          'tipo',               v.tipo,
          'status',             v.status,
          'concluida_em',       v.concluida_em,
          'anulada_em',         v.anulada_em,
          'km',                 v.km,
          'horimetro',          v.horimetro,
          'combustivel',        v.combustivel,
          'objetos',            v.objetos,
          'sem_avarias',        v.sem_avarias,
          'observacoes',        v.observacoes,
          'itens', coalesce((
            select jsonb_agg(jsonb_build_object(
                'descricao',  vi.descricao,
                'situacao',   vi.situacao,
                'observacao', vi.observacao
              ) order by vi.ordem)
              from public.vistoria_itens vi where vi.vistoria_id = v.id
          ), '[]'::jsonb),
          'avarias', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id',        va.id,
                'lado',      va.lado,
                'descricao', va.descricao
              ) order by va.criado_em, va.id)
              from public.vistoria_avarias va where va.vistoria_id = v.id
          ), '[]'::jsonb),
          -- originais e de complemento (complemento_id diz de qual)
          'fotos', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id',                vf.id,
                'tipo',              vf.tipo,
                'avaria_id',         vf.avaria_id,
                'complemento_id',    vf.complemento_id,
                'legenda',           vf.legenda,
                'largura',           vf.largura,
                'altura',            vf.altura,
                'caminho',           vf.caminho,
                'caminho_miniatura', vf.caminho_miniatura
              ) order by vf.criado_em, vf.id)
              from public.vistoria_fotos vf
             where vf.vistoria_id = v.id
               and vf.enviada_em is not null
          ), '[]'::jsonb),
          -- complementos: texto e data; quem escreveu so para o balcao
          'complementos', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id',        c.id,
                'texto',     c.texto,
                'criado_em', c.criado_em
              ) || case when v_balcao then jsonb_build_object('criado_por_nome', private.nome_membro(c.criado_por))
                        else '{}'::jsonb end
              order by c.criado_em, c.id)
              from public.vistoria_complementos c where c.vistoria_id = v.id
          ), '[]'::jsonb)
        )
        -- motivo da anulacao, nomes e assinatura: nunca para o mecanico
        || case when v_balcao then jsonb_build_object(
          'concluida_por_nome',    private.nome_membro(v.concluida_por),
          'motivo_anulacao',       v.motivo_anulacao,
          'anulada_por_nome',      private.nome_membro(v.anulada_por),
          'assinado_por_nome',     v.assinado_por_nome,
          'sem_assinatura_motivo', v.sem_assinatura_motivo,
          'assinatura_caminho',    v.assinatura_caminho
        ) else '{}'::jsonb end
        order by (v.status <> 'concluida'), v.criado_em, v.id)   -- concluida antes da anulada
        from public.vistorias v
       where v.os_id = v_os_id
         and v.status <> 'rascunho'
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.historico_placa(text, integer, timestamptz, uuid) from public, anon;
revoke all on function public.historico_os(uuid) from public, anon;
grant execute on function public.historico_placa(text, integer, timestamptz, uuid) to authenticated;
grant execute on function public.historico_os(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 3) Storage: SO a leitura e alargada, e so para o mecanico. Mesmas assinaturas
--    (as politicas de storage.objects nao mudam). Subir e apagar nao mudam.
--    Conferir "mesma placa" nao restringiria nada: toda OS tem placa e o mecanico
--    pode consultar qualquer placa. O corte real e a oficina e o estado do arquivo.
-- -----------------------------------------------------------------------------

-- os-fotos: alem do que ja via, foto ENVIADA de qualquer OS da oficina.
create or replace function private.pode_ver_foto(p_nome text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.os_fotos f
      join public.ordens_servico o on o.id = f.os_id
     where (f.caminho = p_nome or f.caminho_miniatura = p_nome)
       and f.oficina_id = private.minha_oficina_id()
       and o.oficina_id = f.oficina_id
       and (private.vejo_todas_os()
            or o.mecanico_id = auth.uid()
            or (private.meu_papel() = 'mecanico' and f.enviada_em is not null))
  )
$$;

-- vistorias: alem do que ja via, foto ENVIADA (original ou de complemento) de vistoria
-- concluida ou anulada, de qualquer OS da oficina. A ASSINATURA continua so para
-- quem ve a OS.
create or replace function private.pode_ver_arquivo_vistoria(p_nome text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.vistoria_fotos f
      join public.ordens_servico o on o.id = f.os_id
      join public.vistorias v on v.id = f.vistoria_id
     where (f.caminho = p_nome or f.caminho_miniatura = p_nome)
       and f.oficina_id = private.minha_oficina_id()
       and o.oficina_id = f.oficina_id
       and (private.vejo_todas_os()
            or o.mecanico_id = auth.uid()
            or (private.meu_papel() = 'mecanico'
                and f.enviada_em is not null
                and v.status <> 'rascunho'))
  ) or exists (
    select 1
      from public.vistorias v
      join public.ordens_servico o on o.id = v.os_id
     where v.assinatura_caminho = p_nome
       and v.oficina_id = private.minha_oficina_id()
       and o.oficina_id = v.oficina_id
       and (private.vejo_todas_os() or o.mecanico_id = auth.uid())
  )
$$;

-- (create or replace mantem os GRANTs: execute para authenticated e service_role)
