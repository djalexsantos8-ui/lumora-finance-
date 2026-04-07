-- ============================================================
-- MIGRATION 014 — Campos de analytics para jobs
-- IDEMPOTENTE: ADD COLUMN IF NOT EXISTS não falha se já existir.
-- ============================================================

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS job_date_start  date,
  ADD COLUMN IF NOT EXISTS job_date_end    date,
  ADD COLUMN IF NOT EXISTS is_multi_day    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lead_source     text,
  ADD COLUMN IF NOT EXISTS client_segment  text;
