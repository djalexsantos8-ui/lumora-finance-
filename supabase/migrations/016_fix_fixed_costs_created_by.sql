-- ============================================================
-- MIGRATION 016 — Corrigir coluna created_by na tabela fixed_costs
--
-- Mesmo problema resolvido para expenses na migration 009:
-- A tabela fixed_costs foi criada com created_by uuid NOT NULL
-- (possivelmente com FK para profiles). As server actions de
-- custos fixos usam auth.uid() que pode não existir em profiles.
--
-- Fix: drop NOT NULL + drop FK se existir.
-- A coluna fica nullable — server actions passam o valor quando
-- disponível, mas o insert não falha se não passar.
-- ============================================================

-- Drop NOT NULL
ALTER TABLE public.fixed_costs ALTER COLUMN created_by DROP NOT NULL;

-- Drop FK constraint se existir (nome pode variar — tentamos os comuns)
DO $$ BEGIN
  ALTER TABLE public.fixed_costs DROP CONSTRAINT IF EXISTS fixed_costs_created_by_fkey;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.fixed_costs DROP CONSTRAINT IF EXISTS fixed_costs_created_by_fkey1;
EXCEPTION WHEN undefined_object THEN NULL; END $$;
