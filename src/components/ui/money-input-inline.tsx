'use client'

// ─── MoneyInputInline ─────────────────────────────────────────────────────
//
// Versão enxuta do MoneyInput para usar em grids apertados (tabelas de
// itens, repasses, etc). Mesma lógica de digitação em modo CENTAVOS:
//
//   1     → 0,01
//   10    → 0,10
//   100   → 1,00
//   150000 → 1.500,00
//
// Diferenças vs MoneyInput padrão:
//   · NÃO renderiza o símbolo da moeda (a coluna UNIT. já contextualiza).
//   · NÃO aplica border/padding fixos — herda do `className` que o call-site
//     passa (inputSm dos editors, etc).
//   · API simétrica ao MoneyInput, mas com foco em uso dentro de linhas.
//
// Compromisso: mantém `value: number` → `onChange: (v: number) => void`,
// então o call-site armazena o número cru (não a string formatada), o que
// é exatamente o que os editors já fazem ao chamar `addRecurring*Item`.

import { useEffect, useMemo, useState } from 'react'
import { getCurrencyDecimals, toNumberSafe } from '@/lib/utils/format'

interface Props {
  value:        number | string | null
  currency:     string
  onChange?:    (value: number) => void
  onCommit?:    (value: number) => void
  onBlur?:      (e: React.FocusEvent<HTMLInputElement>) => void
  onKeyDown?:   (e: React.KeyboardEvent<HTMLInputElement>) => void
  disabled?:    boolean
  autoFocus?:   boolean
  className?:   string
  ariaLabel?:   string
  placeholder?: string
}

function formatMinor(minorUnits: number, decimals: number): string {
  const safe = Number.isFinite(minorUnits) ? Math.max(0, Math.floor(minorUnits)) : 0
  const divisor = Math.pow(10, decimals)
  const value = safe / divisor
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function digitsToMinor(raw: string): number {
  const digits = (raw.match(/\d/g) ?? []).join('').slice(0, 15)
  if (!digits) return 0
  const n = parseInt(digits, 10)
  return Number.isFinite(n) ? n : 0
}

export function MoneyInputInline({
  value,
  currency,
  onChange,
  onCommit,
  onBlur,
  onKeyDown,
  disabled,
  autoFocus,
  className,
  ariaLabel,
  placeholder = '0,00',
}: Props) {
  const decimals = getCurrencyDecimals(currency)
  const divisor = useMemo(() => Math.pow(10, decimals), [decimals])

  const externalMinor = Math.max(0, Math.round(toNumberSafe(value) * divisor))
  const [minor, setMinor] = useState<number>(externalMinor)

  useEffect(() => {
    setMinor(prev => (prev === externalMinor ? prev : externalMinor))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalMinor])

  const display = useMemo(() => formatMinor(minor, decimals), [minor, decimals])

  function commit(next: number) {
    setMinor(next)
    onChange?.(next / divisor)
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      spellCheck={false}
      disabled={disabled}
      autoFocus={autoFocus}
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={display}
      onChange={e => commit(digitsToMinor(e.target.value))}
      onFocus={e => {
        const el = e.currentTarget
        requestAnimationFrame(() => {
          try {
            const len = el.value.length
            el.setSelectionRange(len, len)
          } catch { /* noop */ }
        })
      }}
      onClick={e => {
        const el = e.currentTarget
        try {
          const len = el.value.length
          el.setSelectionRange(len, len)
        } catch { /* noop */ }
      }}
      onBlur={e => {
        onCommit?.(minor / divisor)
        onBlur?.(e)
      }}
      onKeyDown={e => {
        if (e.key === 'Enter') {
          onCommit?.(minor / divisor)
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'Backspace') {
          e.preventDefault()
          commit(0)
        }
        onKeyDown?.(e)
      }}
      className={`tabular-nums ${className ?? ''}`}
    />
  )
}
