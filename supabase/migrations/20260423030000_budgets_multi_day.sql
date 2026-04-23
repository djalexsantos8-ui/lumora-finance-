-- Migration 20260423030000_budgets_multi_day
--
-- Adiciona suporte a múltiplas datas em orçamentos, espelhando o padrão
-- já consolidado em jobs (migration 014). Não mexe em event_date existente.
--
-- Semântica (mesmo padrão de jobs — veja FreelanceDateRange/date-range.tsx):
--   event_date          = data de início (sempre preenchida quando houver data)
--   event_date_end      = data de fim   (null OR igual a event_date → single day)
--   is_multi_day        = cache booleano (event_date_end IS NOT NULL AND > event_date)
--
-- Adapter na action updateBudget recebe {date_start, date_end} e sincroniza
-- as três colunas atomicamente — mesmo padrão de updateJob().

ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS event_date_end DATE,
  ADD COLUMN IF NOT EXISTS is_multi_day   BOOLEAN NOT NULL DEFAULT false;

-- Backfill defensivo: orçamentos existentes viram single-day explicitamente.
UPDATE public.budgets
SET is_multi_day = false,
    event_date_end = NULL
WHERE is_multi_day IS DISTINCT FROM false
   OR event_date_end IS DISTINCT FROM NULL;

-- Índice leve pra listagens que filtram por período multi-day.
CREATE INDEX IF NOT EXISTS idx_budgets_event_date_end
  ON public.budgets(event_date_end)
  WHERE deleted_at IS NULL AND event_date_end IS NOT NULL;
