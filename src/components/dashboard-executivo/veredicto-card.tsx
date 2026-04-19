// ─── VeredictoCard · N1 — o HERO da aba ──────────────────────────────────────
//
// É a primeira coisa que o usuário lê. Dominante, visual, colorida pelo tom.
// Estrutura: pergunta (label pequeno) → tese (grande, colorida) → nuance
// (corpo) → prova (pill com número).
//
// Regra: o usuário bate o olho, entende em 3 segundos se tá bem, em atenção
// ou crítico — SEM precisar ler o resto.

import type { Veredicto } from '@/lib/dashboard/narrativa/types'
import { tomStyle } from './tom'

interface Props {
  veredicto: Veredicto
}

export function VeredictoCard({ veredicto }: Props) {
  const s = tomStyle(veredicto.tom)

  return (
    <section
      className={`relative overflow-hidden rounded-2xl border ${s.border} ${s.bgSoft} bg-[#141414] p-6 md:p-8`}
    >
      {/* Barra lateral colorida — sinaliza tom sem ser gritante */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${s.accent}`} />

      <div className="pl-2 md:pl-4">
        {/* Pergunta — label pequeno, em caps */}
        <p className="text-[10px] md:text-[11px] font-bold tracking-widest uppercase text-[#525252] mb-3">
          {veredicto.pergunta}
        </p>

        {/* Tese — O HERO. Grande, color-coded pelo tom. */}
        <h2 className={`text-3xl md:text-5xl font-bold leading-tight tracking-tight ${s.text}`}>
          {veredicto.tese}
        </h2>

        {/* Nuance — "mas…" em corpo de texto humano */}
        <p className="mt-3 text-sm md:text-base text-[#d4d4d4] leading-relaxed max-w-3xl">
          {veredicto.nuance}
        </p>

        {/* Prova — pill com o número concreto */}
        <div className="mt-5 flex items-center gap-2 flex-wrap">
          <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${s.bgSolid} ${s.textOnBg} tabular-nums`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
            {veredicto.prova}
          </span>

          {/* Badge do status (Saudável/Atenção/Crítico) — redundância útil */}
          <span className="text-[10px] font-bold tracking-widest uppercase text-[#525252]">
            {s.label}
          </span>
        </div>
      </div>
    </section>
  )
}
