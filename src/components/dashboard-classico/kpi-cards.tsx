'use client'

import type { ClassicoKpis } from '@/lib/dashboard-classico/fetch'
import { formatCurrency } from '@/lib/utils/format'

interface Props {
  kpis: ClassicoKpis
}

export function KpiCards({ kpis }: Props) {
  const cards = [
    {
      label: 'Receita total',
      value: formatCurrency(kpis.receitaTotal, 'BRL'),
      accent: 'text-[#D4A853]',
    },
    {
      label: 'Custo total',
      value: formatCurrency(kpis.custoTotal, 'BRL'),
      accent: 'text-[#e5e5e5]',
    },
    {
      label: 'Lucro bruto',
      value: formatCurrency(kpis.lucroBruto, 'BRL'),
      accent: kpis.lucroBruto >= 0 ? 'text-emerald-400' : 'text-red-400',
    },
    {
      label: 'Margem',
      value: `${kpis.margemPct.toFixed(1)}%`,
      accent: kpis.margemPct >= 20 ? 'text-emerald-400' : kpis.margemPct >= 0 ? 'text-[#D4A853]' : 'text-red-400',
    },
    {
      label: 'Freelances ativos',
      value: String(kpis.jobsAtivos),
      accent: 'text-[#e5e5e5]',
    },
    {
      label: 'Ticket médio',
      value: formatCurrency(kpis.ticketMedio, 'BRL'),
      accent: 'text-[#e5e5e5]',
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map(c => (
        <div
          key={c.label}
          className="rounded-xl border border-[#2a2a2a] bg-[#141414] p-4"
        >
          <p className="text-[10px] uppercase tracking-wide text-[#525252]">{c.label}</p>
          <p className={`mt-1 text-lg font-bold tabular-nums ${c.accent}`}>
            {c.value}
          </p>
        </div>
      ))}
    </div>
  )
}
