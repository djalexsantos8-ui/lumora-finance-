-- ==========================================
-- EPIC-13: budgets_v2 + budget_items_v2
-- Fundação do core financeiro V2 (unit_cost separado de unit_price)
-- ==========================================

create table public.budgets_v2 (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,

  number text not null,
  client_id uuid references public.clients(id) on delete set null,
  agency_id uuid references public.clients(id) on delete set null,
  project_type text,
  name text not null,

  start_date date,
  end_date date,
  location text,

  subtotal numeric not null default 0,
  total_cost numeric not null default 0,
  margin_percent numeric not null default 20,
  tax_percent numeric not null default 16,
  margin_amount numeric not null default 0,
  tax_amount numeric not null default 0,
  discount_amount numeric not null default 0,
  total numeric not null default 0,

  status text not null default 'draft' check (status in (
    'draft','sent','approved','rejected','converted','expired','archived'
  )),

  cover_letter_id uuid,

  payment_terms text default '50/50',
  validity_days int default 15,
  delivery_days int default 30,
  revisions_included int default 2,

  notes_internal text,
  notes_client text,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_budgets_v2_workspace on public.budgets_v2(workspace_id);
create index idx_budgets_v2_client    on public.budgets_v2(client_id);
create index idx_budgets_v2_status    on public.budgets_v2(status);
create index idx_budgets_v2_dates     on public.budgets_v2(start_date, end_date);
create unique index idx_budgets_v2_number_unique on public.budgets_v2(workspace_id, number);

create trigger trg_budgets_v2_updated
  before update on public.budgets_v2
  for each row execute function public.set_updated_at();

-- ==========================================

create table public.budget_items_v2 (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.budgets_v2(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,

  category text default 'Geral',
  description text not null,
  unit text default 'unidade',
  days int default 1,
  people int default 1,
  quantity numeric not null default 1,

  unit_price numeric not null default 0,
  unit_cost numeric not null default 0,
  total numeric not null default 0,
  total_cost numeric not null default 0,

  sort_order int not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_budget_items_v2_budget    on public.budget_items_v2(budget_id);
create index idx_budget_items_v2_workspace on public.budget_items_v2(workspace_id);
create index idx_budget_items_v2_sort      on public.budget_items_v2(budget_id, sort_order);

create trigger trg_budget_items_v2_updated
  before update on public.budget_items_v2
  for each row execute function public.set_updated_at();

-- ==========================================
-- RLS — padrão Lumora V2

alter table public.budgets_v2 enable row level security;

create policy "members can read budgets_v2"
  on public.budgets_v2 for select
  using (workspace_id in (select public.user_workspaces()));

create policy "members can insert budgets_v2"
  on public.budgets_v2 for insert
  with check (workspace_id in (select public.user_workspaces()));

create policy "members can update budgets_v2"
  on public.budgets_v2 for update
  using (workspace_id in (select public.user_workspaces()))
  with check (workspace_id in (select public.user_workspaces()));

create policy "members can delete budgets_v2"
  on public.budgets_v2 for delete
  using (workspace_id in (select public.user_workspaces()));

alter table public.budget_items_v2 enable row level security;

create policy "members can read budget_items_v2"
  on public.budget_items_v2 for select
  using (workspace_id in (select public.user_workspaces()));

create policy "members can insert budget_items_v2"
  on public.budget_items_v2 for insert
  with check (workspace_id in (select public.user_workspaces()));

create policy "members can update budget_items_v2"
  on public.budget_items_v2 for update
  using (workspace_id in (select public.user_workspaces()))
  with check (workspace_id in (select public.user_workspaces()));

create policy "members can delete budget_items_v2"
  on public.budget_items_v2 for delete
  using (workspace_id in (select public.user_workspaces()));

-- ==========================================
-- Sequência ORC-AAAA-NNN por workspace

create or replace function public.next_budget_number(ws_id uuid)
returns text language plpgsql as $$
declare
  current_year text;
  next_seq int;
begin
  current_year := to_char(now(), 'YYYY');

  select coalesce(max(
    (regexp_match(number, 'ORC-' || current_year || '-(\d+)'))[1]::int
  ), 0) + 1
  into next_seq
  from public.budgets_v2
  where workspace_id = ws_id and number ~ ('^ORC-' || current_year || '-\d+$');

  return 'ORC-' || current_year || '-' || lpad(next_seq::text, 3, '0');
end;
$$;

-- ==========================================
-- Trigger de recalc dos totals do budget

create or replace function public.recalc_budget_v2_totals()
returns trigger language plpgsql security definer as $$
declare
  bid uuid;
  v_subtotal numeric;
  v_total_cost numeric;
  v_margin_pct numeric;
  v_tax_pct numeric;
  v_discount numeric;
  v_margin_amt numeric;
  v_tax_amt numeric;
  v_total numeric;
begin
  bid := coalesce(new.budget_id, old.budget_id);

  select coalesce(sum(total), 0), coalesce(sum(total_cost), 0)
    into v_subtotal, v_total_cost
    from public.budget_items_v2
    where budget_id = bid;

  select margin_percent, tax_percent, discount_amount
    into v_margin_pct, v_tax_pct, v_discount
    from public.budgets_v2 where id = bid;

  v_margin_amt := v_subtotal * (coalesce(v_margin_pct, 0) / 100.0);
  v_tax_amt    := (v_subtotal + v_margin_amt) * (coalesce(v_tax_pct, 0) / 100.0);
  v_total      := v_subtotal + v_margin_amt + v_tax_amt - coalesce(v_discount, 0);

  update public.budgets_v2
    set subtotal      = v_subtotal,
        total_cost    = v_total_cost,
        margin_amount = v_margin_amt,
        tax_amount    = v_tax_amt,
        total         = v_total,
        updated_at    = now()
    where id = bid;

  return coalesce(new, old);
end;
$$;

create trigger trg_recalc_budget_v2_on_item_change
  after insert or update or delete on public.budget_items_v2
  for each row execute function public.recalc_budget_v2_totals();

comment on table public.budgets_v2 is
  'EPIC-13: Orçamento V2 com unit_cost separado de unit_price (rentabilidade real). Multi-tenant via workspace_id.';
comment on table public.budget_items_v2 is
  'EPIC-13: Itens do orçamento V2 — unit_cost (custo interno) + unit_price (cobrado do cliente).';
