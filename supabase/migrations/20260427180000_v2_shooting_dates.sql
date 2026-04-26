-- EPIC-23: Multi-data de filmagem no orçamento
create table if not exists public.shooting_dates_v2 (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.budgets_v2(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  date_start date not null,
  date_end date,
  time_start time,
  time_end time,
  label text,
  local_descricao text,
  local_endereco text,
  notes text,
  order_idx int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_date_range check (date_end is null or date_end >= date_start)
);

create index if not exists idx_shooting_dates_budget    on public.shooting_dates_v2(budget_id, order_idx);
create index if not exists idx_shooting_dates_workspace on public.shooting_dates_v2(workspace_id);
create index if not exists idx_shooting_dates_range     on public.shooting_dates_v2(workspace_id, date_start, date_end);

create trigger trg_shooting_dates_v2_updated
  before update on public.shooting_dates_v2
  for each row execute function public.set_updated_at();

alter table public.shooting_dates_v2 enable row level security;

create policy "members can read shooting_dates_v2"
  on public.shooting_dates_v2 for select
  using (workspace_id in (select public.user_workspaces()));

create policy "members can insert shooting_dates_v2"
  on public.shooting_dates_v2 for insert
  with check (workspace_id in (select public.user_workspaces()));

create policy "members can update shooting_dates_v2"
  on public.shooting_dates_v2 for update
  using (workspace_id in (select public.user_workspaces()))
  with check (workspace_id in (select public.user_workspaces()));

create policy "members can delete shooting_dates_v2"
  on public.shooting_dates_v2 for delete
  using (workspace_id in (select public.user_workspaces()));

create table if not exists public.shooting_date_items_v2 (
  shooting_date_id uuid not null references public.shooting_dates_v2(id) on delete cascade,
  budget_item_id   uuid not null references public.budget_items_v2(id) on delete cascade,
  workspace_id     uuid not null references public.workspaces(id) on delete cascade,
  primary key (shooting_date_id, budget_item_id)
);

create index if not exists idx_sd_items_item on public.shooting_date_items_v2(budget_item_id);

alter table public.shooting_date_items_v2 enable row level security;

create policy "members can read shooting_date_items_v2"
  on public.shooting_date_items_v2 for select
  using (workspace_id in (select public.user_workspaces()));

create policy "members can write shooting_date_items_v2"
  on public.shooting_date_items_v2 for all
  using (workspace_id in (select public.user_workspaces()))
  with check (workspace_id in (select public.user_workspaces()));

create or replace view public.upcoming_shootings as
select
  sd.id           as shooting_date_id,
  sd.budget_id,
  b.number        as budget_number,
  b.name          as budget_name,
  sd.date_start,
  sd.date_end,
  sd.time_start,
  sd.time_end,
  sd.label,
  sd.local_descricao,
  sd.workspace_id
from public.shooting_dates_v2 sd
join public.budgets_v2 b on b.id = sd.budget_id
where sd.date_start >= current_date
order by sd.date_start, sd.time_start;

comment on table public.shooting_dates_v2 is
  'EPIC-23: Datas de filmagem do orcamento V2. 1:N com budgets_v2. Multi-dia via date_end.';
comment on table public.shooting_date_items_v2 is
  'EPIC-23: M:N entre shooting_dates_v2 e budget_items_v2. UI de vinculo fica V2.1.';
