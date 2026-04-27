// @ts-nocheck — Vitest ainda não está instalado no projeto. Este arquivo é
// placeholder pronto pra rodar quando `npm i -D vitest` for adicionado:
//   npx vitest run src/types/__tests__/job.financial-badge.test.ts
// Enquanto isso, a validação acontece via SQL no banco + Chrome em runtime.

/**
 * Testes da função `jobFinancialBadge` — fonte de verdade do status financeiro
 * derivado de um job (R02-FIN-CONSISTENCY 2026-04-27).
 *
 * Formato compatível com Vitest e Jest. Pra rodar quando framework for
 * adicionado ao projeto: `npx vitest run src/types/__tests__/job.financial-badge.test.ts`.
 *
 * Cobre os 6 cenários obrigatórios da rodada R02:
 *   1. job sem recebido (em aberto)
 *   2. job parcialmente recebido (parcial)
 *   3. job totalmente recebido (quitado)
 *   4. job vencido (saldo > 0 + payment_due_date < hoje)
 *   5. job futuro (não vencido, em aberto)
 *   6. job marcado manualmente como "paid" operacional mas com saldo aberto
 *      → ESTE ERA O BUG: Serasa video 02 clinica
 */

import { describe, it, expect } from 'vitest'
import { jobFinancialBadge } from '../job'

const FIXED_TODAY = new Date('2026-04-27T12:00:00Z')

function makeJob(overrides: {
  revenue_total?:    number | string
  cost_total?:       number | string
  amount_paid?:      number | string
  total_value?:      number | string
  payment_due_date?: string | null
} = {}): Parameters<typeof jobFinancialBadge>[0] {
  return {
    revenue_total:    overrides.revenue_total ?? 0,
    cost_total:       overrides.cost_total ?? 0,
    amount_paid:      overrides.amount_paid ?? 0,
    total_value:      overrides.total_value ?? 0,
    payment_due_date: overrides.payment_due_date ?? null,
  } as Parameters<typeof jobFinancialBadge>[0]
}

describe('jobFinancialBadge', () => {
  it('1) sem recebido — retorna unpaid', () => {
    const fb = jobFinancialBadge(
      makeJob({ revenue_total: 3000, cost_total: 0, amount_paid: 0, payment_due_date: '2026-06-15' }),
      FIXED_TODAY
    )
    expect(fb.status).toBe('unpaid')
    expect(fb.label).toBe('Em aberto')
    expect(fb.amountDue).toBe(3000)
    expect(fb.totalDue).toBe(3000)
    expect(fb.received).toBe(0)
    expect(fb.receivedPct).toBe(0)
    expect(fb.overdue).toBe(false)
  })

  it('2) parcialmente recebido — retorna partial com %', () => {
    const fb = jobFinancialBadge(
      makeJob({ revenue_total: 1000, cost_total: 0, amount_paid: 250, payment_due_date: '2026-06-15' }),
      FIXED_TODAY
    )
    expect(fb.status).toBe('partial')
    expect(fb.label).toContain('Parcial')
    expect(fb.label).toContain('25')
    expect(fb.amountDue).toBe(750)
    expect(fb.received).toBe(250)
    expect(fb.receivedPct).toBe(25)
  })

  it('3) totalmente recebido (recebeu == total) — retorna paid', () => {
    const fb = jobFinancialBadge(
      makeJob({ revenue_total: 2000, cost_total: 500, amount_paid: 2500, payment_due_date: '2026-03-15' }),
      FIXED_TODAY
    )
    expect(fb.status).toBe('paid')
    expect(fb.label).toBe('Quitado')
    expect(fb.amountDue).toBe(0)
    expect(fb.received).toBe(2500)
    expect(fb.totalDue).toBe(2500)
    expect(fb.receivedPct).toBe(100)
    expect(fb.overdue).toBe(false)
  })

  it('3b) recebeu mais que total (cliente pagou a mais) — ainda paid', () => {
    const fb = jobFinancialBadge(
      makeJob({ revenue_total: 1000, cost_total: 0, amount_paid: 1500, payment_due_date: null }),
      FIXED_TODAY
    )
    expect(fb.status).toBe('paid')
    expect(fb.amountDue).toBe(0)
  })

  it('4) vencido (saldo > 0 + payment_due_date < hoje) — retorna overdue', () => {
    const fb = jobFinancialBadge(
      makeJob({ revenue_total: 3000, cost_total: 0, amount_paid: 0, payment_due_date: '2026-03-17' }),
      FIXED_TODAY
    )
    expect(fb.status).toBe('overdue')
    expect(fb.label).toBe('Vencido')
    expect(fb.overdue).toBe(true)
    expect(fb.amountDue).toBe(3000)
  })

  it('4b) vencido com pagamento parcial — overdue prevalece sobre partial', () => {
    const fb = jobFinancialBadge(
      makeJob({ revenue_total: 1000, cost_total: 0, amount_paid: 200, payment_due_date: '2026-03-17' }),
      FIXED_TODAY
    )
    expect(fb.status).toBe('overdue')
    expect(fb.amountDue).toBe(800)
  })

  it('5) futuro (saldo > 0 + payment_due_date > hoje) — retorna unpaid sem overdue', () => {
    const fb = jobFinancialBadge(
      makeJob({ revenue_total: 1000, cost_total: 0, amount_paid: 0, payment_due_date: '2026-12-31' }),
      FIXED_TODAY
    )
    expect(fb.status).toBe('unpaid')
    expect(fb.overdue).toBe(false)
  })

  it('6) BUG SERASA: revenue_total=3000, cost_total=457, amount_paid=457, due=2026-03-17, hoje=2026-04-27 → overdue R$ 3.000', () => {
    // Este é o caso real do user que motivou esta rodada.
    // Status operacional do job no banco é "paid" mas financeiramente está vencido.
    const fb = jobFinancialBadge(
      makeJob({ revenue_total: 3000, cost_total: 457, amount_paid: 457, payment_due_date: '2026-03-17' }),
      FIXED_TODAY
    )
    expect(fb.status).toBe('overdue')
    expect(fb.label).toBe('Vencido')
    expect(fb.totalDue).toBe(3457)
    expect(fb.received).toBe(457)
    expect(fb.amountDue).toBe(3000)
    expect(fb.overdue).toBe(true)
  })

  it('7) job sem valor (totalDue == 0) — retorna sem_valor', () => {
    const fb = jobFinancialBadge(
      makeJob({ revenue_total: 0, cost_total: 0, total_value: 0, amount_paid: 0 }),
      FIXED_TODAY
    )
    expect(fb.status).toBe('sem_valor')
  })

  it('8) usa total_value como fallback quando revenue_total == 0', () => {
    const fb = jobFinancialBadge(
      makeJob({ revenue_total: 0, cost_total: 0, total_value: 800, amount_paid: 800 }),
      FIXED_TODAY
    )
    expect(fb.status).toBe('paid')
    expect(fb.totalDue).toBe(800)
  })
})
