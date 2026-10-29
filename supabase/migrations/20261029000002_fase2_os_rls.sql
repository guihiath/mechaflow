-- =============================================================================
-- MechaFlow - Fase 2 - 02 permissoes (GRANT) e politicas RLS da OS
--
-- Mesmo padrao da Fase 1: (select private.minha_oficina_id()) / meu_papel() /
-- vejo_todas_os() entre parenteses => calculado uma vez por consulta.
--
-- MUDANCA DE REGRA DA FASE 1 (decisao do CEO, 2026-10-29):
--   o mecanico deixa de ler a tabela clientes (telefone, documento, e-mail).
--   Ele ve so o NOME do cliente, pelas views vw_os e pela RPC dados_da_placa
--   (funcao private.nome_cliente). Ver ARQUITETURA, Fase 2.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- clientes: leitura so para dono e atendente
-- -----------------------------------------------------------------------------
drop policy clientes_select on public.clientes;
create policy clientes_select on public.clientes
  for select to authenticated
  using (
    oficina_id = (select private.minha_oficina_id())
    and (select private.meu_papel()) in ('dono', 'atendente')
  );

-- -----------------------------------------------------------------------------
-- 1) GRANTs
-- -----------------------------------------------------------------------------
revoke all on table
  public.ordens_servico, public.os_comercial, public.os_itens,
  public.os_itens_precos, public.os_itens_custos, public.os_historico,
  public.vw_os, public.vw_os_totais, public.vw_os_itens, public.vw_os_historico,
  public.vw_catalogo_mais_usados
from anon, authenticated;

-- ordens_servico: le; dono/atendente editam so os textos da OS (km, relato,
-- diagnostico). Status, numero, mecanico, modo, datas: so por RPC.
grant select on public.ordens_servico to authenticated;
grant update (km, horimetro, sintoma_relatado, observacoes, codigo_falha, causa_encontrada, solucao_aplicada)
  on public.ordens_servico to authenticated;

-- os_comercial: so leitura (escrita pelas RPCs).
grant select on public.os_comercial to authenticated;

-- itens: insert/delete pela RLS; update so descricao, quantidade e unidade.
grant select, insert, delete on public.os_itens to authenticated;
grant update (descricao, quantidade, unidade) on public.os_itens to authenticated;

grant select, insert, update, delete on public.os_itens_precos, public.os_itens_custos to authenticated;

grant select on public.os_historico to authenticated;

grant select on public.vw_os, public.vw_os_totais, public.vw_os_itens, public.vw_os_historico,
  public.vw_catalogo_mais_usados to authenticated;

-- -----------------------------------------------------------------------------
-- 2) Politicas
-- -----------------------------------------------------------------------------

-- ---------- ordens_servico ----------
-- dono/atendente: todas da oficina. mecanico: as atribuidas a ele (ou todas
-- se o dono ligou ve_todas_os). Sem INSERT/DELETE: abrir = RPC, apagar = cancelar.
create policy ordens_servico_select on public.ordens_servico
  for select to authenticated
  using (
    oficina_id = (select private.minha_oficina_id())
    and ((select private.vejo_todas_os()) or mecanico_id = (select auth.uid()))
  );

create policy ordens_servico_update on public.ordens_servico
  for update to authenticated
  using (
    oficina_id = (select private.minha_oficina_id())
    and (select private.meu_papel()) in ('dono', 'atendente')
  )
  with check (oficina_id = (select private.minha_oficina_id()));

-- ---------- os_comercial (so dono + atendente; escrita so por RPC) ----------
create policy os_comercial_select on public.os_comercial
  for select to authenticated
  using (
    oficina_id = (select private.minha_oficina_id())
    and (select private.meu_papel()) in ('dono', 'atendente')
  );

-- ---------- os_itens ----------
-- Leitura: itens das OS que eu enxergo.
create policy os_itens_select on public.os_itens
  for select to authenticated
  using (
    oficina_id = (select private.minha_oficina_id())
    and os_id in (select o.id from public.ordens_servico o)
  );

-- Insercao:
--   dono/atendente: em qualquer OS da oficina (a trava de OS fechada e trigger).
--   mecanico (Fase 3): so na OS atribuida a ele, em_andamento, lancado_por = ele,
--   e peca SEMPRE do catalogo (peca nova => cria antes em catalogo_pecas, que
--   para ele nasce pendente_precificacao). Sem valor: ele nao grava preco/custo.
create policy os_itens_insert on public.os_itens
  for insert to authenticated
  with check (
    oficina_id = (select private.minha_oficina_id())
    and (
      ((select private.meu_papel()) in ('dono', 'atendente')
        and os_id in (select o.id from public.ordens_servico o))
      or ((select private.meu_papel()) = 'mecanico'
        and lancado_por = (select auth.uid())
        and (tipo = 'servico' or peca_id is not null)
        and exists (select 1 from public.ordens_servico o
                     where o.id = os_itens.os_id
                       and o.mecanico_id = (select auth.uid())
                       and o.status = 'em_andamento'))
    )
  );

-- Alterar/remover: dono/atendente qualquer item; mecanico so o que ele lancou,
-- na OS dele em_andamento.
create policy os_itens_update on public.os_itens
  for update to authenticated
  using (
    oficina_id = (select private.minha_oficina_id())
    and (
      (select private.meu_papel()) in ('dono', 'atendente')
      or ((select private.meu_papel()) = 'mecanico'
        and lancado_por = (select auth.uid())
        and exists (select 1 from public.ordens_servico o
                     where o.id = os_itens.os_id
                       and o.mecanico_id = (select auth.uid())
                       and o.status = 'em_andamento'))
    )
  )
  with check (oficina_id = (select private.minha_oficina_id()));

create policy os_itens_delete on public.os_itens
  for delete to authenticated
  using (
    oficina_id = (select private.minha_oficina_id())
    and (
      (select private.meu_papel()) in ('dono', 'atendente')
      or ((select private.meu_papel()) = 'mecanico'
        and lancado_por = (select auth.uid())
        and exists (select 1 from public.ordens_servico o
                     where o.id = os_itens.os_id
                       and o.mecanico_id = (select auth.uid())
                       and o.status = 'em_andamento'))
    )
  );

-- ---------- os_itens_precos (dono + atendente: tudo) ----------
create policy os_itens_precos_select on public.os_itens_precos
  for select to authenticated
  using (
    oficina_id = (select private.minha_oficina_id())
    and (select private.meu_papel()) in ('dono', 'atendente')
  );

create policy os_itens_precos_insert on public.os_itens_precos
  for insert to authenticated
  with check (
    oficina_id = (select private.minha_oficina_id())
    and (select private.meu_papel()) in ('dono', 'atendente')
  );

create policy os_itens_precos_update on public.os_itens_precos
  for update to authenticated
  using (
    oficina_id = (select private.minha_oficina_id())
    and (select private.meu_papel()) in ('dono', 'atendente')
  )
  with check (oficina_id = (select private.minha_oficina_id()));

create policy os_itens_precos_delete on public.os_itens_precos
  for delete to authenticated
  using (
    oficina_id = (select private.minha_oficina_id())
    and (select private.meu_papel()) in ('dono', 'atendente')
  );

-- ---------- os_itens_custos (so dono) ----------
create policy os_itens_custos_select on public.os_itens_custos
  for select to authenticated
  using (
    oficina_id = (select private.minha_oficina_id())
    and (select private.meu_papel()) = 'dono'
  );

create policy os_itens_custos_insert on public.os_itens_custos
  for insert to authenticated
  with check (
    oficina_id = (select private.minha_oficina_id())
    and (select private.meu_papel()) = 'dono'
  );

create policy os_itens_custos_update on public.os_itens_custos
  for update to authenticated
  using (
    oficina_id = (select private.minha_oficina_id())
    and (select private.meu_papel()) = 'dono'
  )
  with check (oficina_id = (select private.minha_oficina_id()));

create policy os_itens_custos_delete on public.os_itens_custos
  for delete to authenticated
  using (
    oficina_id = (select private.minha_oficina_id())
    and (select private.meu_papel()) = 'dono'
  );

-- ---------- os_historico (leitura das OS que eu enxergo; escrita so RPC) ----------
create policy os_historico_select on public.os_historico
  for select to authenticated
  using (
    oficina_id = (select private.minha_oficina_id())
    and os_id in (select o.id from public.ordens_servico o)
  );
