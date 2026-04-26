/**
 * Cálculos do orçamento V2 — espelho da função SQL recalc_budget_v2_totals.
 *
 * Usado no editor cliente pra recalcular KPIs em tempo real enquanto o usuário
 * digita. A trigger SQL é a fonte da verdade — depois do save, o server
 * component refaz o load e os valores ficam canônicos.
 */

export interface BudgetItemV2 {
  id?:           string
  unit_price:    number | string
  unit_cost:     number | string
  days?:         number | string | null
  people?:       number | string | null
  quantity?:     number | string | null
  total?:        number | string | null
  total_cost?:   number | string | null
}

export interface BudgetV2 {
  margin_percent:  number | string | null
  tax_percent:     number | string | null
  discount_amount: number | string | null
}

export interface BudgetTotals {
  subtotal:       number
  totalCost:      number
  marginAmount:   number
  taxAmount:      number
  discountAmount: number
  total:          number
  grossProfit:    number
  grossMarginPct: number
  markupPct:      number
}

const num = (v: unknown, fallback = 0): number => {
  if (v === null || v === undefined || v === '') return fallback
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}

/** Calcula total e total_cost de UM item (unit × days × people × quantity). */
export function calcItemTotals(item: BudgetItemV2): { total: number; total_cost: number } {
  const days     = num(item.days, 1) || 1
  const people   = num(item.people, 1) || 1
  const quantity = num(item.quantity, 1) || 1
  const total      = num(item.unit_price) * days * people * quantity
  const total_cost = num(item.unit_cost)  * days * people * quantity
  return { total, total_cost }
}

/**
 * Recalcula tudo a partir de items + budget header.
 * Usado pelos KPIs em tempo real e pelo TotalsSummary.
 */
export function calcBudgetTotals(items: BudgetItemV2[], budget: BudgetV2): BudgetTotals {
  const subtotal  = items.reduce((s, i) => s + num(i.total, 0), 0)
  const totalCost = items.reduce((s, i) => s + num(i.total_cost, 0), 0)

  const marginPct      = num(budget.margin_percent, 0)
  const taxPct         = num(budget.tax_percent, 0)
  const discountAmount = num(budget.discount_amount, 0)

  const marginAmount = subtotal * (marginPct / 100)
  const taxAmount    = (subtotal + marginAmount) * (taxPct / 100)
  const total        = subtotal + marginAmount + taxAmount - discountAmount

  const grossProfit    = total - totalCost
  const grossMarginPct = total > 0 ? (grossProfit / total) * 100 : 0
  const markupPct      = totalCost > 0 ? (grossProfit / totalCost) * 100 : 0

  return {
    subtotal,
    totalCost,
    marginAmount,
    taxAmount,
    discountAmount,
    total,
    grossProfit,
    grossMarginPct,
    markupPct,
  }
}

/** Formato pt-BR padrão pra valores monetários. */
export function fmtBRL(n: number): string {
  return n.toLocaleString('pt-BR', {
    style:    'currency',
    currency: 'BRL',
    maximumFractionDigits: 2,
  })
}

/** Formato curto sem cents (pra badges). */
export function fmtBRLShort(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000)     return `R$ ${(n / 1_000).toFixed(1)}k`
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}
