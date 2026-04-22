-- ============================================================
-- MIGRATION — Recurring Revenue Invoices (Fase 4 / 2026-04-22)
--
-- Tabela 100% ADITIVA. Não altera nenhuma tabela existente.
-- Representa cada cobrança mensal emitida a partir de uma receita
-- recorrente. Permite:
--   · histórico de cobranças por contrato
--   · status individual por mês (open/paid/overdue/cancelled)
--   · geração de PDF mensal (invoice/recibo)
--   · idempotência via unique (recurring_revenue_id, period_year, period_month)
--
-- Segurança:
--   · RLS habilitada no mesmo padrão de recurring_revenue
--     (workspace_members com status = 'active')
--   · snapshot de title/amount/client_name no momento da geração
--     (imutável quando a recorrência muda depois)
--   · NÃO altera recurring_revenue, aggregators ou dashboard
--
-- Rollback: `drop table public.recurring_revenue_invoices cascade;`
-- ============================================================

create table if not exists public.recurring_revenue_invoices (
  id                    uuid          primary key default gen_random_uuid(),
  workspace_id          uuid          not null references public.workspaces(id) on delete cascade,
  recurring_revenue_id  uuid          not null references public.recurring_revenue(id) on delete cascade,
  created_by            uuid          not null references auth.users(id),

  -- Período de competência (year+month identifica unicamente uma cobrança)
  period_year           smallint      not null check (period_year between 2000 and 2100),
  period_month          smallint      not null check (period_month between 1 and 12),
  due_date              date,

  -- Snapshot do contrato no momento da emissão
  title                 text          not null default 'Cobrança',
  client_name           text,
  amount                numeric(14,2) not null default 0 check (amount >= 0),
  currency              text          not null default 'BRL',

  -- Ciclo de vida
  status                text          not null default 'open'
    check (status in ('open', 'paid', 'overdue', 'cancelled')),
  paid_at               date,
  paid_amount           numeric(14,2) check (paid_amount is null or paid_amount >= 0),

  notes                 text,

  created_at            timestamptz   not null default now(),
  updated_at            timestamptz   not null default now(),
  deleted_at            timestamptz,

  constraint rri_period_unique
    unique (recurring_revenue_id, period_year, period_month)
);

-- ─── Índices ───────────────────────────────────────────────────

create index if not exists idx_rri_recurring
  on public.recurring_revenue_invoices(recurring_revenue_id, period_year desc, period_month desc)
  where deleted_at is null;

create index if not exists idx_rri_workspace_status
  on public.recurring_revenue_invoices(workspace_id, status)
  where deleted_at is null;

create index if not exists idx_rri_due_open
  on public.recurring_revenue_invoices(due_date)
  where deleted_at is null and status in ('open', 'overdue');

-- ─── updated_at ─────────────────────────────────────────────────

create or replace function public.tg_rri_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_rri_updated_at on public.recurring_revenue_invoices;
create trigger trg_rri_updated_at
  before update on public.recurring_revenue_invoices
  for each row execute function public.tg_rri_touch_updated_at();

-- ─── RLS (mesmo padrão de recurring_revenue) ────────────────────

alter table public.recurring_revenue_invoices enable row level security;

drop policy if exists "rri: workspace members full access" on public.recurring_revenue_invoices;
create policy "rri: workspace members full access"
  on public.recurring_revenue_invoices for all
  using (
    exists (
      select 1 from public.workspace_members wm
      where  wm.workspace_id = recurring_revenue_invoices.workspace_id
        and  wm.user_id = auth.uid()
        and  wm.status  = 'active'
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where  wm.workspace_id = recurring_revenue_invoices.workspace_id
        and  wm.user_id = auth.uid()
        and  wm.status  = 'active'
    )
  );

-- ─── Validação ─────────────────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'recurring_revenue_invoices'
  ) then
    raise exception 'FAIL: tabela recurring_revenue_invoices nao criada';
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'trg_rri_updated_at'
  ) then
    raise exception 'FAIL: trigger updated_at nao criado';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'recurring_revenue_invoices'
      and policyname = 'rri: workspace members full access'
  ) then
    raise exception 'FAIL: RLS policy nao criada';
  end if;

  raise notice 'OK: recurring_revenue_invoices + triggers + RLS prontos';
end $$;

comment on table public.recurring_revenue_invoices is
  'Cobranças mensais geradas a partir de uma receita recorrente. Adicionado em 2026-04-22 (Fase 4).';
