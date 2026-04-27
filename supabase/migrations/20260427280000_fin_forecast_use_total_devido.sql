-- HOTFIX consistencia financeira: alinhar fin_forecast e fin_summary com
-- calcJobFinancials() em src/types/job.ts. cost_total e repasse cobrado
-- do cliente — parte do total devido. fin_forecast usava revenue-paid e
-- divergia da UI detalhe que usa (revenue+cost)-paid.

create or replace function public.fin_forecast(
  p_workspace_id uuid,
  p_horizon_days int default 90
)
returns table (
  data           date,
  tipo           text,
  fonte          text,
  ref_id         uuid,
  ref_label      text,
  cliente        text,
  valor          numeric,
  status         text,
  dias_para_data int
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_horizon date := current_date + (greatest(p_horizon_days, 1) || ' days')::interval;
begin
  perform public._fin_assert_workspace(p_workspace_id);

  return query
  with combined as (
    -- jobs: total devido = revenue + cost (repasse cobrado do cliente)
    select j.payment_due_date as data, 'a_receber'::text as tipo, 'job'::text as fonte, j.id as ref_id,
      coalesce(j.title, j.client_name, 'Job sem título')::text as ref_label,
      coalesce(j.client_name, '—')::text as cliente,
      ((coalesce(j.revenue_total, j.total_value, 0) + coalesce(j.cost_total, 0)) - coalesce(j.amount_paid, 0))::numeric as valor,
      coalesce(j.status::text, 'pending')::text as status,
      (j.payment_due_date - current_date)::int as dias_para_data
    from public.jobs j
    where j.workspace_id = p_workspace_id and j.deleted_at is null
      and j.payment_due_date is not null and j.payment_due_date <= v_horizon
      and ((coalesce(j.revenue_total, j.total_value, 0) + coalesce(j.cost_total, 0)) - coalesce(j.amount_paid, 0)) > 0

    union all

    select op.due_date, 'a_receber'::text, 'order'::text, op.order_id,
      coalesce(o.title, o.client_name, 'Pedido sem título')::text,
      coalesce(o.client_name, '—')::text,
      coalesce(op.amount, 0)::numeric,
      op.status::text,
      (op.due_date - current_date)::int
    from public.order_payments op
    join public.orders o on o.id = op.order_id
    where op.workspace_id = p_workspace_id and op.deleted_at is null
      and op.status::text = 'previsto' and op.due_date is not null and op.due_date <= v_horizon

    union all

    select rri.due_date, 'a_receber'::text, 'recurring'::text, rri.recurring_revenue_id as ref_id,
      coalesce(rri.title, rri.client_name, 'Recorrência')::text,
      coalesce(rri.client_name, '—')::text,
      coalesce(rri.amount, 0)::numeric,
      coalesce(rri.status, 'pending')::text,
      (rri.due_date - current_date)::int
    from public.recurring_revenue_invoices rri
    where rri.workspace_id = p_workspace_id and rri.deleted_at is null
      and rri.paid_at is null and rri.due_date is not null and rri.due_date <= v_horizon

    union all

    select e.expense_date, 'a_pagar'::text, 'expense'::text, e.id,
      coalesce(e.description, 'Despesa')::text, '—'::text,
      coalesce(e.amount_brl, e.amount, 0)::numeric,
      case when e.is_paid then 'paid' else 'pending' end,
      (e.expense_date - current_date)::int
    from public.expenses e
    where e.workspace_id = p_workspace_id and e.deleted_at is null
      and e.is_paid = false and e.expense_date is not null and e.expense_date <= v_horizon

    union all

    select fc.next_due_date, 'a_pagar'::text, 'fixed_cost'::text, fc.id,
      coalesce(fc.name, fc.description, 'Custo fixo')::text, '—'::text,
      coalesce(fc.amount_brl, fc.amount, 0)::numeric,
      case when fc.is_paid then 'paid' else 'pending' end,
      (fc.next_due_date - current_date)::int
    from public.fixed_costs fc
    where fc.workspace_id = p_workspace_id and fc.deleted_at is null
      and fc.is_active = true and fc.next_due_date is not null
      and fc.next_due_date <= v_horizon and fc.is_paid = false
  )
  select c.data, c.tipo, c.fonte, c.ref_id, c.ref_label, c.cliente, c.valor, c.status, c.dias_para_data
  from combined c
  order by c.data asc;
end $$;

-- fin_summary inadimplencia: mesma formula
create or replace function public.fin_summary(p_workspace_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_result jsonb;
begin
  perform public._fin_assert_workspace(p_workspace_id);

  with current_month as (select * from public.fin_dre_competencia(p_workspace_id, 1) limit 1),
  prev_month as (select * from public.fin_dre_competencia(p_workspace_id, 2) offset 1 limit 1),
  caixa_atual as (select * from public.fin_caixa_realizado(p_workspace_id, 1) limit 1),
  forecast_30 as (
    select
      sum(case when tipo = 'a_receber' then valor else 0 end) as proximas_entradas,
      sum(case when tipo = 'a_pagar'   then valor else 0 end) as proximas_saidas,
      count(*) filter (where tipo = 'a_receber') as qtd_recebimentos,
      count(*) filter (where tipo = 'a_pagar')   as qtd_pagamentos
    from public.fin_forecast(p_workspace_id, 30)
  ),
  inadimplentes as (
    select count(*) as qtd, coalesce(sum(valor), 0) as valor_total
    from (
      select (coalesce(j.revenue_total, j.total_value, 0) + coalesce(j.cost_total, 0)) - coalesce(j.amount_paid, 0) as valor
      from public.jobs j
      where j.workspace_id = p_workspace_id and j.deleted_at is null
        and j.payment_due_date is not null and j.payment_due_date < current_date
        and ((coalesce(j.revenue_total, j.total_value, 0) + coalesce(j.cost_total, 0)) - coalesce(j.amount_paid, 0)) > 0
      union all
      select op.amount
      from public.order_payments op
      where op.workspace_id = p_workspace_id and op.deleted_at is null
        and op.status::text = 'previsto' and op.due_date < current_date
      union all
      select rri.amount
      from public.recurring_revenue_invoices rri
      where rri.workspace_id = p_workspace_id and rri.deleted_at is null
        and rri.paid_at is null and rri.due_date < current_date
    ) t
  )
  select jsonb_build_object(
    'mes_corrente',  to_char(date_trunc('month', current_date)::date, 'YYYY-MM'),
    'receita_mes',   coalesce((select receita_total from current_month), 0),
    'custo_mes',     coalesce((select custo_direto  from current_month), 0),
    'margem_mes',    coalesce((select margem_bruta  from current_month), 0),
    'margem_pct',    coalesce((select margem_pct    from current_month), 0),
    'qtd_projetos',  coalesce((select qtd_projetos  from current_month), 0),
    'receita_prev',  coalesce((select receita_total from prev_month),    0),
    'caixa_entradas',coalesce((select entradas_total from caixa_atual),  0),
    'caixa_saidas',  coalesce((select saidas_total   from caixa_atual),  0),
    'caixa_saldo',   coalesce((select saldo          from caixa_atual),  0),
    'proximas_entradas_30d', coalesce((select proximas_entradas from forecast_30), 0),
    'proximas_saidas_30d',   coalesce((select proximas_saidas   from forecast_30), 0),
    'qtd_recebimentos_30d',  coalesce((select qtd_recebimentos  from forecast_30), 0),
    'qtd_pagamentos_30d',    coalesce((select qtd_pagamentos    from forecast_30), 0),
    'inadimplencia_qtd',     coalesce((select qtd from inadimplentes),    0),
    'inadimplencia_valor',   coalesce((select valor_total from inadimplentes), 0)
  ) into v_result;
  return v_result;
end $$;
