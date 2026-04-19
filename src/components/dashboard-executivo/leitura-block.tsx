// ─── LeituraBlock · N4 — parágrafo humano ───────────────────────────────────
//
// 2–4 frases. Linguagem de pessoa. Conecta os números com a decisão — é onde
// o usuário finalmente "entende" o que os dados significam pra vida dele.
//
// Estética: max-width confortável pra leitura (prose), color-coded pelo tom.

import type { Leitura } from '@/lib/dashboard/narrativa/types'
import { tomStyle } from './tom'

interface Props {
  leitura: Leitura
  title?: string
}

export function LeituraBlock({ leitura, title = 'O que isso significa' }: Props) {
  const s = tomStyle(leitura.tom)

  return (
    <section className={`rounded-2xl border ${s.border} ${s.bgSoft} bg-[#141414] p-5 md:p-6`}>
      <div className="flex items-center gap-2 mb-3">
        <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
        <p className="text-[10px] font-bold tracking-widest uppercase text-[#737373]">
          {title}
        </p>
      </div>

      <p className="text-sm md:text-[15px] text-[#e5e5e5] leading-relaxed max-w-3xl">
        {leitura.paragrafo}
      </p>
    </section>
  )
}
