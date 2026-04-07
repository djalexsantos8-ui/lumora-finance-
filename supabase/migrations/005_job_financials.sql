-- ============================================================
-- MIGRATION 005 — Job Financials
-- Adiciona modelagem completa de receita e custo por item.
-- total_value permanece legado (não é mais atualizado).
-- revenue_total = fonte da verdade de receita.
-- cost_total    = fonte da verdade de custo.
-- ============================================================

-- ─── 1. Enum: categoria de custo de projeto ──────────────────

do $$ begin
  create type job_cost_category as enum (
    'equipment_rental',
    'team',
    'travel',
    'accommodation',
    'food',
    'software',
    'other'
  );
exception when duplicate_object then null; end $$;

-- ─── 2. Colunas de cache em jobs ─────────────────────────────

alter table public.jobs
  add column if not exists revenue_total numeric(12,2) not null default 0,
  add column if not exists cost_total    numeric(12,2) not null default 0;

-- ─── 3. Tabela: job_revenue_items ────────────────────────────

create table if not exists public.job_revenue_items (
  id          uuid          primary key default gen_random_uuid(),
  job_id      uuid          not null references public.jobs(id) on delete cascade,
  description text          not null,
  quantity    numeric(10,2) not null default 1 check (quantity > 0),
  unit_value  numeric(12,2) not null default 0 check (unit_value >= 0),
  total_value numeric(12,2) not null default 0,
  sort_order  int           not null default 0,
  deleted_at  timestamptz,
  created_at  timestamptz   not null default now()
);

-- ─── 4. Tabela: job_cost_items ───────────────────────────────

create table if not exists public.job_cost_items (
  id          uuid              primary key default gen_random_uuid(),
  job_id      uuid              not null references public.jobs(id) on delete cascade,
  description text              not null,
  category    job_cost_category not null default 'other',
  quantity    numeric(10,2)     not null default 1 check (quantity > 0),
  unit_value  numeric(12,2)     not null default 0 check (unit_value >= 0),
  total_value numeric(12,2)     not null default 0,
  sort_order  int               not null default 0,
  deleted_at  timestamptz,
  created_at  timestamptz       not null default now()
);

-- ─── 5. Trigger: calcula total_value nos itens ───────────────

create or replace function set_item_total_value()
returns trigger
language plpgsql
as $$
begin
  new.total_value := round(new.quantity * new.unit_value, 2);
  return new;
end;
$$;

drop trigger if exists trg_revenue_item_total on public.job_revenue_items;
create trigger trg_revenue_item_total
  before insert or update of quantity, unit_value on public.job_revenue_items
  for each row execute function set_item_total_value();

drop trigger if exists trg_cost_item_total on public.job_cost_items;
create trigger trg_cost_item_total
  before insert or update of quantity, unit_value on public.job_cost_items
  for each row execute function set_item_total_value();

-- ─── 6. Trigger: recalcula revenue_total no job ──────────────

create or replace function recalculate_job_revenue()
returns trigger
language plpgsql
as $$
declare
  v_job_id uuid;
begin
  v_job_id := coalesce(new.job_id, old.job_id);

  update public.jobs
  set revenue_total = (
    select coalesce(sum(total_value), 0)
    from   public.job_revenue_items
    where  job_id = v_job_id
      and  deleted_at is null
  )
  where id = v_job_id;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_job_revenue_recalc on public.job_revenue_items;
create trigger trg_job_revenue_recalc
  after insert or update or delete on public.job_revenue_items
  for each row execute function recalculate_job_revenue();

-- ─── 7. Trigger: recalcula cost_total no job ─────────────────

create or replace function recalculate_job_costs()
returns trigger
language plpgsql
as $$
declare
  v_job_id uuid;
begin
  v_job_id := coalesce(new.job_id, old.job_id);

  update public.jobs
  set cost_total = (
    select coalesce(sum(total_value), 0)
    from   public.job_cost_items
    where  job_id = v_job_id
      and  deleted_at is null
  )
  where id = v_job_id;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_job_costs_recalc on public.job_cost_items;
create trigger trg_job_costs_recalc
  after insert or update or delete on public.job_cost_items
  for each row execute function recalculate_job_costs();

-- ─── 8. Migração backward compat ─────────────────────────────
-- Jobs existentes com total_value > 0 ganham 1 revenue item
-- revenue_total é atualizado pelo trigger após o insert

insert into public.job_revenue_items (job_id, description, quantity, unit_value, total_value, sort_order)
select
  id,
  'Valor do projeto',
  1,
  total_value,
  total_value,
  0
from public.jobs
where total_value > 0
  and deleted_at is null
on conflict do nothing;

-- ─── 9. RLS ──────────────────────────────────────────────────

alter table public.job_revenue_items enable row level security;
alter table public.job_cost_items     enable row level security;

drop policy if exists "job_revenue_items: workspace members full access" on public.job_revenue_items;
create policy "job_revenue_items: workspace members full access"
  on public.job_revenue_items for all
  using (
    exists (
      select 1
      from   public.jobs j
      join   public.workspace_members wm on wm.workspace_id = j.workspace_id
      where  j.id  = job_revenue_items.job_id
        and  wm.user_id = auth.uid()
        and  wm.status  = 'active'
    )
  );

drop policy if exists "job_cost_items: workspace members full access" on public.job_cost_items;
create policy "job_cost_items: workspace members full access"
  on public.job_cost_items for all
  using (
    exists (
      select 1
      from   public.jobs j
      join   public.workspace_members wm on wm.workspace_id = j.workspace_id
      where  j.id  = job_cost_items.job_id
        and  wm.user_id = auth.uid()
        and  wm.status  = 'active'
    )
  );

-- ─── 10. Índices ─────────────────────────────────────────────

create index if not exists idx_job_revenue_items_job
  on public.job_revenue_items(job_id) where deleted_at is null;

create index if not exists idx_job_cost_items_job
  on public.job_cost_items(job_id) where deleted_at is null;
