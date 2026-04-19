'use client'

/**
 * FreelanceDateRange — Deploy 4 (F.6)
 *
 * UX unificada para data do freelance:
 *   [ data_início ]  até  [ data_fim (opcional) ]
 *
 * Regras:
 *   - start obrigatório (ISO yyyy-mm-dd)
 *   - end opcional; se vazio ou igual a start → single-day
 *   - end < start não é permitido (min no input + fallback onChange)
 *   - salva em onBlur (consistente com os demais campos inline do detalhe)
 *
 * Não toca em schema. O adapter de updateJob() traduz {date_start, date_end}
 * para os 4 campos legados (job_date, job_date_start, job_date_end, is_multi_day).
 */

import { useEffect, useState } from 'react'

interface FreelanceDateRangeProps {
  startDate: string
  endDate: string | null
  disabled?: boolean
  /** Chamado quando o usuário confirma (onBlur ou Enter). Não dispara durante digitação. */
  onCommit: (start: string, end: string | null) => void | Promise<void>
}

export function FreelanceDateRange({
  startDate,
  endDate,
  disabled = false,
  onCommit,
}: FreelanceDateRangeProps) {
  const [start, setStart] = useState<string>(startDate)
  const [end,   setEnd]   = useState<string>(endDate ?? '')

  // Sincroniza quando o job é recarregado (ex.: save em outro campo retorna dados novos).
  useEffect(() => { setStart(startDate)       }, [startDate])
  useEffect(() => { setEnd(endDate ?? '')     }, [endDate])

  function commit(nextStart: string, nextEnd: string) {
    // Normalizações do adapter UI:
    //  · end vazio → single-day (null)
    //  · end === start → single-day (null) — evita ruído visual e mantém is_multi_day=false
    //  · end < start  → ignora end (adapter backend também defende)
    const normalizedEnd =
      !nextEnd || nextEnd === nextStart || nextEnd < nextStart ? null : nextEnd
    onCommit(nextStart, normalizedEnd)
  }

  const inputCls =
    'text-xs bg-[#1c1c1c] border border-[#2a2a2a] rounded px-2 py-1 text-white outline-none focus:border-[#D4A853]/50 disabled:opacity-60 w-32'

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="date"
        value={start}
        disabled={disabled}
        onChange={e => setStart(e.target.value)}
        onBlur={() => {
          if (!start) return // não comita vazio — start é obrigatório
          commit(start, end)
        }}
        onKeyDown={e => {
          if (e.key === 'Enter' && start) commit(start, end)
        }}
        className={inputCls}
        aria-label="Data de início"
      />
      <span className="text-xs text-[#555]">até</span>
      <input
        type="date"
        value={end}
        min={start || undefined}
        disabled={disabled || !start}
        placeholder="(opcional)"
        onChange={e => setEnd(e.target.value)}
        onBlur={() => commit(start, end)}
        onKeyDown={e => {
          if (e.key === 'Enter') commit(start, end)
          if (e.key === 'Escape') setEnd(endDate ?? '')
        }}
        className={inputCls}
        aria-label="Data de fim (opcional)"
      />
    </div>
  )
}
