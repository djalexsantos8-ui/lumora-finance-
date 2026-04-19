// ─── KpiCard · N2 — KPI com sublabel SEMPRE visível ──────────────────────────
//
// O sublabel é a EDUCAÇÃO. Não é tooltip, não é modal. É texto em baixo do
// número, sempre lá. Regra sagrada do modelo Lumiere: o usuário não precisa
// decorar o que é "runway" — a explicação mora junto do número.
//
// Estrutura:
//   LABEL (caps pequeno)
//   VALOR (grande, tabular-nums)    ↑ 12% (trend opcional)
//   sublabel em linha — educa/contextualiza em 1 frase
//
// Tom opcional tinge o valor (usar com parcimônia — só quando o número
// sozinho já representa um risco/positivo claro).

import type { Sublabel, Tom } from '@/lib/dashboard/narrativa/types'
import { tomStyle } from './tom'

interface Props {
  value:     string              // já formatado ("R$ 12.300", "28%", "3 meses")
  sublabel:  Sublabel             // { label, sublabel, trend? }
  tom?:      Tom                  // opcional — só quando o número é o sinal
  size?:     'md' | 'lg'          // lg = destaque (ex: receita/resultado)
}

export function KpiCard({ value, sublabel, tom, size = 'md' }: Props) {
  const s = tom ? tomStyle(tom) : null

  const valueSize = size === 'lg'
    ? 'text-2xl md:text-3xl'
    : 'text-xl md:text-2xl'

  const trendUp   = sublabel.trend?.includes('↑')
  const trendDown = sublabel.trend?.includes('↓')
  const trendCls  = trendUp   ? 'text-emerald-400'
                  : trendDown ? 'text-red-400'
                  :             'text-[#525252]'

  return (
    <div className="rounded-xl border border-[#2a2a2a] bg-[#141414] p-4 md:p-5 flex flex-col gap-2">
      {/* Label — caps, pequeno, mudo */}
      <p className="text-[10px] font-bold tracking-widest uppercase text-[#737373]">
        {sublabel.label}
      </p>

      {/* Valor + trend inline */}
      <div className="flex items-baseline gap-3 flex-wrap">
        <span
          className={`${valueSize} font-bold tracking-tight tabular-nums ${
            s ? s.text : 'text-white'
          }`}
        >
          {value}
        </span>
        {sublabel.trend && (
          <span className={`text-xs font-medium tabular-nums ${trendCls}`}>
            {sublabel.trend}
          </span>
        )}
      </div>

      {/* Sublabel — a educação. Sempre visível. */}
      <p className="text-[11px] md:text-xs text-[#a3a3a3] leading-relaxed">
        {sublabel.sublabel}
      </p>
    </div>
  )
}
