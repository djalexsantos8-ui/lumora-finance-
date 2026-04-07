-- ============================================================
-- MIGRATION 010 — Controle de pagamento de despesas
-- IDEMPOTENTE: pode ser rodada múltiplas vezes sem erro.
-- ============================================================

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS is_paid     boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS paid_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS paid_at     timestamptz;

-- Índice para filtrar despesas não pagas facilmente
DROP INDEX IF EXISTS public.idx_expenses_unpaid;
CREATE INDEX idx_expenses_unpaid
  ON public.expenses (workspace_id, expense_date)
  WHERE is_paid = false AND deleted_at IS NULL;
