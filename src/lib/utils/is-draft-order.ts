// ─── isDraftOrder ───────────────────────────────────────────────────────────
//
// Espelho de isDraftFreelance. Um pedido é "rascunho" quando:
//   · não tem receita (amount === 0 e revenue_total === 0)
//   · não tem custo   (cost_total === 0)
//   · título é um dos defaults gerados por createOrderDraft
//
// Reconhecemos os defaults usados ao longo do tempo:
//   · 'Pedido sem título' — default atual (createOrderDraft + budget-conversion)
//
// NÃO olhamos para `status` — um pedido nasce com status='in_progress' mesmo
// quando ainda é só um rascunho (paridade com freelances).

import type { Order } from '@/types/order'

export const DEFAULT_ORDER_TITLES: readonly string[] = [
  'Pedido sem título',
  'Pedido sem titulo',
] as const

export function isDefaultOrderTitle(title: string | null | undefined): boolean {
  if (!title) return true
  return DEFAULT_ORDER_TITLES.includes(title.trim())
}

export function isDraftOrder(order: Order): boolean {
  const hasRevenue = Number(order.revenue_total) > 0 || Number(order.amount) > 0
  const hasCost    = Number(order.cost_total)    > 0
  return !hasRevenue && !hasCost && isDefaultOrderTitle(order.title)
}
