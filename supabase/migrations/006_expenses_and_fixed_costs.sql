-- ============================================================
-- MIGRATION 006 — Módulo Financeiro do Freelancer
-- Despesas variáveis + Custos fixos recorrentes
--
-- SEPARADO completamente de Jobs.
-- Responde: quanto FATURO vs quanto GASTO vs quanto SOBRA.
-- ============================================================

-- ─── 1. Enum: categoria de despesa ──────────────────────────

do $$ begin
  create type expense_category as enum (
    'food',
    'transport',
    'equipment',
    'software',
    'marketing',
    'other'
  );
exception when duplicate_object then null; end $$;

-- ─── 2. Enum: categoria de custo fixo ───────────────────────
-- Simplificado: software cobre Adobe/SaaS/assinaturas,
-- eliminando ambiguidade "Adobe vs Assinaturas".

do $$ begin
  create type fixed_cost_category as enum (
    'software',
    'internet',
    'equipment',
    'workspace',
    'other'
  );
exception when duplicate_object then null; end $$;

-- ─── 3. Tabela: expenses ────────────────────────────────────

create table if not exists public.expenses (
  id             uuid             primary key default gen_random_uuid(),
  workspace_id   uuid             not null references public.workspaces(id) on delete cascade,
  description    text             not null,
  category       expense_category not null default 'other',
  amount         numeric(12,2)    not null check (amount > 0),
  currency       char(3)          not null default 'BRL',
  expense_date   date             not null default current_date,
  is_deductible  boolean          not null default false,
  notes          text,
  deleted_at     timestamptz,
  created_at     timestamptz      not null default now()
);

-- ─── 4. Tabela: fixed_costs ─────────────────────────────────

create table if not exists public.fixed_costs (
  id             uuid                primary key default gen_random_uuid(),
  workspace_id   uuid                not null references public.workspaces(id) on delete cascade,
  description    text                not null,
  category       fixed_cost_category not null default 'other',
  amount         numeric(12,2)       not null check (amount > 0),
  currency       char(3)             not null default 'BRL',
  billing_day    smallint            not null default 1 check (billing_day between 1 and 31),
  is_active      boolean             not null default true,
  is_deductible  boolean             not null default false,
  notes          text,
  deleted_at     timestamptz,
  created_at     timestamptz         not null default now()
);

-- ─── 5. Índices ─────────────────────────────────────────────

create index if not exists idx_expenses_workspace_date
  on public.expenses (workspace_id, expense_date)
  where deleted_at is null;

create index if not exists idx_fixed_costs_workspace
  on public.fixed_costs (workspace_id)
  where deleted_at is null;

-- ─── 6. RLS ─────────────────────────────────────────────────

alter table public.expenses    enable row level security;
alter table public.fixed_costs enable row level security;

-- ── expenses: select ──
create policy "workspace members can select expenses"
  on public.expenses for select
  using (
    exists (
      select 1 from public.workspace_members wm
      where  wm.workspace_id = expenses.workspace_id
        and  wm.user_id = auth.uid()
        and  wm.status = 'active'
    )
  );

-- ── expenses: insert ──
create policy "workspace members can insert expenses"
  on public.expenses for insert
  with check (
    exists (
      select 1 from public.workspace_members wm
      where  wm.workspace_id = expenses.workspace_id
        and  wm.user_id = auth.uid()
        and  wm.status = 'active'
    )
  );

-- ── expenses: update (soft delete) ──
create policy "workspace members can update expenses"
  on public.expenses for update
  using (
    exists (
      select 1 from public.workspace_members wm
      where  wm.workspace_id = expenses.workspace_id
        and  wm.user_id = auth.uid()
        and  wm.status = 'active'
    )
  );

-- ── fixed_costs: select ──
create policy "workspace members can select fixed_costs"
  on public.fixed_costs for select
  using (
    exists (
      select 1 from public.workspace_members wm
      where  wm.workspace_id = fixed_costs.workspace_id
        and  wm.user_id = auth.uid()
        and  wm.status = 'active'
    )
  );

-- ── fixed_costs: insert ──
create policy "workspace members can insert fixed_costs"
  on public.fixed_costs for insert
  with check (
    exists (
      select 1 from public.workspace_members wm
      where  wm.workspace_id = fixed_costs.workspace_id
        and  wm.user_id = auth.uid()
        and  wm.status = 'active'
    )
  );

-- ── fixed_costs: update (soft delete + toggle is_active) ──
create policy "workspace members can update fixed_costs"
  on public.fixed_costs for update
  using (
    exists (
      select 1 from public.workspace_members wm
      where  wm.workspace_id = fixed_costs.workspace_id
        and  wm.user_id = auth.uid()
        and  wm.status = 'active'
    )
  );
