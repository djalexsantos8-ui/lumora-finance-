-- ============================================================
-- MIGRATION 006 — Módulo Financeiro do Freelancer
-- Despesas variáveis + Custos fixos recorrentes
--
-- IDEMPOTENTE: pode ser rodada múltiplas vezes sem erro.
-- Segura mesmo se executada parcialmente antes.
-- ============================================================

-- ─── 1. Enums ────────────────────────────────────────────────

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

do $$ begin
  create type fixed_cost_category as enum (
    'software',
    'internet',
    'equipment',
    'workspace',
    'other'
  );
exception when duplicate_object then null; end $$;

-- ─── 2. Tabela: expenses ─────────────────────────────────────
-- CREATE IF NOT EXISTS garante estrutura base.
-- ALTER ADD COLUMN IF NOT EXISTS garante cada coluna
-- individualmente — seguro se a tabela já existia parcialmente.

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid()
);

alter table public.expenses
  add column if not exists workspace_id   uuid             not null default '00000000-0000-0000-0000-000000000000'::uuid references public.workspaces(id) on delete cascade,
  add column if not exists description    text             not null default '',
  add column if not exists category       expense_category not null default 'other',
  add column if not exists amount         numeric(12,2)    not null default 0,
  add column if not exists currency       char(3)          not null default 'BRL',
  add column if not exists expense_date   date             not null default current_date,
  add column if not exists is_deductible  boolean          not null default false,
  add column if not exists notes          text,
  add column if not exists deleted_at     timestamptz,
  add column if not exists created_at     timestamptz      not null default now();

-- ─── 3. Tabela: fixed_costs ──────────────────────────────────

create table if not exists public.fixed_costs (
  id uuid primary key default gen_random_uuid()
);

alter table public.fixed_costs
  add column if not exists workspace_id   uuid                not null default '00000000-0000-0000-0000-000000000000'::uuid references public.workspaces(id) on delete cascade,
  add column if not exists description    text                not null default '',
  add column if not exists category       fixed_cost_category not null default 'other',
  add column if not exists amount         numeric(12,2)       not null default 0,
  add column if not exists currency       char(3)             not null default 'BRL',
  add column if not exists billing_day    smallint            not null default 1,
  add column if not exists is_active      boolean             not null default true,
  add column if not exists is_deductible  boolean             not null default false,
  add column if not exists notes          text,
  add column if not exists deleted_at     timestamptz,
  add column if not exists created_at     timestamptz         not null default now();

-- CHECK constraints (idempotente via DO block)
do $$ begin
  alter table public.expenses    add constraint expenses_amount_positive    check (amount > 0);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.fixed_costs add constraint fixed_costs_amount_positive  check (amount > 0);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.fixed_costs add constraint fixed_costs_billing_day_range check (billing_day between 1 and 31);
exception when duplicate_object then null; end $$;

-- ─── 4. Índices ───────────────────────────────────────────────
-- DROP IF EXISTS antes de criar — seguro em re-execução.

drop index if exists public.idx_expenses_workspace_date;
create index idx_expenses_workspace_date
  on public.expenses (workspace_id, expense_date)
  where deleted_at is null;

drop index if exists public.idx_fixed_costs_workspace;
create index idx_fixed_costs_workspace
  on public.fixed_costs (workspace_id)
  where deleted_at is null;

-- ─── 5. RLS ───────────────────────────────────────────────────

alter table public.expenses    enable row level security;
alter table public.fixed_costs enable row level security;

-- ── expenses: select ──
do $$ begin
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
exception when duplicate_object then null; end $$;

-- ── expenses: insert ──
do $$ begin
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
exception when duplicate_object then null; end $$;

-- ── expenses: update (soft delete) ──
do $$ begin
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
exception when duplicate_object then null; end $$;

-- ── fixed_costs: select ──
do $$ begin
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
exception when duplicate_object then null; end $$;

-- ── fixed_costs: insert ──
do $$ begin
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
exception when duplicate_object then null; end $$;

-- ── fixed_costs: update (soft delete + toggle is_active) ──
do $$ begin
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
exception when duplicate_object then null; end $$;
