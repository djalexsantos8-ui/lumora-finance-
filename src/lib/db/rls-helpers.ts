/**
 * RLS_TEMPLATE — padrão obrigatório para toda tabela V2 nova.
 *
 * Toda tabela V2 deve:
 *   1. ter coluna `workspace_id uuid not null references workspaces(id)`
 *   2. ter RLS habilitado
 *   3. ter as 4 policies abaixo (select / insert / update / delete)
 *
 * Use este helper na escrita de migrations:
 *
 *   const sql = `
 *     create table public.budgets_v2 (...);
 *     ${RLS_TEMPLATE('budgets_v2')}
 *   `
 *
 * Validação: scripts/v2-test/rls-isolation.sql cobre os 4 cenários.
 *
 * Decisão travada: 03-decisoes-travadas — RLS obrigatório em TODAS tabelas V2,
 * vazamento entre workspaces bloqueia Fase 1 inteira (LGPD).
 */
export const RLS_TEMPLATE = (tableName: string): string => `
alter table public.${tableName} enable row level security;

drop policy if exists "members can read ${tableName}" on public.${tableName};
create policy "members can read ${tableName}"
  on public.${tableName} for select
  using (workspace_id in (select public.user_workspaces()));

drop policy if exists "members can insert ${tableName}" on public.${tableName};
create policy "members can insert ${tableName}"
  on public.${tableName} for insert
  with check (workspace_id in (select public.user_workspaces()));

drop policy if exists "members can update ${tableName}" on public.${tableName};
create policy "members can update ${tableName}"
  on public.${tableName} for update
  using (workspace_id in (select public.user_workspaces()))
  with check (workspace_id in (select public.user_workspaces()));

drop policy if exists "members can delete ${tableName}" on public.${tableName};
create policy "members can delete ${tableName}"
  on public.${tableName} for delete
  using (workspace_id in (select public.user_workspaces()));
`

/**
 * Variantes pra casos especiais:
 *
 * - RLS_OWNER_ONLY: só owner do workspace pode write (pra tabelas críticas
 *   tipo subscription, billing). Members veem mas não modificam.
 */
export const RLS_OWNER_ONLY = (tableName: string): string => `
alter table public.${tableName} enable row level security;

drop policy if exists "members can read ${tableName}" on public.${tableName};
create policy "members can read ${tableName}"
  on public.${tableName} for select
  using (workspace_id in (select public.user_workspaces()));

drop policy if exists "owner can write ${tableName}" on public.${tableName};
create policy "owner can write ${tableName}"
  on public.${tableName} for all
  using (workspace_id in (select id from public.workspaces where owner_id = auth.uid()))
  with check (workspace_id in (select id from public.workspaces where owner_id = auth.uid()));
`

/**
 * RLS_ADMIN_ONLY: só usuários com admin_grant ativo podem ler/escrever.
 * Uso: tabelas internas (implementation_tasks, claude_inbox, admin_failure_notifications).
 */
export const RLS_ADMIN_ONLY = (tableName: string): string => `
alter table public.${tableName} enable row level security;

drop policy if exists "admin can read ${tableName}" on public.${tableName};
create policy "admin can read ${tableName}"
  on public.${tableName} for select
  using (
    exists (
      select 1 from public.admin_grants
      where user_id = auth.uid()
        and (expires_at is null or expires_at > now())
    )
  );

drop policy if exists "admin can write ${tableName}" on public.${tableName};
create policy "admin can write ${tableName}"
  on public.${tableName} for all
  using (
    exists (
      select 1 from public.admin_grants
      where user_id = auth.uid()
        and (expires_at is null or expires_at > now())
    )
  )
  with check (
    exists (
      select 1 from public.admin_grants
      where user_id = auth.uid()
        and (expires_at is null or expires_at > now())
    )
  );
`
