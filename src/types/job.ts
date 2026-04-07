// ─── Status operacional do job ────────────────────────────────────────────────
// in_progress     → trabalho em execução
// delivered       → entregue, aguardando pagamento ou já pago
// pending_payment → vencido / cobrança ativa
// paid            → totalmente pago
// cancelled       → cancelado
export type JobStatus =
  | 'in_progress'
  | 'delivered'
  | 'pending_payment'
  | 'paid'
  | 'cancelled'

// ─── Tipo de trabalho (compatibilidade com schema v1) ─────────────────────────
export type JobType = 'freelance' | 'project' | 'recurring'

// ─── Condição de pagamento ────────────────────────────────────────────────────
export type PaymentCondition = 'upfront' | '7d' | '15d' | '30d' | '60d' | '90d'

// ─── Categoria de nicho ───────────────────────────────────────────────────────
export type JobCategory =
  | 'wedding'
  | 'corporate'
  | 'social'
  | 'documentary'
  | 'other'

// ─── Status de pagamento derivado (calculado, não armazenado) ─────────────────
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
  total_value:       number
  currency:          string
  payment_condition: PaymentCondition
  job_date:          string          // date ISO (YYYY-MM-DD)
  payment_due_date:  string          // date ISO — calculado por trigger
  status:            JobStatus
  amount_paid:       number          // cache — fonte da verdade é job_payments
  notes:             string | null
  budget_id:         string | null   // FK opcional para orçamento aprovado
  deleted_at:        string | null
  created_at:        string
  updated_at:        string
}

// ─── Pagamento individual ──────────────────────────────────────────────────────
export interface JobPayment {
  id:          string
  job_id:      string
  amount:      number
  currency:    string
  received_at: string  // date ISO
  notes:       string | null
  created_at:  string
}

// ─── Job com pagamentos carregados ────────────────────────────────────────────
export interface JobWithPayments extends Job {
  payments: JobPayment[]
}

// ─── Helpers derivados ────────────────────────────────────────────────────────
export function getPaymentStatus(job: Pick<Job, 'amount_paid' | 'total_value'>): PaymentStatus {
  if (job.amount_paid <= 0)                        return 'unpaid'
  if (job.amount_paid >= job.total_value)          return 'paid'
  return 'partial'
}

export function getAmountDue(job: Pick<Job, 'amount_paid' | 'total_value'>): number {
  return Math.max(0, job.total_value - job.amount_paid)
}

// ─── Tipos de retorno das Server Actions ──────────────────────────────────────
export type JobActionResult =
  | { success: true;  data?: Job }
  | { success: false; error: string }

export type JobPaymentActionResult =
  | { success: true;  data?: JobPayment; job?: Job }
  | { success: false; error: string }

export type JobWithPaymentsResult =
  | { success: true;  data: JobWithPayments }
  | { success: false; error: string }
