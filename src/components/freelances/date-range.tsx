'use client'

/**
 * FreelanceDateRange — Deploy 4 (F.6) · iteração "data única por padrão"
 *
 * UX revisada:
 *   · Modo padrão: [ data ]                     (single-day)
 *   · Toggle "+ usar intervalo de datas" revela: [ início ] até [ fim ]
 *
 * Detecção automática do modo inicial:
 *   · Se o job veio do servidor com endDate ≠ startDate → abre já em range
 *   · Caso contrário → abre em single
 *
 * Contrato de persistência (inalterado):
 *   · commit manda (start, end|null) para o pai
 *   · end=null / end=='' / end==start → backend adapter grava is_multi_day=false
 *     com job_date_end=job_date_start, mantendo os 4 campos legados atômicos
 *   · range com end válido → is_multi_day=true, job_date_end=end
 *
 * Regras invariantes:
 *   · start obrigatório (ISO yyyy-mm-dd) — não comita vazio
 *   · end < start não é permitido (min no input + fallback em commit)
 *   · salva em onBlur/Enter, consistente com os demais campos inline do detalhe
 *
 * Não toca em schema. Adapter em updateJob() é a única ponte para os 4 campos
 * legados (job_date, job_date_start, job_date_end, is_multi_day).
 */

import { useEffect, useState } from 'react'

interface FreelanceDateRangeProps {
  startDate: string
  endDate: string | null
  disabled?: boolean
  /**
   * Alinhamento do bloco. 'end' (default) é o usado no detalhe de Freelance
   * (InfoRow à direita). 'start' é usado no editor de Orçamento onde o bloco
   * vive num campo full-width com label em cima — ver budget-editor.tsx.
   *
   * Padrão oficial 2026-04-23: este mesmo componente serve Freelances e
   * Orçamentos. Qualquer alteração deve manter compatibilidade com ambos.
   */
  align?: 'start' | 'end'
  /** Chamado quando o usuário confirma (onBlur, Enter ou toggle que força commit). */
  onCommit: (start: string, end: string | null) => void | Promise<void>
}

export function FreelanceDateRange({
  startDate,
  endDate,
  disabled = false,
  align = 'end',
  onCommit,
}: FreelanceDateRangeProps) {
  const [start, setStart] = useState<string>(startDate)
  const [end,   setEnd]   = useState<string>(endDate ?? '')

  // Modo inicial: só é "range" se o servidor entregou um endDate distinto do start.
  // Depois disso, o toggle do usuário manda — com uma exceção (veja effect abaixo).
  const [isRange, setIsRange] = useState<boolean>(
    !!endDate && endDate !== startDate
  )

  // Sincroniza quando o job é recarregado (ex.: save em outro campo devolve dados novos).
  useEffect(() => { setStart(startDate) }, [startDate])

  useEffect(() => {
    setEnd(endDate ?? '')
    // Se o servidor passou a ter endDate multi-dia, força o modo range pra não
    // esconder dados. Se servidor vier single-day, não forçamos false: respeitamos
    // o toggle do usuário (ele pode ter acabado de ligar range e ainda não escolheu fim).
    if (endDate && endDate !== startDate) setIsRange(true)
  }, [endDate, startDate])

  function commit(nextStart: string, nextEnd: string) {
    if (!nextStart) return // start obrigatório
    const normalizedEnd =
      !nextEnd || nextEnd === nextStart || nextEnd < nextStart ? null : nextEnd
    onCommit(nextStart, normalizedEnd)
  }

  function toggleRange() {
    if (disabled) return
    if (isRange) {
      // Range → Single: limpa end e comita imediatamente (zera multi-day no banco).
      setIsRange(false)
      setEnd('')
      commit(start, '')
    } else {
      // Single → Range: só revela o segundo input. Sem commit (nada mudou ainda).
      setIsRange(true)
    }
  }

  const inputCls =
    'text-xs bg-[#1c1c1c] border border-[#2a2a2a] rounded px-2 py-1 text-white outline-none focus:border-[#D4A853]/50 disabled:opacity-60 w-32 transition-colors'

  return (
    <div className={`flex flex-col gap-1 ${align === 'start' ? 'items-start' : 'items-end'}`}>
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          value={start}
          disabled={disabled}
          onChange={e => setStart(e.target.value)}
          onBlur={() => {
            if (!start) return
            commit(start, isRange ? end : '')
          }}
          onKeyDown={e => {
            if (e.key === 'Enter' && start) commit(start, isRange ? end : '')
          }}
          className={inputCls}
          aria-label={isRange ? 'Data de início' : 'Data do freelance'}
        />

        {isRange && (
          <>
            <span className="text-xs text-[#555]" aria-hidden>até</span>
            <input
              type="date"
              value={end}
              min={start || undefined}
              disabled={disabled || !start}
              onChange={e => setEnd(e.target.value)}
              onBlur={() => commit(start, end)}
              onKeyDown={e => {
                if (e.key === 'Enter') commit(start, end)
                if (e.key === 'Escape') setEnd(endDate ?? '')
              }}
              className={inputCls}
              aria-label="Data de fim"
            />
          </>
        )}
      </div>

      {/* Toggle moderno "Usar múltiplas datas" — semântica de switch (ARIA).
          - role="switch" + aria-checked comunica estado on/off a leitores de tela
          - botão inteiro é clicável (switch visual + label)
          - foco visível no switch para teclado (group-focus-visible) */}
      <button
        type="button"
        role="switch"
        aria-checked={isRange}
        onClick={toggleRange}
        disabled={disabled}
        title={isRange
          ? 'Voltar para data única'
          : 'Definir data de início e fim'}
        className="group inline-flex items-center gap-2 select-none outline-none disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <span
          aria-hidden
          className={`inline-flex h-5 w-9 items-center rounded-full p-0.5 transition-colors shrink-0 group-focus-visible:ring-2 group-focus-visible:ring-[#D4A853]/40 ${
            isRange ? 'bg-[#D4A853]' : 'bg-[#2a2a2a] group-hover:bg-[#3a3a3a]'
          }`}
        >
          <span
            className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-150 ease-out ${
              isRange ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </span>
        <span
          className={`text-xs transition-colors ${
            isRange ? 'text-white' : 'text-[#737373] group-hover:text-[#a3a3a3]'
          }`}
        >
          Usar múltiplas datas
        </span>
      </button>
    </div>
  )
}
