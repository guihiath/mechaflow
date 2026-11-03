-- =============================================================================
-- MechaFlow - Fase 6 - 04 RPCs do balcao, RPCs publicas e views
--
-- Balcao (authenticated; dono e atendente): enviar_orcamento, reenviar_orcamento,
--   cancelar_link_orcamento, alterar_orcamento, previa_orcamento, conferir_orcamento.
-- Publicas (SO anon): ver_orcamento, responder_orcamento.
--   * resolvem tudo a partir do hash do token; nunca recebem id, IP ou navegador;
--   * nunca dao RAISE de proposito: devolvem situacao, para o contador de tentativas
--     nao ser desfeito junto com a transacao;
--   * a pagina usa um cliente SEM sessao (so a chave publishable). Quem chamar com
--     sessao de usuario e barrado (42501). ARQUITETURA 13.6.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Internas
-- -----------------------------------------------------------------------------

-- Prazos em um lugar so.
-- Validade: ate 23:59:59 do 10o dia no fuso da oficina (a tela mostra so a data).
create or replace function private.orcamento_expira_em(p_oficina_id uuid) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select (((now() at time zone f.fuso_horario)::date + 10) + time '23:59:59') at time zone f.fuso_horario
    from public.oficinas f where f.id = p_oficina_id
$$;
create or replace function private.orcamento_guarda_rede() returns interval
language sql immutable set search_path = '' as $$ select interval '12 months' $$;
revoke all on function private.orcamento_expira_em(uuid) from public;
revoke all on function private.orcamento_guarda_rede() from public;

-- Situacao do link. Publica: resposta so aparece ate vencer (19.6-6).
-- Balcao (p_balcao): a resposta continua aparecendo depois de vencer.
create or replace function private.situacao_link(
  p_motivo    public.motivo_revogacao_link,
  p_aprovou   boolean,
  p_expira_em timestamptz,
  p_os_status public.status_os,
  p_balcao    boolean default false
)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_motivo = 'substituido'         then 'substituido'
    when p_motivo = 'alterado'            then 'atualizado'
    when p_motivo is not null             then 'encerrado'
    when p_balcao and p_aprovou is true   then 'aprovado'
    when p_balcao and p_aprovou is false  then 'recusado'
    when p_expira_em <= now()             then 'vencido'
    when p_aprovou is true                then 'aprovado'
    when p_aprovou is false               then 'recusado'
    when p_os_status <> 'orcamento_enviado' then 'encerrado'  -- rede de seguranca
    else 'aberto'
  end
$$;
revoke all on function private.situacao_link(public.motivo_revogacao_link, boolean, timestamptz, public.status_os, boolean) from public;
grant execute on function private.situacao_link(public.motivo_revogacao_link, boolean, timestamptz, public.status_os, boolean) to authenticated;

-- Conta a tentativa na janela atual de 10 minutos. true = dentro do limite.
create or replace function private.contar_tentativa_link(p_link_id uuid, p_resposta boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_janela timestamptz := date_bin('10 minutes', now(), timestamptz '2000-01-01 00:00:00+00');
  v_ler    integer;
  v_resp   integer;
begin
  insert into private.orcamento_tentativas as t (link_id, janela, leituras, respostas)
  values (p_link_id, v_janela,
          case when p_resposta then 0 else 1 end,
          case when p_resposta then 1 else 0 end)
  on conflict (link_id) do update
     set janela    = excluded.janela,
         leituras  = case when t.janela = excluded.janela then t.leituras else 0 end + excluded.leituras,
         respostas = case when t.janela = excluded.janela then t.respostas else 0 end + excluded.respostas
  returning t.leituras, t.respostas into v_ler, v_resp;

  return case when p_resposta then v_resp <= 30 else v_ler <= 120 end;
end;
$$;
revoke all on function private.contar_tentativa_link(uuid, boolean) from public;

-- IP e navegador vem dos cabecalhos que o gateway entrega ao PostgREST (nunca de
-- parametro). cf-connecting-ip primeiro: a Cloudflare sobrescreve. x-forwarded-for
-- so como reserva (o primeiro valor pode ser forjado) e a fonte fica registrada.
create or replace function private.origem_requisicao(out ip text, out ip_fonte text, out user_agent text)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_h jsonb;
  v_c text;
begin
  begin
    v_h := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_h := null;
  end;
  user_agent := left(nullif(btrim(v_h ->> 'user-agent'), ''), 500);

  v_c := nullif(btrim(v_h ->> 'cf-connecting-ip'), '');
  if v_c is not null then
    ip_fonte := 'cf-connecting-ip';
  else
    v_c := nullif(btrim(split_part(coalesce(v_h ->> 'x-forwarded-for', ''), ',', 1)), '');
    if v_c is not null then
      ip_fonte := 'x-forwarded-for';
    end if;
  end if;

  -- so aceita o que for IP de verdade
  begin
    ip := host(v_c::inet);
  exception when others then
    ip := null;
    ip_fonte := null;
  end;
end;
$$;
revoke all on function private.origem_requisicao() from public;

-- LGPD: apaga IP e navegador vencidos, em lotes pequenos, a cada envio de orcamento.
-- Sem rotina agendada. A RLS ja esconde o vencido enquanto a linha nao sai.
create or replace function private.expurgar_rede_orcamento()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  delete from public.orcamento_resposta_rede x
   where x.resposta_id in (
     select y.resposta_id from public.orcamento_resposta_rede y
      where y.apagar_em <= now()
      order by y.apagar_em
      limit 200);
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function private.expurgar_rede_orcamento() from public;

-- Token: 256 bits, 64 caracteres hex. O SHA-256 condensa 3 UUIDs v4 (366 bits do
-- gerador forte do Postgres), sem depender de extensao.
create or replace function private.gerar_token_orcamento()
returns text
language sql
volatile
set search_path = ''
as $$
  select encode(sha256(decode(
           replace(gen_random_uuid()::text || gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
           'hex')), 'hex')
$$;
revoke all on function private.gerar_token_orcamento() from public;

-- Cria o link. Revoga antes o que houver. O token so existe no retorno desta funcao.
create or replace function private.criar_link_orcamento(
  p_versao public.orcamento_versoes,
  p_chave  uuid,
  p_motivo public.motivo_revogacao_link,
  out token text,
  out expira_em timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.revogar_links_os(p_versao.os_id, p_motivo);
  token     := private.gerar_token_orcamento();
  expira_em := private.orcamento_expira_em(p_versao.oficina_id);
  -- clock_timestamp: ordem estrita dos links da OS, mesmo na mesma transacao
  insert into public.orcamento_links (oficina_id, os_id, versao_id, token_hash, chave_idempotencia, expira_em, criado_por, criado_em)
  values (p_versao.oficina_id, p_versao.os_id, p_versao.id, sha256(convert_to(token, 'UTF8')), p_chave,
          criar_link_orcamento.expira_em, auth.uid(), clock_timestamp());
end;
$$;
revoke all on function private.criar_link_orcamento(public.orcamento_versoes, uuid, public.motivo_revogacao_link) from public;

-- Le o link pelo token. Campos NULL = token malformado ou desconhecido.
create or replace function private.link_pelo_token(p_token text)
returns public.orcamento_links
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_token text := lower(btrim(coalesce(p_token, '')));
  v_link  public.orcamento_links;
begin
  if v_token !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  select l.* into v_link from public.orcamento_links l where l.token_hash = sha256(convert_to(v_token, 'UTF8'));
  return v_link;
end;
$$;
revoke all on function private.link_pelo_token(text) from public;

-- -----------------------------------------------------------------------------
-- 2) enviar_orcamento: valida, congela, gera o token e move para orcamento_enviado
--    na mesma transacao. Idempotente pela chave do navegador.
--    O token nao e recuperavel: repetir a chave gera um token novo para o MESMO
--    envio (sem versao nova nem historico novo) e o anterior vira "substituido".
--    Regra para a tela: vale o ultimo token recebido.
-- -----------------------------------------------------------------------------
create or replace function public.enviar_orcamento(
  p_os_id               uuid,
  p_chave_idempotencia  uuid,
  p_total_conferido_centavos bigint,
  p_prazo_estimado      text default null,
  p_condicoes_pagamento text default null
)
returns table (versao_numero integer, token text, expira_em timestamptz, ja_existia boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_os     public.ordens_servico;
  v_link   public.orcamento_links;
  v_versao public.orcamento_versoes;
  v_tot    record;
  v_novo   record;
  v_texto  text;
begin
  perform private.exigir_papel(array['dono', 'atendente']::public.papel_usuario[]);
  if p_chave_idempotencia is null then
    raise exception 'chave_obrigatoria';
  end if;
  v_os := private.travar_os(p_os_id);

  if v_os.status in ('entregue', 'cancelada') then
    raise exception 'os_fechada';
  end if;
  if v_os.modo <> 'com_orcamento' then
    raise exception 'transicao_invalida';
  end if;

  v_link := private.link_ativo(v_os.id);

  -- Reenvio do mesmo toque (internet fraca, toque duplo)
  if v_link.id is not null and v_link.chave_idempotencia = p_chave_idempotencia then
    select x.* into v_versao from public.orcamento_versoes x where x.id = v_link.versao_id;
    v_novo := private.criar_link_orcamento(v_versao, p_chave_idempotencia, 'substituido');
    return query select v_versao.numero, v_novo.token, v_novo.expira_em, true;
    return;
  end if;

  if (private.versao_vigente(v_os.id)).id is not null then
    raise exception 'orcamento_ja_enviado';   -- use reenviar ou alterar
  end if;
  if v_os.status not in ('aguardando_orcamento', 'orcamento_enviado') then
    if private.cliente_respondeu_por_link(v_os.id) then
      raise exception 'cliente_ja_respondeu';
    end if;
    raise exception 'status_mudou';
  end if;

  if char_length(btrim(coalesce(p_prazo_estimado, ''))) > 120
     or char_length(btrim(coalesce(p_condicoes_pagamento, ''))) > 120 then
    raise exception 'texto_orcamento_grande';
  end if;

  v_tot := private.totais_os(v_os.id);
  if v_tot.qtd_itens = 0 then
    raise exception 'orcamento_sem_itens';
  end if;
  if v_tot.itens_sem_preco > 0 then
    raise exception 'os_itens_sem_preco';
  end if;
  -- Alguem mexeu nos itens entre a conferencia na tela e este toque: nada e gerado.
  if p_total_conferido_centavos is distinct from v_tot.total_centavos then
    raise exception 'orcamento_mudou';
  end if;

  v_versao := private.congelar_versao_orcamento(v_os, 'link', p_prazo_estimado, p_condicoes_pagamento);
  -- link recusado antes, se houver, deixa de valer
  v_novo   := private.criar_link_orcamento(v_versao, p_chave_idempotencia, 'substituido');

  -- Historico: texto so para dono e atendente; o mecanico nao recebe detalhe do link.
  v_texto := 'Link gerado (versão ' || v_versao.numero || ')';
  if v_os.status = 'aguardando_orcamento' then
    perform private.aplicar_status(v_os, 'orcamento_enviado', 'orcamento_link', null, null, null, v_texto);
  else
    -- OS antiga em orcamento_enviado sem link: o status nao muda
    update public.ordens_servico o set orcamento_enviado_em = now() where o.id = v_os.id;
    perform private.registrar_historico(v_os, 'orcamento_link', v_os.status, v_os.status, null, v_texto);
  end if;

  update public.os_comercial c set orcamento_versao_vigente_id = v_versao.id where c.os_id = v_os.id;

  perform private.expurgar_rede_orcamento();

  return query select v_versao.numero, v_novo.token, v_novo.expira_em, false;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3) reenviar_orcamento: link novo para a MESMA versao (renova a validade).
-- -----------------------------------------------------------------------------
create or replace function public.reenviar_orcamento(p_os_id uuid, p_chave_idempotencia uuid)
returns table (versao_numero integer, token text, expira_em timestamptz, ja_existia boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_os     public.ordens_servico;
  v_versao public.orcamento_versoes;
  v_novo   record;
  v_repete boolean;
begin
  perform private.exigir_papel(array['dono', 'atendente']::public.papel_usuario[]);
  if p_chave_idempotencia is null then
    raise exception 'chave_obrigatoria';
  end if;
  v_os := private.travar_os(p_os_id);

  if v_os.status in ('entregue', 'cancelada') then
    raise exception 'os_fechada';
  end if;

  v_versao := private.versao_vigente(v_os.id);
  if v_versao.id is null or v_os.status <> 'orcamento_enviado' then
    if private.cliente_respondeu_por_link(v_os.id) then
      raise exception 'cliente_ja_respondeu';
    end if;
    raise exception 'sem_versao_enviada';
  end if;

  -- vale com link ativo, vencido ou cancelado: o ultimo link diz se e repeticao do toque
  v_repete := coalesce((
    select l.chave_idempotencia = p_chave_idempotencia
      from public.orcamento_links l
     where l.versao_id = v_versao.id
     order by l.criado_em desc, l.revogado_em is null desc
     limit 1), false);
  v_novo := private.criar_link_orcamento(v_versao, p_chave_idempotencia, 'substituido');

  if not v_repete then
    perform private.registrar_historico(v_os, 'orcamento_link', v_os.status, v_os.status, null,
                                        'Link novo gerado (versão ' || v_versao.numero || ')');
  end if;

  return query select v_versao.numero, v_novo.token, v_novo.expira_em, v_repete;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4) cancelar_link_orcamento: a OS fica em orcamento_enviado, com os itens travados
--    e a mesma versao (decisao do CEO). Sai por reenviar ou alterar_orcamento.
--    Devolve false se nao havia link ativo (reenvio).
-- -----------------------------------------------------------------------------
create or replace function public.cancelar_link_orcamento(p_os_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_os public.ordens_servico;
begin
  perform private.exigir_papel(array['dono', 'atendente']::public.papel_usuario[]);
  v_os := private.travar_os(p_os_id);
  if (private.link_ativo(v_os.id)).id is null then
    return false;
  end if;
  perform private.revogar_links_os(v_os.id, 'manual');
  perform private.registrar_historico(v_os, 'orcamento_link', v_os.status, v_os.status, null, 'Link cancelado');
  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5) alterar_orcamento: cancela o link e volta para aguardando_orcamento.
--    O proximo envio cria versao nova com link novo. Reenvio nao faz nada.
-- -----------------------------------------------------------------------------
create or replace function public.alterar_orcamento(p_os_id uuid)
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
  if private.cliente_respondeu_por_link(v_os.id) then
    raise exception 'cliente_ja_respondeu';   -- nada muda: a resposta do cliente vale
  end if;
  if v_os.status = 'aguardando_orcamento' then
    return;
  end if;
  if v_os.status in ('entregue', 'cancelada') then
    raise exception 'os_fechada';
  end if;
  if v_os.status <> 'orcamento_enviado' then
    raise exception 'status_mudou';
  end if;
  perform private.aplicar_status(v_os, 'aguardando_orcamento', 'orcamento_link', null, null, null,
                                 'Orçamento alterado: link anterior cancelado');
end;
$$;

-- -----------------------------------------------------------------------------
-- 6) previa_orcamento: "Ver como o cliente ve" antes de enviar. Nao grava nada.
--    Mesmo montador da versao congelada, entao a previa nao tem como mostrar
--    menos ou mais do que o cliente vera.
-- -----------------------------------------------------------------------------
create or replace function public.previa_orcamento(
  p_os_id               uuid,
  p_prazo_estimado      text default null,
  p_condicoes_pagamento text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_os public.ordens_servico;
begin
  perform private.exigir_papel(array['dono', 'atendente']::public.papel_usuario[]);
  select o.* into v_os from public.ordens_servico o
   where o.id = p_os_id and o.oficina_id = private.minha_oficina_id();
  if not found then
    raise exception 'os_nao_encontrada';
  end if;
  return jsonb_build_object(
    'documento', private.montar_documento_orcamento(v_os.id, p_prazo_estimado, p_condicoes_pagamento),
    'expira_em', private.orcamento_expira_em(v_os.oficina_id));
end;
$$;

-- -----------------------------------------------------------------------------
-- 7) conferir_orcamento: recalcula os hashes da versao e das respostas dela.
-- -----------------------------------------------------------------------------
create or replace function public.conferir_orcamento(p_versao_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_v public.orcamento_versoes;
begin
  perform private.exigir_papel(array['dono', 'atendente']::public.papel_usuario[]);
  select x.* into v_v from public.orcamento_versoes x
   where x.id = p_versao_id and x.oficina_id = private.minha_oficina_id();
  if not found then
    raise exception 'versao_nao_encontrada';
  end if;

  if private.hash_texto(v_v.conteudo::text) <> v_v.hash_conteudo then
    return false;
  end if;

  return not exists (
    select 1 from public.orcamento_respostas r
     where r.versao_id = v_v.id
       and (r.hash_versao <> v_v.hash_conteudo
            or r.hash_resposta <> private.hash_texto(jsonb_build_object(
                 'hash_versao', r.hash_versao,
                 'versao_id',   r.versao_id,
                 'canal',       r.canal,
                 'aprovou',     r.aprovou,
                 'nome',        r.respondente_nome,
                 'motivo',      r.motivo,
                 'valor',       r.valor_centavos,
                 'em',          to_char(r.respondido_em at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
               )::text))
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 8) ver_orcamento (PUBLICA). Volatil de proposito: conta a tentativa, entao so
--    funciona por POST (PostgREST roda GET em transacao somente leitura, e o token
--    tambem nao vai parar em URL de log da API).
--    Sem acesso: so { situacao }. Com acesso: lista fechada, campo a campo.
--    Nao altera nada do orcamento: abrir o link (robo de previa) nao responde nada.
-- -----------------------------------------------------------------------------
create or replace function public.ver_orcamento(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.orcamento_links;
  v_os   public.status_os;
  v_resp public.orcamento_respostas;
  v_sit  text;
  v_d    jsonb;
begin
  v_link := private.link_pelo_token(p_token);
  if v_link.id is null then
    return jsonb_build_object('situacao', 'nao_encontrado');
  end if;
  if not private.contar_tentativa_link(v_link.id, false) then
    return jsonb_build_object('situacao', 'limite');
  end if;

  select o.status into v_os from public.ordens_servico o where o.id = v_link.os_id;
  select r.* into v_resp from public.orcamento_respostas r where r.link_id = v_link.id;
  v_sit := private.situacao_link(v_link.revogado_motivo, v_resp.aprovou, v_link.expira_em, v_os);

  if v_sit not in ('aberto', 'aprovado', 'recusado') then
    return jsonb_build_object('situacao', v_sit);
  end if;

  select x.conteudo into v_d from public.orcamento_versoes x where x.id = v_link.versao_id;

  return jsonb_build_object(
    'situacao',  v_sit,
    'expira_em', v_link.expira_em,
    'documento', jsonb_build_object(
      'oficina_nome',     v_d -> 'oficina_nome',
      'oficina_telefone', v_d -> 'oficina_telefone',
      'os_numero',        v_d -> 'os_numero',
      'veiculo_placa',    v_d -> 'veiculo_placa',
      'veiculo_marca',    v_d -> 'veiculo_marca',
      'veiculo_modelo',   v_d -> 'veiculo_modelo',
      'cliente_nome',     v_d -> 'cliente_nome',
      'itens', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'tipo',                    e.i -> 'tipo',
                 'descricao',               e.i -> 'descricao',
                 'quantidade',              e.i -> 'quantidade',
                 'unidade',                 e.i -> 'unidade',
                 'preco_unitario_centavos', e.i -> 'preco_unitario_centavos',
                 'subtotal_centavos',       e.i -> 'subtotal_centavos'
               ) order by e.n), '[]'::jsonb)
          from jsonb_array_elements(v_d -> 'itens') with ordinality as e(i, n)),
      'subtotal_servicos_centavos', v_d -> 'subtotal_servicos_centavos',
      'subtotal_pecas_centavos',    v_d -> 'subtotal_pecas_centavos',
      'total_centavos',             v_d -> 'total_centavos',
      'prazo_estimado',             v_d -> 'prazo_estimado',
      'condicoes_pagamento',        v_d -> 'condicoes_pagamento'
    ),
    'resposta', case when v_resp.id is null then null else jsonb_build_object(
      'tipo',          case when v_resp.aprovou then 'aprovou' else 'recusou' end,
      'nome',          v_resp.respondente_nome,
      'respondido_em', v_resp.respondido_em
    ) end
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 9) responder_orcamento (PUBLICA). Trava a OS (mesma ordem de todas as RPCs): a
--    primeira resposta vale, no link ou a mao. Repetir devolve a resposta gravada.
--    Sem acesso: so { situacao }, igual a ver_orcamento. Respondido: { situacao,
--    aplicada, resposta }. Dado invalido: { situacao: 'aberto', erro }.
-- -----------------------------------------------------------------------------
create or replace function public.responder_orcamento(
  p_token   text,
  p_aprovou boolean,
  p_nome    text default null,
  p_motivo  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link   public.orcamento_links;
  v_os     public.ordens_servico;
  v_resp   public.orcamento_respostas;
  v_versao public.orcamento_versoes;
  v_sit    text;
  v_nome   text := nullif(btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g')), '');
  v_motivo text := nullif(btrim(p_motivo), '');
  v_id     uuid;
  v_rede   record;
  v_em     timestamptz;
begin
  v_link := private.link_pelo_token(p_token);
  if v_link.id is null then
    return jsonb_build_object('situacao', 'nao_encontrado');
  end if;
  -- antes de travar a OS: excesso nao entra na fila da trava
  if not private.contar_tentativa_link(v_link.id, true) then
    return jsonb_build_object('situacao', 'limite');
  end if;

  select o.* into v_os from public.ordens_servico o where o.id = v_link.os_id for update;
  -- relido depois da trava: outra pessoa pode ter respondido ou revogado enquanto esperava
  select l.* into v_link from public.orcamento_links l where l.id = v_link.id;
  select r.* into v_resp from public.orcamento_respostas r where r.link_id = v_link.id;
  v_sit := private.situacao_link(v_link.revogado_motivo, v_resp.aprovou, v_link.expira_em, v_os.status);

  if v_sit in ('aprovado', 'recusado') then
    return jsonb_build_object('situacao', v_sit, 'aplicada', false,
      'resposta', jsonb_build_object('tipo', case when v_resp.aprovou then 'aprovou' else 'recusou' end,
                                     'nome', v_resp.respondente_nome,
                                     'respondido_em', v_resp.respondido_em));
  end if;
  if v_sit <> 'aberto' then
    return jsonb_build_object('situacao', v_sit);
  end if;

  if p_aprovou is null then
    return jsonb_build_object('situacao', 'aberto', 'erro', 'resposta_obrigatoria');
  end if;
  if (p_aprovou and char_length(coalesce(v_nome, '')) < 2)
     or (not p_aprovou and v_nome is not null and char_length(v_nome) < 2) then
    return jsonb_build_object('situacao', 'aberto', 'erro', 'nome_obrigatorio');
  end if;
  if char_length(coalesce(v_nome, '')) > 80 then
    return jsonb_build_object('situacao', 'aberto', 'erro', 'nome_grande_demais');
  end if;
  if char_length(coalesce(v_motivo, '')) > 500 then
    return jsonb_build_object('situacao', 'aberto', 'erro', 'motivo_grande_demais');
  end if;

  -- Grava primeiro a prova: com ela, aplicar_status preserva o link respondido.
  select x.* into v_versao from public.orcamento_versoes x where x.id = v_link.versao_id;
  v_id := private.gravar_resposta_orcamento(v_versao, v_link.id, 'link', p_aprovou, v_nome,
                                            case when p_aprovou then null else v_motivo end);

  v_rede := private.origem_requisicao();
  insert into public.orcamento_resposta_rede (resposta_id, oficina_id, ip, ip_fonte, user_agent, apagar_em)
  values (v_id, v_os.oficina_id, v_rede.ip, v_rede.ip_fonte, v_rede.user_agent, now() + private.orcamento_guarda_rede());

  if p_aprovou then
    -- p_observacao NULL: o mecanico nao recebe canal nem nome; o balcao le o texto interno.
    perform private.aplicar_status(v_os, 'aprovada', 'aprovacao', null, null, null,
                                   'por link. Nome informado: ' || v_nome);
    update public.os_comercial c
       set orcamento_aprovado_por_nome        = v_nome,
           orcamento_aprovacao_canal          = 'link',
           orcamento_aprovacao_registrada_por = null,
           valor_aprovado_centavos            = v_versao.total_centavos
     where c.os_id = v_os.id;
  else
    -- Nunca cancela sozinha (19.6-4): volta para o balcao negociar.
    perform private.aplicar_status(v_os, 'aguardando_orcamento', 'recusa', null, null, null,
                                   'Cliente recusou por link' || coalesce(': ' || v_motivo, ''));
  end if;

  select r.respondido_em into v_em from public.orcamento_respostas r where r.id = v_id;
  return jsonb_build_object(
    'situacao', case when p_aprovou then 'aprovado' else 'recusado' end,
    'aplicada', true,
    'resposta', jsonb_build_object('tipo', case when p_aprovou then 'aprovou' else 'recusou' end,
                                   'nome', v_nome, 'respondido_em', v_em));
end;
$$;

-- -----------------------------------------------------------------------------
-- 10) Permissoes. O Supabase da EXECUTE a todos por padrao: tirar e dar so o certo.
-- -----------------------------------------------------------------------------
revoke all on function public.enviar_orcamento(uuid, uuid, bigint, text, text) from public, anon;
revoke all on function public.reenviar_orcamento(uuid, uuid) from public, anon;
revoke all on function public.cancelar_link_orcamento(uuid) from public, anon;
revoke all on function public.alterar_orcamento(uuid) from public, anon;
revoke all on function public.previa_orcamento(uuid, text, text) from public, anon;
revoke all on function public.conferir_orcamento(uuid) from public, anon;
grant execute on function public.enviar_orcamento(uuid, uuid, bigint, text, text) to authenticated;
grant execute on function public.reenviar_orcamento(uuid, uuid) to authenticated;
grant execute on function public.cancelar_link_orcamento(uuid) to authenticated;
grant execute on function public.alterar_orcamento(uuid) to authenticated;
grant execute on function public.previa_orcamento(uuid, text, text) to authenticated;
grant execute on function public.conferir_orcamento(uuid) to authenticated;

revoke all on function public.ver_orcamento(text) from public, authenticated, service_role;
revoke all on function public.responder_orcamento(text, boolean, text, text) from public, authenticated, service_role;
grant execute on function public.ver_orcamento(text) to anon;
grant execute on function public.responder_orcamento(text, boolean, text, text) to anon;

-- -----------------------------------------------------------------------------
-- 11) Views do balcao (security_invoker; mecanico: 0 linhas)
-- -----------------------------------------------------------------------------

-- Situacao atual do orcamento por OS (so OS que ja teve versao).
-- link_situacao usa o vocabulario da pagina publica; "cancelado" no CartaoLink =
-- encerrado com link_revogado_motivo = 'manual'.
create view public.vw_orcamento_situacao
with (security_invoker = true)
as
select
  o.id                as os_id,
  o.oficina_id,
  ve.id               as versao_id,
  ve.numero           as versao_numero,
  ve.total_centavos   as versao_total_centavos,
  (o.status = 'orcamento_enviado' and oc.orcamento_versao_vigente_id is not null) as itens_travados,
  li.id               as link_id,
  li.criado_em        as link_criado_em,
  private.nome_membro(li.criado_por) as link_criado_por_nome,
  li.expira_em        as link_expira_em,
  li.revogado_em      as link_revogado_em,
  li.revogado_motivo  as link_revogado_motivo,
  private.nome_membro(li.revogado_por) as link_revogado_por_nome,
  case when li.id is not null then
    private.situacao_link(li.revogado_motivo, rl.aprovou, li.expira_em, o.status, true)
  end                 as link_situacao,
  re.id               as resposta_id,
  re.aprovou          as resposta_aprovou,
  re.canal            as resposta_canal,
  re.respondente_nome as resposta_nome,
  re.motivo           as resposta_motivo,
  re.respondido_em,
  re.desfeita_em      as resposta_desfeita_em,
  re.desfeita_por_nome as resposta_desfeita_por_nome,
  -- "Respondidos": precisa de acao do balcao e sai sozinho quando a acao acontece
  coalesce(
    re.canal = 'link' and re.desfeita_em is null and (
      (o.status = 'aprovada' and re.aprovou)
      or (o.status = 'aguardando_orcamento' and not re.aprovou and re.versao_id = ve.id)
    ), false)         as respondido
from public.ordens_servico o
join public.os_comercial oc on oc.os_id = o.id
join lateral (
  select x.id, x.numero, x.total_centavos from public.orcamento_versoes x
   where x.os_id = o.id order by x.numero desc limit 1
) ve on true
left join lateral (
  select l.id, l.criado_em, l.criado_por, l.expira_em, l.revogado_em, l.revogado_por, l.revogado_motivo
    from public.orcamento_links l
   where l.os_id = o.id order by l.criado_em desc, l.revogado_em is null desc limit 1
) li on true
left join public.orcamento_respostas rl on rl.link_id = li.id
left join lateral (
  select r.* from public.orcamento_respostas r
   where r.os_id = o.id order by r.respondido_em desc limit 1
) re on true
where (select private.meu_papel()) in ('dono', 'atendente');

-- Versoes para consulta do balcao, sem token (/os/[id]/orcamento/[versao]).
create view public.vw_orcamento_versoes
with (security_invoker = true)
as
select
  x.id,
  x.oficina_id,
  x.os_id,
  x.numero,
  x.origem,
  x.conteudo,
  x.subtotal_servicos_centavos,
  x.subtotal_pecas_centavos,
  x.total_centavos,
  x.hash_conteudo,
  upper(substr(x.hash_conteudo, 1, 4) || '-' || substr(x.hash_conteudo, 5, 4)) as codigo_conferencia,
  x.congelada_em,
  private.nome_membro(x.congelada_por) as congelada_por_nome
from public.orcamento_versoes x;

-- Prova: uma linha por resposta. IP e navegador ficam fora: nao vao para a tela.
create view public.vw_orcamento_provas
with (security_invoker = true)
as
select
  r.id,
  r.oficina_id,
  r.os_id,
  r.versao_id,
  ve.numero as versao_numero,
  r.canal,
  r.aprovou,
  r.respondente_nome,
  r.motivo,
  r.valor_centavos,
  upper(substr(r.hash_versao, 1, 4) || '-' || substr(r.hash_versao, 5, 4)) as codigo_conferencia,
  r.hash_resposta,
  r.respondido_em,
  private.nome_membro(r.registrada_por) as registrada_por_nome,
  r.desfeita_em,
  r.desfeita_por_nome
from public.orcamento_respostas r
join public.orcamento_versoes ve on ve.id = r.versao_id;

revoke all on table public.vw_orcamento_situacao, public.vw_orcamento_versoes, public.vw_orcamento_provas from anon, authenticated;
grant select on public.vw_orcamento_situacao, public.vw_orcamento_versoes, public.vw_orcamento_provas to authenticated;

-- vw_os: mesma definicao da Fase 4 + 4 colunas no FIM (etiquetas, contagem e filtro de respondidos).
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
  t.itens_mecanico,
  t.itens_apos_aprovacao,
  (select count(*)::integer from public.os_fotos f
    where f.os_id = o.id and f.enviada_em is not null) as qtd_fotos,
  -- Fase 4
  vi.id                               as vistoria_entrada_id,
  vi.status                           as vistoria_entrada_status,
  -- Fase 6 (mecanico: NULL)
  os6.link_situacao                   as orcamento_link_situacao,
  os6.itens_travados                  as orcamento_itens_travados,
  os6.respondido                      as orcamento_respondido,
  case when os6.respondido then os6.respondido_em end as orcamento_respondido_em
from public.ordens_servico o
join public.veiculos v           on v.id = o.veiculo_id
left join public.clientes c      on c.id = o.cliente_id
left join public.os_comercial oc on oc.os_id = o.id
left join lateral (
  select tt.* from public.vw_os_totais tt where tt.os_id = o.id
) t on true
left join lateral (
  select x.id, x.status from public.vistorias x
   where x.os_id = o.id and x.tipo = 'entrada' and x.status <> 'anulada'
   limit 1
) vi on true
left join lateral (
  select s.link_situacao, s.itens_travados, s.respondido, s.respondido_em
    from public.vw_orcamento_situacao s where s.os_id = o.id
) os6 on true;
