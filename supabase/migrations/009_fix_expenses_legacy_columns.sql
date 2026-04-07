-- ============================================================
-- MIGRATION 009 — Corrigir colunas legadas na tabela expenses
--
-- A tabela expenses foi originalmente criada para "despesas de job"
-- (módulo diferente) com as colunas:
--   job_id     uuid (já corrigido em 008 — nullable)
--   created_by uuid NOT NULL  ← bloqueia inserts do módulo financeiro
--   value      numeric NOT NULL default 0  ← não bloqueia (tem default)
--
-- O módulo Despesas (freelancer) é independente de Jobs.
-- created_by não é preenchido pelas server actions de despesas.
-- ============================================================

ALTER TABLE public.expenses ALTER COLUMN created_by DROP NOT NULL;
