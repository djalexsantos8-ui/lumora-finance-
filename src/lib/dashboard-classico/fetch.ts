'use server'

/**
 * Dashboard Clássico — Camada de dados ISOLADA.
 *
 * Esta camada NÃO toca nos aggregators / narrativa / composer do dashboard
 * executivo. Tem queries próprias, tipos próprios, contrato próprio.
 *
 * Motivo do isolamento: o executivo depende de invariantes delicadas
 * (receita vs custos batendo, narrativa consistente). Qualquer refactor
 * genérico "com filtros" arrisca quebrar esses invariantes. O clássico
 * responde outra pergunta — "segmenta e compara" — então vive sozinho.
 *
 * Contrato retornado:
 *   { kpis, receitaPorSegmento, receitaPorCliente, receitaPorFonte,
 *     serieMensal (receita vs custos) }
 */

import { createClient } from '@/lib/supabase/server'
import { getWorkspaceId } from '@/lib/utils/workspace'

export interface ClassicoFilters {
  /** ISO yyyy-mm-dd — inclusivo */
  dateFrom?:    string
  /** ISO yyyy-mm-dd — inclusivo */
  dateTo?:      string
  clientId?:    string | null
  segment?:     string | null
  leadSource?:  string | null
}

export interface ClassicoKpis {
  receitaTotal:  number
  custoTotal:    number
  lucroBruto:    number
  margemPct:     number
  jobsAtivos:    number
  ticketMedio:   number
}

export interface ClassicoBucket {
  label:   string
  value:   number
  count:   number
  pct:     number
}

export interface SerieMensalPoint {
  /** yyyy-mm */
  month:    string
  receita:  number
  custo:    number
}

export interface ClassicoOptions {
  clientes:    { id: string; name: string }[]
  segmentos:   string[]
  leadSources: string[]
}

export interface ClassicoDashboard {
  kpis:               ClassicoKpis
  receitaPorSegmento: ClassicoBucket[]
  receitaPorCliente:  ClassicoBucket[]
  receitaPorFonte:    ClassicoBucket[]
  serieMensal:        SerieMensalPoint[]
  options:            ClassicoOptions
  filters:            ClassicoFilters
  isEmpty:            boolean
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function rev(j: {
  revenue_total: number | null
  total_value:   number | null
}): number {
  return Number(j.revenue_total ?? j.total_value ?? 0) || 0
}

function cst(j: { cost_total: number | null }): number {
  return Number(j.cost_total ?? 0) || 0
}

function bucketize(
  map: Map<string, { label: string; value: number; count: number }>,
  totalValue: number,
): ClassicoBucket[] {
  return [...map.values()]
    .sort((a, b) => b.value - a.value)
    .map(({ label, value, count }) => ({
      label,
      value:  Math.round(value * 100) / 100,
      count,
      pct:    totalValue > 0 ? Math.round((value / totalValue) * 1000) / 10 : 0,
    }))
}

function monthKey(dateStr: string | null): string {
  if (!dateStr) return ''
  return dateStr.slice(0, 7) // yyyy-mm
}

// ─── Main fetcher ───────────────────────────────────────────────────────────

export async function getClassicoDashboard(
  filters: ClassicoFilters = {},
): Promise<ClassicoDashboard> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autorizado')

  const workspaceId = await getWorkspaceId(user.id)
  if (!workspaceId) throw new Error('Workspace não encontrado')

  // ── Query principal: jobs (receita + custo + metadados) ─────────────────
  let jobsQ = supabase
    .from('jobs')
    .select(`
      id,
      title,
      client_id,
      client_name,
      client_segment,
      lead_source,
      status,
      job_date,
      job_date_start,
      job_date_end,
      revenue_total,
      total_value,
      cost_total
    `)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .neq('status', 'cancelled')

  if (filters.dateFrom) jobsQ = jobsQ.gte('job_date', filters.dateFrom)
  if (filters.dateTo)   jobsQ = jobsQ.lte('job_date', filters.dateTo)
  if (filters.clientId) jobsQ = jobsQ.eq('client_id', filters.clientId)
  if (filters.segment)  jobsQ = jobsQ.ilike('client_segment', filters.segment)
  if (filters.leadSource) jobsQ = jobsQ.ilike('lead_source', filters.leadSource)

  const [jobsRes, clientsRes] = await Promise.all([
    jobsQ,
    supabase
      .from('clients')
      .select('id, name')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .order('name', { ascending: true }),
  ])

  const jobs = jobsRes.data ?? []

  // ── Agregados ───────────────────────────────────────────────────────────
  const receitaTotal = jobs.reduce((s, j) => s + rev(j), 0)
  const custoTotal   = jobs.reduce((s, j) => s + cst(j), 0)
  const lucroBruto   = receitaTotal - custoTotal
  const margemPct    = receitaTotal > 0 ? (lucroBruto / receitaTotal) * 100 : 0
  const ticketMedio  = jobs.length > 0 ? receitaTotal / jobs.length : 0

  // ── Buckets: por segmento ──────────────────────────────────────────────
  const segMap = new Map<string, { label: string; value: number; count: number }>()
  for (const j of jobs) {
    const raw = j.client_segment?.trim() || 'Sem segmento'
    const key = raw.toLowerCase()
    const v   = rev(j)
    const cur = segMap.get(key)
    if (cur) { cur.value += v; cur.count += 1 }
    else     { segMap.set(key, { label: raw, value: v, count: 1 }) }
  }

  // ── Buckets: por cliente ───────────────────────────────────────────────
  const cliMap = new Map<string, { label: string; value: number; count: number }>()
  for (const j of jobs) {
    const raw = j.client_name?.trim() || 'Cliente sem nome'
    const key = (j.client_id ?? raw).toLowerCase()
    const v   = rev(j)
    const cur = cliMap.get(key)
    if (cur) { cur.value += v; cur.count += 1 }
    else     { cliMap.set(key, { label: raw, value: v, count: 1 }) }
  }

  // ── Buckets: por fonte (lead_source) ───────────────────────────────────
  const fonteMap = new Map<string, { label: string; value: number; count: number }>()
  for (const j of jobs) {
    const raw = j.lead_source?.trim() || 'Sem informação'
    const key = raw.toLowerCase()
    const v   = rev(j)
    const cur = fonteMap.get(key)
    if (cur) { cur.value += v; cur.count += 1 }
    else     { fonteMap.set(key, { label: raw, value: v, count: 1 }) }
  }

  // ── Série mensal: receita vs custo por mês ─────────────────────────────
  const serieMap = new Map<string, SerieMensalPoint>()
  for (const j of jobs) {
    const mKey = monthKey(j.job_date ?? j.job_date_start ?? null)
    if (!mKey) continue
    const cur = serieMap.get(mKey)
    const v = rev(j)
    const c = cst(j)
    if (cur) { cur.receita += v; cur.custo += c }
    else     { serieMap.set(mKey, { month: mKey, receita: v, custo: c }) }
  }
  const serieMensal = [...serieMap.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map(p => ({
      month:   p.month,
      receita: Math.round(p.receita * 100) / 100,
      custo:   Math.round(p.custo * 100) / 100,
    }))

  // ── Options pros selects de filtro ─────────────────────────────────────
  // (consultar no workspace inteiro, não só jobs filtrados — pra permitir
  // mudar filtro sem perder opções)
  const { data: allJobsForOptions } = await supabase
    .from('jobs')
    .select('client_segment, lead_source')
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .neq('status', 'cancelled')

  const segmentos = new Set<string>()
  const leadSources = new Set<string>()
  for (const j of allJobsForOptions ?? []) {
    if (j.client_segment?.trim()) segmentos.add(j.client_segment.trim())
    if (j.lead_source?.trim())    leadSources.add(j.lead_source.trim())
  }

  return {
    kpis: {
      receitaTotal: Math.round(receitaTotal * 100) / 100,
      custoTotal:   Math.round(custoTotal * 100) / 100,
      lucroBruto:   Math.round(lucroBruto * 100) / 100,
      margemPct:    Math.round(margemPct * 10) / 10,
      jobsAtivos:   jobs.length,
      ticketMedio:  Math.round(ticketMedio * 100) / 100,
    },
    receitaPorSegmento: bucketize(segMap, receitaTotal),
    receitaPorCliente:  bucketize(cliMap, receitaTotal).slice(0, 10),
    receitaPorFonte:    bucketize(fonteMap, receitaTotal),
    serieMensal,
    options: {
      clientes:    (clientsRes.data ?? []).map(c => ({ id: c.id, name: c.name })),
      segmentos:   [...segmentos].sort(),
      leadSources: [...leadSources].sort(),
    },
    filters,
    isEmpty: jobs.length === 0,
  }
}
