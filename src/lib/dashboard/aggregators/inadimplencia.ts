// ─── Agregador: Inadimplência (Aba 4 do Dashboard Executivo) ─────────────────
//
// FUNÇÃO PURA. Sem side effects. Sem fetch. Recebe os dados já carregados
// e retorna a estrutura completa — mesmo quando não há devedores.
//
// REGRAS DE NEGÓCIO (espec. Fase 1):
//
//   Critério de "devedor":
//     payment_due_date < hoje
//     AND amount_due > 0
//     AND status != 'cancelled'
//
//   Aging (faixas etárias da dívida, em dias de atraso):
//     d0_30     = 1..30
//     d31_60    = 31..60
//     d61_90    = 61..90
//     d90_mais  = 91+
//     (obs: 0 dias exatos = vence hoje, NÃO entra em inadimplência ainda)
//
//   Provisão sugerida (weighted):
//     0-30   → 2%
//     31-60  → 10%
//     61-90  → 30%
//     90+    → 80%
//
//   taxa_pct (inadimplência):
//     total_em_aberto / total_faturado_com_due_date_vencido * 100
//     Mede: dos valores que JÁ DEVERIAM ter sido recebidos até hoje, quanto
//           ainda está em aberto. Métrica mais honesta que overdue/total_geral.
//
//   pmr_dias (Prazo Médio de Recebimento):
//     Média PONDERADA POR VALOR de (received_at - payment_due_date)
//     em todos os payments de freelances com due_date informado.
//     Positivo = atraso médio em dias. Negativo = pagam adiantado.
//     Ponderação por valor reflete cash flow real (um R$ 50k tardio pesa
//     mais que um R$ 500 no prazo).
//
//   top_devedores:
//     Agrupa por cliente, soma valor em aberto, usa MAIOR atraso entre os
//     freelances do cliente. Ordena desc por valor. Default: top 5.

import type { Freelance, FreelancePayment } from '../types'
import { freelanceAmountDue, freelanceTotal } from '../types'

// ─── Saída ────────────────────────────────────────────────────────────────────

export interface InadimplenciaAging {
  d0_30:    number
  d31_60:   number
  d61_90:   number
  d90_mais: number
}

export interface TopDevedor {
  cliente:      string
  valor:        number
  dias_atraso:  number   // maior atraso entre os freelances deste cliente
}

export interface InadimplenciaData {
  total_em_aberto:    number
  taxa_pct:           number
  pmr_dias:           number
  provisao_sugerida:  number
  aging:              InadimplenciaAging
  top_devedores:      TopDevedor[]
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const PROVISAO_RATE = {
  d0_30:    0.02,
  d31_60:   0.10,
  d61_90:   0.30,
  d90_mais: 0.80,
} as const

const TOP_DEVEDORES_LIMIT = 5

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Dias entre duas datas YYYY-MM-DD (b - a) no fuso local.
 * Positivo = b > a. Ex: daysBetween('2026-04-01', '2026-04-10') === 9
 */
function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  const aMs = new Date(ay, am - 1, ad).getTime()
  const bMs = new Date(by, bm - 1, bd).getTime()
  return Math.round((bMs - aMs) / 86_400_000)
}

/**
 * Decide o bucket de aging dado um atraso em dias.
 * Contrato: retorna null se daysLate <= 0 (ainda não vencido ou vence hoje).
 */
function agingBucket(daysLate: number): keyof InadimplenciaAging | null {
  if (daysLate <= 0)  return null
  if (daysLate <= 30) return 'd0_30'
  if (daysLate <= 60) return 'd31_60'
  if (daysLate <= 90) return 'd61_90'
  return 'd90_mais'
}

/**
 * Arredonda para 2 casas decimais. Evita erros de float no agregado.
 */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ─── Estado vazio (usado quando não há dados) ────────────────────────────────

const EMPTY: InadimplenciaData = {
  total_em_aberto:   0,
  taxa_pct:          0,
  pmr_dias:          0,
  provisao_sugerida: 0,
  aging:             { d0_30: 0, d31_60: 0, d61_90: 0, d90_mais: 0 },
  top_devedores:     [],
}

// ─── Função principal ─────────────────────────────────────────────────────────

/**
 * Calcula métricas de inadimplência a partir de freelances e payments.
 *
 * @param freelances  Todos os freelances do workspace (inclui cancelados — filtrados internamente).
 * @param payments    Todos os pagamentos recebidos (para cálculo do PMR).
 * @param today       Data de hoje YYYY-MM-DD no fuso local (use `new Date().toLocaleDateString('en-CA')`).
 *
 * @returns Estrutura completa. Se não há devedores, retorna EMPTY.
 */
export function calcInadimplencia(
  freelances: Freelance[],
  payments:   FreelancePayment[],
  today:      string
): InadimplenciaData {
  if (freelances.length === 0) return { ...EMPTY, aging: { ...EMPTY.aging } }

  // Indexação para lookup O(1) no cálculo de PMR
  const freelanceById = new Map<string, Freelance>()
  for (const f of freelances) freelanceById.set(f.id, f)

  // ── Devedores: due_date passou, valor em aberto, não cancelado ─────────
  interface Devedor {
    f:            Freelance
    amount_due:   number
    days_late:    number
    bucket:       keyof InadimplenciaAging
  }

  const devedores: Devedor[] = []

  for (const f of freelances) {
    if (f.status === 'cancelled')  continue
    if (!f.payment_due_date)       continue

    const days_late = daysBetween(f.payment_due_date, today)
    const bucket    = agingBucket(days_late)
    if (bucket === null) continue                        // ainda no prazo ou vence hoje

    const amount_due = freelanceAmountDue(f)
    if (amount_due <= 0) continue                        // pago integralmente

    devedores.push({ f, amount_due, days_late, bucket })
  }

  // ── Aging buckets ──────────────────────────────────────────────────────
  const aging: InadimplenciaAging = { d0_30: 0, d31_60: 0, d61_90: 0, d90_mais: 0 }
  for (const d of devedores) {
    aging[d.bucket] += d.amount_due
  }
  aging.d0_30    = round2(aging.d0_30)
  aging.d31_60   = round2(aging.d31_60)
  aging.d61_90   = round2(aging.d61_90)
  aging.d90_mais = round2(aging.d90_mais)

  // ── Totais ─────────────────────────────────────────────────────────────
  const total_em_aberto = round2(aging.d0_30 + aging.d31_60 + aging.d61_90 + aging.d90_mais)

  // ── taxa_pct: em_aberto / faturado_com_due_date_vencido ────────────────
  // Denominador = soma do total cobrado (revenue + cost) dos freelances cuja
  // due_date já passou. Inclui pagos + não pagos. Pagos pesam como "ok" (não
  // contribuem para o numerador) mas ainda contam no total — por isso a taxa
  // reflete a saúde real da carteira vencida, não só a dívida absoluta.
  let faturadoVencido = 0
  for (const f of freelances) {
    if (f.status === 'cancelled')                                    continue
    if (!f.payment_due_date)                                         continue
    if (daysBetween(f.payment_due_date, today) <= 0)                 continue
    faturadoVencido += freelanceTotal(f)
  }
  const taxa_pct = faturadoVencido > 0
    ? round2((total_em_aberto / faturadoVencido) * 100)
    : 0

  // ── Provisão sugerida (weighted por bucket) ───────────────────────────
  const provisao_sugerida = round2(
      aging.d0_30    * PROVISAO_RATE.d0_30
    + aging.d31_60   * PROVISAO_RATE.d31_60
    + aging.d61_90   * PROVISAO_RATE.d61_90
    + aging.d90_mais * PROVISAO_RATE.d90_mais
  )

  // ── PMR (ponderado por valor de pagamento) ────────────────────────────
  let pmrWeighted = 0
  let pmrBase     = 0
  for (const p of payments) {
    const f = freelanceById.get(p.freelance_id)
    if (!f || !f.payment_due_date) continue
    const delta = daysBetween(f.payment_due_date, p.received_at)
    pmrWeighted += delta * p.amount
    pmrBase     += p.amount
  }
  const pmr_dias = pmrBase > 0 ? Math.round(pmrWeighted / pmrBase) : 0

  // ── Top devedores (agregados por cliente) ──────────────────────────────
  // Chave: lowercase do nome para unificar "João Silva" e "joão silva".
  // Valor original preservado para exibição.
  interface DevedorAgg { cliente: string; valor: number; dias_atraso: number }
  const byClient = new Map<string, DevedorAgg>()
  for (const d of devedores) {
    const key = d.f.client_name.trim().toLowerCase() || '(sem cliente)'
    const cur = byClient.get(key) ?? {
      cliente:     d.f.client_name.trim() || 'Cliente não informado',
      valor:       0,
      dias_atraso: 0,
    }
    cur.valor       += d.amount_due
    cur.dias_atraso  = Math.max(cur.dias_atraso, d.days_late)
    byClient.set(key, cur)
  }
  const top_devedores: TopDevedor[] = [...byClient.values()]
    .map(d => ({ ...d, valor: round2(d.valor) }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, TOP_DEVEDORES_LIMIT)

  return {
    total_em_aberto,
    taxa_pct,
    pmr_dias,
    provisao_sugerida,
    aging,
    top_devedores,
  }
}
