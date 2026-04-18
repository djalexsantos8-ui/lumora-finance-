// ─── Agregador: Visão Geral (Aba 1 do Dashboard Executivo) ───────────────────
//
// FUNÇÃO PURA. Sem side effects. Sem fetch.
//
// RESPONSABILIDADE:
//   Calcular o "veredicto" (N1 na narrativa Lumiere) — saúde financeira
//   global do mês corrente, comparando com o mês anterior.
//
// REGRAS DE NEGÓCIO (espec. Fase 1 — baseline MVP, ajustável):
//
//   receita_mes       = soma dos payments recebidos no mês atual
//   custo_mes         = expenses do mês atual + fixed_costs ativos recorrentes
//   resultado_mes     = receita_mes − custo_mes
//   margem_mes_pct    = resultado_mes / receita_mes × 100   (0 se receita = 0)
//   runway_meses      = receita_mes / custo_mes              ← PROXY, não caixa real
//   delta_mom_pct     = variação % da receita vs mês anterior
//
//   Health Score (0–100):
//     +30   se margem_mes_pct > 20
//     +20   se resultado_mes > 0
//     +25   se runway_meses > 3
//     +15   se taxa_inadimplencia_pct < 10
//     +10   se delta_mom_pct >= 0
//
//   Health Status:
//     ≥ 70  → 'saudavel'
//     40–69 → 'atencao'
//     < 40  → 'critico'
//
// NOTA: Runway aqui é um PROXY (receita/custo), não o clássico
//   saldo/burn_rate. Será substituído quando o Lumora modelar saldo
//   inicial. Documentado no tipo para evitar mal-entendido no consumer.

import type { FreelancePayment, DashExpense, DashFixedCost } from '../types'

// ─── Saída ────────────────────────────────────────────────────────────────────

export type HealthStatus = 'saudavel' | 'atencao' | 'critico'

export interface VisaoGeralData {
  health_score:    number        // 0–100, inteiro
  health_status:   HealthStatus
  margem_mes_pct:  number        // pode ser negativo
  resultado_mes:   number        // pode ser negativo
  runway_meses:    number        // PROXY: receita/custo; não é saldo/burn
  receita_mes:     number
  custo_mes:       number        // expenses + fixed_costs recorrentes ativos
  delta_mom_pct:   number        // Month-over-Month da receita (pode ser negativo)
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const HEALTH_THRESHOLDS = {
  saudavel: 70,
  atencao:  40,
} as const

const SCORE_RULES = {
  margem_boa:          { threshold: 20, points: 30 },
  resultado_positivo:  { threshold: 0,  points: 20 },
  runway_seguro:       { threshold: 3,  points: 25 },
  inadimplencia_baixa: { threshold: 10, points: 15 },
  crescimento_mom:     { threshold: 0,  points: 10 },
} as const

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface MonthBounds { start: string; end: string }

/**
 * Retorna limites (inclusive) do mês de `today` e do mês anterior.
 * Strings YYYY-MM-DD — pronta para comparação lexicográfica com colunas *_date.
 */
function monthBoundsFromToday(today: string): { current: MonthBounds; previous: MonthBounds } {
  const [y, m] = today.split('-').map(Number)
  const toISO = (d: Date): string => d.toLocaleDateString('en-CA')
  const current: MonthBounds = {
    start: toISO(new Date(y, m - 1, 1)),
    end:   toISO(new Date(y, m,     0)),   // último dia do mês
  }
  const previous: MonthBounds = {
    start: toISO(new Date(y, m - 2, 1)),
    end:   toISO(new Date(y, m - 1, 0)),
  }
  return { current, previous }
}

function inRange(iso: string | null | undefined, bounds: MonthBounds): boolean {
  return !!iso && iso >= bounds.start && iso <= bounds.end
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

// ─── Função principal ─────────────────────────────────────────────────────────

/**
 * Calcula saúde financeira do mês corrente.
 *
 * @param payments               Todos os pagamentos recebidos (não filtrados por mês).
 * @param expenses               Todas as despesas variáveis.
 * @param fixedCosts             Todos os custos fixos (filtro is_active && is_recurring feito aqui).
 * @param taxaInadimplenciaPct   Vem do agregador de inadimplência já calculado.
 * @param today                  YYYY-MM-DD no fuso local.
 */
export function calcVisaoGeral(
  payments:             FreelancePayment[],
  expenses:             DashExpense[],
  fixedCosts:           DashFixedCost[],
  taxaInadimplenciaPct: number,
  today:                string
): VisaoGeralData {
  const { current, previous } = monthBoundsFromToday(today)

  // ── Receita ─────────────────────────────────────────────────────────────
  let receita_mes           = 0
  let receita_mes_anterior  = 0
  for (const p of payments) {
    if      (inRange(p.received_at, current))  receita_mes          += p.amount
    else if (inRange(p.received_at, previous)) receita_mes_anterior += p.amount
  }

  // ── Custos variáveis (expenses do mês) ─────────────────────────────────
  let expenses_mes = 0
  for (const e of expenses) {
    if (inRange(e.expense_date, current)) expenses_mes += e.amount_brl
  }

  // ── Custos fixos recorrentes ativos ────────────────────────────────────
  // Recorrente = cobrado todo mês independente de data. Não filtramos por
  // mês (é sempre "o que o usuário paga por mês"). is_installment NÃO entra
  // aqui — parcelas são item isolado em outro agregador.
  let fixed_mes = 0
  for (const f of fixedCosts) {
    if (f.is_active && f.is_recurring) fixed_mes += f.amount_brl
  }

  const custo_mes     = expenses_mes + fixed_mes
  const resultado_mes = receita_mes - custo_mes

  const margem_mes_pct = receita_mes > 0
    ? round1((resultado_mes / receita_mes) * 100)
    : 0

  const runway_meses = custo_mes > 0
    ? round1(receita_mes / custo_mes)
    : 0

  const delta_mom_pct = receita_mes_anterior > 0
    ? round1(((receita_mes - receita_mes_anterior) / receita_mes_anterior) * 100)
    : 0

  // ── Health Score ────────────────────────────────────────────────────────
  let health_score = 0
  if (margem_mes_pct        >  SCORE_RULES.margem_boa.threshold)          health_score += SCORE_RULES.margem_boa.points
  if (resultado_mes         >  SCORE_RULES.resultado_positivo.threshold)  health_score += SCORE_RULES.resultado_positivo.points
  if (runway_meses          >  SCORE_RULES.runway_seguro.threshold)       health_score += SCORE_RULES.runway_seguro.points
  if (taxaInadimplenciaPct  <  SCORE_RULES.inadimplencia_baixa.threshold) health_score += SCORE_RULES.inadimplencia_baixa.points
  if (delta_mom_pct         >= SCORE_RULES.crescimento_mom.threshold)     health_score += SCORE_RULES.crescimento_mom.points

  const health_status: HealthStatus =
      health_score >= HEALTH_THRESHOLDS.saudavel ? 'saudavel'
    : health_score >= HEALTH_THRESHOLDS.atencao  ? 'atencao'
    : 'critico'

  return {
    health_score,
    health_status,
    margem_mes_pct,
    resultado_mes:  round2(resultado_mes),
    runway_meses,
    receita_mes:    round2(receita_mes),
    custo_mes:      round2(custo_mes),
    delta_mom_pct,
  }
}
