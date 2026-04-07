-- ============================================================
-- MIGRATION 011 — Suporte a multimoeda nas despesas
-- IDEMPOTENTE: pode ser rodada múltiplas vezes sem erro.
-- ============================================================

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS exchange_rate numeric(10,6),   -- 1 USD = X BRL (fixado na criação)
  ADD COLUMN IF NOT EXISTS amount_brl    numeric(12,2),   -- valor convertido em BRL (com ou sem IOF)
  ADD COLUMN IF NOT EXISTS iof_applied   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS iof_amount    numeric(12,2);   -- valor do IOF em BRL, se aplicado
