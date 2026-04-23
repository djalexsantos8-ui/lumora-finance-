-- Desconto em R$ aplicado ao subtotal. Default 0 pra não quebrar registros
-- existentes. O total gravado representa o já descontado — aggregators e
-- narrativa leem revenue_total/total normalmente, sem precisar ajustar nada.

alter table public.budgets
  add column if not exists discount_amount numeric not null default 0
  check (discount_amount >= 0);

alter table public.orders
  add column if not exists discount_amount numeric not null default 0
  check (discount_amount >= 0);

alter table public.jobs
  add column if not exists discount_amount numeric not null default 0
  check (discount_amount >= 0);
