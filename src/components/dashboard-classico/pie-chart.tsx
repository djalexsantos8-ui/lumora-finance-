'use client'

/**
 * Pie chart SVG puro. Sem dependência externa.
 * Paleta derivada do Lumora Finance (dark + gold + complementares).
 */

interface Slice {
  label:  string
  value:  number
  pct:    number
  count:  number
}

interface Props {
  title:    string
  subtitle?: string
  slices:   Slice[]
  emptyHint?: string
}

const COLORS = [
  '#D4A853', // gold (Lumora primary)
  '#E8C47A', // gold light
  '#A07E3B', // gold dark
  '#4B9CD3', // azul suave
  '#6B8E23', // oliva
  '#A45A52', // terracota
  '#7B68EE', // roxo suave
  '#888888', // cinza
]

export function PieChart({ title, subtitle, slices, emptyHint }: Props) {
  const total = slices.reduce((s, x) => s + x.value, 0)

  if (total <= 0) {
    return (
      <div className="rounded-2xl border border-[#2a2a2a] bg-[#141414] p-5">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          {subtitle && <p className="text-xs text-[#737373] mt-0.5">{subtitle}</p>}
        </div>
        <p className="text-xs text-[#525252]">
          {emptyHint ?? 'Sem dados para os filtros atuais.'}
        </p>
      </div>
    )
  }

  // Calcula paths de cada fatia
  const cx = 70, cy = 70, r = 60
  let acc = 0
  const segments = slices.map((s, i) => {
    const frac = s.value / total
    const start = acc
    const end = acc + frac
    acc = end

    const a0 = start * 2 * Math.PI - Math.PI / 2
    const a1 = end   * 2 * Math.PI - Math.PI / 2
    const x0 = cx + r * Math.cos(a0)
    const y0 = cy + r * Math.sin(a0)
    const x1 = cx + r * Math.cos(a1)
    const y1 = cy + r * Math.sin(a1)
    const largeArc = frac > 0.5 ? 1 : 0

    const path = [
      `M ${cx} ${cy}`,
      `L ${x0} ${y0}`,
      `A ${r} ${r} 0 ${largeArc} 1 ${x1} ${y1}`,
      'Z',
    ].join(' ')

    return { path, color: COLORS[i % COLORS.length], slice: s }
  })

  return (
    <div className="rounded-2xl border border-[#2a2a2a] bg-[#141414] p-5">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        {subtitle && <p className="text-xs text-[#737373] mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-start gap-5 flex-wrap">
        <svg viewBox="0 0 140 140" className="w-36 h-36 shrink-0">
          {segments.map((seg, i) => (
            <path
              key={i}
              d={seg.path}
              fill={seg.color}
              stroke="#0a0a0a"
              strokeWidth="1"
            />
          ))}
          {/* Donut hole central opcional — visual mais maduro */}
          <circle cx={cx} cy={cy} r={28} fill="#141414" />
        </svg>

        <ul className="flex-1 min-w-0 space-y-1.5 text-xs">
          {segments.map((seg, i) => (
            <li key={i} className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-sm shrink-0"
                style={{ backgroundColor: seg.color }}
              />
              <span className="truncate text-[#e5e5e5]">{seg.slice.label}</span>
              <span className="ml-auto tabular-nums text-[#a3a3a3] shrink-0">
                {seg.slice.pct.toFixed(1)}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
