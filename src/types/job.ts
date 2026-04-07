// ─── Status operacional ───────────────────────────────────────────────────────
export type JobStatus =
  | 'in_progress'
  | 'delivered'
  | 'pending_payment'
  | 'paid'
  | 'cancelled'

export type JobType = 'freelance' | 'project' | 'recurring'

export type PaymentCondition = 'upfront' | '7d' | '15d' | '30d' | '60d' | '90d'

export type JobCategory =
  | 'wedding'
  | 'corporate'
  | 'social'
  | 'documentary'
  | 'other'

// ─── Categoria de custo de projeto ───────────────────────────────────────────
export type JobCostCategory =
  | 'equipment_rental'
  | 'team'
  | 'travel'
  | 'accommodation'
  | 'food'
  | 'software'
  | 'other'

export const JOB_COST_CATEGORY_LABELS: Record<JobCostCategory, string> = {
  equipment_rental: 'Aluguel de gear',
  team:             'Equipe',
  travel:           'Deslocamento',
  accommodation:    'Hospedagem',
  food:             'Alimentação',
  software:         'Software',
  other:            'Outros',
}

// ─── Status de pagamento derivado ────────────────────────────────────────────
export type PaymentStatus = 'unpaid' | 'partial' | 'paid'

// ─── Job ──────────────────────────────────────────────────────────────────────
export interface Job {
  id:                string
  workspace_id:      string
  created_by:        string
  title:             string
  client_name:       string
  client_email:      string | null
  category:          JobCategory | null
  job_type:          JobType
  total_value:       number   // legado — mantido para compatibilidade na listagem
  revenue_total:     number   // fonte da verdade: soma de job_revenue_items
  cost_total:        number   // fonte da verdade: soma de job_cost_items
  currency:          string
  payment_condition: PaymentCondition
  job_date:          string
  payment_due_date:  string
  status:            JobStatus
  amount_paid:       number
  notes:             string | null
  budget_id:         string | null
  deleted_at:        string | null
  created_at:        string
  updated_at:        string
}

// ─── Item de receita ──────────────────────────────────────────────────────────
export interface JobRevenueItem {
  id:          string
  job_id:      string
  description: string
  quantity:    number
  unit_value:  number
  total_value: number
  sort_order:  number
  deleted_at:  string | null
  created_at:  string
}

// ─── Item de custo ────────────────────────────────────────────────────────────
export interface JobCostItem {
  id:          string
  job_id:      string
  description: string
  category:    JobCostCategory
  quantity:    number
  unit_value:  number
  total_value: number
  sort_order:  number
  deleted_at:  string | null
  created_at:  string
}

// ─── Pagamento individual ────────────────────────────────────────────────────
export interface JobPayment {
  id:          string
  job_id:      string
  amount:      number
  currency:    string
  received_at: string
  notes:       string | null
  created_at:  string
}

// ─── Job completo (para tela de detalhe) ─────────────────────────────────────
export interface JobWithItems extends Job {
  revenueItems: JobRevenueItem[]
  costItems:    JobCostItem[]
  payments:     JobPayment[]
}

// ─── Financeiro derivado (nunca armazenado) ───────────────────────────────────
export interface JobFinancials {
  revenue:    number  // revenue_total
  cost:       number  // cost_total
  profit:     number  // revenue - cost
  margin_pct: number  // (profit / revenue) * 100
  received:   number  // amount_paid
  due:        number  // revenue - amount_paid
}

export function calcJobFinancials(job: Pick<Job, 'revenue_total' | 'cost_total' | 'amount_paid'>): JobFinancials {
  const revenue    = Number(job.revenue_total)
  const cost       = Number(job.cost_total)
  const profit     = revenue - cost
  const margin_pct = revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : 0
  return {
    revenue,
    cost,
    profit,
    margin_pct,
    received: Number(job.amount_paid),
    due:      Math.max(0, revenue - Number(job.amount_paid)),
  }
}

// ─── Helpers legados (usados na listagem) ─────────────────────────────────────
export function getPaymentStatus(job: Pick<Job, 'amount_paid' | 'revenue_total' | 'total_value'>): PaymentStatus {
  const total = Number(job.revenue_total) || Number(job.total_value)
  if (Number(job.amount_paid) <= 0)      return 'unpaid'
  if (Number(job.amount_paid) >= total)  return 'paid'
  return 'partial'
}

export function getAmountDue(job: Pick<Job, 'amount_paid' | 'revenue_total' | 'total_value'>): number {
  const total = Number(job.revenue_total) || Number(job.total_value)
  return Math.max(0, total - Number(job.amount_paid))
}

// ─── Tipos de retorno das Server Actions ──────────────────────────────────────
export type JobActionResult =
  | { success: true;  data?: Job }
  | { success: false; error: string }

export type JobPaymentActionResult =
  | { success: true;  data?: JobPayment; job?: Job }
  | { success: false; error: string }

export type JobWithPaymentsResult =
  | { success: true;  data: JobWithItems }
  | { success: false; error: string }

export type JobItemActionResult =
  | { success: true;  data?: JobRevenueItem | JobCostItem; job?: Job }
  | { success: false; error: string }
