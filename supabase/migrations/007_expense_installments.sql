-- ============================================================
-- MIGRATION 007 — Parcelamento de Despesas
--
-- Adiciona suporte a compras parceladas na tabela expenses.
-- Retrocompatível: despesas existentes não são afetadas.
-- IDEMPOTENTE: pode ser rodada múltiplas vezes sem erro.
-- ============================================================

alter table public.expenses
  add column if not exists is_installment      boolean  not null default false,
  add column if not exists installments_total  integer,
  add column if not exists installment_index   integer,
  add column if not exists parent_expense_id   uuid     references public.expenses(id) on delete cascade;

-- Índice para buscar parcelas por parent
drop index if exists public.idx_expenses_parent;
create index idx_expenses_parent
  on public.expenses (parent_expense_id)
  where parent_expense_id is not null;
