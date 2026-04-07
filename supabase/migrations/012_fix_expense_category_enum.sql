-- ============================================================
-- MIGRATION 012 — Adicionar valores faltantes ao enum expense_category_enum
-- IDEMPOTENTE: ADD VALUE IF NOT EXISTS não falha se já existir.
-- ============================================================

ALTER TYPE expense_category_enum ADD VALUE IF NOT EXISTS 'food';
ALTER TYPE expense_category_enum ADD VALUE IF NOT EXISTS 'transport';
ALTER TYPE expense_category_enum ADD VALUE IF NOT EXISTS 'equipment';
ALTER TYPE expense_category_enum ADD VALUE IF NOT EXISTS 'software';
ALTER TYPE expense_category_enum ADD VALUE IF NOT EXISTS 'marketing';
ALTER TYPE expense_category_enum ADD VALUE IF NOT EXISTS 'other';
