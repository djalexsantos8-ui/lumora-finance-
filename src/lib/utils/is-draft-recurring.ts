// ─── isDraftRecurring ──────────────────────────────────────────────────────
//
// Espelho de isDraftFreelance. Uma receita recorrente é "rascunho" quando:
//   · não tem valor (amount === 0)
//   · título é um dos defaults gerados por createRecurringRevenueDraft
//
// Reconhecemos os defaults usados ao longo do tempo:
//   · 'Receita sem título' — default atual
//
// NÃO olhamos para `status` — uma recorrência nasce com status='active' mesmo
// quando ainda é só um rascunho (paridade com freelances/orders).

import type { RecurringRevenue } from '@/types/recurring-revenue'

export const DEFAULT_RECURRING_TITLES: readonly string[] = [
  'Receita sem título',
  'Receita sem titulo',
] as const

export function isDefaultRecurringTitle(title: string | null | undefined): boolean {
  if (!title) return true
  return DEFAULT_RECURRING_TITLES.includes(title.trim())
}

export function isDraftRecurring(r: RecurringRevenue): boolean {
  const hasAmount = Number(r.amount) > 0
  return !hasAmount && isDefaultRecurringTitle(r.title)
}
