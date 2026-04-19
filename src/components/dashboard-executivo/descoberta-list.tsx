// ─── DescobertaList · N3 — os fatos concretos ────────────────────────────────
//
// Lista de 3–5 descobertas já ordenadas por gravidade (crítico > atenção >
// positivo). Cada item:
//   · dot colorido pela gravidade
//   · texto com número embutido
//   · badge discreto da dimensão (financeira | comercial)
//
// Não é um dashboard de KPI — é uma *leitura* priorizada. A ordem importa:
// os primeiros ITEMS SÃO OS QUE MERECEM AÇÃO HOJE.

import type { Descoberta } from '@/lib/dashboard/narrativa/types'
import { tomStyle } from './tom'

interface Props {
  descobertas: Descoberta[]
  title?:      string
}

function DimensaoBadge({ dimensao }: { dimensao: Descoberta['dimensao'] }) {
  const isComercial = dimensao === 'comercial'
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-bold tracking-widest uppercase border ${
        isComercial
          ? 'border-[#D4A853]/30 bg-[#D4A853]/5 text-[#D4A853]'
          : 'border-[#2a2a2a] bg-[#0a0a0a] text-[#737373]'
      }`}
    >
      {isComercial ? 'Comercial' : 'Financeiro'}
    </span>
  )
}

export function DescobertaList({ descobertas, title = 'O que vale olhar' }: Props) {
  if (descobertas.length === 0) {
    return (
      <section className="rounded-2xl border border-[#2a2a2a] bg-[#141414] p-5 md:p-6">
        <p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-2">
          {title}
        </p>
        <p className="text-sm text-[#525252]">
          Sem descobertas relevantes neste mês — nada disparou nenhuma regra.
        </p>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-[#2a2a2a] bg-[#141414] p-5 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] font-bold tracking-widest uppercase text-[#737373]">
          {title}
        </p>
        <span className="text-[10px] text-[#525252]">
          {descobertas.length} {descobertas.length === 1 ? 'sinal' : 'sinais'}
        </span>
      </div>

      <ul className="flex flex-col gap-3">
        {descobertas.map((d, idx) => {
          const s = tomStyle(d.gravidade)
          return (
            <li
              key={d.codigo + idx}
              className={`relative rounded-xl border ${s.border} ${s.bgSoft} p-3 md:p-4 flex gap-3 items-start`}
            >
              {/* Dot colorido pela gravidade */}
              <span
                className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${s.dot}`}
                aria-hidden
              />

              <div className="flex-1 min-w-0">
                <p className="text-sm text-[#e5e5e5] leading-relaxed">
                  {d.texto}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <DimensaoBadge dimensao={d.dimensao} />
                  <span className="text-[9px] font-bold tracking-widest uppercase text-[#525252]">
                    {s.label}
                  </span>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
