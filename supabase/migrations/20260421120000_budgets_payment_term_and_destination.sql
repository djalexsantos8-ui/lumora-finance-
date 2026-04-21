-- ============================================================
-- MIGRATION — Budgets: payment_term + intended_destination
--
-- Adiciona ao orçamento:
--   · payment_term          (texto livre — "50% assinatura + 50% entrega", etc)
--   · intended_destination  (hint de qual fluxo o orçamento vira:
--                              'order' | 'freelance' | 'recurring')
--
-- Ambos NULLABLE — zero impacto em orçamentos existentes.
-- ============================================================

alter table public.budgets
  add column if not exists payment_term          text,
  add column if not exists intended_destination  text
    check (intended_destination in ('order', 'freelance', 'recurring'));
