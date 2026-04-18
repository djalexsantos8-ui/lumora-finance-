// ─── Agregador: Receita & Recebimentos (Aba 2 do Dashboard Executivo) ────────
//
// FUNÇÃO PURA. Sem side effects. Sem fetch.
//
// DIRETRIZ CRÍTICA:
//   Esta aba NÃO responde "quanto entrou".
//   Ela responde: "Eu vou receber esse dinheiro mesmo?"
//
// Separação fundamental:
//   CONFIRMADA = payments.amount de recebimentos já efetivados (YTD).
//   PREVISTA   = amount_due de freelances ainda em aberto (carteira pendente).
//
// CONVENÇÕES:
//   - Janelas temporais em strings YYYY-MM-DD (timezone-safe).
//   - Todos os denominadores zero retornam 0 (nunca NaN / Infinity).
//   - Temporal_12m sempre tem 12 entries em ordem cronológica.
//
// ESCOLHAS DE ESCOPO documentadas (decisões do agregador):
//   - receita_ytd, confirmada, ranking_clientes → janela Year-To-Date.
//   - prevista                                  → carteira TOTAL em aberto
//                                                  (amount_due > 0, não cancelado).
//     Motivo: a pergunta "vou receber esse dinheiro?" é de carteira,
//     não de calendário — toda obra pendente importa.
//   - ticket_medio = freelanceTotal médio dos freelances NÃO cancelados.
//     (tamanho médio de freelance, contextualiza as demais métricas.)
//   - próximas_entradas: due_date nos próximos N dias, inclusive hoje.
//   - temporal_12m: janela de 12 meses fechando no mês atual.

import type { Freelance, FreelancePayment } from '../types'
import { freelanceAmountDue, freelanceTotal } from '../types'

// ─── Saída ────────────────────────────────────────────────────────────────────

export interface ProximasEntradas {
  d30: number    // 0–30 dias (inclusive hoje)
  d60: number    // 31–60 dias
  d90: number    // 61–90 dias
}

export interface RankingClienteItem {
  cliente: string
  valor:   number
  pct:     number   // % sobre total confirmado YTD
}

export interface TemporalItem {
  mes:         string    // ex: "2025-05" (YYYY-MM, ordenável lexicograficamente)
  confirmada:  number
  prevista:    number
}

export interface ReceitaData {
  receita_mes:      number
  receita_ytd:      number

  mom_pct:          number
  yoy_pct:          number

  confirmada:       number      // YTD
  prevista:         number      // carteira em aberto total
  pct_confirmada:   number      // confirmada / (confirmada + prevista) × 100

  ticket_medio:     number

  proximas_entradas: ProximasEntradas

  ranking_clientes: RankingClienteItem[]

  temporal_12m:     TemporalItem[]
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const RANKING_LIMIT = 5
const TEMPORAL_WINDOW_MONTHS = 12

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface Bounds { start: string; end: string }

function toISO(d: Date): string {
  return d.toLocaleDateString('en-CA')
}

/**
 * Retorna YYYY-MM de uma data ISO (primeiros 7 chars).
 */
function monthKey(iso: string): string {
  return iso.slice(0, 7)
}

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round(
    (new Date(by, bm - 1, bd).getTime() - new Date(ay, am - 1, ad).getTime()) / 86_400_000
  )
}

function inRange(iso: string | null | undefined, b: Bounds): boolean {
  return !!iso && iso >= b.start && iso <= b.end
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/**
 * Calcula bounds de períodos relevantes a partir de `today`.
 * Todos em YYYY-MM-DD no fuso local.
 */
function computeBounds(today: string) {
  const [y, m] = today.split('-').map(Number)
  const monthCurrent:  Bounds = { start: toISO(new Date(y,     m - 1, 1)), end: toISO(new Date(y,     m,     0)) }
  const monthPrevious: Bounds = { start: toISO(new Date(y,     m - 2, 1)), end: toISO(new Date(y,     m - 1, 0)) }
  const monthYoY:      Bounds = { start: toISO(new Date(y - 1, m - 1, 1)), end: toISO(new Date(y - 1, m,     0)) }
  const yearToDate:    Bounds = { start: toISO(new Date(y,     0,     1)), end: today }
  return { monthCurrent, monthPrevious, monthYoY, yearToDate }
}

// ─── Estado vazio ─────────────────────────────────────────────────────────────

function emptyResult(today: string): ReceitaData {
  return {
    receita_mes:       0,
    receita_ytd:       0,
    mom_pct:           0,
    yoy_pct:           0,
    confirmada:        0,
    prevista:          0,
    pct_confirmada:    0,
    ticket_medio:      0,
    proximas_entradas: { d30: 0, d60: 0, d90: 0 },
    ranking_clientes:  [],
    temporal_12m:      buildEmpty12m(today),
  }
}

function buildEmpty12m(today: string): TemporalItem[] {
  const [y, m] = today.split('-').map(Number)
  const out: TemporalItem[] = []
  for (let i = TEMPORAL_WINDOW_MONTHS - 1; i >= 0; i--) {
    const d  = new Date(y, m - 1 - i, 1)
    const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    out.push({ mes: mk, confirmada: 0, prevista: 0 })
  }
  return out
}

// ─── Função principal ─────────────────────────────────────────────────────────

/**
 * Calcula métricas da aba Receita & Recebimentos.
 *
 * @param freelances Todos os freelances do workspace (filtro de cancelled feito aqui).
 * @param payments   Todos os pagamentos recebidos (linha do tempo histórica).
 * @param today      YYYY-MM-DD no fuso local.
 */
export function calcReceita(
  freelances: Freelance[],
  payments:   FreelancePayment[],
  today:      string
): ReceitaData {
  if (freelances.length === 0 && payments.length === 0) return emptyResult(today)

  const bounds = computeBounds(today)

  // ── Freelances ativos (não cancelados) ─────────────────────────────────
  const activeFreelances = freelances.filter(f => f.status !== 'cancelled')
  const freelanceById    = new Map<string, Freelance>(activeFreelances.map(f => [f.id, f]))

  // ── Receita confirmada: por período ────────────────────────────────────
  let receita_mes         = 0
  let receita_mes_anterior = 0
  let receita_mes_yoy     = 0
  let receita_ytd         = 0

  for (const p of payments) {
    const amt = p.amount
    if (inRange(p.received_at, bounds.yearToDate))    receita_ytd         += amt
    if (inRange(p.received_at, bounds.monthCurrent))  receita_mes         += amt
    if (inRange(p.received_at, bounds.monthPrevious)) receita_mes_anterior += amt
    if (inRange(p.received_at, bounds.monthYoY))      receita_mes_yoy     += amt
  }

  const mom_pct = receita_mes_anterior > 0
    ? round1(((receita_mes - receita_mes_anterior) / receita_mes_anterior) * 100)
    : 0

  const yoy_pct = receita_mes_yoy > 0
    ? round1(((receita_mes - receita_mes_yoy) / receita_mes_yoy) * 100)
    : 0

  // ── Confirmada (YTD) vs Prevista (carteira aberta total) ───────────────
  const confirmada = receita_ytd

  let prevista = 0
  for (const f of activeFreelances) {
    prevista += freelanceAmountDue(f)
  }

  const pct_confirmada = (confirmada + prevista) > 0
    ? round1((confirmada / (confirmada + prevista)) * 100)
    : 0

  // ── Ticket médio (freelanceTotal / qtd freelances ativos) ──────────────
  const ticket_medio = activeFreelances.length > 0
    ? round2(activeFreelances.reduce((s, f) => s + freelanceTotal(f), 0) / activeFreelances.length)
    : 0

  // ── Próximas entradas (buckets futuros por due_date) ───────────────────
  const proximas_entradas: ProximasEntradas = { d30: 0, d60: 0, d90: 0 }
  for (const f of activeFreelances) {
    if (!f.payment_due_date) continue
    const due = freelanceAmountDue(f)
    if (due <= 0) continue
    const days = daysBetween(today, f.payment_due_date)
    if      (days >=  0 && days <= 30) proximas_entradas.d30 += due
    else if (days >= 31 && days <= 60) proximas_entradas.d60 += due
    else if (days >= 61 && days <= 90) proximas_entradas.d90 += due
    // days < 0 (vencido)  → responsabilidade de Inadimplência
    // days > 90 (longe)   → fora de visão executiva próxima
  }
  proximas_entradas.d30 = round2(proximas_entradas.d30)
  proximas_entradas.d60 = round2(proximas_entradas.d60)
  proximas_entradas.d90 = round2(proximas_entradas.d90)

  // ── Ranking de clientes (YTD, top 5) ───────────────────────────────────
  // Agrupa por client_name (case-insensitive). Valor = payments confirmados YTD
  // mapeados via freelance_id → freelance.client_name.
  const byClient = new Map<string, { cliente: string; valor: number }>()
  for (const p of payments) {
    if (!inRange(p.received_at, bounds.yearToDate)) continue
    const f = freelanceById.get(p.freelance_id)
    if (!f) continue                                  // payment órfão (freelance cancelado ou deletado)
    const key = f.client_name.trim().toLowerCase() || '(sem cliente)'
    const cur = byClient.get(key) ?? { cliente: f.client_name.trim() || 'Cliente não informado', valor: 0 }
    cur.valor += p.amount
    byClient.set(key, cur)
  }
  const ranking_clientes: RankingClienteItem[] = [...byClient.values()]
    .sort((a, b) => b.valor - a.valor)
    .slice(0, RANKING_LIMIT)
    .map(c => ({
      cliente: c.cliente,
      valor:   round2(c.valor),
      pct:     confirmada > 0 ? round1((c.valor / confirmada) * 100) : 0,
    }))

  // ── Temporal 12m (mesmo-com-buraco → preencher com 0) ──────────────────
  // Sempre 12 entries, ordenadas do mais antigo para o mais recente.
  const slots = buildEmpty12m(today)
  const bySlot = new Map<string, TemporalItem>(slots.map(s => [s.mes, s]))

  for (const p of payments) {
    const mk = monthKey(p.received_at)
    const s  = bySlot.get(mk)
    if (s) s.confirmada += p.amount
  }
  for (const f of activeFreelances) {
    if (!f.payment_due_date) continue
    const due = freelanceAmountDue(f)
    if (due <= 0) continue
    const mk = monthKey(f.payment_due_date)
    const s  = bySlot.get(mk)
    if (s) s.prevista += due
  }
  for (const s of slots) {
    s.confirmada = round2(s.confirmada)
    s.prevista   = round2(s.prevista)
  }

  return {
    receita_mes:       round2(receita_mes),
    receita_ytd:       round2(receita_ytd),
    mom_pct,
    yoy_pct,
    confirmada:        round2(confirmada),
    prevista:          round2(prevista),
    pct_confirmada,
    ticket_medio,
    proximas_entradas,
    ranking_clientes,
    temporal_12m:      slots,
  }
}
