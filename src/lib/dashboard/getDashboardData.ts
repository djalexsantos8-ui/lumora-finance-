import { createClient } from '@/lib/supabase/server'
import { buildPaymentReminders } from '@/types/job'
import type { Job } from '@/types/job'
import type { Budget } from '@/types/budget'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MonthlySeries {
  month:    string
  received: number
  expenses: number
  result:   number
}

export interface JobStatusCount {
  status: string
  label:  string
  count:  number
}

export interface CategoryBreakdown {
  category: string
  label:    string
  value:    number
  count:    number
  pct:      number
}

export interface PipelineItem {
  status: string
  label:  string
  count:  number
}

export interface InstallmentItem {
  id:          string
  description: string
  index:       number
  total:       number
  amount:      number
  currency:    string
  dueDate:     string | null
}

export interface AutoInsight {
  type:    'positive' | 'negative' | 'neutral'
  label:   string
  value:   string
  detail?: string
}

export interface DashboardData {
  // ── Top-level summary KPIs ────────────────────────────────────────────────
  summary: {
    faturamentoTotal:  number   // all-time revenue from job_payments
    ticketMedio:       number   // avg revenue_total per non-cancelled job
    receitaLiquida:    number   // received_month - expenses_month - fixed_month
    margemPct:         number   // receitaLiquida / receivedMonth * 100
  }
  // ── Visão Geral ───────────────────────────────────────────────────────────
  overview: {
    receivedMonth:    number
    toReceive:        number
    expensesMonth:    number
    fixedMonth:       number
    netResult:        number
    monthlySeries:    MonthlySeries[]
    jobStatusCounts:  JobStatusCount[]
    alerts:           ReturnType<typeof buildPaymentReminders>
  }
  // ── Comercial ─────────────────────────────────────────────────────────────
  commercial: {
    budgetsMonth:      number
    approvalRate:      number
    avgTicket:         number
    awaitingResponse:  number
    pipeline:          PipelineItem[]
    revenueByCategory: CategoryBreakdown[]
    leadSources:       { source: string; count: number; revenue: number; pct: number }[]
  }
  // ── Financeiro ────────────────────────────────────────────────────────────
  financial: {
    variableExpenses:    number
    fixedCosts:          number
    pendingInstallments: number
    deductibleTotal:     number
    expensesByCategory:  CategoryBreakdown[]
    fixedCostsList:      { id: string; description: string; category: string; amount: number; currency: string }[]
    installmentsList:    InstallmentItem[]
  }
  // ── Insights ──────────────────────────────────────────────────────────────
  insights: AutoInsight[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PT_MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

const JOB_CATEGORY_LABELS: Record<string, string> = {
  wedding:     'Casamento',
  corporate:   'Corporativo',
  social:      'Social',
  documentary: 'Documentário',
  other:       'Outros',
}

const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  food:      'Alimentação',
  transport: 'Transporte',
  equipment: 'Equipamento',
  software:  'Software',
  marketing: 'Marketing',
  other:     'Outros',
}

const JOB_STATUS_LABELS: Record<string, string> = {
  in_progress:     'Em andamento',
  delivered:       'Entregue',
  pending_payment: 'Aguard. pgto',
  paid:            'Pago',
  cancelled:       'Cancelado',
}

const PIPELINE_LABELS: Record<string, string> = {
  draft:    'Rascunho',
  sent:     'Enviado',
  approved: 'Aprovado',
  rejected: 'Recusado',
  expired:  'Expirado',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function monthBounds(ref: Date): { start: string; end: string } {
  const y = ref.getFullYear(), m = ref.getMonth()
  return {
    start: new Date(y, m, 1).toLocaleDateString('en-CA'),
    end:   new Date(y, m + 1, 0).toLocaleDateString('en-CA'),
  }
}

function normalize(s: string | null | undefined): string {
  return s?.trim().toLowerCase() || 'other'
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function getDashboardData(
  workspaceId: string,
  ref: Date = new Date()
): Promise<DashboardData> {
  const supabase = await createClient()
  const { start, end } = monthBounds(ref)
  const today = ref.toLocaleDateString('en-CA')

  // ── 5 parallel queries ────────────────────────────────────────────────────
  const [jobsRes, paymentsRes, budgetsRes, expensesRes, fixedCostsRes] = await Promise.all([
    supabase
      .from('jobs')
      .select('id,title,client_name,category,status,revenue_total,cost_total,amount_paid,total_value,payment_due_date,currency,lead_source,client_segment,budget_id,deleted_at')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null),

    supabase
      .from('job_payments')
      .select('job_id,amount,currency,received_at'),

    supabase
      .from('budgets')
      .select('id,status,total,margin_amount,created_at,sent_at,approved_at,deleted_at')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null),

    supabase
      .from('expenses')
      .select('id,description,category,amount,amount_brl,currency,expense_date,is_deductible,is_installment,installments_total,installment_index,is_paid,deleted_at')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null),

    supabase
      .from('fixed_costs')
      .select('id,description,category,amount,amount_brl,currency,is_active,is_recurring,is_installment,installments_total,installment_index,is_paid,is_deductible,start_date,last_paid_date,deleted_at')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null),
  ])

  const jobs       = (jobsRes.data      ?? []) as Job[]
  const payments   = paymentsRes.data   ?? []
  const budgets    = (budgetsRes.data   ?? []) as Budget[]
  const expenses   = expensesRes.data   ?? []
  const fixedCosts = fixedCostsRes.data ?? []

  // ── Derived base values ───────────────────────────────────────────────────

  const activeJobs = jobs.filter(j => j.status !== 'cancelled')

  const receivedMonth = payments
    .filter(p => p.received_at >= start && p.received_at <= end)
    .reduce((s, p) => s + Number(p.amount), 0)

  const expensesMonth = expenses
    .filter(e => e.expense_date >= start && e.expense_date <= end)
    .reduce((s, e) => s + Number(e.amount_brl ?? e.amount), 0)

  const fixedMonth = fixedCosts
    .filter(f => f.is_active && f.is_recurring)
    .reduce((s, f) => s + Number(f.amount_brl ?? f.amount), 0)

  const toReceive = activeJobs.reduce((s, j) => {
    const total = Number(j.revenue_total || j.total_value) + Number(j.cost_total)
    return s + Math.max(0, total - Number(j.amount_paid))
  }, 0)

  const netResult = receivedMonth - expensesMonth - fixedMonth

  // ── Summary KPIs ──────────────────────────────────────────────────────────

  const faturamentoTotal = payments.reduce((s, p) => s + Number(p.amount), 0)

  const ticketMedio = activeJobs.length > 0
    ? Math.round(activeJobs.reduce((s, j) => s + Number(j.revenue_total || j.total_value), 0) / activeJobs.length * 100) / 100
    : 0

  const receitaLiquida = netResult

  const margemPct = receivedMonth > 0
    ? Math.round((receitaLiquida / receivedMonth) * 1000) / 10
    : 0

  // ── Monthly series (6 months) — received + expenses + result ─────────────

  const monthKeys: string[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1)
    monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const receivedByMonth = new Map<string, number>()
  const expensesByMonth = new Map<string, number>()
  for (const k of monthKeys) { receivedByMonth.set(k, 0); expensesByMonth.set(k, 0) }

  for (const p of payments) {
    const k = p.received_at?.slice(0, 7)
    if (k && receivedByMonth.has(k)) receivedByMonth.set(k, (receivedByMonth.get(k) ?? 0) + Number(p.amount))
  }
  for (const e of expenses) {
    const k = e.expense_date?.slice(0, 7)
    if (k && expensesByMonth.has(k)) expensesByMonth.set(k, (expensesByMonth.get(k) ?? 0) + Number(e.amount_brl ?? e.amount))
  }

  const monthlySeries: MonthlySeries[] = monthKeys.map(k => {
    const [y, m] = k.split('-').map(Number)
    const rec = receivedByMonth.get(k) ?? 0
    const exp = expensesByMonth.get(k) ?? 0
    return {
      month:    PT_MONTHS[m - 1] ?? k,
      received: Math.round(rec * 100) / 100,
      expenses: Math.round((exp + fixedMonth) * 100) / 100,
      result:   Math.round((rec - exp - fixedMonth) * 100) / 100,
    }
  })

  // ── Job status counts ─────────────────────────────────────────────────────

  const statusOrder = ['in_progress', 'pending_payment', 'delivered', 'paid', 'cancelled']
  const statusMap = new Map<string, number>()
  for (const j of jobs) statusMap.set(j.status, (statusMap.get(j.status) ?? 0) + 1)
  const jobStatusCounts: JobStatusCount[] = statusOrder
    .filter(s => (statusMap.get(s) ?? 0) > 0)
    .map(s => ({ status: s, label: JOB_STATUS_LABELS[s] ?? s, count: statusMap.get(s)! }))

  // ── Revenue by category (with % and count) ────────────────────────────────

  const revCatMap = new Map<string, { value: number; count: number }>()
  for (const j of activeJobs) {
    const cat = normalize(j.category) || 'other'
    const cur = revCatMap.get(cat) ?? { value: 0, count: 0 }
    revCatMap.set(cat, { value: cur.value + Number(j.revenue_total || j.total_value), count: cur.count + 1 })
  }
  const totalRevCat = [...revCatMap.values()].reduce((s, v) => s + v.value, 0)
  const revenueByCategory: CategoryBreakdown[] = [...revCatMap.entries()]
    .filter(([, v]) => v.value > 0)
    .sort((a, b) => b[1].value - a[1].value)
    .map(([cat, { value, count }]) => ({
      category: cat,
      label:    JOB_CATEGORY_LABELS[cat] ?? cat,
      value:    Math.round(value * 100) / 100,
      count,
      pct:      totalRevCat > 0 ? Math.round((value / totalRevCat) * 1000) / 10 : 0,
    }))

  // ── Commercial ────────────────────────────────────────────────────────────

  const budgetsMonth   = budgets.filter(b => b.created_at >= start).length
  const considered     = budgets.filter(b => ['sent','approved','rejected'].includes(b.status))
  const approvedBudg   = budgets.filter(b => b.status === 'approved')
  const approvalRate   = considered.length > 0 ? Math.round((approvedBudg.length / considered.length) * 100) : 0
  const avgTicket      = approvedBudg.length > 0
    ? Math.round(approvedBudg.reduce((s, b) => s + Number(b.total), 0) / approvedBudg.length * 100) / 100
    : 0
  const awaitingResponse = budgets.filter(b => b.status === 'sent').length

  const pipelineOrder = ['draft','sent','approved','rejected','expired']
  const pipelineMap   = new Map<string, number>()
  for (const b of budgets) pipelineMap.set(b.status, (pipelineMap.get(b.status) ?? 0) + 1)
  const pipeline: PipelineItem[] = pipelineOrder.map(s => ({
    status: s,
    label:  PIPELINE_LABELS[s] ?? s,
    count:  pipelineMap.get(s) ?? 0,
  }))

  // ── Lead sources ──────────────────────────────────────────────────────────

  const leadMap = new Map<string, { count: number; revenue: number }>()
  for (const j of activeJobs) {
    const src = j.lead_source?.trim()
    if (!src) continue
    const key = src.toLowerCase()
    const cur = leadMap.get(key) ?? { count: 0, revenue: 0 }
    leadMap.set(key, { count: cur.count + 1, revenue: cur.revenue + Number(j.revenue_total || j.total_value) })
  }
  const totalLeadRev = [...leadMap.values()].reduce((s, v) => s + v.revenue, 0)
  const leadSources = [...leadMap.entries()]
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 6)
    .map(([source, { count, revenue }]) => ({
      source:  source.charAt(0).toUpperCase() + source.slice(1),
      count,
      revenue: Math.round(revenue * 100) / 100,
      pct:     totalLeadRev > 0 ? Math.round((revenue / totalLeadRev) * 1000) / 10 : 0,
    }))

  // ── Financial ─────────────────────────────────────────────────────────────

  const expCatMap = new Map<string, { value: number; count: number }>()
  for (const e of expenses.filter(e => e.expense_date >= start && e.expense_date <= end)) {
    const cat = normalize(e.category) || 'other'
    const cur = expCatMap.get(cat) ?? { value: 0, count: 0 }
    expCatMap.set(cat, { value: cur.value + Number(e.amount_brl ?? e.amount), count: cur.count + 1 })
  }
  const totalExpCat = [...expCatMap.values()].reduce((s, v) => s + v.value, 0)
  const expensesByCategory: CategoryBreakdown[] = [...expCatMap.entries()]
    .filter(([, v]) => v.value > 0)
    .sort((a, b) => b[1].value - a[1].value)
    .map(([cat, { value, count }]) => ({
      category: cat,
      label:    EXPENSE_CATEGORY_LABELS[cat] ?? cat,
      value:    Math.round(value * 100) / 100,
      count,
      pct:      totalExpCat > 0 ? Math.round((value / totalExpCat) * 1000) / 10 : 0,
    }))

  const pendingInstallments =
    expenses.filter(e => e.is_installment && !e.is_paid).reduce((s, e) => s + Number(e.amount_brl ?? e.amount), 0) +
    fixedCosts.filter(f => f.is_installment && !f.is_paid).reduce((s, f) => s + Number(f.amount_brl ?? f.amount), 0)

  const deductibleTotal =
    expenses.filter(e => e.is_deductible && e.expense_date >= start && e.expense_date <= end).reduce((s, e) => s + Number(e.amount_brl ?? e.amount), 0) +
    fixedCosts.filter(f => f.is_active && f.is_deductible).reduce((s, f) => s + Number(f.amount_brl ?? f.amount), 0)

  const fixedCostsList = fixedCosts
    .filter(f => f.is_active && f.is_recurring)
    .sort((a, b) => Number(b.amount_brl ?? b.amount) - Number(a.amount_brl ?? a.amount))
    .slice(0, 8)
    .map(f => ({ id: f.id, description: f.description, category: f.category, amount: Number(f.amount_brl ?? f.amount), currency: f.currency }))

  const installmentsList = [
    ...fixedCosts.filter(f => f.is_installment && !f.is_paid).map(f => ({
      id: f.id, description: f.description, index: f.installment_index ?? 1,
      total: f.installments_total ?? 1, amount: Number(f.amount_brl ?? f.amount),
      currency: f.currency, dueDate: f.start_date,
    })),
    ...expenses.filter(e => e.is_installment && !e.is_paid).map(e => ({
      id: e.id, description: e.description, index: e.installment_index ?? 1,
      total: e.installments_total ?? 1, amount: Number(e.amount_brl ?? e.amount),
      currency: e.currency, dueDate: e.expense_date,
    })),
  ].sort((a, b) => (a.dueDate ?? '') < (b.dueDate ?? '') ? -1 : 1).slice(0, 5)

  // ── Auto insights ─────────────────────────────────────────────────────────

  const insights: AutoInsight[] = []

  // Best revenue category
  if (revenueByCategory[0]) {
    insights.push({
      type:   'positive',
      label:  'Categoria mais lucrativa',
      value:  revenueByCategory[0].label,
      detail: `${revenueByCategory[0].pct}% da receita total`,
    })
  }

  // Best lead source
  if (leadSources[0]) {
    insights.push({
      type:   'positive',
      label:  'Melhor origem de lead',
      value:  leadSources[0].source,
      detail: `${leadSources[0].count} job${leadSources[0].count !== 1 ? 's' : ''} · ${leadSources[0].pct}% da receita`,
    })
  }

  // Highest expense category
  if (expensesByCategory[0]) {
    insights.push({
      type:   'negative',
      label:  'Maior custo do mês',
      value:  expensesByCategory[0].label,
      detail: `${expensesByCategory[0].pct}% das despesas`,
    })
  }

  // Net result health
  if (receitaLiquida > 0) {
    insights.push({
      type:   'positive',
      label:  'Resultado do mês',
      value:  margemPct > 0 ? `Margem de ${margemPct}%` : 'Positivo',
      detail: 'Receita cobre todos os custos',
    })
  } else if (receivedMonth > 0) {
    insights.push({
      type:   'negative',
      label:  'Resultado do mês',
      value:  'Resultado negativo',
      detail: 'Saídas superam o recebido no mês',
    })
  }

  // High pending installments
  if (pendingInstallments > fixedMonth * 2) {
    insights.push({
      type:   'neutral',
      label:  'Atenção — parcelas',
      value:  'Alto volume parcelado',
      detail: 'Parcelas comprometem caixa futuro',
    })
  }

  return {
    summary: { faturamentoTotal, ticketMedio, receitaLiquida, margemPct },
    overview: { receivedMonth, toReceive, expensesMonth, fixedMonth, netResult, monthlySeries, jobStatusCounts, alerts: buildPaymentReminders(jobs, today) },
    commercial: { budgetsMonth, approvalRate, avgTicket, awaitingResponse, pipeline, revenueByCategory, leadSources },
    financial: { variableExpenses: expensesMonth, fixedCosts: fixedMonth, pendingInstallments, deductibleTotal, expensesByCategory, fixedCostsList, installmentsList },
    insights,
  }
}
