-- MIGRATION 018 — Adicionar last_paid_date em fixed_costs
-- Permite registrar o último pagamento de custos recorrentes
-- sem criar uma tabela separada de log.
-- Custo recorrente é considerado "pago este mês" quando
-- last_paid_date pertence ao mês/ano atual.

ALTER TABLE public.fixed_costs
  ADD COLUMN IF NOT EXISTS last_paid_date date;
