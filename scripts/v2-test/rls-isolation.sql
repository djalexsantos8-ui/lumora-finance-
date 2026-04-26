-- =============================================================================
-- RLS Isolation Suite — Lumora V2
-- =============================================================================
-- Critério binário: vazamento entre workspaces = bloqueia Fase 1 (LGPD).
--
-- Pré-requisitos:
--   1. 2 usuários de teste em auth.users (via signup normal)
--   2. .env com RLS_TEST_USER_A, RLS_TEST_USER_B, RLS_TEST_WORKSPACE_B
--   3. Tabelas a testar definidas via array TABLES_TO_TEST abaixo
--
-- Como rodar:
--   bash scripts/v2-test/run-rls-tests.sh
--
-- Substituições obrigatórias (feitas pelo runner via sed):
--   <UUID-A>          — UUID do user A
--   <UUID-B>          — UUID do user B
--   <workspace-B-id>  — workspace ID de B
-- =============================================================================

-- TESTE 1 — LEITURA: A só vê os próprios workspaces
\echo '=== TESTE 1: User A não vê workspace de B (SELECT) ==='

set role authenticated;
set request.jwt.claims = '{"sub":"<UUID-A>"}';

select count(*) as workspaces_visiveis_a from public.workspaces;
-- esperado: ≥1 (o próprio de A)

select count(*) as workspaces_de_b_visiveis_pra_a
from public.workspaces where owner_id = '<UUID-B>';
-- esperado: 0 (RLS bloqueia)

reset role;

-- TESTE 2 — INSERÇÃO: A não consegue inserir em workspace de B
\echo '=== TESTE 2: User A não insere em workspace de B (INSERT) ==='

set role authenticated;
set request.jwt.claims = '{"sub":"<UUID-A>"}';

do $$
declare
  v_blocked boolean := false;
begin
  begin
    insert into public.workspace_members (workspace_id, user_id, email, role, status)
    values ('<workspace-B-id>', '<UUID-A>', 'hack@test.com', 'member', 'active');
  exception when others then
    if sqlstate = '42501' then
      v_blocked := true;
      raise notice 'OK: RLS bloqueou insert cross-workspace (sqlstate=%)', sqlstate;
    else
      raise notice 'ATENÇÃO: erro diferente — sqlstate=%, msg=%', sqlstate, sqlerrm;
      raise;
    end if;
  end;

  if not v_blocked then
    raise exception 'FALHA TESTE 2: insert cross-workspace NÃO foi bloqueado';
  end if;
end $$;

reset role;

-- TESTE 3 — UPDATE: A não atualiza workspace de B
\echo '=== TESTE 3: User A não atualiza workspace de B (UPDATE) ==='

set role authenticated;
set request.jwt.claims = '{"sub":"<UUID-A>"}';

with attempt as (
  update public.workspaces
  set name = 'HACKED'
  where id = '<workspace-B-id>'
  returning id
)
select count(*) as rows_afetadas from attempt;
-- esperado: 0

reset role;

-- TESTE 4 — DELETE: A não apaga workspace de B
\echo '=== TESTE 4: User A não apaga workspace de B (DELETE) ==='

set role authenticated;
set request.jwt.claims = '{"sub":"<UUID-A>"}';

with attempt as (
  delete from public.workspaces
  where id = '<workspace-B-id>'
  returning id
)
select count(*) as rows_afetadas from attempt;
-- esperado: 0

reset role;

\echo '=== Suite RLS completa — verifique todos os testes acima retornaram esperado ==='
