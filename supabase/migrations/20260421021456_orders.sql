-- ============================================================
-- MIGRATION — Orders (Pedidos)
--
-- Nova entidade "pedidos" — visual irmã de jobs/freelances mas para
-- vendas de produtos / entregas com lógica mais simples.
--
-- Escolhas de design:
--   · Tabela NOVA (orders). NÃO reusa jobs — jobs tem schema pesado
--     (multi-day, aggregators, cost_items etc). Orders é mais leve.
--   · status: simples (draft/in_progress/delivered/paid/cancelled)
--   · client_id opcional (mesmo padrão de jobs/budgets)
--   · Soft delete via deleted_at (padrão do projeto)
--   · RLS baseada em workspace_members (mesmo padrão)
--
-- Totalmente idempotente. Segura pra re-aplicar.
-- ============================================================

-- ─── 1. Tabela orders ───────────────────────────────────────────

create table if not exists public.orders (
  id               uuid         primary key default gen_random_uuid(),
  workspace_id     uuid         not null references public.workspaces(id) on delete cascade,
  created_by       uuid         not null references auth.users(id),

  title            text         not null default 'Pedido sem título',
  client_id        uuid         references public.clients(id) on delete set null,
  client_name      text         default '',

  -- Datas
  order_date       date         not null default current_date,
  delivery_date    date,

  -- Financeiro (simples — sem items/cost breakdown por agora)
  currency         text         not null default 'BRL',
  amount           numeric(14,2) not null default 0,
  amount_paid      numeric(14,2) not null default 0,

  -- Fluxo
  status           text         not null default 'in_progress'
    check (status in ('draft', 'in_progress', 'delivered', 'paid', 'cancelled')),

  notes            text,

  created_at       timestamptz  not null default now(),
  updated_at       timestamptz  not null default now(),
  deleted_at       timestamptz,

  constraint orders_title_not_empty check (length(btrim(title)) > 0),
  constraint orders_amount_non_negative check (amount >= 0),
  constraint orders_paid_non_negative check (amount_paid >= 0)
);

create index if not exists idx_orders_workspace_active
  on public.orders(workspace_id)
  where deleted_at is null;

create index if not exists idx_orders_client_id
  on public.orders(client_id)
  where client_id is not null;

create index if not exists idx_orders_status
  on public.orders(status)
  where deleted_at is null;

create index if not exists idx_orders_order_date
  on public.orders(order_date desc)
  where deleted_at is null;

-- ─── 2. Trigger updated_at ──────────────────────────────────────

-- Reusa public.set_updated_at() (já criado pela migration 020_clients).
-- Se por algum motivo não existir, cria.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- ─── 3. Normalize title/client_name ─────────────────────────────

create or replace function public.orders_normalize_strings()
returns trigger
language plpgsql
as $$
begin
  new.title := btrim(new.title);
  if new.client_name is not null then
    new.client_name := btrim(new.client_name);
  end if;
  return new;
end;
$$;

drop trigger if exists orders_normalize_strings_trg on public.orders;
create trigger orders_normalize_strings_trg
  before insert or update of title, client_name on public.orders
  for each row execute function public.orders_normalize_strings();

-- ─── 4. RLS ─────────────────────────────────────────────────────

alter table public.orders enable row level security;

drop policy if exists "orders: workspace members full access" on public.orders;
create policy "orders: workspace members full access"
  on public.orders for all
  using (
    exists (
      select 1 from public.workspace_members wm
      where  wm.workspace_id = orders.workspace_id
        and  wm.user_id = auth.uid()
        and  wm.status  = 'active'
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where  wm.workspace_id = orders.workspace_id
        and  wm.user_id = auth.uid()
        and  wm.status  = 'active'
    )
  );

-- ─── 5. Validação ───────────────────────────────────────────────

do $$
begin
  if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'orders') then
    raise exception 'FAIL: tabela orders não foi criada';
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'trg_orders_updated_at'
  ) then
    raise exception 'FAIL: trigger updated_at nao criado';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'orders'
      and policyname = 'orders: workspace members full access'
  ) then
    raise exception 'FAIL: RLS policy nao criada';
  end if;

  raise notice 'OK: orders table + triggers + RLS prontos';
end $$;
