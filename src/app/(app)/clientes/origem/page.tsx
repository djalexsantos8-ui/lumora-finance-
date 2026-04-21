// ─── Origem dos Clientes — Estatísticas por lead_source / segmento ─────────
//
// Blueprint 2026-04-21, item 13. Agrega jobs (freelances) por lead_source e
// client_segment, mostra:
//
//   · Top fontes por receita (revenue_total + total_value fallback)
//   · Top fontes por contagem
//   · Top segmentos por receita
//
// Leitura direta da tabela `jobs` — NÃO toca no composer/aggregators do
// dashboard executivo. Esta é uma página isolada: nada daqui afeta o cálculo
// do dashboard principal.
//
// Campos usados: lead_source, client_segment, revenue_total, total_value,
// status, deleted_at. Todos existem na tabela jobs desde a migration 014.

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { formatCurrency } from '@/lib/utils/format'

export const metadata = { title: 'Origem dos Clientes — Lumora Finance' }

interface JobRow {
  lead_source:    string | null
  client_segment: string | null
  revenue_total:  number | null
  total_value:    number | null
  status:         string | null
}

interface Bucket {
  label:   string
  count:   number
  revenue: number
  pct:     number
}

function aggregateBy(
  jobs: JobRow[],
  field: 'lead_source' | 'client_segment',
): Bucket[] {
  const map = new Map<string, { label: string; count: number; revenue: number }>()
  let noFieldCount = 0
  let noFieldRevenue = 0

  for (const j of jobs) {
    const raw = j[field]?.trim()
    const rev = Number(j.revenue_total ?? j.total_value ?? 0) || 0

    if (!raw) {
      noFieldCount += 1
      noFieldRevenue += rev
      continue
    }

    const key = raw.toLowerCase()
    const cur = map.get(key)
    if (cur) {
      cur.count += 1
      cur.revenue += rev
    } else {
      // Primeira ocorrência — preserva a capitalização original
      map.set(key, { label: raw, count: 1, revenue: rev })
    }
  }

  const totalRevenue =
    [...map.values()].reduce((s, v) => s + v.revenue, 0) + noFieldRevenue

  const buckets = [...map.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .map(({ label, count, revenue }) => ({
      label,
      count,
      revenue: Math.round(revenue * 100) / 100,
      pct: totalRevenue > 0 ? Math.round((revenue / totalRevenue) * 1000) / 10 : 0,
    }))

  if (noFieldCount > 0) {
    buckets.push({
      label:   'Sem informação',
      count:   noFieldCount,
      revenue: Math.round(noFieldRevenue * 100) / 100,
      pct:     totalRevenue > 0 ? Math.round((noFieldRevenue / totalRevenue) * 1000) / 10 : 0,
    })
  }

  return buckets
}

export default async function OrigemPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  if (!member) redirect('/dashboard')

  const { data: jobs } = await supabase
    .from('jobs')
    .select('lead_source,client_segment,revenue_total,total_value,status')
    .eq('workspace_id', member.workspace_id)
    .is('deleted_at', null)
    .neq('status', 'cancelled')

  const list = (jobs ?? []) as JobRow[]

  const bySource  = aggregateBy(list, 'lead_source')
  const bySegment = aggregateBy(list, 'client_segment')

  const totalJobs    = list.length
  const totalRevenue = list.reduce(
    (s, j) => s + (Number(j.revenue_total ?? j.total_value ?? 0) || 0),
    0,
  )

  return (
    <div className="min-h-full p-6 md:p-8 space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#525252] mb-1">
            <Link href="/clientes" className="hover:text-[#a3a3a3] transition-colors">
              Clientes
            </Link>
            <span>/</span>
            <span className="text-[#a3a3a3]">Origem</span>
          </div>
          <h1 className="text-xl font-bold text-white">Origem dos Clientes</h1>
          <p className="text-xs text-[#737373] mt-1">
            De onde vem a receita. Agrega freelances ativos (exclui cancelados) por fonte e segmento.
          </p>
        </div>
        <div className="flex items-center gap-6 text-right">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-[#525252]">Freelances ativos</p>
            <p className="text-xl font-bold text-white tabular-nums">{totalJobs}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-[#525252]">Receita acumulada</p>
            <p className="text-xl font-bold text-[#D4A853] tabular-nums">
              {formatCurrency(totalRevenue, 'BRL')}
            </p>
          </div>
        </div>
      </div>

      {totalJobs === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <StatsPanel
            title="Por fonte (lead_source)"
            subtitle="Onde o cliente descobriu seu trabalho"
            buckets={bySource}
            emptyHint="Preencha o campo “fonte” nos freelances para ver estatísticas aqui."
          />
          <StatsPanel
            title="Por segmento (client_segment)"
            subtitle="Tipo de cliente / nicho"
            buckets={bySegment}
            emptyHint="Preencha o campo “segmento” nos freelances para ver estatísticas aqui."
          />
        </div>
      )}
    </div>
  )
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="rounded-2xl border border-[#2a2a2a] bg-[#141414] p-8 text-center">
      <p className="text-sm text-[#a3a3a3]">
        Nenhum freelance cadastrado ainda. Crie o primeiro para começar a ver
        de onde vem sua receita.
      </p>
      <Link
        href="/freelances"
        className="inline-block mt-4 text-xs font-semibold text-[#D4A853] hover:text-[#E8C47A] transition-colors"
      >
        Ir para Freelances →
      </Link>
    </div>
  )
}

// ─── Panel ───────────────────────────────────────────────────────────────────

function StatsPanel({
  title,
  subtitle,
  buckets,
  emptyHint,
}: {
  title:     string
  subtitle:  string
  buckets:   Bucket[]
  emptyHint: string
}) {
  const realBuckets = buckets.filter(b => b.label !== 'Sem informação')
  const hasReal     = realBuckets.length > 0

  return (
    <div className="rounded-2xl border border-[#2a2a2a] bg-[#141414] p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        <p className="text-xs text-[#737373] mt-0.5">{subtitle}</p>
      </div>

      {!hasReal ? (
        <p className="text-xs text-[#525252]">{emptyHint}</p>
      ) : (
        <ul className="space-y-3">
          {buckets.map((b, idx) => (
            <li key={b.label + idx} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span
                  className={`truncate ${
                    b.label === 'Sem informação'
                      ? 'italic text-[#525252]'
                      : 'text-white font-medium'
                  }`}
                >
                  {b.label}
                </span>
                <span className="tabular-nums shrink-0 text-[#a3a3a3]">
                  {b.count} freelance{b.count !== 1 ? 's' : ''} ·{' '}
                  <span className="text-white font-semibold">
                    {formatCurrency(b.revenue, 'BRL')}
                  </span>{' '}
                  <span className="text-[#525252]">({b.pct.toFixed(1)}%)</span>
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-[#1c1c1c] overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    b.label === 'Sem informação' ? 'bg-[#2a2a2a]' : 'bg-[#D4A853]'
                  }`}
                  style={{ width: `${Math.min(100, b.pct)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
