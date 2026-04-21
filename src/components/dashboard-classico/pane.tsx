'use client'

/**
 * Dashboard Clássico — Orchestrator.
 *
 * Pane isolada, consumida exclusivamente pela aba "Dashboard" (conclusao)
 * do dashboard executivo. NÃO depende de aggregators/narrativa do executivo.
 * Faz sua própria chamada ao server action `getClassicoDashboard` cada
 * vez que os filtros mudam.
 */

import { useEffect, useState, useTransition } from 'react'
import type {
  ClassicoDashboard,
  ClassicoFilters,
} from '@/lib/dashboard-classico/fetch'
import { getClassicoDashboard } from '@/lib/dashboard-classico/fetch'

import { KpiCards }   from './kpi-cards'
import { FiltersBar } from './filters-bar'
import { PieChart }   from './pie-chart'
import { BarChart }   from './bar-chart'

const EMPTY_FILTERS: ClassicoFilters = {}

export function DashboardClassicoPane() {
  const [filters, setFilters] = useState<ClassicoFilters>(EMPTY_FILTERS)
  const [data,    setData]    = useState<ClassicoDashboard | null>(null)
  const [error,   setError]   = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function reload(nextFilters: ClassicoFilters) {
    setError(null)
    startTransition(async () => {
      try {
        const result = await getClassicoDashboard(nextFilters)
        setData(result)
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Erro desconhecido'
        setError(msg)
      }
    })
  }

  // Primeiro carregamento
  useEffect(() => {
    reload(EMPTY_FILTERS)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function onChange(next: ClassicoFilters) {
    setFilters(next)
    reload(next)
  }

  function onReset() {
    setFilters(EMPTY_FILTERS)
    reload(EMPTY_FILTERS)
  }

  // ── Loading inicial ──────────────────────────────────────────────────────
  if (!data && !error) {
    return (
      <div className="space-y-4">
        <div className="h-24 rounded-2xl border border-[#2a2a2a] bg-[#141414] animate-pulse" />
        <div className="h-16 rounded-2xl border border-[#2a2a2a] bg-[#141414] animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="h-64 rounded-2xl border border-[#2a2a2a] bg-[#141414] animate-pulse" />
          <div className="h-64 rounded-2xl border border-[#2a2a2a] bg-[#141414] animate-pulse" />
          <div className="h-64 rounded-2xl border border-[#2a2a2a] bg-[#141414] animate-pulse" />
        </div>
      </div>
    )
  }

  // ── Erro ─────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="rounded-2xl border border-red-900/40 bg-red-950/20 p-5">
        <h3 className="text-sm font-semibold text-red-300 mb-1">
          Não foi possível carregar o dashboard
        </h3>
        <p className="text-xs text-red-200/70">{error}</p>
        <button
          type="button"
          onClick={() => reload(filters)}
          className="mt-3 text-[11px] text-[#D4A853] hover:text-[#E8C47A]"
        >
          Tentar novamente
        </button>
      </div>
    )
  }

  if (!data) return null

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Header contextual */}
      <div>
        <p className="text-[10px] font-bold tracking-widest uppercase text-[#525252]">
          Dashboard Clássico
        </p>
        <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight mt-0.5">
          Segmenta e compara
        </h2>
        <p className="text-xs text-[#a3a3a3] mt-1 max-w-2xl">
          Filtros por cliente, segmento e fonte. Receita vs custo por mês.
          Camada independente do dashboard executivo — não altera a narrativa.
        </p>
      </div>

      <KpiCards kpis={data.kpis} />

      <FiltersBar
        value={filters}
        options={data.options}
        onChange={onChange}
        onReset={onReset}
        loading={pending}
      />

      {data.isEmpty ? (
        <div className="rounded-2xl border border-[#2a2a2a] bg-[#141414] p-8 text-center">
          <p className="text-sm text-[#a3a3a3]">
            Sem freelances no período selecionado.
          </p>
          <p className="text-xs text-[#525252] mt-1">
            Ajuste os filtros ou cadastre um novo freelance.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <PieChart
              title="Receita por segmento"
              subtitle="Distribuição por nicho de cliente"
              slices={data.receitaPorSegmento}
            />
            <PieChart
              title="Receita por cliente"
              subtitle="Top 10 clientes do período"
              slices={data.receitaPorCliente}
            />
            <PieChart
              title="Receita por fonte"
              subtitle="De onde vêm os trabalhos"
              slices={data.receitaPorFonte}
            />
          </div>

          <BarChart
            title="Receita vs Custo por mês"
            subtitle="Comparativo mensal — mostra quanto sobrou de fato"
            data={data.serieMensal}
          />
        </>
      )}
    </div>
  )
}
