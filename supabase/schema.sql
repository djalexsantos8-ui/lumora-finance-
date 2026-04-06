-- ============================================
-- LUMORA FINANCE — Schema v2
-- PostgreSQL / Supabase
-- ============================================

-- ============================================
-- ENUMS
-- ============================================
do $$ begin
  create type currency_code as enum ('BRL','USD','EUR','PYG','ARS','CLP','COP','MXN','GBP','CAD','AUD','JPY','CHF');
exception when duplicate_object then null; end $$;

do $$ begin
  create type job_type_enum as enum ('freelance','project','recurring');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_condition_enum as enum ('upfront','7d','15d','30d','60d','90d');
exception when duplicate_object then null; end $$;

do $$ begin
  create type job_status_enum as enum ('pending','received','overdue');
exception when duplicate_object then null; end $$;

do $$ begin
  create type expense_category_enum as enum ('fuel','food','accommodation','equipment','other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type fixed_cost_category_enum as enum ('software','rent','equipment','service','other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type billing_cycle_enum as enum ('monthly','annual');
exception when duplicate_object then null; end $$;

do $$ begin
  create type fixed_cost_status_enum as enum ('active','inactive');
exception when duplicate_object then null; end $$;

do $$ begin
  create type subscription_status_enum as enum ('trialing','active','past_due','canceled','incomplete');
exception when duplicate_object then null; end $$;

do $$ begin
  create type subscription_plan_enum as enum ('monthly','annual');
exception when duplicate_object then null; end $$;

do $$ begin
  create type workspace_role_enum as enum ('owner','member');
exception when duplicate_object then null; end $$;

do $$ begin
  create type member_status_enum as enum ('pending','active');
exception when duplicate_object then null; end $$;

do $$ begin
  create type notification_type_enum as enum ('payment_due','cost_due','job_overdue','trial_ending','payment_failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type reference_type_enum as enum ('job','fixed_cost');
exception when duplicate_object then null; end $$;

-- ============================================
-- TRIGGER FUNCTION: updated_at automático
-- ============================================
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================
-- TRIGGER FUNCTION: calcular payment_due_date
-- ============================================
create or replace function calculate_payment_due_date()
returns trigger
language plpgsql
as $$
begin
  new.payment_due_date = case new.payment_condition
    when 'upfront' then new.job_date
    when '7d'      then new.job_date + interval '7 days'
    when '15d'     then new.job_date + interval '15 days'
    when '30d'     then new.job_date + interval '30 days'
    when '60d'     then new.job_date + interval '60 days'
    when '90d'     then new.job_date + interval '90 days'
    else new.job_date
  end;
  return new;
end;
$$;

-- ============================================
-- PROFILES
-- ============================================
create table if not exists public.profiles (
  id                   uuid primary key references auth.users(id) on delete cascade,
  full_name            text not null,
  email                text not null,
  primary_currency     char(3) not null default 'BRL',
  avatar_url           text,
  onboarding_completed boolean not null default false,
  terms_accepted_at    timestamptz,
  stripe_customer_id   text unique,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function set_updated_at();

-- ============================================
-- WORKSPACES
-- ============================================
create table if not exists public.workspaces (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ============================================
-- WORKSPACE MEMBERS
-- ============================================
create table if not exists public.workspace_members (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid references public.profiles(id) on delete cascade,
  email        text not null,
  role         workspace_role_enum not null default 'member',
  status       member_status_enum not null default 'pending',
  invited_by   uuid references public.profiles(id) on delete set null,
  invited_at   timestamptz not null default now(),
  joined_at    timestamptz,
  unique(workspace_id, email)
);

-- ============================================
-- SUBSCRIPTIONS
-- ============================================
create table if not exists public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null unique references public.profiles(id) on delete cascade,
  stripe_subscription_id text unique,
  stripe_customer_id     text,
  status                 subscription_status_enum not null default 'trialing',
  plan                   subscription_plan_enum,
  trial_ends_at          timestamptz,
  current_period_start   timestamptz,
  current_period_end     timestamptz,
  canceled_at            timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create trigger trg_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function set_updated_at();

-- ============================================
-- JOBS
-- ============================================
create table if not exists public.jobs (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  created_by        uuid not null references public.profiles(id) on delete restrict,
  client_name       text not null,
  project_name      text,
  job_type          job_type_enum not null default 'freelance',
  total_value       numeric(12,2) not null default 0 check (total_value >= 0),
  currency          char(3) not null default 'BRL',
  payment_condition payment_condition_enum not null default 'upfront',
  job_date          date not null default current_date,
  payment_due_date  date not null,
  status            job_status_enum not null default 'pending',
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Calcula payment_due_date automaticamente
create trigger trg_jobs_payment_due_date
  before insert or update of job_date, payment_condition on public.jobs
  for each row execute function calculate_payment_due_date();

create trigger trg_jobs_updated_at
  before update on public.jobs
  for each row execute function set_updated_at();

-- ============================================
-- EXPENSES
-- ============================================
create table if not exists public.expenses (
  id               uuid primary key default gen_random_uuid(),
  job_id           uuid not null references public.jobs(id) on delete cascade,
  created_by       uuid not null references public.profiles(id) on delete restrict,
  category         expense_category_enum not null default 'other',
  value            numeric(12,2) not null default 0 check (value >= 0),
  currency         char(3) not null default 'BRL',
  description      text,
  receipt_url      text,
  receipt_filename text,
  created_at       timestamptz not null default now()
);

-- ============================================
-- FILES (metadados de uploads — Storage)
-- ============================================
create table if not exists public.files (
  id           uuid primary key default gen_random_uuid(),
  uploaded_by  uuid not null references public.profiles(id) on delete cascade,
  bucket       text not null default 'receipts',
  path         text not null,
  filename     text not null,
  mime_type    text,
  size_bytes   bigint,
  reference_id uuid,
  created_at   timestamptz not null default now(),
  unique(bucket, path)
);

-- ============================================
-- FIXED COSTS
-- ============================================
create table if not exists public.fixed_costs (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  created_by    uuid not null references public.profiles(id) on delete restrict,
  name          text not null,
  category      fixed_cost_category_enum not null default 'other',
  value         numeric(12,2) not null default 0 check (value >= 0),
  currency      char(3) not null default 'BRL',
  billing_cycle billing_cycle_enum not null default 'monthly',
  due_day       integer not null default 1 check (due_day between 1 and 28),
  next_due_date date not null,
  status        fixed_cost_status_enum not null default 'active',
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger trg_fixed_costs_updated_at
  before update on public.fixed_costs
  for each row execute function set_updated_at();

-- ============================================
-- NOTIFICATIONS
-- ============================================
create table if not exists public.notifications (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  type           notification_type_enum not null,
  title          text not null,
  body           text not null,
  reference_id   uuid,
  reference_type reference_type_enum,
  read_at        timestamptz,
  email_sent_at  timestamptz,
  created_at     timestamptz not null default now()
);

-- ============================================
-- TRIGGER: criar profile + workspace + subscription
-- ao confirmar o cadastro
-- ============================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  new_workspace_id uuid;
begin
  insert into public.profiles (id, full_name, email, primary_currency, terms_accepted_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'Usuário'),
    new.email,
    coalesce(new.raw_user_meta_data->>'primary_currency', 'BRL'),
    now()
  );

  insert into public.workspaces (name, owner_id)
  values (
    coalesce(new.raw_user_meta_data->>'full_name', 'Meu Workspace') || ' — Finanças',
    new.id
  )
  returning id into new_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, email, role, status, joined_at)
  values (new_workspace_id, new.id, new.email, 'owner', 'active', now());

  insert into public.subscriptions (user_id, status, trial_ends_at)
  values (new.id, 'trialing', now() + interval '7 days');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================
-- RLS
-- ============================================
alter table public.profiles           enable row level security;
alter table public.workspaces         enable row level security;
alter table public.workspace_members  enable row level security;
alter table public.subscriptions      enable row level security;
alter table public.jobs               enable row level security;
alter table public.expenses           enable row level security;
alter table public.files              enable row level security;
alter table public.fixed_costs        enable row level security;
alter table public.notifications      enable row level security;

-- PROFILES
create policy "profiles: own read/write"
  on public.profiles for all
  using (auth.uid() = id);

-- WORKSPACES
create policy "workspaces: members can select"
  on public.workspaces for select
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspaces.id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
    )
  );

create policy "workspaces: owner can update"
  on public.workspaces for update
  using (owner_id = auth.uid());

-- WORKSPACE MEMBERS
create policy "workspace_members: members can select"
  on public.workspace_members for select
  using (
    exists (
      select 1 from public.workspace_members wm2
      where wm2.workspace_id = workspace_members.workspace_id
        and wm2.user_id = auth.uid()
        and wm2.status = 'active'
    )
  );

-- SUBSCRIPTIONS
create policy "subscriptions: own read"
  on public.subscriptions for select
  using (user_id = auth.uid());

-- JOBS
create policy "jobs: workspace members full access"
  on public.jobs for all
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = jobs.workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
    )
  );

-- EXPENSES
create policy "expenses: workspace members full access"
  on public.expenses for all
  using (
    exists (
      select 1 from public.jobs j
      join public.workspace_members wm on wm.workspace_id = j.workspace_id
      where j.id = expenses.job_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
    )
  );

-- FILES
create policy "files: own read/write"
  on public.files for all
  using (uploaded_by = auth.uid());

-- FIXED COSTS
create policy "fixed_costs: workspace members full access"
  on public.fixed_costs for all
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = fixed_costs.workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
    )
  );

-- NOTIFICATIONS
create policy "notifications: own read/write"
  on public.notifications for all
  using (user_id = auth.uid());

-- ============================================
-- INDEXES
-- ============================================
create index if not exists idx_jobs_workspace         on public.jobs(workspace_id);
create index if not exists idx_jobs_status            on public.jobs(status);
create index if not exists idx_jobs_payment_due       on public.jobs(payment_due_date);
create index if not exists idx_jobs_created_by        on public.jobs(created_by);
create index if not exists idx_expenses_job           on public.expenses(job_id);
create index if not exists idx_fixed_costs_workspace  on public.fixed_costs(workspace_id);
create index if not exists idx_fixed_costs_next_due   on public.fixed_costs(next_due_date);
create index if not exists idx_fixed_costs_status     on public.fixed_costs(status);
create index if not exists idx_notifications_user     on public.notifications(user_id, read_at);
create index if not exists idx_notifications_unread   on public.notifications(user_id) where read_at is null;
create index if not exists idx_workspace_members_user on public.workspace_members(user_id);
create index if not exists idx_files_reference        on public.files(reference_id);
create index if not exists idx_subscriptions_status   on public.subscriptions(status);
