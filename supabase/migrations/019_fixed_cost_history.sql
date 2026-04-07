-- MIGRATION 019 — Histórico de alterações em fixed_costs
-- Registra toda mudança de valor, categoria ou descrição.
-- Gravação feita pela server action updateFixedCost (não por trigger)
-- para manter controle total no application layer.

CREATE TABLE IF NOT EXISTS public.fixed_cost_history (
  id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  cost_id      uuid         NOT NULL REFERENCES public.fixed_costs(id) ON DELETE CASCADE,
  workspace_id uuid         NOT NULL,
  changed_by   uuid,
  field        text         NOT NULL,   -- 'amount' | 'description' | 'category' | 'billing_day'
  old_value    text,
  new_value    text,
  changed_at   timestamptz  NOT NULL DEFAULT now()
);

-- Index para busca por custo
CREATE INDEX IF NOT EXISTS idx_fixed_cost_history_cost_id
  ON public.fixed_cost_history(cost_id);

-- RLS
ALTER TABLE public.fixed_cost_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fixed_cost_history: workspace members" ON public.fixed_cost_history;
CREATE POLICY "fixed_cost_history: workspace members"
  ON public.fixed_cost_history FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );
