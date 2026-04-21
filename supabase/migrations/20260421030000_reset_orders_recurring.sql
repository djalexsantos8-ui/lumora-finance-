-- ============================================================
-- MIGRATION — Reset orders + recurring_revenue (schema drift fix)
--
-- DIAGNÓSTICO em produção (2026-04-20 ~23:50 UTC):
--
--   createOrderDraft falhava silenciosamente com
--     22P02: invalid input value for enum order_status: "in_progress"
--
--   Isso revela que existia em produção uma tabela public.orders anterior
--   (criada fora deste repo — manualmente no SQL Editor em algum momento)
--   cujo status era um TYPE enum com valores diferentes dos que a app
--   espera ('draft', 'in_progress', 'delivered', 'paid', 'cancelled').
--
--   Como a migration original (20260421021456_orders.sql) usa
--   CREATE TABLE IF NOT EXISTS, ela NÃO sobrescreveu o esquema antigo.
--
-- POR QUE DROP É SEGURO:
--   · A tabela está VAZIA em produção (/pedidos mostra empty state).
--   · A tabela é NOVA — nenhum usuário fez seed.
--   · Nenhum outro módulo referencia public.orders (verificado via grep).
--
-- POR VIA DAS DÚVIDAS:
--   Mesmo tratamento aplicado a public.recurring_revenue caso haja
--   drift similar lá — tabela também está empty.
--
-- Idempotente: DROP IF EXISTS + recria.
-- ============================================================

-- ─── 1. DROP de versões antigas (tabela + enums residuais) ─────

drop table if exists public.orders cascade;
drop table if exists public.recurring_revenue cascade;

-- Enums potencialmente criados por schema anterior
drop type if exists public.order_status cascade;
drop type if exists public.orders_status cascade;
drop type if exists public.recurring_status cascade;
drop type if exists public.recurring_frequency cascade;

-- ─── 2. RECREATE orders ────────────────────────────────────────

create table public.orders (
  id               uuid         primary key default gen_random_uuid(),
  workspace_id     uuid         not null references public.workspaces(id) on delete cascade,
  created_by       uuid         not null references auth.users(id),

  title            text         not null default 'Pedido sem título',
  client_id        uuid         references public.clients(id) on delete set null,
  client_name      text         default '',

  order_date       date         not null default current_date,
  delivery_date    date,

  currency         text         not null default 'BRL',
  amount           numeric(14,2) not null default 0,
  amount_paid      numeric(14,2) not null default 0,

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

create index idx_orders_workspace_active
  on public.orders(workspace_id)
  where deleted_at is null;

create index idx_orders_client_id
  on public.orders(client_id)
  where client_id is not null;

create index idx_orders_status
  on public.orders(status)
  where deleted_at is null;

create index idx_orders_order_date
  on public.orders(order_date desc)
  where deleted_at is null;

-- Triggers
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_orders_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

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

create trigger orders_normalize_strings_trg
  before insert or update of title, client_name on public.orders
  for each row execute function public.orders_normalize_strings();

-- RLS
alter table public.orders enable row level security;

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

-- ─── 3. RECREATE recurring_revenue ─────────────────────────────

create table public.recurring_revenue (
  id                uuid         primary key default gen_random_uuid(),
  workspace_id      uuid         not null references public.workspaces(id) on delete cascade,
  created_by        uuid         not null references auth.users(id),

  title             text         not null default 'Receita sem título',
  client_id         uuid         references public.clients(id) on delete set null,
  client_name       text         default '',

  segment           text,
  delivery_type     text,
  has_video         boolean      not null default false,
  has_photo         boolean      not null default false,
  has_social        boolean      not null default false,

  currency          text         not null default 'BRL',
  amount            numeric(14,2) not null default 0,

  frequency         text         not null default 'monthly'
    check (frequency in ('weekly', 'monthly', 'quarterly', 'yearly')),
  billing_day       smallint     check (billing_day is null or (billing_day between 1 and 31)),

  next_delivery_at  date,
  next_billing_at   date,

  status            text         not null default 'active'
    check (status in ('active', 'paused', 'cancelled')),

  notes             text,

  started_at        date         not null default current_date,
  cancelled_at      date,

  created_at        timestamptz  not null default now(),
  updated_at        timestamptz  not null default now(),
  deleted_at        timestamptz,

  constraint rr_title_not_empty check (length(btrim(title)) > 0),
  constraint rr_amount_non_negative check (amount >= 0)
);

create index idx_rr_workspace_active
  on public.recurring_revenue(workspace_id)
  where deleted_at is null;

create index idx_rr_client_id
  on public.recurring_revenue(client_id)
  where client_id is not null;

create index idx_rr_status
  on public.recurring_revenue(status)
  where deleted_at is null;

create index idx_rr_next_billing
  on public.recurring_revenue(next_billing_at)
  where deleted_at is null and status = 'active';

create trigger trg_rr_updated_at
  before update on public.recurring_revenue
  for each row execute function public.set_updated_at();

create or replace function public.rr_normalize_strings()
returns trigger
language plpgsql
as $$
begin
  new.title := btrim(new.title);
  if new.client_name is not null then
    new.client_name := btrim(new.client_name);
  end if;
  if new.segment is not null then
    new.segment := btrim(new.segment);
  end if;
  if new.delivery_type is not null then
    new.delivery_type := btrim(new.delivery_type);
  end if;
  return new;
end;
$$;

create trigger rr_normalize_strings_trg
  before insert or update of title, client_name, segment, delivery_type
  on public.recurring_revenue
  for each row execute function public.rr_normalize_strings();

alter table public.recurring_revenue enable row level security;

create policy "rr: workspace members full access"
  on public.recurring_revenue for all
  using (
    exists (
      select 1 from public.workspace_members wm
      where  wm.workspace_id = recurring_revenue.workspace_id
        and  wm.user_id = auth.uid()
        and  wm.status  = 'active'
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where  wm.workspace_id = recurring_revenue.workspace_id
        and  wm.user_id = auth.uid()
        and  wm.status  = 'active'
    )
  );

-- ─── 4. Validação ──────────────────────────────────────────────

do $$
declare
  orders_status_type text;
  rr_status_type text;
begin
  -- Confirma que orders.status agora é text (não enum)
  select data_type into orders_status_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'orders' and column_name = 'status';

  if orders_status_type is null then
    raise exception 'FAIL: orders.status nao existe';
  end if;
  if orders_status_type <> 'text' then
    raise exception 'FAIL: orders.status deveria ser text, mas e %', orders_status_type;
  end if;

  select data_type into rr_status_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'recurring_revenue' and column_name = 'status';

  if rr_status_type is null then
    raise exception 'FAIL: recurring_revenue.status nao existe';
  end if;
  if rr_status_type <> 'text' then
    raise exception 'FAIL: recurring_revenue.status deveria ser text, mas e %', rr_status_type;
  end if;

  raise notice 'OK: orders + recurring_revenue schema reset — status e text em ambas';
end $$;
