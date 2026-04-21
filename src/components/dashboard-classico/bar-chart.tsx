'use client'

/**
 * Bar chart comparativo SVG. Cada mês tem 2 barras lado a lado:
 * receita (gold) vs custo (cinza escuro).
 */

import { formatCurrency } from '@/lib/utils/format'

interface Point {
  month:    string
  receita:  number
  custo:    number
}

interface Props {
  title:     string
  subtitle?: string
  data:      Point[]
  currency?: string
}

export function BarChart({ title, subtitle, data, currency = 'BRL' }: Props) {
  if (!data.length) {
    return (
      <div className="rounded-2xl border border-[#2a2a2a] bg-[#141414] p-5">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          {subtitle && <p className="text-xs text-[#737373] mt-0.5">{subtitle}</p>}
        </div>
        <p className="text-xs text-[#525252]">Sem dados para o período.</p>
      </div>
    )
  }

  const max = Math.max(
    1,
    ...data.flatMap(p => [p.receita, p.custo]),
  )

  // Responsive: viewBox-based. Largura útil escala com o número de meses.
  const w = Math.max(320, data.length * 60)
  const h = 180
  const padL = 8, padR = 8, padT = 12, padB = 28
  const chartW = w - padL - padR
  const chartH = h - padT - padB

  const groupW = chartW / data.length
  const barW   = Math.min(14, (groupW - 8) / 2)

  return (
    <div className="rounded-2xl border border-[#2a2a2a] bg-[#141414] p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
        <div>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          {subtitle && <p className="text-xs text-[#737373] mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-[#a3a3a3]">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#D4A853]" />
            Receita
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#525252]" />
            Custo
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="max-w-full">
          {/* Grid horizontal */}
          {[0.25, 0.5, 0.75, 1].map((f, i) => (
            <line
              key={i}
              x1={padL}
              y1={padT + chartH * (1 - f)}
              x2={padL + chartW}
              y2={padT + chartH * (1 - f)}
              stroke="#2a2a2a"
              strokeDasharray="2,3"
            />
          ))}

          {data.map((p, i) => {
            const gx = padL + i * groupW
            const receitaH = (p.receita / max) * chartH
            const custoH   = (p.custo / max) * chartH
            const barBase  = padT + chartH

            return (
              <g key={p.month}>
                {/* Receita */}
                <rect
                  x={gx + groupW / 2 - barW - 1}
                  y={barBase - receitaH}
                  width={barW}
                  height={receitaH}
                  fill="#D4A853"
                  rx="2"
                >
                  <title>
                    {p.month} — Receita: {formatCurrency(p.receita, currency)}
                  </title>
                </rect>
                {/* Custo */}
                <rect
                  x={gx + groupW / 2 + 1}
                  y={barBase - custoH}
                  width={barW}
                  height={custoH}
                  fill="#525252"
                  rx="2"
                >
                  <title>
                    {p.month} — Custo: {formatCurrency(p.custo, currency)}
                  </title>
                </rect>
                {/* Label do mês */}
                <text
                  x={gx + groupW / 2}
                  y={h - 10}
                  textAnchor="middle"
                  className="text-[10px]"
                  fill="#737373"
                >
                  {p.month.slice(5)}/{p.month.slice(2, 4)}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}
