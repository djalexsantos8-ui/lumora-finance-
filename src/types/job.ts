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
  // Analytics (migration 014)
  job_date_start:    string | null   // YYYY-MM-DD — início do período
  job_date_end:      string | null   // YYYY-MM-DD — fim do período
  is_multi_day:      boolean         // true = período, false = 1 dia
  lead_source:       string | null   // Origem do lead (texto livre)
  client_segment:    string | null   // Segmento do cliente (texto livre)
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
  // Futuro (migration 006): URL do comprovante de pagamento do repasse.
  // Já tipado aqui para o PDF mostrar "Comprovante disponível" sem mudança de banco.
  receipt_url: string | null | undefined
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
//
// MODELO: total_job = serviços + repasses
//         due       = total_job - recebido
//
// Repasses são cobrados do cliente → fazem parte do total que ele deve pagar.
// "Lucro" aqui é somente informativo (revenue) — não é o ganho líquido real da
// empresa, pois custos operacionais próprios ainda não são modelados.
// Isso será corrigido na migration 006 com job_repass_items + job_cost_items.

export interface JobFinancials {
  revenue:    number  // revenue_total — serviços cobrados
  cost:       number  // cost_total — repasses cobrados do cliente
  total:      number  // revenue + cost — total que o cliente deve pagar
  profit:     number  // revenue (campo legado — repasses são pass-through)
  margin_pct: number  // (revenue / total) * 100 — % que é seu
  received:   number  // amount_paid
  due:        number  // total - received (correto)
}

export function calcJobFinancials(job: Pick<Job, 'revenue_total' | 'cost_total' | 'amount_paid'>): JobFinancials {
  const revenue  = Number(job.revenue_total)
  const cost     = Number(job.cost_total)
  const total    = revenue + cost
  const received = Number(job.amount_paid)
  return {
    revenue,
    cost,
    total,
    profit:     revenue,                                           // repasses são neutros
    margin_pct: total > 0 ? Math.round((revenue / total) * 1000) / 10 : 0,
    received,
    due:        Math.max(0, total - received),                    // ← corrigido
  }
}

// ─── Helpers (usados na listagem) ────────────────────────────────────────────
// total_job inclui repasses para refletir o que o cliente deve pagar.

export function getPaymentStatus(
  job: Pick<Job, 'amount_paid' | 'revenue_total' | 'cost_total' | 'total_value'>
): PaymentStatus {
  const base  = Number(job.revenue_total) || Number(job.total_value)
  const total = base + Number(job.cost_total)
  if (Number(job.amount_paid) <= 0)      return 'unpaid'
  if (Number(job.amount_paid) >= total)  return 'paid'
  return 'partial'
}

export function getAmountDue(
  job: Pick<Job, 'amount_paid' | 'revenue_total' | 'cost_total' | 'total_value'>
): number {
  const base  = Number(job.revenue_total) || Number(job.total_value)
  const total = base + Number(job.cost_total)
  return Math.max(0, total - Number(job.amount_paid))
}

// ─── Status de lembrete de cobrança ──────────────────────────────────────────
//
// Distinto de PaymentStatus (unpaid/partial/paid), que descreve o estado do
// pagamento em si. PaymentReminderStatus foca na urgência de cobrança.
//
// ─── isJobPending — jobs que exigem ação na listagem de notificações ──────────
//
// Um job é "pendente de ação" quando:
//   1. Status ainda é in_progress (não foi entregue, pago ou cancelado)
//   2. A data do job já chegou (passou ou é hoje) — jobs futuros não aparecem
//
// Multi-day: usa job_date_start como referência — se já iniciou, exige ação.
// Não usa job_date_end: mesmo terminado, enquanto status = in_progress há ação a tomar.
// Timezone: comparação YYYY-MM-DD (string) no fuso local, sem bug de UTC.

/**
 * Retorna true se o job exige ação nas notificações.
 *
 * Critérios:
 * - status `in_progress` (delivered/paid/cancelled = ação já tomada)
 * - data válida informada
 * - data já chegou (job_date <= hoje para single, job_date_start <= hoje para multi-day)
 *
 * @param today  Data de hoje como YYYY-MM-DD no fuso local (use todayISO()).
 */
export function isJobPending(
  job: Pick<Job, 'status' | 'is_multi_day' | 'job_date' | 'job_date_start'>,
  today: string
): boolean {
  if (job.status !== 'in_progress') return false

  if (!job.is_multi_day) {
    return !!job.job_date && job.job_date <= today
  }

  // Multi-day: pendente se já iniciou — inclui em andamento e os que já terminaram
  return !!job.job_date_start && job.job_date_start <= today
}

// ok        → sem valor pendente, ou job cancelado/pago
// pending   → tem valor a receber mas sem data de vencimento, ou ainda no prazo
// due_today → vence hoje
// overdue   → data de vencimento já passou

export type PaymentReminderStatus = 'ok' | 'pending' | 'due_today' | 'overdue'

/**
 * Retorna o status do lembrete de cobrança baseado na data de vencimento.
 *
 * @param todayISO  Data de hoje no formato YYYY-MM-DD (padrão: data local atual).
 *                  Aceita parâmetro externo para facilitar testes e SSR consistente.
 */
export function getPaymentReminderStatus(
  job: Pick<Job, 'amount_paid' | 'revenue_total' | 'cost_total' | 'total_value' | 'payment_due_date' | 'status'>,
  todayISO?: string
): PaymentReminderStatus {
  // Jobs cancelados ou totalmente pagos não precisam de lembrete
  if (job.status === 'cancelled' || job.status === 'paid') return 'ok'

  const due = getAmountDue(job)
  if (due <= 0) return 'ok'

  // Tem valor a receber, mas sem data definida → pending (sem urgência)
  if (!job.payment_due_date) return 'pending'

  // Data local (toLocaleDateString 'en-CA' = YYYY-MM-DD sem problemas de TZ)
  const today = todayISO ?? new Date().toLocaleDateString('en-CA')

  if (job.payment_due_date < today)  return 'overdue'
  if (job.payment_due_date === today) return 'due_today'
  return 'pending'
}

// ─── Estrutura de lembrete (Fase 3 — em memória, não persistida ainda) ────────
//
// Tipagem preparada para automação futura (email, push, cron job).
// Quando persistida, vai para tabela `payment_reminders` no banco.
// Campos: job_id, due_date, status, amount_due já cobrem o contrato mínimo
// necessário para disparo de notificação.

export interface PaymentReminder {
  job_id:       string
  job_title:    string
  client_name:  string
  due_date:     string   // YYYY-MM-DD
  amount_due:   number
  currency:     string
  status:       Exclude<PaymentReminderStatus, 'ok'>
  /** Positivo = dias de atraso. Negativo = dias restantes. Zero = vence hoje. */
  days_delta:   number
}

/**
 * Gera lembretes em memória a partir de uma lista de jobs.
 * Filtra apenas jobs com valor a receber e data de vencimento definida.
 * Ordena: overdue → due_today → pending.
 */
export function buildPaymentReminders(jobs: Job[], todayISO?: string): PaymentReminder[] {
  const today = todayISO ?? new Date().toLocaleDateString('en-CA')
  const [ty, tm, td] = today.split('-').map(Number)
  const todayMs = new Date(ty, tm - 1, td).getTime()

  return jobs
    .filter(j => j.status !== 'cancelled')
    .filter(j => getAmountDue(j) > 0 && j.payment_due_date)
    .map(j => {
      const status = getPaymentReminderStatus(j, today)
      if (status === 'ok') return null

      const [y, m, d] = j.payment_due_date!.split('-').map(Number)
      const dueMs    = new Date(y, m - 1, d).getTime()
      // positivo = já venceu (atraso), negativo = ainda falta, 0 = hoje
      const days_delta = Math.round((todayMs - dueMs) / 86_400_000)

      return {
        job_id:      j.id,
        job_title:   j.title || 'Job sem título',
        client_name: j.client_name || 'Cliente não informado',
        due_date:    j.payment_due_date!,
        amount_due:  getAmountDue(j),
        currency:    j.currency,
        status:      status as Exclude<PaymentReminderStatus, 'ok'>,
        days_delta,
      }
    })
    .filter((r): r is PaymentReminder => r !== null)
    .sort((a, b) => {
      const ORDER: Record<string, number> = { overdue: 0, due_today: 1, pending: 2 }
      return ORDER[a.status] - ORDER[b.status]
    })
}

// ─── Tipos de retorno das Server Actions ──────────────────────────────────────
export type JobActionResult =
  | { success: true;  data?: Job }
  | { success: false; message: string }

export type JobPaymentActionResult =
  | { success: true;  data?: JobPayment; job?: Job }
  | { success: false; message: string }

export type JobWithPaymentsResult =
  | { success: true;  data: JobWithItems }
  | { success: false; message: string }

export type JobItemActionResult =
  | { success: true;  data?: JobRevenueItem | JobCostItem; job?: Job }
  | { success: false; message: string }
