-- =============================================================================
-- MechaFlow - Fase 1 - 03 permissoes (GRANT) e politicas RLS
--
-- Duas camadas:
--   1) GRANT: o que o papel do Postgres "authenticated" pode tocar (inclusive
--      por coluna). "anon" (sem login) nao toca em nenhuma tabela.
--   2) RLS: quais LINHAS, conforme oficina e papel do app (dono/atendente/mecanico).
--
-- Padrao das politicas: (select private.minha_oficina_id()) e
-- (select private.meu_papel()) entre parenteses com SELECT => calculado uma vez
-- por consulta (initPlan).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) GRANTs
-- O Supabase da ALL para anon/authenticated por padrao no schema public.
-- Aqui zeramos e concedemos so o necessario.
-- -----------------------------------------------------------------------------
revoke all on table
  public.oficinas, public.perfis, public.termos_aceite, public.convites,
  public.clientes, public.veiculos,
  public.catalogo_servicos, public.catalogo_servicos_precos,
  public.catalogo_pecas, public.catalogo_pecas_precos, public.catalogo_pecas_custos,
  public.vw_catalogo_servicos, public.vw_catalogo_pecas
from anon, authenticated;

-- oficinas: le; atualiza so colunas de configuracao (plano, id, criado_* nunca).
grant select on public.oficinas to authenticated;
grant update (nome, documento, telefone, logo_path, vistoria_obrigatoria) on public.oficinas to authenticated;

-- perfis: le; cada um atualiza so nome/telefone. Papel/ativo => RPC atualizar_membro.
grant select on public.perfis to authenticated;
grant update (nome, telefone) on public.perfis to authenticated;

-- termos_aceite e convites: so leitura direta (escrita apenas pelas RPCs).
grant select on public.termos_aceite to authenticated;
grant select on public.convites to authenticated;

-- cadastros: CRUD controlado pela RLS.
grant select, insert, update, delete on
  public.clientes, public.veiculos,
  public.catalogo_servicos, public.catalogo_servicos_precos,
  public.catalogo_pecas, public.catalogo_pecas_precos, public.catalogo_pecas_custos
to authenticated;

-- views de leitura
grant select on public.vw_catalogo_servicos, public.vw_catalogo_pecas to authenticated;

-- -----------------------------------------------------------------------------
-- 2) Politicas RLS
-- -----------------------------------------------------------------------------

-- ---------- oficinas ----------
create policy oficinas_select_membro on public.oficinas
  for select to authenticated
  using (id = (select private.minha_oficina_id()));

create policy oficinas_update_dono on public.oficinas
  for update to authenticated
  using (id = (select private.minha_oficina_id()) and (select private.meu_papel()) = 'dono')
  with check (id = (select private.minha_oficina_id()));
-- INSERT/DELETE: sem politica => negado. Criacao so pela RPC criar_oficina.

-- ---------- perfis ----------
-- Cada um ve o proprio perfil (mesmo desativado, para o app mostrar "acesso desativado").
-- Dono e atendente veem a equipe da oficina. Mecanico nao ve dados de colegas.
create policy perfis_select on public.perfis
  for select to authenticated
  using (
    id = (select auth.uid())
    or (
      oficina_id = (select private.minha_oficina_id())
      and (select private.meu_papel()) in ('dono', 'atendente')
    )
  );

create policy perfis_update_proprio on public.perfis
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
-- INSERT/DELETE: negado (RPCs criar_oficina / aceitar_convite; desligar = ativo false).

-- ---------- termos_aceite ----------
create policy termos_aceite_select on public.termos_aceite
  for select to authenticated
  using (
    usuario_id = (select auth.uid())
    or (
      oficina_id = (select private.minha_oficina_id())
      and (select private.meu_papel()) = 'dono'
    )
  );
-- INSERT/UPDATE/DELETE: negado (imutavel; gravado pelas RPCs).

-- ---------- convites ----------
create policy convites_select_dono on public.convites
  for select to authenticated
  using (
    oficina_id = (select private.minha_oficina_id())
    and (select private.meu_papel()) = 'dono'
  );
-- Escrita so por RPC (criar_convite, revogar_convite, aceitar_convite).

-- ---------- clientes ----------
create policy clientes_select on public.clientes
  for select to authenticated
  using (oficina_id = (select private.minha_oficina_id()));

create policy clientes_insert on public.clientes
  for insert to authenticated
  with check (
    oficina_id = (select private.minha_oficina_id())
    and (select private.meu_papel()) in ('dono', 'atendente')
  );

create policy clientes_update on public.clientes
  for update to authenticated
  using (
    oficina_id = (select private.minha_oficina_id())
    and (select private.meu_papel()) in ('dono', 'atendente')
  )
  with check (oficina_id = (select private.minha_oficina_id()));

create policy clientes_delete on public.clientes
  for delete to authenticated
  using (
    oficina_id = (select private.minha_oficina_id())
    and (select private.meu_papel()) = 'dono'
  );

-- ---------- veiculos ----------
create policy veiculos_select on public.veiculos
  for select to authenticated
  using (oficina_id = (select private.minha_oficina_id()));

create policy veiculos_insert on public.veiculos
  for insert to authenticated
  with check (
    oficina_id = (select private.minha_oficina_id())
    and (select private.meu_papel()) in ('dono', 'atendente')
  );

create policy veiculos_update on public.veiculos
  for update to authenticated
  using (
    oficina_id = (select private.minha_oficina_id())
    and (select private.meu_papel()) in ('dono', 'atendente')
  )
  with check (oficina_id = (select private.minha_oficina_id()));

create policy veiculos_delete on public.veiculos
  for delete to authenticated
  using (
    oficina_id = (select private.minha_oficina_id())
    and (select private.meu_papel()) = 'dono'
  );

-- ---------- catalogo_servicos (nome/descricao: todos leem; so dono escreve) ----------
create policy catalogo_servicos_select on public.catalogo_servicos
  for select to authenticated
  using (oficina_id = (select private.minha_oficina_id()));

create policy catalogo_servicos_insert on public.catalogo_servicos
  for insert to authenticated
  with check (
    oficina_id = (select private.minha_oficina_id())
    and (select private.meu_papel()) = 'dono'
  );

create policy catalogo_servicos_update on public.catalogo_servicos
  for update to authenticated
  using (
    oficina_id = (select private.minha_oficina_id())
    and (select private.meu_papel()) = 'dono'
  )
  with check (oficina_id = (select private.minha_oficina_id()));

create policy catalogo_servicos_delete on public.catalogo_servicos
  for delete to authenticated
  using (
    oficina_id = (select private.minha_oficina_id())
    and (select private.meu_papel()) = 'dono'
  );

-- ---------- catalogo_servicos_precos (dono + atendente leem; dono escreve) ----------
create policy catalogo_servicos_precos_select on public.catalogo_servicos_precos
  for select to authenticated
  using (
    oficina_id = (select private.minha_oficina_id())
    and (select private.meu_papel()) in ('dono', 'atendente')
  );

create policy catalogo_servicos_precos_insert on public.catalogo_servicos_precos
  for insert to authenticated
  with check (
    oficina_id = (select private.minha_oficina_id())
    and (select private.meu_papel()) = 'dono'
  );

create policy catalogo_servicos_precos_update on public.catalogo_servicos_precos
  for update to authenticated
  using (
    oficina_id = (select private.minha_oficina_id())
    and (select private.meu_papel()) = 'dono'
  )
  with check (oficina_id = (select private.minha_oficina_id()));

create policy catalogo_servicos_precos_delete on public.catalogo_servicos_precos
  for delete to authenticated
  using (
    oficina_id = (select private.minha_oficina_id())
    and (select private.meu_papel()) = 'dono'
  );

-- ---------- catalogo_pecas ----------
-- Todos leem (sem valores). Qualquer papel cria peca, mas quem nao e dono so
-- cria peca PENDENTE de precificacao. Editar/apagar: so dono.
create policy catalogo_pecas_select on public.catalogo_pecas
  for select to authenticated
  using (oficina_id = (select private.minha_oficina_id()));

create policy catalogo_pecas_insert on public.catalogo_pecas
  for insert to authenticated
  with check (
    oficina_id = (select private.minha_oficina_id())
    and (
      (select private.meu_papel()) = 'dono'
      or (pendente_precificacao and (select private.meu_papel()) in ('atendente', 'mecanico'))
    )
  );

create policy catalogo_pecas_update on public.catalogo_pecas
  for update to authenticated
  using (
    oficina_id = (select private.minha_oficina_id())
    and (select private.meu_papel()) = 'dono'
  )
  with check (oficina_id = (select private.minha_oficina_id()));

create policy catalogo_pecas_delete on public.catalogo_pecas
  for delete to authenticated
  using (
    oficina_id = (select private.minha_oficina_id())
    and (select private.meu_papel()) = 'dono'
  );

-- ---------- catalogo_pecas_precos (dono + atendente leem; dono escreve) ----------
create policy catalogo_pecas_precos_select on public.catalogo_pecas_precos
  for select to authenticated
  using (
    oficina_id = (select private.minha_oficina_id())
    and (select private.meu_papel()) in ('dono', 'atendente')
  );

create policy catalogo_pecas_precos_insert on public.catalogo_pecas_precos
  for insert to authenticated
  with check (
    oficina_id = (select private.minha_oficina_id())
    and (select private.meu_papel()) = 'dono'
  );

create policy catalogo_pecas_precos_update on public.catalogo_pecas_precos
  for update to authenticated
  using (
    oficina_id = (select private.minha_oficina_id())
    and (select private.meu_papel()) = 'dono'
  )
  with check (oficina_id = (select private.minha_oficina_id()));

create policy catalogo_pecas_precos_delete on public.catalogo_pecas_precos
  for delete to authenticated
  using (
    oficina_id = (select private.minha_oficina_id())
    and (select private.meu_papel()) = 'dono'
  );

-- ---------- catalogo_pecas_custos (so dono, tudo) ----------
create policy catalogo_pecas_custos_select on public.catalogo_pecas_custos
  for select to authenticated
  using (
    oficina_id = (select private.minha_oficina_id())
    and (select private.meu_papel()) = 'dono'
  );

create policy catalogo_pecas_custos_insert on public.catalogo_pecas_custos
  for insert to authenticated
  with check (
    oficina_id = (select private.minha_oficina_id())
    and (select private.meu_papel()) = 'dono'
  );

create policy catalogo_pecas_custos_update on public.catalogo_pecas_custos
  for update to authenticated
  using (
    oficina_id = (select private.minha_oficina_id())
    and (select private.meu_papel()) = 'dono'
  )
  with check (oficina_id = (select private.minha_oficina_id()));

create policy catalogo_pecas_custos_delete on public.catalogo_pecas_custos
  for delete to authenticated
  using (
    oficina_id = (select private.minha_oficina_id())
    and (select private.meu_papel()) = 'dono'
  );
