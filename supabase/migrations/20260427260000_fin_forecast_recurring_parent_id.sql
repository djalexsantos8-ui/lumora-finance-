-- R01-DASH-CARDS-NAVIGATE: ajusta fin_forecast pra retornar recurring_revenue_id
-- (id da recorrência mãe) ao invés de rri.id (id da invoice mensal) no caso
-- de fonte='recurring'. Isso permite navegação direta pra /receitas-recorrentes/[id].
-- Outros campos (data, valor, status) continuam vindo da invoice.

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
    select j.payment_due_date as data, 'a_receber'::text as tipo, 'job'::text as fonte, j.id as ref_id,
      coalesce(j.title, j.client_name, 'Job sem título')::text as ref_label,
      coalesce(j.client_name, '—')::text as cliente,
      (coalesce(j.revenue_total, j.total_value, 0) - coalesce(j.amount_paid, 0))::numeric as valor,
      coalesce(j.status::text, 'pending')::text as status,
      (j.payment_due_date - current_date)::int as dias_para_data
    from public.jobs j
    where j.workspace_id = p_workspace_id and j.deleted_at is null
      and j.payment_due_date is not null and j.payment_due_date <= v_horizon
      and (coalesce(j.revenue_total, j.total_value, 0) - coalesce(j.amount_paid, 0)) > 0

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

    -- recurring: ref_id agora é o ID da recorrência mãe (recurring_revenue_id),
    -- pra permitir navegação direta para /receitas-recorrentes/[id]
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
