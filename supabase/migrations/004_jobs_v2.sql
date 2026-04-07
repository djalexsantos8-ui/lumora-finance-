-- ============================================================
-- MIGRATION 004 — Jobs v2
-- Refactora a tabela jobs para o modelo operacional correto:
-- novos status, category, title, amount_paid, deleted_at,
-- budget_id e tabela job_payments com trigger de cache.
-- ============================================================

-- ─── 1. Novos enums ──────────────────────────────────────────

do $$ begin
  create type job_operational_status as enum (
    'in_progress',
    'delivered',
    'pending_payment',
    'paid',
    'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type job_category_enum as enum (
    'wedding',
    'corporate',
    'social',
    'documentary',
    'other'
  );
exception when duplicate_object then null; end $$;

-- ─── 2. Novas colunas em jobs ─────────────────────────────────

alter table public.jobs
  add column if not exists title        text             not null default 'Job sem título',
  add column if not exists client_email text,
  add column if not exists category     job_category_enum,
  add column if not exists amount_paid  numeric(12,2)    not null default 0,
  add column if not exists budget_id    uuid             references public.budgets(id) on delete set null,
  add column if not exists deleted_at   timestamptz;

-- Migra project_name → title (onde title ainda é default)
update public.jobs
set title = project_name
where project_name is not null
  and title = 'Job sem título';

-- ─── 3. Troca a coluna status para o novo enum ────────────────

-- Adiciona coluna temporária com novo tipo
alter table public.jobs
  add column if not exists status_v2 job_operational_status not null default 'in_progress';

-- Mapeia valores antigos → novos
update public.jobs set status_v2 = case
  when status::text = 'received' then 'paid'::job_operational_status
  when status::text = 'overdue'  then 'pending_payment'::job_operational_status
  else                                 'in_progress'::job_operational_status
end;

-- Remove coluna antiga e renomeia nova
alter table public.jobs drop column if exists status;
alter table public.jobs rename column status_v2 to status;

-- ─── 4. Remove project_name (dados já em title) ───────────────
alter table public.jobs drop column if exists project_name;

-- ─── 5. Tabela job_payments ───────────────────────────────────

create table if not exists public.job_payments (
  id          uuid         primary key default gen_random_uuid(),
  job_id      uuid         not null references public.jobs(id) on delete cascade,
  amount      numeric(12,2) not null check (amount > 0),
  currency    char(3)      not null default 'BRL',
  received_at date         not null default current_date,
  notes       text,
  created_at  timestamptz  not null default now()
);

-- ─── 6. Trigger: recalcula amount_paid no job ─────────────────

create or replace function recalculate_job_amount_paid()
returns trigger
language plpgsql
as $$
declare
  v_job_id uuid;
begin
  v_job_id := coalesce(new.job_id, old.job_id);

  update public.jobs
  set amount_paid = (
    select coalesce(sum(amount), 0)
    from   public.job_payments
    where  job_id = v_job_id
  )
  where id = v_job_id;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_job_payments_recalc on public.job_payments;
create trigger trg_job_payments_recalc
  after insert or update or delete on public.job_payments
  for each row execute function recalculate_job_amount_paid();

-- ─── 7. RLS para job_payments ─────────────────────────────────

alter table public.job_payments enable row level security;

drop policy if exists "job_payments: workspace members full access" on public.job_payments;
create policy "job_payments: workspace members full access"
  on public.job_payments for all
  using (
    exists (
      select 1
      from   public.jobs j
      join   public.workspace_members wm on wm.workspace_id = j.workspace_id
      where  j.id = job_payments.job_id
        and  wm.user_id = auth.uid()
        and  wm.status  = 'active'
    )
  );

-- ─── 8. Índices ───────────────────────────────────────────────

create index if not exists idx_job_payments_job    on public.job_payments(job_id);
create index if not exists idx_jobs_deleted_at     on public.jobs(workspace_id) where deleted_at is null;
create index if not exists idx_jobs_category       on public.jobs(category);
create index if not exists idx_jobs_amount_paid    on public.jobs(amount_paid);
