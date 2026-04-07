-- ============================================================
-- MIGRATION 008 — Corrigir job_id na tabela expenses
--
-- A tabela expenses foi originalmente criada pela migration de
-- job_financials com job_id NOT NULL.
-- O módulo de Despesas (006/007) é independente de Jobs,
-- então job_id deve ser nullable.
-- ============================================================

ALTER TABLE public.expenses ALTER COLUMN job_id DROP NOT NULL;
