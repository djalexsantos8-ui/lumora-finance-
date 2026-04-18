// ─── Agregador: Clientes (Aba 5 do Dashboard Executivo) ─────────────────────
//
// FUNÇÃO PURA. Sem side effects. Sem fetch.
//
// DIRETRIZ CRÍTICA:
//   Esta aba NÃO responde "quem são meus clientes".
//   Ela responde: "Se eu perder 1 cliente, eu quebro?"
//
// RESUMO DO QUE CALCULA:
//
//   total_clientes       — quantos clientes distintos (não cancelados).
//   concentracao         — top1/top5/top10 em % sobre receita total.
//   hhi                  — índice Herfindahl-Hirschman (0–10.000).
//                          <1500 = baixa, 1500–2500 = moderada, >2500 = alta.
//   ranking_receita      — top por receita + margem % por cliente.
//   novos_vs_recorrentes — count do mês atual.
//   dinamica_12m         — novos/recorrentes por mês (12 slots).
//
// CONCEITOS:
//
//   RECEITA POR CLIENTE
//     Soma de freelanceTotal (revenue + cost) dos freelances NÃO cancelados.
//     Inclui valores em aberto — reflete dependência, não só dinheiro no
//     caixa. Um cliente grande que ainda não pagou AINDA é risco.
//
//   MARGEM POR CLIENTE
//     margem = (receita - custo) / receita × 100
//     Onde receita = freelanceTotal e custo = soma de cost_total (repasses).
//     Representa o % que realmente é lucro bruto vs pass-through.
//
//   NOVO vs RECORRENTE
//     Primeira aparição do cliente = MENOR occurred_at entre seus freelances.
//     Se essa data cai no mês M → cliente é "novo" em M.
//     Caso contrário (já tinha freelance antes de M) → "recorrente" em M.
//     Cliente sem occurred_at em NENHUM freelance → não classificado em
//     dinamica_12m (não aparece no gráfico temporal).
//
//   HHI (Herfindahl-Hirschman Index)
//     Soma dos quadrados das participações (decimal 0–1), × 10.000.
//     Intuição: um monopólio de 1 cliente = 10.000.
//     10 clientes iguais = 1.000. Quanto maior, mais concentrado.

import type { Freelance } from '../types'
import { freelanceTotal } from '../types'

// ─── Saída ────────────────────────────────────────────────────────────────────

export interface ConcentracaoData {
  top1_pct:  number
  top5_pct:  number
  top10_pct: number
}

export interface RankingClienteItem {
  cliente:    string
  receita:    number
  pct:        number          // % sobre receita total
  margem_pct: number          // margem própria do cliente
}

export interface NovosRecorrentes {
  novos:       number
  recorrentes: number
}

export interface DinamicaItem {
  mes:         string          // YYYY-MM
  novos:       number
  recorrentes: number
}

export interface ClientesData {
  total_clientes:       number
  concentracao:         ConcentracaoData
  hhi:                  number
  ranking_receita:      RankingClienteItem[]
  novos_vs_recorrentes: NovosRecorrentes
  dinamica_12m:         DinamicaItem[]
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const RANKING_LIMIT = 10                   // retornamos até 10 — UI decide exibir N
const TEMPORAL_WINDOW_MONTHS = 12

// ─── Helpers ──────────────────────────────────────────────────────────────────

function round1(n: number): number { return Math.round(n * 10)  / 10  }
function round2(n: number): number { return Math.round(n * 100) / 100 }

function monthKey(iso: string): string { return iso.slice(0, 7) }

function clientKey(name: string): string {
  return (name || '').trim().toLowerCase() || '(sem cliente)'
}

function clientDisplay(name: string): string {
  return (name || '').trim() || 'Cliente não informado'
}

function buildEmpty12m(today: string): DinamicaItem[] {
  const [y, m] = today.split('-').map(Number)
  const out: DinamicaItem[] = []
  for (let i = TEMPORAL_WINDOW_MONTHS - 1; i >= 0; i--) {
    const d  = new Date(y, m - 1 - i, 1)
    const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    out.push({ mes: mk, novos: 0, recorrentes: 0 })
  }
  return out
}

// ─── Estado vazio ─────────────────────────────────────────────────────────────

function emptyResult(today: string): ClientesData {
  return {
    total_clientes:       0,
    concentracao:         { top1_pct: 0, top5_pct: 0, top10_pct: 0 },
    hhi:                  0,
    ranking_receita:      [],
    novos_vs_recorrentes: { novos: 0, recorrentes: 0 },
    dinamica_12m:         buildEmpty12m(today),
  }
}

// ─── Função principal ─────────────────────────────────────────────────────────

/**
 * Calcula métricas da aba Clientes.
 *
 * @param freelances Todos os freelances do workspace. Cancelados filtrados aqui.
 * @param today      YYYY-MM-DD no fuso local.
 */
export function calcClientes(
  freelances: Freelance[],
  today:      string
): ClientesData {
  const activeFreelances = freelances.filter(f => f.status !== 'cancelled')
  if (activeFreelances.length === 0) return emptyResult(today)

  // ── Agregação por cliente ──────────────────────────────────────────────
  interface ClientAgg {
    display:         string
    receita:         number     // sum de freelanceTotal
    custo:           number     // sum de cost_total (repasses)
    primeira_data:   string | null  // menor occurred_at
    meses_atividade: Set<string>    // meses em que teve freelance (YYYY-MM)
  }

  const byClient = new Map<string, ClientAgg>()
  for (const f of activeFreelances) {
    const key = clientKey(f.client_name)
    const cur = byClient.get(key) ?? {
      display:         clientDisplay(f.client_name),
      receita:         0,
      custo:           0,
      primeira_data:   null,
      meses_atividade: new Set<string>(),
    }
    cur.receita += freelanceTotal(f)
    cur.custo   += f.cost_total
    if (f.occurred_at) {
      if (!cur.primeira_data || f.occurred_at < cur.primeira_data) {
        cur.primeira_data = f.occurred_at
      }
      cur.meses_atividade.add(monthKey(f.occurred_at))
    }
    byClient.set(key, cur)
  }

  const total_clientes = byClient.size

  // ── Receita total (base para todas as participações) ──────────────────
  let receita_total = 0
  for (const c of byClient.values()) receita_total += c.receita

  // ── Ranking por receita ────────────────────────────────────────────────
  // Filtra clientes com receita > 0. Cliente de receita 0 existe no total
  // mas não compete no ranking/concentração.
  const rankedAll = [...byClient.values()]
    .filter(c => c.receita > 0)
    .sort((a, b) => b.receita - a.receita)

  const ranking_receita: RankingClienteItem[] = rankedAll
    .slice(0, RANKING_LIMIT)
    .map(c => {
      const margem_pct = c.receita > 0
        ? round1(((c.receita - c.custo) / c.receita) * 100)
        : 0
      return {
        cliente:    c.display,
        receita:    round2(c.receita),
        pct:        receita_total > 0 ? round1((c.receita / receita_total) * 100) : 0,
        margem_pct,
      }
    })

  // ── Concentração ──────────────────────────────────────────────────────
  const sumSlice = (n: number) =>
    rankedAll.slice(0, n).reduce((s, c) => s + c.receita, 0)

  const concentracao: ConcentracaoData = receita_total > 0
    ? {
        top1_pct:  round1((sumSlice(1)  / receita_total) * 100),
        top5_pct:  round1((sumSlice(5)  / receita_total) * 100),
        top10_pct: round1((sumSlice(10) / receita_total) * 100),
      }
    : { top1_pct: 0, top5_pct: 0, top10_pct: 0 }

  // ── HHI ───────────────────────────────────────────────────────────────
  let hhi = 0
  if (receita_total > 0) {
    for (const c of rankedAll) {
      const share = c.receita / receita_total       // 0–1
      hhi += share * share
    }
    hhi = Math.round(hhi * 10_000)
  }

  // ── Novos vs Recorrentes (mês atual) ──────────────────────────────────
  const currentMonth = today.slice(0, 7)
  let novos = 0
  let recorrentes = 0
  for (const c of byClient.values()) {
    // Cliente teve atividade no mês atual?
    if (!c.meses_atividade.has(currentMonth)) continue
    // Foi a primeira aparição dele?
    if (c.primeira_data && monthKey(c.primeira_data) === currentMonth) novos++
    else                                                               recorrentes++
  }

  // ── Dinâmica 12m ──────────────────────────────────────────────────────
  const slots  = buildEmpty12m(today)
  const bySlot = new Map<string, DinamicaItem>(slots.map(s => [s.mes, s]))

  for (const c of byClient.values()) {
    if (!c.primeira_data) continue     // sem data — não entra no temporal
    const firstMk = monthKey(c.primeira_data)
    for (const mk of c.meses_atividade) {
      const slot = bySlot.get(mk)
      if (!slot) continue              // fora da janela 12m
      if (mk === firstMk) slot.novos++
      else                slot.recorrentes++
    }
  }

  return {
    total_clientes,
    concentracao,
    hhi,
    ranking_receita,
    novos_vs_recorrentes: { novos, recorrentes },
    dinamica_12m:         slots,
  }
}
