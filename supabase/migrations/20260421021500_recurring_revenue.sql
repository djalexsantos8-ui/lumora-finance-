-- ============================================================
-- MIGRATION — Recurring Revenue
--
-- Receita recorrente (MRR — monthly recurring revenue). Cada linha
-- representa um contrato/retainer/mensalidade ativo no workspace.
--
-- Campos cobrem o brief do usuário:
--   · identidade: title, client_id, client_name
--   · vertical: segment (texto livre — "casamento", "corporativo", etc)
--   · tipo de entrega: delivery_type (texto livre)
--   · flags de conteúdo: has_video, has_photo, has_social
--   · financeiro: amount, currency
--   · cadência: frequency (weekly/monthly/quarterly/yearly),
--               billing_day (1-31, opcional — dia do mês da cobrança)
--   · próximas datas: next_delivery_at, next_billing_at
--   · fluxo: status (active/paused/cancelled)
--   · notas: notes
--
-- Dashboard / narrativa NÃO precisam ser alterados neste passo —
-- esta tabela é NOVA e fica isolada. MRR pode ser incorporado aos
-- aggregators numa iteração futura (Fase pós-7, fora de escopo hoje).
-- ============================================================

create table if not exists public.recurring_revenue (
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

create index if not exists idx_rr_workspace_active
  on public.recurring_revenue(workspace_id)
  where deleted_at is null;

create index if not exists idx_rr_client_id
  on public.recurring_revenue(client_id)
  where client_id is not null;

create index if not exists idx_rr_status
  on public.recurring_revenue(status)
  where deleted_at is null;

create index if not exists idx_rr_next_billing
  on public.recurring_revenue(next_billing_at)
  where deleted_at is null and status = 'active';

-- ─── Triggers ──────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_rr_updated_at on public.recurring_revenue;
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

drop trigger if exists rr_normalize_strings_trg on public.recurring_revenue;
create trigger rr_normalize_strings_trg
  before insert or update of title, client_name, segment, delivery_type
  on public.recurring_revenue
  for each row execute function public.rr_normalize_strings();

-- ─── RLS ───────────────────────────────────────────────────────

alter table public.recurring_revenue enable row level security;

drop policy if exists "rr: workspace members full access" on public.recurring_revenue;
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

-- ─── Validação ─────────────────────────────────────────────────

do $$
begin
  if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'recurring_revenue') then
    raise exception 'FAIL: tabela recurring_revenue nao criada';
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_rr_updated_at') then
    raise exception 'FAIL: trigger updated_at nao criado';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'recurring_revenue'
      and policyname = 'rr: workspace members full access'
  ) then
    raise exception 'FAIL: RLS policy nao criada';
  end if;

  raise notice 'OK: recurring_revenue table + triggers + RLS prontos';
end $$;
