import { createClient } from '@/lib/supabase/server'

/**
 * Phase 6 — Camada financeira do Lumora V2.
 *
 * Lê das 4 RPCs (fin_dre_competencia, fin_caixa_realizado, fin_forecast,
 * fin_summary) que agregam V1 (jobs+orders+recurring) + V2 (budgets_v2)
 * em uma visão unificada.
 *
 * Todas as RPCs validam workspace via _fin_assert_workspace (SECURITY
 * DEFINER) — chamamos sempre passando workspace_id explícito.
 */

export interface DreRow {
  mes:                string
  receita_jobs:       number
  receita_orders:     number
  receita_recorrente: number
  receita_budgets_v2: number
  receita_total:      number
  custo_direto:       number
  margem_bruta:       number
  margem_pct:         number
  qtd_projetos:       number
  ticket_medio:       number
}

export interface CaixaRow {
  mes:                  string
  entradas_jobs:        number
  entradas_orders:      number
  entradas_recorrente:  number
  entradas_total:       number
  saidas_variaveis:     number
  saidas_fixas:         number
  saidas_total:         number
  saldo:                number
}

export type ForecastTipo  = 'a_receber' | 'a_pagar'
export type ForecastFonte = 'job' | 'order' | 'recurring' | 'expense' | 'fixed_cost'

export interface ForecastRow {
  data:           string
  tipo:           ForecastTipo
  fonte:          ForecastFonte
  ref_id:         string
  ref_label:      string
  cliente:        string
  valor:          number
  status:         string
  dias_para_data: number
}

export interface FinSummary {
  mes_corrente:           string  // 'YYYY-MM'
  receita_mes:            number
  custo_mes:              number
  margem_mes:             number
  margem_pct:             number
  qtd_projetos:           number
  receita_prev:           number  // mês anterior pra trend
  caixa_entradas:         number
  caixa_saidas:           number
  caixa_saldo:            number
  proximas_entradas_30d:  number
  proximas_saidas_30d:    number
  qtd_recebimentos_30d:   number
  qtd_pagamentos_30d:     number
  inadimplencia_qtd:      number
  inadimplencia_valor:    number
}

/** Normaliza row do DB (numerics vêm como string) → number. */
function n(v: unknown): number {
  if (v === null || v === undefined) return 0
  const x = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(x) ? x : 0
}

export async function fetchFinSummary(workspaceId: string): Promise<FinSummary | null> {
  const sb = await createClient()
  const { data, error } = await sb.rpc('fin_summary', { p_workspace_id: workspaceId })
  if (error || !data) return null
  // RPC retorna JSON; convertemos numerics
  const j = data as Record<string, unknown>
  return {
    mes_corrente:           String(j.mes_corrente ?? ''),
    receita_mes:            n(j.receita_mes),
    custo_mes:              n(j.custo_mes),
    margem_mes:             n(j.margem_mes),
    margem_pct:             n(j.margem_pct),
    qtd_projetos:           n(j.qtd_projetos),
    receita_prev:           n(j.receita_prev),
    caixa_entradas:         n(j.caixa_entradas),
    caixa_saidas:           n(j.caixa_saidas),
    caixa_saldo:            n(j.caixa_saldo),
    proximas_entradas_30d:  n(j.proximas_entradas_30d),
    proximas_saidas_30d:    n(j.proximas_saidas_30d),
    qtd_recebimentos_30d:   n(j.qtd_recebimentos_30d),
    qtd_pagamentos_30d:     n(j.qtd_pagamentos_30d),
    inadimplencia_qtd:      n(j.inadimplencia_qtd),
    inadimplencia_valor:    n(j.inadimplencia_valor),
  }
}

export async function fetchDreCompetencia(
  workspaceId: string,
  months = 12
): Promise<DreRow[]> {
  const sb = await createClient()
  const { data } = await sb.rpc('fin_dre_competencia', {
    p_workspace_id: workspaceId,
    p_months:       months,
  })
  return (data ?? []).map((r: Record<string, unknown>) => ({
    mes:                String(r.mes ?? ''),
    receita_jobs:       n(r.receita_jobs),
    receita_orders:     n(r.receita_orders),
    receita_recorrente: n(r.receita_recorrente),
    receita_budgets_v2: n(r.receita_budgets_v2),
    receita_total:      n(r.receita_total),
    custo_direto:       n(r.custo_direto),
    margem_bruta:       n(r.margem_bruta),
    margem_pct:         n(r.margem_pct),
    qtd_projetos:       n(r.qtd_projetos),
    ticket_medio:       n(r.ticket_medio),
  }))
}

export async function fetchCaixaRealizado(
  workspaceId: string,
  months = 12
): Promise<CaixaRow[]> {
  const sb = await createClient()
  const { data } = await sb.rpc('fin_caixa_realizado', {
    p_workspace_id: workspaceId,
    p_months:       months,
  })
  return (data ?? []).map((r: Record<string, unknown>) => ({
    mes:                  String(r.mes ?? ''),
    entradas_jobs:        n(r.entradas_jobs),
    entradas_orders:      n(r.entradas_orders),
    entradas_recorrente:  n(r.entradas_recorrente),
    entradas_total:       n(r.entradas_total),
    saidas_variaveis:     n(r.saidas_variaveis),
    saidas_fixas:         n(r.saidas_fixas),
    saidas_total:         n(r.saidas_total),
    saldo:                n(r.saldo),
  }))
}

export async function fetchForecast(
  workspaceId: string,
  horizonDays = 90
): Promise<ForecastRow[]> {
  const sb = await createClient()
  const { data } = await sb.rpc('fin_forecast', {
    p_workspace_id:  workspaceId,
    p_horizon_days:  horizonDays,
  })
  return (data ?? []).map((r: Record<string, unknown>) => ({
    data:           String(r.data ?? ''),
    tipo:           String(r.tipo ?? '')           as ForecastTipo,
    fonte:          String(r.fonte ?? '')          as ForecastFonte,
    ref_id:         String(r.ref_id ?? ''),
    ref_label:      String(r.ref_label ?? ''),
    cliente:        String(r.cliente ?? '—'),
    valor:          n(r.valor),
    status:         String(r.status ?? ''),
    dias_para_data: n(r.dias_para_data),
  }))
}

const MONTHS_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/**
 * "2026-04-01" → "abr de 26".
 * Parse manual pra evitar drift de timezone (Date(iso) interpreta UTC e
 * mostra mês anterior em fusos negativos).
 */
export function fmtMonthLabel(iso: string): string {
  if (!iso) return '—'
  const m = iso.match(/^(\d{4})-(\d{2})/)
  if (!m) return iso
  const year  = m[1]
  const month = parseInt(m[2], 10) - 1
  if (month < 0 || month > 11) return iso
  return `${MONTHS_PT[month]} de ${year.slice(2)}`
}

/**
 * "2026-04-15" → "15/04". Parse manual pelo mesmo motivo de timezone.
 */
export function fmtShortDate(iso: string): string {
  if (!iso) return '—'
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[3]}/${m[2]}`
  // fallback datetime / ts
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

export function fonteLabel(fonte: ForecastFonte): { icon: string; label: string } {
  switch (fonte) {
    case 'job':        return { icon: '🎬', label: 'Job' }
    case 'order':      return { icon: '📦', label: 'Pedido' }
    case 'recurring':  return { icon: '🔁', label: 'Recorrência' }
    case 'expense':    return { icon: '💸', label: 'Despesa' }
    case 'fixed_cost': return { icon: '🏠', label: 'Custo fixo' }
  }
}

/**
 * R01-DASH-CARDS-NAVIGATE — mapeia (fonte, ref_id) → rota V1 correspondente.
 *
 * Mapeamento aplicado:
 *   - job        → /freelances/[ref_id]            (V1: jobs vivem em /freelances)
 *   - order      → /pedidos/[ref_id]               (V1: rota detalhe)
 *   - recurring  → /receitas-recorrentes/[ref_id]  (ref_id já é a recurring_revenue_id, não invoice)
 *   - expense    → /expenses                       (FALLBACK: V1 não tem /expenses/[id])
 *   - fixed_cost → /fixed-costs                    (FALLBACK: V1 não tem /fixed-costs/[id])
 *
 * Sem rota detalhada existente em V1 pra expenses/fixed_costs — vai pra
 * listagem. Quando V2 ganhar /expenses/[id] e /fixed-costs/[id], atualizar aqui.
 */
export function forecastHref(fonte: ForecastFonte, refId: string): string {
  switch (fonte) {
    case 'job':        return `/freelances/${refId}`
    case 'order':      return `/pedidos/${refId}`
    case 'recurring':  return `/receitas-recorrentes/${refId}`
    case 'expense':    return '/expenses'
    case 'fixed_cost': return '/fixed-costs'
  }
}
