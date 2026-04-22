-- ─── Orders: payments trigger + expenses.order_id (Fase 1b Pedidos) ────────
--
-- Fase 1b (2026-04-22): paridade total com Freelances.
-- NOTA: a tabela `public.order_payments` JÁ EXISTIA (criada pelo schema
-- original de Pedidos) com um schema rico: workspace_id, due_date, paid_at,
-- method, reference, status (enum payment_status: previsto/pago/cancelado),
-- created_by, updated_at, deleted_at.
--
-- Portanto esta migration NÃO recria a tabela. Apenas:
--   1. Adiciona expenses.order_id (aditivo, nullable FK).
--   2. Cria trigger `recalculate_order_amount_paid` que atualiza
--      orders.amount_paid considerando só status='pago' e deleted_at is null.
--
-- 100% ADITIVA — zero ALTER em colunas existentes, zero mudança em
-- aggregators/triggers existentes. Dashboard/narrativa NÃO afetados.

-- ─── 1. expenses.order_id ────────────────────────────────────────────────────
alter table public.expenses
  add column if not exists order_id uuid references public.orders(id) on delete set null;

create index if not exists idx_expenses_order_id
  on public.expenses(order_id)
  where order_id is not null and deleted_at is null;

-- ─── 2. Trigger: recalcula orders.amount_paid ────────────────────────────────

create or replace function public.recalculate_order_amount_paid()
returns trigger
language plpgsql
as $$
declare
  v_order_id uuid;
begin
  v_order_id := coalesce(new.order_id, old.order_id);

  update public.orders
  set amount_paid = (
    select coalesce(sum(amount), 0)
    from   public.order_payments
    where  order_id = v_order_id
      and  status   = 'pago'
      and  deleted_at is null
  )
  where id = v_order_id;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_order_payments_recalc on public.order_payments;
create trigger trg_order_payments_recalc
  after insert or update or delete on public.order_payments
  for each row execute function public.recalculate_order_amount_paid();

comment on function public.recalculate_order_amount_paid()
  is 'Atualiza orders.amount_paid somando order_payments com status=pago e não deletados.';
