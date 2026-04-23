'use client'

// ─── Onboarding · ProductTour ───────────────────────────────────────────────
//
// Etapa 3. Carrossel de slides (TOUR_SLIDES) com navegação anterior/próximo,
// dots clicáveis, barra de progresso e dois CTAs terminais: "Pular" (só
// registra skip) e "Começar a usar" (markOnboardingCompleted).
//
// Design: card premium compacto — não é modal gigante. Dá pra ler o slide
// inteiro em 3 segundos. Copy carrega o valor.

import { useState } from 'react'
import { TOUR_SLIDES, type TourSlide } from './tour-slides'

interface Props {
  onFinish: () => void
  onSkip:   () => void
}

const COLOR_MAP: Record<TourSlide['color'], { tint: string; accent: string }> = {
  gold:    { tint: 'from-[#D4A853]/20 to-[#D4A853]/5',    accent: 'text-[#E8C47A]' },
  teal:    { tint: 'from-teal-500/20 to-teal-500/5',      accent: 'text-teal-300' },
  violet:  { tint: 'from-violet-500/20 to-violet-500/5',  accent: 'text-violet-300' },
  rose:    { tint: 'from-rose-500/20 to-rose-500/5',      accent: 'text-rose-300' },
  emerald: { tint: 'from-emerald-500/20 to-emerald-500/5', accent: 'text-emerald-300' },
  amber:   { tint: 'from-amber-500/20 to-amber-500/5',    accent: 'text-amber-300' },
  sky:     { tint: 'from-sky-500/20 to-sky-500/5',        accent: 'text-sky-300' },
  indigo:  { tint: 'from-indigo-500/20 to-indigo-500/5',  accent: 'text-indigo-300' },
  orange:  { tint: 'from-orange-500/20 to-orange-500/5',  accent: 'text-orange-300' },
  slate:   { tint: 'from-slate-500/20 to-slate-500/5',    accent: 'text-slate-300' },
}

export default function ProductTour({ onFinish, onSkip }: Props) {
  const [idx, setIdx] = useState(0)
  const slide = TOUR_SLIDES[idx]
  const total = TOUR_SLIDES.length
  const isLast = idx === total - 1
  const isFirst = idx === 0
  const tint = COLOR_MAP[slide.color]

  function next() {
    if (isLast) onFinish()
    else setIdx((i) => i + 1)
  }

  function prev() {
    if (!isFirst) setIdx((i) => i - 1)
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Progress bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1 bg-[#1f1f1f] rounded-full overflow-hidden">
          <div
            className="h-full bg-[#D4A853] transition-all duration-300"
            style={{ width: `${((idx + 1) / total) * 100}%` }}
          />
        </div>
        <span className="text-[10px] font-medium text-[#525252] tabular-nums">
          {idx + 1} / {total}
        </span>
      </div>

      {/* Slide */}
      <div className={`rounded-2xl bg-gradient-to-br ${tint.tint} border border-[#2a2a2a] p-5 md:p-6 min-h-[230px]`}>
        <div className="flex items-center gap-2 mb-3">
          <span className={`text-[10px] font-bold uppercase tracking-[0.14em] ${tint.accent}`}>
            {slide.title}
          </span>
          {slide.status === 'preview' && (
            <span className="text-[9px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[#1f1f1f] text-[#a3a3a3] border border-[#2a2a2a]">
              em breve
            </span>
          )}
        </div>

        <h3 className="text-xl md:text-2xl font-bold text-white leading-tight mb-2">
          {slide.tagline}
        </h3>

        <p className="text-sm text-[#d4d4d4] leading-relaxed">
          {slide.body}
        </p>

        {slide.highlight && (
          <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#D4A853]/10 border border-[#D4A853]/30">
            <svg className="w-3.5 h-3.5 text-[#E8C47A]" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            <span className="text-[11px] font-semibold text-[#E8C47A]">{slide.highlight}</span>
          </div>
        )}
      </div>

      {/* Dots */}
      <div className="flex items-center justify-center gap-1.5">
        {TOUR_SLIDES.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setIdx(i)}
            aria-label={`Ir para ${s.title}`}
            className={`h-1.5 rounded-full transition-all ${
              i === idx ? 'w-6 bg-[#D4A853]' : 'w-1.5 bg-[#2a2a2a] hover:bg-[#3a3a3a]'
            }`}
          />
        ))}
      </div>

      {/* Ações */}
      <div className="flex items-center justify-between gap-3 pt-2 border-t border-[#1f1f1f]">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onSkip}
            className="text-xs font-medium text-[#737373] hover:text-white transition-colors"
          >
            Pular tour
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={prev}
            disabled={isFirst}
            className="text-xs font-medium text-[#a3a3a3] hover:text-white px-3 py-2 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ← Voltar
          </button>
          <button
            type="button"
            onClick={next}
            className="flex items-center gap-1.5 bg-[#D4A853] hover:bg-[#E8C47A] text-[#0a0a0a] font-semibold text-sm px-4 py-2 rounded-xl transition-colors"
          >
            {isLast ? 'Começar a usar' : 'Próximo'}
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
