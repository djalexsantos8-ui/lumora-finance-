-- ============================================================
-- MIGRATION 015 — Evolução da tabela fixed_costs
-- Adiciona suporte a: recorrente vs parcelado, multimoeda,
-- controle de pagamento, quitação antecipada com desconto.
-- IDEMPOTENTE: ADD COLUMN IF NOT EXISTS não falha se já existir.
-- ============================================================

ALTER TABLE public.fixed_costs
  -- Tipo: recorrente (sem fim) ou parcelado (N parcelas)
  ADD COLUMN IF NOT EXISTS is_recurring          boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_installment        boolean NOT NULL DEFAULT false,

  -- Parcelamento
  ADD COLUMN IF NOT EXISTS installments_total    integer,
  ADD COLUMN IF NOT EXISTS installment_index     integer,
  ADD COLUMN IF NOT EXISTS parent_fixed_cost_id  uuid,

  -- Período
  ADD COLUMN IF NOT EXISTS start_date            date,
  ADD COLUMN IF NOT EXISTS end_date              date,

  -- Multimoeda
  ADD COLUMN IF NOT EXISTS exchange_rate         numeric(10,6),
  ADD COLUMN IF NOT EXISTS amount_brl            numeric(12,2),
  ADD COLUMN IF NOT EXISTS iof_applied           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS iof_amount            numeric(12,2),

  -- Controle de pagamento (parcelas)
  ADD COLUMN IF NOT EXISTS is_paid               boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS paid_at               timestamptz,
  ADD COLUMN IF NOT EXISTS paid_amount           numeric(12,2),
  ADD COLUMN IF NOT EXISTS discount_amount       numeric(12,2);
