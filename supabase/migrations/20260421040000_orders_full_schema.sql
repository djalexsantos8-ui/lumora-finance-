-- ============================================================
-- MIGRATION — Orders full schema (Phase 3a)
--
-- Amplia public.orders para herdar o melhor do Freelance + Orçamento:
--   · Campos extras: project_description, deliverables, lead_source,
--     client_segment, notes_internal, payment_condition,
--     order_date_start/end, is_multi_day, revenue_total, cost_total
--   · Nova tabela order_items (revenue items por pedido) — mesmo shape
--     de job_revenue_items: quantity * unit_value = total_value.
--   · Nova tabela order_cost_items (custos internos por pedido) — mesmo
--     shape de job_cost_items.
--   · Nova tabela order_files (anexos: contratos, comprovantes, nota
--     fiscal, arte) — espelho de job_files com bucket `order-files`.
--   · ALTER expenses ADD COLUMN order_id nullable para mirror automático
--     igual ao que job_id já faz. expenses agora pode referenciar
--     { job_id | order_id } (um só por linha — CHECK).
--
-- Idempotente: tudo com IF NOT EXISTS / CREATE OR REPLACE.
--
-- ============================================================

-- ─── 1. Campos extras em public.orders ─────────────────────────

alter table public.orders
  add column if not exists project_description text,
  add column if not exists deliverables        text,
  add column if not exists lead_source         text,
  add column if not exists client_segment      text,
  add column if not exists notes_internal      text,
  add column if not exists payment_condition   text,
  add column if not exists order_date_start    date,
  add column if not exists order_date_end      date,
  add column if not exists is_multi_day        boolean  not null default false,
  add column if not exists revenue_total       numeric(14,2) not null default 0,
  add column if not exists cost_total          numeric(14,2) not null default 0,
  add column if not exists event_date          date;

-- Normalização de strings opcionais (evita espaços laterais)
create or replace function public.orders_normalize_strings()
returns trigger
language plpgsql
as $$
begin
  new.title := btrim(new.title);
  if new.client_name is not null then
    new.client_name := btrim(new.client_name);
  end if;
  if new.lead_source is not null then
    new.lead_source := btrim(new.lead_source);
  end if;
  if new.client_segment is not null then
    new.client_segment := btrim(new.client_segment);
  end if;
  if new.project_description is not null then
    new.project_description := btrim(new.project_description);
  end if;
  if new.payment_condition is not null then
    new.payment_condition := btrim(new.payment_condition);
  end if;
  return new;
end;
$$;

-- ─── 2. Tabela: order_items (receita) ──────────────────────────

create table if not exists public.order_items (
  id              uuid          primary key default gen_random_uuid(),
  order_id        uuid          not null references public.orders(id) on delete cascade,
  description     text          not null,
  category        text          check (category is null or category in (
    'service', 'product', 'team', 'equipment', 'other'
  )),
  custom_category text,
  quantity        numeric(10,2) not null default 1 check (quantity > 0),
  unit_value      numeric(14,2) not null default 0 check (unit_value >= 0),
  total_value     numeric(14,2) not null default 0,
  sort_order      int           not null default 0,
  show_in_pdf     boolean       not null default true,
  deleted_at      timestamptz,
  created_at      timestamptz   not null default now(),

  constraint order_items_desc_not_empty check (length(btrim(description)) > 0)
);

create index if not exists idx_order_items_order
  on public.order_items(order_id, sort_order)
  where deleted_at is null;

-- ─── 3. Tabela: order_cost_items (custos internos) ─────────────

create table if not exists public.order_cost_items (
  id              uuid          primary key default gen_random_uuid(),
  order_id        uuid          not null references public.orders(id) on delete cascade,
  description     text          not null,
  category        text          check (category is null or category in (
    'equipment_rental', 'team', 'travel', 'accommodation',
    'food', 'software', 'other'
  )),
  quantity        numeric(10,2) not null default 1 check (quantity > 0),
  unit_value      numeric(14,2) not null default 0 check (unit_value >= 0),
  total_value     numeric(14,2) not null default 0,
  sort_order      int           not null default 0,
  deleted_at      timestamptz,
  created_at      timestamptz   not null default now(),

  constraint order_cost_items_desc_not_empty check (length(btrim(description)) > 0)
);

create index if not exists idx_order_cost_items_order
  on public.order_cost_items(order_id, sort_order)
  where deleted_at is null;

-- ─── 4. Triggers de total por item ─────────────────────────────
-- Reusa set_item_total_value() já existente em 005_job_financials.

drop trigger if exists trg_order_item_total on public.order_items;
create trigger trg_order_item_total
  before insert or update of quantity, unit_value on public.order_items
  for each row execute function set_item_total_value();

drop trigger if exists trg_order_cost_item_total on public.order_cost_items;
create trigger trg_order_cost_item_total
  before insert or update of quantity, unit_value on public.order_cost_items
  for each row execute function set_item_total_value();

-- ─── 5. Triggers de rollup no pedido ───────────────────────────

create or replace function public.recalculate_order_revenue()
returns trigger
language plpgsql
as $$
declare
  v_order_id uuid;
begin
  v_order_id := coalesce(new.order_id, old.order_id);

  update public.orders
  set revenue_total = (
    select coalesce(sum(total_value), 0)
    from   public.order_items
    where  order_id = v_order_id
      and  deleted_at is null
  )
  where id = v_order_id;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_order_revenue_recalc on public.order_items;
create trigger trg_order_revenue_recalc
  after insert or update or delete on public.order_items
  for each row execute function public.recalculate_order_revenue();

create or replace function public.recalculate_order_costs()
returns trigger
language plpgsql
as $$
declare
  v_order_id uuid;
begin
  v_order_id := coalesce(new.order_id, old.order_id);

  update public.orders
  set cost_total = (
    select coalesce(sum(total_value), 0)
    from   public.order_cost_items
    where  order_id = v_order_id
      and  deleted_at is null
  )
  where id = v_order_id;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_order_costs_recalc on public.order_cost_items;
create trigger trg_order_costs_recalc
  after insert or update or delete on public.order_cost_items
  for each row execute function public.recalculate_order_costs();

-- ─── 6. Tabela order_files (anexos) ────────────────────────────

create table if not exists public.order_files (
  id             uuid        primary key default gen_random_uuid(),
  workspace_id   uuid        not null references public.workspaces(id) on delete cascade,
  order_id       uuid        not null references public.orders(id)     on delete cascade,
  uploaded_by    uuid        not null references auth.users(id),

  storage_path   text        not null unique,
  file_name      text        not null,
  mime_type      text        not null,
  size_bytes     bigint      not null check (size_bytes > 0),

  created_at     timestamptz not null default now(),
  deleted_at     timestamptz,

  constraint order_files_name_not_empty check (length(trim(file_name)) > 0),
  constraint order_files_mime_whitelist check (mime_type in (
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/heic',
    'image/heif',
    'image/webp'
  ))
);

create index if not exists idx_order_files_order_active
  on public.order_files(order_id, created_at desc)
  where deleted_at is null;

create index if not exists idx_order_files_workspace
  on public.order_files(workspace_id);

-- ─── 7. Storage bucket + policies para order-files ─────────────

insert into storage.buckets (id, name, public)
values ('order-files', 'order-files', false)
on conflict (id) do nothing;

drop policy if exists "order-files: workspace read"   on storage.objects;
drop policy if exists "order-files: workspace insert" on storage.objects;
drop policy if exists "order-files: workspace update" on storage.objects;
drop policy if exists "order-files: workspace delete" on storage.objects;

create policy "order-files: workspace read"
  on storage.objects for select
  using (
    bucket_id = 'order-files'
    and auth.uid() is not null
    and exists (
      select 1 from public.workspace_members wm
      where  wm.user_id = auth.uid()
        and  wm.status  = 'active'
        and  wm.workspace_id = nullif(split_part(name, '/', 1), '')::uuid
    )
  );

create policy "order-files: workspace insert"
  on storage.objects for insert
  with check (
    bucket_id = 'order-files'
    and auth.uid() is not null
    and exists (
      select 1 from public.workspace_members wm
      where  wm.user_id = auth.uid()
        and  wm.status  = 'active'
        and  wm.workspace_id = nullif(split_part(name, '/', 1), '')::uuid
    )
  );

create policy "order-files: workspace update"
  on storage.objects for update
  using (
    bucket_id = 'order-files'
    and auth.uid() is not null
    and exists (
      select 1 from public.workspace_members wm
      where  wm.user_id = auth.uid()
        and  wm.status  = 'active'
        and  wm.workspace_id = nullif(split_part(name, '/', 1), '')::uuid
    )
  );

create policy "order-files: workspace delete"
  on storage.objects for delete
  using (
    bucket_id = 'order-files'
    and auth.uid() is not null
    and exists (
      select 1 from public.workspace_members wm
      where  wm.user_id = auth.uid()
        and  wm.status  = 'active'
        and  wm.workspace_id = nullif(split_part(name, '/', 1), '')::uuid
    )
  );

-- ─── 8. expenses.order_id (mirror pattern) ─────────────────────

alter table public.expenses
  add column if not exists order_id uuid references public.orders(id) on delete set null;

create index if not exists idx_expenses_order_id
  on public.expenses(order_id)
  where order_id is not null and deleted_at is null;

-- ─── 9. RLS para novas tabelas ─────────────────────────────────

alter table public.order_items      enable row level security;
alter table public.order_cost_items enable row level security;
alter table public.order_files      enable row level security;

drop policy if exists "order_items: workspace members full access" on public.order_items;
create policy "order_items: workspace members full access"
  on public.order_items for all
  using (
    exists (
      select 1
      from   public.orders o
      join   public.workspace_members wm on wm.workspace_id = o.workspace_id
      where  o.id  = order_items.order_id
        and  wm.user_id = auth.uid()
        and  wm.status  = 'active'
    )
  )
  with check (
    exists (
      select 1
      from   public.orders o
      join   public.workspace_members wm on wm.workspace_id = o.workspace_id
      where  o.id  = order_items.order_id
        and  wm.user_id = auth.uid()
        and  wm.status  = 'active'
    )
  );

drop policy if exists "order_cost_items: workspace members full access" on public.order_cost_items;
create policy "order_cost_items: workspace members full access"
  on public.order_cost_items for all
  using (
    exists (
      select 1
      from   public.orders o
      join   public.workspace_members wm on wm.workspace_id = o.workspace_id
      where  o.id  = order_cost_items.order_id
        and  wm.user_id = auth.uid()
        and  wm.status  = 'active'
    )
  )
  with check (
    exists (
      select 1
      from   public.orders o
      join   public.workspace_members wm on wm.workspace_id = o.workspace_id
      where  o.id  = order_cost_items.order_id
        and  wm.user_id = auth.uid()
        and  wm.status  = 'active'
    )
  );

drop policy if exists "order_files: workspace members full access" on public.order_files;
create policy "order_files: workspace members full access"
  on public.order_files for all
  using (
    exists (
      select 1 from public.workspace_members wm
      where  wm.workspace_id = order_files.workspace_id
        and  wm.user_id = auth.uid()
        and  wm.status  = 'active'
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where  wm.workspace_id = order_files.workspace_id
        and  wm.user_id = auth.uid()
        and  wm.status  = 'active'
    )
  );

-- ─── 9b. Recurring revenue polish (Phase 4) ───────────────────
-- Campos adicionais para descrição do projeto, origem do lead e
-- observações internas. Segmentação reusa lista canônica (frontend).

alter table public.recurring_revenue
  add column if not exists project_description text,
  add column if not exists lead_source         text,
  add column if not exists notes_internal      text,
  add column if not exists renewal_date        date,
  add column if not exists scope_summary       text;

-- Normalização
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
  if new.lead_source is not null then
    new.lead_source := btrim(new.lead_source);
  end if;
  if new.delivery_type is not null then
    new.delivery_type := btrim(new.delivery_type);
  end if;
  if new.project_description is not null then
    new.project_description := btrim(new.project_description);
  end if;
  return new;
end;
$$;

-- ─── 10. Validação ─────────────────────────────────────────────

do $$
declare
  v_has_revenue_total boolean;
  v_has_order_items   boolean;
  v_has_expenses_oid  boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders'
      and column_name = 'revenue_total'
  ) into v_has_revenue_total;

  select exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'order_items'
  ) into v_has_order_items;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'expenses'
      and column_name = 'order_id'
  ) into v_has_expenses_oid;

  if not v_has_revenue_total then
    raise exception 'FAIL: orders.revenue_total nao foi criada';
  end if;
  if not v_has_order_items then
    raise exception 'FAIL: tabela order_items nao foi criada';
  end if;
  if not v_has_expenses_oid then
    raise exception 'FAIL: expenses.order_id nao foi criada';
  end if;

  raise notice 'OK: Phase 3a orders schema applied';
end $$;
