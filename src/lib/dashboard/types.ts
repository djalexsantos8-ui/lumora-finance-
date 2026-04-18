// ─── Dashboard Executivo — Tipos de domínio ───────────────────────────────────
//
// Camada de adaptação (Decisão de Produto — Nível 1):
//   UI vê "Freelance"; banco continua com "jobs".
//   Este arquivo expõe o vocabulário NOVO (Freelance*) e fornece adapters
//   para mapear do modelo antigo (Job) sem tocar nada existente.
//
// Tipos intencionalmente MÍNIMOS: só os campos que os agregadores consomem.
// Se um agregador novo precisar de mais campo, adicionar aqui e no adapter.

import type { Job, JobPayment } from '@/types/job'

// ─── Freelance ────────────────────────────────────────────────────────────────

export interface Freelance {
  id:                string
  client_name:       string
  status:            string              // mantido como string p/ não acoplar ao enum antigo
  revenue_total:     number
  cost_total:        number
  total_value:       number              // legado — fallback quando revenue_total = 0
  amount_paid:       number
  payment_due_date:  string | null       // YYYY-MM-DD
  currency:          string
}

export interface FreelancePayment {
  freelance_id: string
  amount:       number
  received_at:  string                   // YYYY-MM-DD
  currency:     string
}

// ─── Adapters (Job → Freelance) ───────────────────────────────────────────────
//
// Mantidos neste arquivo de propósito: quando a Fase "rename total" acontecer
// no futuro, basta deletar estes adapters e trocar a query direto.

export function toFreelance(job: Pick<
  Job,
  'id' | 'client_name' | 'status' | 'revenue_total' | 'cost_total'
  | 'total_value' | 'amount_paid' | 'payment_due_date' | 'currency'
>): Freelance {
  return {
    id:               job.id,
    client_name:      job.client_name || '',
    status:           job.status,
    revenue_total:    Number(job.revenue_total) || 0,
    cost_total:       Number(job.cost_total)    || 0,
    total_value:      Number(job.total_value)   || 0,
    amount_paid:      Number(job.amount_paid)   || 0,
    payment_due_date: job.payment_due_date,
    currency:         job.currency,
  }
}

export function toFreelancePayment(payment: Pick<
  JobPayment,
  'job_id' | 'amount' | 'received_at' | 'currency'
>): FreelancePayment {
  return {
    freelance_id: payment.job_id,
    amount:       Number(payment.amount) || 0,
    received_at:  payment.received_at,
    currency:     payment.currency,
  }
}

// ─── Helpers de valor (usados por múltiplos agregadores) ──────────────────────

/**
 * Total cobrado do cliente no freelance (serviço + repasses).
 * Fallback: se revenue_total = 0 (freelances antigos), usa total_value legado.
 */
export function freelanceTotal(f: Pick<Freelance, 'revenue_total' | 'cost_total' | 'total_value'>): number {
  const base = f.revenue_total > 0 ? f.revenue_total : f.total_value
  return base + f.cost_total
}

/**
 * Valor em aberto (a receber) do freelance. Sempre >= 0.
 */
export function freelanceAmountDue(
  f: Pick<Freelance, 'revenue_total' | 'cost_total' | 'total_value' | 'amount_paid'>
): number {
  return Math.max(0, freelanceTotal(f) - f.amount_paid)
}
