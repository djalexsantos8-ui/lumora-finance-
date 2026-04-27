-- ===========================================================================
-- Phase 6 — Camada de agregação financeira (DRE / Caixa / Forecast)
-- ===========================================================================
-- 4 RPCs SECURITY DEFINER que validam workspace via _fin_assert_workspace e
-- agregam V1 (jobs, orders, recurring_revenue) + V2 (budgets_v2 quando vier).
-- Idempotente via CREATE OR REPLACE. Não mexe em tabelas existentes nem RLS.
-- ===========================================================================

create or replace function public._fin_assert_workspace(p_workspace_id uuid)
returns void language plpgsql stable security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then
    raise exception 'unauthorized' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id and user_id = auth.uid() and status = 'active'
  ) and not exists (
    select 1 from public.admin_grants
    where user_id = auth.uid() and (expires_at is null or expires_at > now())
  ) then
    raise exception 'workspace_forbidden' using errcode = '42501';
  end if;
end $$;

-- ===========================================================================
-- 1) DRE em regime de competência
-- ===========================================================================
create or replace function public.fin_dre_competencia(
  p_workspace_id uuid,
  p_months int default 12
)
returns table (
  mes               date,
  receita_jobs      numeric,
  receita_orders    numeric,
  receita_recorrente numeric,
  receita_budgets_v2 numeric,
  receita_total     numeric,
  custo_direto      numeric,
  margem_bruta      numeric,
  margem_pct        numeric,
  qtd_projetos      int,
  ticket_medio      numeric
)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._fin_assert_workspace(p_workspace_id);

  return query
  with mes_serie as (
    select date_trunc('month', current_date)::date - (n || ' months')::interval as ref
    from generate_series(0, greatest(p_months - 1, 0)) n
  ),
  meses as (select ref::date as mes from mes_serie),
  jobs_per_mes as (
    select date_trunc('month', coalesce(j.job_date_start, j.job_date, j.created_at::date))::date as mes,
      sum(coalesce(j.revenue_total, j.total_value, 0)) as receita, count(*) as qtd
    from public.jobs j
    where j.workspace_id = p_workspace_id and j.deleted_at is null
    group by 1
  ),
  orders_per_mes as (
    select date_trunc('month', coalesce(o.event_date, o.order_date_start, o.order_date, o.created_at::date))::date as mes,
      sum(coalesce(o.revenue_total, o.amount, 0)) as receita, count(*) as qtd
    from public.orders o
    where o.workspace_id = p_workspace_id and o.deleted_at is null
    group by 1
  ),
  recurring_per_mes as (
    select make_date(rri.period_year, rri.period_month, 1) as mes,
      sum(coalesce(rri.amount, 0)) as receita, count(*) as qtd
    from public.recurring_revenue_invoices rri
    where rri.workspace_id = p_workspace_id and rri.deleted_at is null
      and rri.period_year is not null and rri.period_month is not null
    group by 1
  ),
  budgets_v2_per_mes as (
    select date_trunc('month', coalesce(b.start_date, b.created_at::date))::date as mes,
      sum(coalesce(b.total, 0)) as receita, count(*) as qtd
    from public.budgets_v2 b
    where b.workspace_id = p_workspace_id and b.status = 'converted'
    group by 1
  ),
  custos_per_mes as (
    select date_trunc('month', e.expense_date)::date as mes,
      sum(coalesce(e.amount_brl, e.amount, 0)) as custo
    from public.expenses e
    where e.workspace_id = p_workspace_id and e.deleted_at is null
      and e.expense_date is not null
    group by 1
  ),
  recurring_costs_per_mes as (
    select make_date(rri.period_year, rri.period_month, 1) as mes,
      sum(coalesce(rci.total_value, 0)) as custo
    from public.recurring_revenue_invoices rri
    join public.recurring_revenue rr on rr.id = rri.recurring_revenue_id
    join public.recurring_revenue_cost_items rci on rci.recurring_id = rr.id
    where rri.workspace_id = p_workspace_id and rri.deleted_at is null
      and rci.deleted_at is null
    group by 1
  ),
  consolidado as (
    select m.mes,
      coalesce(j.receita, 0)   as receita_jobs,
      coalesce(o.receita, 0)   as receita_orders,
      coalesce(r.receita, 0)   as receita_recorrente,
      coalesce(bv2.receita, 0) as receita_budgets_v2,
      (coalesce(j.receita, 0) + coalesce(o.receita, 0) + coalesce(r.receita, 0) + coalesce(bv2.receita, 0)) as receita_total,
      (coalesce(c.custo, 0) + coalesce(rc.custo, 0)) as custo_direto,
      (coalesce(j.qtd, 0) + coalesce(o.qtd, 0) + coalesce(r.qtd, 0) + coalesce(bv2.qtd, 0))::int as qtd_projetos
    from meses m
    left join jobs_per_mes              j   on j.mes   = m.mes
    left join orders_per_mes            o   on o.mes   = m.mes
    left join recurring_per_mes         r   on r.mes   = m.mes
    left join budgets_v2_per_mes        bv2 on bv2.mes = m.mes
    left join custos_per_mes            c   on c.mes   = m.mes
    left join recurring_costs_per_mes   rc  on rc.mes  = m.mes
  )
  select
    c.mes, c.receita_jobs, c.receita_orders, c.receita_recorrente, c.receita_budgets_v2,
    c.receita_total, c.custo_direto,
    (c.receita_total - c.custo_direto) as margem_bruta,
    case when c.receita_total > 0
      then round(100.0 * (c.receita_total - c.custo_direto) / c.receita_total, 2)
      else 0 end as margem_pct,
    c.qtd_projetos,
    case when c.qtd_projetos > 0 then round(c.receita_total / c.qtd_projetos, 2) else 0 end as ticket_medio
  from consolidado c
  order by c.mes desc;
end $$;

grant execute on function public.fin_dre_competencia(uuid, int) to authenticated;

-- ===========================================================================
-- 2) Caixa realizado
-- ===========================================================================
create or replace function public.fin_caixa_realizado(
  p_workspace_id uuid,
  p_months int default 12
)
returns table (
  mes              date,
  entradas_jobs    numeric,
  entradas_orders  numeric,
  entradas_recorrente numeric,
  entradas_total   numeric,
  saidas_variaveis numeric,
  saidas_fixas     numeric,
  saidas_total     numeric,
  saldo            numeric
)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._fin_assert_workspace(p_workspace_id);

  return query
  with mes_serie as (
    select date_trunc('month', current_date)::date - (n || ' months')::interval as ref
    from generate_series(0, greatest(p_months - 1, 0)) n
  ),
  meses as (select ref::date as mes from mes_serie),
  jobs_pay as (
    select date_trunc('month', jp.received_at)::date as mes, sum(coalesce(jp.amount, 0)) as v
    from public.job_payments jp
    join public.jobs j on j.id = jp.job_id
    where j.workspace_id = p_workspace_id and j.deleted_at is null
      and jp.received_at is not null
    group by 1
  ),
  orders_pay as (
    -- payment_status enum em pt-BR: {previsto, pago, cancelado}
    select date_trunc('month', op.paid_at)::date as mes, sum(coalesce(op.amount, 0)) as v
    from public.order_payments op
    where op.workspace_id = p_workspace_id and op.deleted_at is null
      and op.paid_at is not null and op.status::text = 'pago'
    group by 1
  ),
  rec_pay as (
    select date_trunc('month', rri.paid_at)::date as mes, sum(coalesce(rri.paid_amount, rri.amount, 0)) as v
    from public.recurring_revenue_invoices rri
    where rri.workspace_id = p_workspace_id and rri.deleted_at is null
      and rri.paid_at is not null
    group by 1
  ),
  exp_paid as (
    select date_trunc('month', coalesce(e.paid_at::date, e.expense_date))::date as mes,
      sum(coalesce(e.amount_brl, e.paid_amount, e.amount, 0)) as v
    from public.expenses e
    where e.workspace_id = p_workspace_id and e.deleted_at is null and e.is_paid = true
    group by 1
  ),
  fix_paid as (
    select date_trunc('month', coalesce(fc.paid_at::date, fc.last_paid_date, current_date))::date as mes,
      sum(coalesce(fc.amount_brl, fc.paid_amount, fc.amount, 0)) as v
    from public.fixed_costs fc
    where fc.workspace_id = p_workspace_id and fc.deleted_at is null and fc.is_paid = true
    group by 1
  ),
  consolidado as (
    select m.mes,
      coalesce(jp.v, 0) as entradas_jobs,
      coalesce(op.v, 0) as entradas_orders,
      coalesce(rp.v, 0) as entradas_recorrente,
      (coalesce(jp.v, 0) + coalesce(op.v, 0) + coalesce(rp.v, 0)) as entradas_total,
      coalesce(ep.v, 0) as saidas_variaveis,
      coalesce(fp.v, 0) as saidas_fixas,
      (coalesce(ep.v, 0) + coalesce(fp.v, 0)) as saidas_total
    from meses m
    left join jobs_pay   jp on jp.mes = m.mes
    left join orders_pay op on op.mes = m.mes
    left join rec_pay    rp on rp.mes = m.mes
    left join exp_paid   ep on ep.mes = m.mes
    left join fix_paid   fp on fp.mes = m.mes
  )
  select c.mes, c.entradas_jobs, c.entradas_orders, c.entradas_recorrente,
    c.entradas_total, c.saidas_variaveis, c.saidas_fixas, c.saidas_total,
    (c.entradas_total - c.saidas_total) as saldo
  from consolidado c
  order by c.mes desc;
end $$;

grant execute on function public.fin_caixa_realizado(uuid, int) to authenticated;

-- ===========================================================================
-- 3) Forecast — próximos N dias
-- ===========================================================================
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
  select j.payment_due_date, 'a_receber'::text, 'job'::text, j.id,
    coalesce(j.title, j.client_name, 'Job sem título')::text,
    coalesce(j.client_name, '—')::text,
    (coalesce(j.revenue_total, j.total_value, 0) - coalesce(j.amount_paid, 0))::numeric,
    coalesce(j.status::text, 'pending')::text,
    (j.payment_due_date - current_date)::int
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

  select rri.due_date, 'a_receber'::text, 'recurring'::text, rri.id,
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

  order by data asc;
end $$;

grant execute on function public.fin_forecast(uuid, int) to authenticated;

-- ===========================================================================
-- 4) Resumo header (1 row JSON)
-- ===========================================================================
create or replace function public.fin_summary(p_workspace_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_result jsonb;
begin
  perform public._fin_assert_workspace(p_workspace_id);

  with current_month as (
    select * from public.fin_dre_competencia(p_workspace_id, 1) limit 1
  ),
  prev_month as (
    select * from public.fin_dre_competencia(p_workspace_id, 2) offset 1 limit 1
  ),
  caixa_atual as (
    select * from public.fin_caixa_realizado(p_workspace_id, 1) limit 1
  ),
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
      select coalesce(j.revenue_total, j.total_value, 0) - coalesce(j.amount_paid, 0) as valor
      from public.jobs j
      where j.workspace_id = p_workspace_id and j.deleted_at is null
        and j.payment_due_date is not null and j.payment_due_date < current_date
        and (coalesce(j.revenue_total, j.total_value, 0) - coalesce(j.amount_paid, 0)) > 0
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

grant execute on function public.fin_summary(uuid) to authenticated;

comment on function public.fin_dre_competencia(uuid, int) is
  'Phase 6: DRE em regime de competência — receita por mês de execução. Une jobs+orders+recurring+budgets_v2.';
comment on function public.fin_caixa_realizado(uuid, int) is
  'Phase 6: Caixa realizado — entradas (job_payments+order_payments+rec_invoices.paid_at) e saídas (expenses+fixed_costs is_paid).';
comment on function public.fin_forecast(uuid, int) is
  'Phase 6: Forecast — próximos N dias com a receber e a pagar de todas as fontes.';
comment on function public.fin_summary(uuid) is
  'Phase 6: Resumo header com KPIs do mês corrente + alertas de inadimplência. JSON pronto pra dashboard.';
