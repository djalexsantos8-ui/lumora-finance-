// ─── Agregador: Custos & Despesas (Aba 3 do Dashboard Executivo) ─────────────
//
// FUNÇÃO PURA. Sem side effects. Sem fetch.
//
// DIRETRIZ CRÍTICA:
//   Esta aba NÃO responde "quanto gastei".
//   Ela responde: "Meu custo é sustentável ou vai me matar?"
//
// TAXONOMIA (decisão Fase 1):
//
//   FIXO      = FixedCost com is_recurring === true && is_active === true
//   VARIÁVEL  = tudo mais:
//               - expenses do mês (qualquer)
//               - FixedCost is_installment (parcelas — entram no mês do start_date)
//
//   Parcelas (is_installment) NÃO são "fixo" porque têm prazo — contam como
//   gasto pontual no mês da due_date (= start_date em FixedCost, expense_date
//   em Expense). Só entram se a data cair no mês atual.
//
// FÓRMULAS:
//
//   custo_total_mes     = fixos_mes + variaveis_mes
//   fixos_pct           = fixos_mes / custo_total_mes × 100
//   variaveis_pct       = variaveis_mes / custo_total_mes × 100
//   custo_receita_ratio = custo_total_mes / receita_mes     (0 se receita = 0)
//   ponto_equilibrio    = fixos_mes / (margem_pct / 100)    (0 se margem = 0)
//                         ↑ recebe margem como percentual (ex: 25 = 25%)
//
// TEMPORAL 12M:
//   fixo     → snapshot retroativo (valor atual aplicado a todos os 12 meses).
//              Decisão consciente: o banco não tem histórico de fixed_cost.
//              Quando Lumora modelar histórico, substituir.
//   variavel → valor real por mês (expenses + parcelas pela data).
//
// TOP_DESPESAS:
//   Despesas individuais do mês atual, ordenadas desc. Não agrupa.
//   Fixed costs recorrentes NÃO entram (seriam sempre as mesmas linhas).

import type { DashExpense, DashFixedCost } from '../types'

// ─── Saída ────────────────────────────────────────────────────────────────────

export interface MaiorCategoria {
  categoria: string
  valor:     number
  pct:       number
}

export interface CategoriaItem {
  categoria: string
  valor:     number
  pct:       number           // % sobre custo_total_mes
  tipo:      'fixo' | 'variavel'
}

export interface TemporalCustoItem {
  mes:      string            // YYYY-MM
  fixo:     number
  variavel: number
}

export interface TopDespesaItem {
  descricao: string
  categoria: string
  valor:     number
}

export interface CustosData {
  custo_total_mes:     number
  fixos_mes:           number
  variaveis_mes:       number
  fixos_pct:           number
  variaveis_pct:       number
  custo_receita_ratio: number
  maior_categoria:     MaiorCategoria | null
  por_categoria:       CategoriaItem[]
  temporal_12m:        TemporalCustoItem[]
  top_despesas:        TopDespesaItem[]
  ponto_equilibrio:    number
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const TOP_DESPESAS_LIMIT = 5
const TEMPORAL_WINDOW_MONTHS = 12

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface Bounds { start: string; end: string }

function toISO(d: Date): string { return d.toLocaleDateString('en-CA') }

function monthKey(iso: string): string { return iso.slice(0, 7) }

function inRange(iso: string | null | undefined, b: Bounds): boolean {
  return !!iso && iso >= b.start && iso <= b.end
}

function round2(n: number): number { return Math.round(n * 100) / 100 }
function round1(n: number): number { return Math.round(n * 10)  / 10  }

function currentMonthBounds(today: string): Bounds {
  const [y, m] = today.split('-').map(Number)
  return { start: toISO(new Date(y, m - 1, 1)), end: toISO(new Date(y, m, 0)) }
}

function buildEmpty12m(today: string): TemporalCustoItem[] {
  const [y, m] = today.split('-').map(Number)
  const out: TemporalCustoItem[] = []
  for (let i = TEMPORAL_WINDOW_MONTHS - 1; i >= 0; i--) {
    const d  = new Date(y, m - 1 - i, 1)
    const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    out.push({ mes: mk, fixo: 0, variavel: 0 })
  }
  return out
}

function normalizeCategory(s: string | null | undefined): string {
  return (s?.trim() || 'other')
}

// ─── Função principal ─────────────────────────────────────────────────────────

/**
 * Calcula métricas da aba Custos & Despesas.
 *
 * @param expenses    Todas as despesas variáveis do workspace.
 * @param fixedCosts  Todos os custos fixos (recorrentes + parcelas).
 * @param receita_mes Receita do mês (vem do agregador de Receita).
 * @param margem_pct  Margem do mês em %, ex: 25 para 25% (vem de Visão Geral).
 * @param today       YYYY-MM-DD no fuso local.
 */
export function calcCustos(
  expenses:    DashExpense[],
  fixedCosts:  DashFixedCost[],
  receita_mes: number,
  margem_pct:  number,
  today:       string
): CustosData {
  const monthBounds = currentMonthBounds(today)

  // ── FIXOS do mês (recorrentes ativos — snapshot atual) ────────────────
  let fixos_mes = 0
  for (const f of fixedCosts) {
    if (f.is_active && f.is_recurring) fixos_mes += f.amount_brl
  }

  // ── VARIÁVEIS do mês ──────────────────────────────────────────────────
  //   a) expenses no mês atual (is_installment ou não — tudo variável)
  //   b) FixedCost parcelas (is_installment) cujo start_date cai no mês
  let variaveis_mes = 0
  for (const e of expenses) {
    if (inRange(e.expense_date, monthBounds)) variaveis_mes += e.amount_brl
  }
  for (const f of fixedCosts) {
    if (f.is_installment && inRange(f.start_date, monthBounds)) variaveis_mes += f.amount_brl
  }

  const custo_total_mes = fixos_mes + variaveis_mes

  const fixos_pct = custo_total_mes > 0
    ? round1((fixos_mes / custo_total_mes) * 100)
    : 0
  const variaveis_pct = custo_total_mes > 0
    ? round1((variaveis_mes / custo_total_mes) * 100)
    : 0

  const custo_receita_ratio = receita_mes > 0
    ? round2(custo_total_mes / receita_mes)
    : 0

  const ponto_equilibrio = margem_pct > 0
    ? round2(fixos_mes / (margem_pct / 100))
    : 0

  // ── Por categoria (separando tipo: fixo vs variavel) ──────────────────
  // Chave composta: "fixo:Software" !== "variavel:Software"
  interface CatAgg { categoria: string; valor: number; tipo: 'fixo' | 'variavel' }
  const catMap = new Map<string, CatAgg>()
  const addCat = (categoria: string, valor: number, tipo: 'fixo' | 'variavel') => {
    const cat = normalizeCategory(categoria)
    const key = `${tipo}:${cat.toLowerCase()}`
    const cur = catMap.get(key) ?? { categoria: cat, valor: 0, tipo }
    cur.valor += valor
    catMap.set(key, cur)
  }

  for (const f of fixedCosts) {
    if (f.is_active && f.is_recurring) addCat(f.category, f.amount_brl, 'fixo')
  }
  for (const e of expenses) {
    if (inRange(e.expense_date, monthBounds)) addCat(e.category, e.amount_brl, 'variavel')
  }
  for (const f of fixedCosts) {
    if (f.is_installment && inRange(f.start_date, monthBounds)) addCat(f.category, f.amount_brl, 'variavel')
  }

  const por_categoria: CategoriaItem[] = [...catMap.values()]
    .filter(c => c.valor > 0)
    .sort((a, b) => b.valor - a.valor)
    .map(c => ({
      categoria: c.categoria,
      valor:     round2(c.valor),
      pct:       custo_total_mes > 0 ? round1((c.valor / custo_total_mes) * 100) : 0,
      tipo:      c.tipo,
    }))

  const maior_categoria: MaiorCategoria | null = por_categoria.length > 0
    ? { categoria: por_categoria[0].categoria, valor: por_categoria[0].valor, pct: por_categoria[0].pct }
    : null

  // ── Temporal 12m ──────────────────────────────────────────────────────
  const slots = buildEmpty12m(today)
  const bySlot = new Map<string, TemporalCustoItem>(slots.map(s => [s.mes, s]))

  // Fixo: snapshot retroativo — mesmo valor em todos os 12 meses.
  for (const s of slots) s.fixo = fixos_mes

  // Variável: expenses pela expense_date
  for (const e of expenses) {
    const slot = bySlot.get(monthKey(e.expense_date))
    if (slot) slot.variavel += e.amount_brl
  }
  // Variável: parcelas de FixedCost pela start_date
  for (const f of fixedCosts) {
    if (!f.is_installment || !f.start_date) continue
    const slot = bySlot.get(monthKey(f.start_date))
    if (slot) slot.variavel += f.amount_brl
  }
  for (const s of slots) {
    s.fixo     = round2(s.fixo)
    s.variavel = round2(s.variavel)
  }

  // ── Top despesas (individuais, mês atual, não agrupa) ─────────────────
  interface DespesaBruta { descricao: string; categoria: string; valor: number }
  const doMes: DespesaBruta[] = []

  for (const e of expenses) {
    if (!inRange(e.expense_date, monthBounds)) continue
    doMes.push({
      descricao: e.description || '(sem descrição)',
      categoria: normalizeCategory(e.category),
      valor:     e.amount_brl,
    })
  }
  for (const f of fixedCosts) {
    if (!f.is_installment || !inRange(f.start_date, monthBounds)) continue
    doMes.push({
      descricao: f.description || '(sem descrição)',
      categoria: normalizeCategory(f.category),
      valor:     f.amount_brl,
    })
  }

  const top_despesas: TopDespesaItem[] = doMes
    .filter(d => d.valor > 0)
    .sort((a, b) => b.valor - a.valor)
    .slice(0, TOP_DESPESAS_LIMIT)
    .map(d => ({ ...d, valor: round2(d.valor) }))

  return {
    custo_total_mes:     round2(custo_total_mes),
    fixos_mes:           round2(fixos_mes),
    variaveis_mes:       round2(variaveis_mes),
    fixos_pct,
    variaveis_pct,
    custo_receita_ratio,
    maior_categoria,
    por_categoria,
    temporal_12m:        slots,
    top_despesas,
    ponto_equilibrio,
  }
}
