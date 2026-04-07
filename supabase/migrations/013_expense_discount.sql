-- ============================================================
-- MIGRATION 013 — Campo discount_amount para quitação com desconto
-- IDEMPOTENTE: ADD COLUMN IF NOT EXISTS não falha se já existir.
-- ============================================================

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS discount_amount numeric(12,2);
