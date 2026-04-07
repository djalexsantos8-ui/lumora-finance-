-- MIGRATION 017 — Tornar nullable todas as colunas de metadados legadas em fixed_costs
-- Objetivo: resolver definitivamente erros NOT NULL de colunas que o app não controla.
-- Seguro: apenas remove restrição, não remove dados nem altera tipos.

-- next_due_date: app calcula dinamicamente a partir de start_date
DO $$ BEGIN
  ALTER TABLE public.fixed_costs ALTER COLUMN next_due_date DROP NOT NULL;
EXCEPTION WHEN undefined_column THEN NULL; END $$;

-- frequency: legado, app usa is_recurring + billing_day em vez disso
DO $$ BEGIN
  ALTER TABLE public.fixed_costs ALTER COLUMN frequency DROP NOT NULL;
EXCEPTION WHEN undefined_column THEN NULL; END $$;

-- day_of_month: legado, substituído por billing_day
DO $$ BEGIN
  ALTER TABLE public.fixed_costs ALTER COLUMN day_of_month DROP NOT NULL;
EXCEPTION WHEN undefined_column THEN NULL; END $$;

-- status: legado, substituído por is_active
DO $$ BEGIN
  ALTER TABLE public.fixed_costs ALTER COLUMN status DROP NOT NULL;
EXCEPTION WHEN undefined_column THEN NULL; END $$;

-- name: se ainda for NOT NULL sem default, app já envia o valor mas garantimos segurança
DO $$ BEGIN
  ALTER TABLE public.fixed_costs ALTER COLUMN name DROP NOT NULL;
EXCEPTION WHEN undefined_column THEN NULL; END $$;

-- type: coluna legada eventual
DO $$ BEGIN
  ALTER TABLE public.fixed_costs ALTER COLUMN type DROP NOT NULL;
EXCEPTION WHEN undefined_column THEN NULL; END $$;

-- due_date: coluna legada eventual
DO $$ BEGIN
  ALTER TABLE public.fixed_costs ALTER COLUMN due_date DROP NOT NULL;
EXCEPTION WHEN undefined_column THEN NULL; END $$;
