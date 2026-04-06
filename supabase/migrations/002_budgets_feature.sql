-- ============================================
-- Migration 002: Feature de Orçamentos
-- Lumora Finance — Blueprint v2
-- ============================================

-- ============================================
-- ENUMS — Orçamentos
-- ============================================
do $$ begin
  create type freelancer_role_enum as enum (
    'cinematographer','photographer','editor','colorist',
    'art_director','producer','production_assistant',
    'motion_designer','sound_designer','drone_pilot',
    'camera_assistant','gaffer','other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type budget_status_enum as enum (
    'draft','sent','approved','rejected','expired'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type budget_item_category_enum as enum (
    'team','food','transport','accommodation','equipment','own_work','other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type budget_margin_type_enum as enum (
    'percentage','fixed'
  );
exception when duplicate_object then null; end $$;

-- ============================================
-- WORKSPACE SETTINGS
-- ============================================
create table if not exists public.workspace_settings (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null unique references public.workspaces(id) on delete cascade,
  company_name      text,
  company_logo_url  text,
  signature_name    text,
  signature_title   text,
  footer_text       text,
  deleted_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger trg_workspace_settings_updated_at
  before update on public.workspace_settings
  for each row execute function set_updated_at();

-- ============================================
-- FREELANCERS — catálogo reutilizável
-- ============================================
create table if not exists public.freelancers (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by   uuid not null references public.profiles(id) on delete restrict,
  name         text not null,
  role         freelancer_role_enum not null default 'other',
  daily_rate   numeric(12,2),
  currency     char(3) not null default 'BRL',
  notes        text,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger trg_freelancers_updated_at
  before update on public.freelancers
  for each row execute function set_updated_at();

-- ============================================
-- BUDGETS — orçamento principal
-- ============================================
create table if not exists public.budgets (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces(id) on delete cascade,
  created_by          uuid not null references public.profiles(id) on delete restrict,
  title               text not null,
  client_name         text not null,
  project_description text,
  deliverables        text,
  event_date          date,
  valid_until         date,
  status              budget_status_enum not null default 'draft',
  currency            char(3) not null default 'BRL',
  -- Cálculo financeiro (sempre recalculado server-side antes de persistir)
  subtotal            numeric(12,2) not null default 0,
  margin_type         budget_margin_type_enum not null default 'percentage',
  margin_input        numeric(12,2) not null default 0, -- o que o usuário digitou
  margin_amount       numeric(12,2) not null default 0, -- valor R$ calculado
  total               numeric(12,2) not null default 0, -- subtotal + margin_amount
  -- Notas privadas — NUNCA expor no PDF
  notes_internal      text,
  -- Auditoria de status
  sent_at             timestamptz,
  approved_at         timestamptz,
  -- Soft delete
  deleted_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger trg_budgets_updated_at
  before update on public.budgets
  for each row execute function set_updated_at();

-- ============================================
-- BUDGET ITEMS — linhas de custo
-- ============================================
create table if not exists public.budget_items (
  id              uuid primary key default gen_random_uuid(),
  budget_id       uuid not null references public.budgets(id) on delete cascade,
  freelancer_id   uuid references public.freelancers(id) on delete set null,
  -- Categoria: enum ou texto livre (flexibilidade total)
  category        budget_item_category_enum,
  custom_category text,            -- usado quando category é null
  label           text not null,   -- sempre editável manualmente
  quantity        integer not null default 1 check (quantity > 0),
  days            numeric(5,2) not null default 1 check (days >= 0),
  unit_value      numeric(12,2) not null default 0 check (unit_value >= 0),
  total_value     numeric(12,2) not null default 0, -- quantity × days × unit_value (server-side)
  is_custom       boolean not null default false,   -- criado sem base no catálogo
  show_in_pdf     boolean not null default false,   -- false = protegido por default
  sort_order      integer not null default 0,
  -- Soft delete
  deleted_at      timestamptz,
  created_at      timestamptz not null default now()
);

-- Para Alexia, se você estiver lendo isso um dia: eu te amo. Continue criando.

-- ============================================
-- RLS
-- ============================================
alter table public.workspace_settings enable row level security;
alter table public.freelancers         enable row level security;
alter table public.budgets             enable row level security;
alter table public.budget_items        enable row level security;

-- WORKSPACE SETTINGS: owner do workspace
create policy "workspace_settings: owner full access"
  on public.workspace_settings for all
  using (
    exists (
      select 1 from public.workspaces w
      where w.id = workspace_settings.workspace_id
        and w.owner_id = auth.uid()
    )
  );

-- FREELANCERS: membros ativos do workspace
create policy "freelancers: workspace members full access"
  on public.freelancers for all
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = freelancers.workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
    )
  );

-- BUDGETS: membros ativos do workspace
create policy "budgets: workspace members full access"
  on public.budgets for all
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = budgets.workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
    )
  );

-- BUDGET ITEMS: via budget → workspace membership
create policy "budget_items: workspace members full access"
  on public.budget_items for all
  using (
    exists (
      select 1 from public.budgets b
      join public.workspace_members wm on wm.workspace_id = b.workspace_id
      where b.id = budget_items.budget_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
    )
  );

-- ============================================
-- INDEXES
-- ============================================
create index if not exists idx_freelancers_workspace
  on public.freelancers(workspace_id)
  where deleted_at is null;

create index if not exists idx_freelancers_role
  on public.freelancers(role)
  where deleted_at is null;

create index if not exists idx_budgets_workspace
  on public.budgets(workspace_id)
  where deleted_at is null;

create index if not exists idx_budgets_status
  on public.budgets(status)
  where deleted_at is null;

create index if not exists idx_budgets_created_by
  on public.budgets(created_by)
  where deleted_at is null;

create index if not exists idx_budget_items_budget
  on public.budget_items(budget_id)
  where deleted_at is null;

create index if not exists idx_budget_items_freelancer
  on public.budget_items(freelancer_id)
  where freelancer_id is not null;

create index if not exists idx_workspace_settings_workspace
  on public.workspace_settings(workspace_id);
