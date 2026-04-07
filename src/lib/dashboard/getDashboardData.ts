import { createClient } from '@/lib/supabase/server'
import { buildPaymentReminders } from '@/types/job'
import type { Job } from '@/types/job'
import type { Budget } from '@/types/budget'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MonthlySeries {
  month: string   // "Jan", "Fev", ...
  value: number
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

export interface DashboardData {
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
  commercial: {
    budgetsMonth:      number
    approvalRate:      number        // 0–100
    avgTicket:         number
    awaitingResponse:  number
    pipeline:          PipelineItem[]
    revenueByCategory: CategoryBreakdown[]
    leadSources:       { source: string; count: number; revenue: number }[]
  }
  financial: {
    variableExpenses:    number
    fixedCosts:          number
    pendingInstallments: number
    deductibleTotal:     number
    expensesByCategory:  CategoryBreakdown[]
    fixedCostsList:      { id: string; description: string; category: string; amount: number; currency: string }[]
    installmentsList:    InstallmentItem[]
  }
}

// ─── Month helpers ────────────────────────────────────────────────────────────

function currentMonthBounds(ref: Date = new Date()): { start: string; end: string } {
  const y = ref.getFullYear()
  const m = ref.getMonth()
  const start = new Date(y, m, 1).toLocaleDateString('en-CA')
  const end   = new Date(y, m + 1, 0).toLocaleDateString('en-CA')
  return { start, end }
}

const PT_MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

function monthLabel(y: number, m: number): string {
  return PT_MONTHS[m] ?? String(m + 1)
}

function normalizeText(s: string | null | undefined): string {
  if (!s) return 'outros'
  return s.trim().toLowerCase()
}

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

// ─── Main function ────────────────────────────────────────────────────────────

export async function getDashboardData(
  workspaceId: string,
  ref: Date = new Date()
): Promise<DashboardData> {
  const supabase = await createClient()
  const { start, end } = currentMonthBounds(ref)
  const today = ref.toLocaleDateString('en-CA')

  // ── Parallel queries ──────────────────────────────────────────────────────

  const [
    jobsRes,
    paymentsRes,
    budgetsRes,
    expensesRes,
    fixedCostsRes,
  ] = await Promise.all([
    supabase
      .from('jobs')
      .select('id,title,client_name,category,status,revenue_total,cost_total,amount_paid,total_value,payment_due_date,currency,lead_source,client_segment,budget_id,deleted_at')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null),

    // job_payments has no workspace_id — RLS restricts via jobs.workspace_id
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

  const jobs      = (jobsRes.data      ?? []) as Job[]
  const payments  = paymentsRes.data   ?? []
  const budgets   = (budgetsRes.data   ?? []) as Budget[]
  const expenses  = expensesRes.data   ?? []
  const fixedCosts = fixedCostsRes.data ?? []

  // ── Overview ──────────────────────────────────────────────────────────────

  // Received this month
  const receivedMonth = payments
    .filter(p => p.received_at >= start && p.received_at <= end)
    .reduce((s, p) => s + Number(p.amount), 0)

  // Total to receive (active jobs — not cancelled)
  const toReceive = jobs
    .filter(j => j.status !== 'cancelled')
    .reduce((s, j) => {
      const total = Number(j.revenue_total || j.total_value) + Number(j.cost_total)
      return s + Math.max(0, total - Number(j.amount_paid))
    }, 0)

  // Expenses this month
  const expensesMonth = expenses
    .filter(e => e.expense_date >= start && e.expense_date <= end)
    .reduce((s, e) => s + Number(e.amount_brl ?? e.amount), 0)

  // Active recurring fixed costs (monthly commitment)
  const fixedMonth = fixedCosts
    .filter(f => f.is_active && f.is_recurring)
    .reduce((s, f) => s + Number(f.amount_brl ?? f.amount), 0)

  const netResult = receivedMonth - expensesMonth - fixedMonth

  // Monthly series — last 6 months
  const monthlySeries: MonthlySeries[] = (() => {
    const map = new Map<string, number>()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      map.set(key, 0)
    }
    for (const p of payments) {
      const key = p.received_at?.slice(0, 7)
      if (key && map.has(key)) map.set(key, (map.get(key) ?? 0) + Number(p.amount))
    }
    return [...map.entries()].map(([key, value]) => {
      const [y, m] = key.split('-').map(Number)
      return { month: monthLabel(y, m - 1), value: Math.round(value * 100) / 100 }
    })
  })()

  // Job status counts (exclude cancelled from the active view)
  const statusOrder = ['in_progress', 'pending_payment', 'delivered', 'paid', 'cancelled']
  const statusMap = new Map<string, number>()
  for (const j of jobs) statusMap.set(j.status, (statusMap.get(j.status) ?? 0) + 1)
  const jobStatusCounts: JobStatusCount[] = statusOrder
    .filter(s => (statusMap.get(s) ?? 0) > 0)
    .map(s => ({ status: s, label: JOB_STATUS_LABELS[s] ?? s, count: statusMap.get(s)! }))

  // Alerts
  const alerts = buildPaymentReminders(jobs, today)

  // ── Commercial ────────────────────────────────────────────────────────────

  const budgetsMonth = budgets.filter(b => b.created_at >= start).length

  const considered = budgets.filter(b => ['sent', 'approved', 'rejected'].includes(b.status))
  const approved   = budgets.filter(b => b.status === 'approved')
  const approvalRate = considered.length > 0
    ? Math.round((approved.length / considered.length) * 100)
    : 0

  const avgTicket = approved.length > 0
    ? Math.round(approved.reduce((s, b) => s + Number(b.total), 0) / approved.length * 100) / 100
    : 0

  const awaitingResponse = budgets.filter(b => b.status === 'sent').length

  const pipelineOrder = ['draft', 'sent', 'approved', 'rejected', 'expired']
  const pipelineMap = new Map<string, number>()
  for (const b of budgets) pipelineMap.set(b.status, (pipelineMap.get(b.status) ?? 0) + 1)
  const pipeline: PipelineItem[] = pipelineOrder.map(s => ({
    status: s,
    label: PIPELINE_LABELS[s] ?? s,
    count: pipelineMap.get(s) ?? 0,
  }))

  // Revenue by job category (all-time, not cancelled)
  const revCatMap = new Map<string, number>()
  for (const j of jobs.filter(j => j.status !== 'cancelled')) {
    const cat = normalizeText(j.category) || 'other'
    revCatMap.set(cat, (revCatMap.get(cat) ?? 0) + Number(j.revenue_total || j.total_value))
  }
  const revenueByCategory: CategoryBreakdown[] = [...revCatMap.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, value]) => ({
      category: cat,
      label: JOB_CATEGORY_LABELS[cat] ?? cat,
      value: Math.round(value * 100) / 100,
    }))

  // Lead sources (top 6, jobs not cancelled)
  const leadMap = new Map<string, { count: number; revenue: number }>()
  for (const j of jobs.filter(j => j.status !== 'cancelled')) {
    const src = j.lead_source?.trim() || null
    if (!src) continue
    const key = src.toLowerCase()
    const cur = leadMap.get(key) ?? { count: 0, revenue: 0 }
    leadMap.set(key, {
      count:   cur.count + 1,
      revenue: cur.revenue + Number(j.revenue_total || j.total_value),
    })
  }
  const leadSources = [...leadMap.entries()]
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 6)
    .map(([source, { count, revenue }]) => ({
      source: source.charAt(0).toUpperCase() + source.slice(1),
      count,
      revenue: Math.round(revenue * 100) / 100,
    }))

  // ── Financial ─────────────────────────────────────────────────────────────

  const variableExpenses = expensesMonth

  // Expenses by category (this month)
  const expCatMap = new Map<string, number>()
  for (const e of expenses.filter(e => e.expense_date >= start && e.expense_date <= end)) {
    const cat = normalizeText(e.category) || 'other'
    expCatMap.set(cat, (expCatMap.get(cat) ?? 0) + Number(e.amount_brl ?? e.amount))
  }
  const expensesByCategory: CategoryBreakdown[] = [...expCatMap.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, value]) => ({
      category: cat,
      label: EXPENSE_CATEGORY_LABELS[cat] ?? cat,
      value: Math.round(value * 100) / 100,
    }))

  // Pending installments — expenses
  const pendingExpInstallments = expenses
    .filter(e => e.is_installment && !e.is_paid)
    .reduce((s, e) => s + Number(e.amount_brl ?? e.amount), 0)

  // Pending installments — fixed costs
  const pendingFixedInstallments = fixedCosts
    .filter(f => f.is_installment && !f.is_paid)
    .reduce((s, f) => s + Number(f.amount_brl ?? f.amount), 0)

  const pendingInstallments = pendingExpInstallments + pendingFixedInstallments

  // Deductible total this month (expenses + fixed costs)
  const deductibleExpenses = expenses
    .filter(e => e.is_deductible && e.expense_date >= start && e.expense_date <= end)
    .reduce((s, e) => s + Number(e.amount_brl ?? e.amount), 0)
  const deductibleFixed = fixedCosts
    .filter(f => f.is_active && f.is_deductible)
    .reduce((s, f) => s + Number(f.amount_brl ?? f.amount), 0)
  const deductibleTotal = deductibleExpenses + deductibleFixed

  // Active recurring fixed costs list (top 8)
  const fixedCostsList = fixedCosts
    .filter(f => f.is_active && f.is_recurring)
    .sort((a, b) => Number(b.amount_brl ?? b.amount) - Number(a.amount_brl ?? a.amount))
    .slice(0, 8)
    .map(f => ({
      id:          f.id,
      description: f.description,
      category:    f.category,
      amount:      Number(f.amount_brl ?? f.amount),
      currency:    f.currency,
    }))

  // Pending installments list (fixed costs + expenses) — next 5
  const installmentsList: InstallmentItem[] = [
    ...fixedCosts
      .filter(f => f.is_installment && !f.is_paid)
      .map(f => ({
        id:          f.id,
        description: f.description,
        index:       f.installment_index ?? 1,
        total:       f.installments_total ?? 1,
        amount:      Number(f.amount_brl ?? f.amount),
        currency:    f.currency,
        dueDate:     f.start_date,
      })),
    ...expenses
      .filter(e => e.is_installment && !e.is_paid)
      .map(e => ({
        id:          e.id,
        description: e.description,
        index:       e.installment_index ?? 1,
        total:       e.installments_total ?? 1,
        amount:      Number(e.amount_brl ?? e.amount),
        currency:    e.currency,
        dueDate:     e.expense_date,
      })),
  ]
    .sort((a, b) => (a.dueDate ?? '') < (b.dueDate ?? '') ? -1 : 1)
    .slice(0, 5)

  return {
    overview: {
      receivedMonth,
      toReceive,
      expensesMonth,
      fixedMonth,
      netResult,
      monthlySeries,
      jobStatusCounts,
      alerts,
    },
    commercial: {
      budgetsMonth,
      approvalRate,
      avgTicket,
      awaitingResponse,
      pipeline,
      revenueByCategory,
      leadSources,
    },
    financial: {
      variableExpenses,
      fixedCosts: fixedMonth,
      pendingInstallments,
      deductibleTotal,
      expensesByCategory,
      fixedCostsList,
      installmentsList,
    },
  }
}
