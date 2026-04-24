'use client'

// ─── MoneyInput ──────────────────────────────────────────────────────────────
//
// Input profissional para valores monetários com digitação em modo CENTAVOS.
//
// Spec definida pelo usuário (2026-04-24):
//   1     → R$ 0,01
//   10    → R$ 0,10
//   100   → R$ 1,00
//   1000  → R$ 10,00
//   150000 → R$ 1.500,00
//
// Cada dígito digitado desloca a vírgula (estilo caixa registradora). Letras e
// símbolos são ignorados; só dígitos contam.
//
// API MANTIDA retrocompatível — ainda recebe `value: number | string | null` e
// emite para o pai `onChange: (value: number) => void`. Call sites existentes
// (recurring-editor, order-editor) ganham a UX nova sem refactor.
//
// Diferenças vs versão anterior:
//   · Formatação com 2 casas SEMPRE visível (nunca mais string vazia).
//   · Placeholder substituído por "0,00" sempre; display mostra o valor.
//   · Não reformata no blur (já está formatado continuamente).
//   · Backspace remove só o último dígito (volta pro estado anterior).
//
// Uso:
//   <MoneyInput value={amount} currency="BRL" onChange={setAmount} />

import { useEffect, useMemo, useState } from 'react'
import { getCurrencyDecimals, getCurrencySymbol, toNumberSafe } from '@/lib/utils/format'

interface Props {
  /** Valor atual em número puro (ex: 1234.56). Aceita string de numeric do Supabase. */
  value: number | string | null
  /** Código ISO da moeda (BRL, USD, EUR, GBP). */
  currency: string
  /** Disparado a cada mudança com o número parseado. */
  onChange?: (value: number) => void
  /** Disparado na blur ou Enter (commit). */
  onCommit?: (value: number) => void
  /** Se desabilitado. */
  disabled?: boolean
  /** Auto-focus inicial. */
  autoFocus?: boolean
  /** Placeholder (ignorado — display sempre mostra "0,00" quando zero). */
  placeholder?: string
  /** Classe extra (sobrepõe estilos padrão se necessário). */
  className?: string
  /** aria-label para acessibilidade. */
  ariaLabel?: string
}

/**
 * Formata `minorUnits` (inteiro de menor unidade: centavos para BRL/USD/EUR,
 * unidade inteira para JPY) para string pt-BR com o número correto de casas.
 * Ex (decimais=2): 150000 → "1.500,00"  ·  1 → "0,01"  ·  0 → "0,00".
 */
function formatMinor(minorUnits: number, decimals: number): string {
  const safe = Number.isFinite(minorUnits) ? Math.max(0, Math.floor(minorUnits)) : 0
  const divisor = Math.pow(10, decimals)
  const value = safe / divisor
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

/**
 * Extrai só os dígitos da string e converte para inteiro na menor unidade.
 * Limita a 15 dígitos para evitar overflow de Number.
 */
function digitsToMinor(raw: string): number {
  const digits = (raw.match(/\d/g) ?? []).join('').slice(0, 15)
  if (!digits) return 0
  const n = parseInt(digits, 10)
  return Number.isFinite(n) ? n : 0
}

export function MoneyInput({
  value,
  currency,
  onChange,
  onCommit,
  disabled,
  autoFocus,
  className,
  ariaLabel,
}: Props) {
  const decimals = getCurrencyDecimals(currency)
  const divisor = useMemo(() => Math.pow(10, decimals), [decimals])

  // PostgREST retorna numeric como string — normaliza na entrada.
  const externalMinor = Math.max(0, Math.round(toNumberSafe(value) * divisor))

  const [minor, setMinor] = useState<number>(externalMinor)

  // Sincroniza quando value muda por fora (ex: reset / reload).
  useEffect(() => {
    setMinor(prev => (prev === externalMinor ? prev : externalMinor))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalMinor])

  const symbol = getCurrencySymbol(currency)
  const display = useMemo(() => formatMinor(minor, decimals), [minor, decimals])

  function commit(next: number) {
    setMinor(next)
    onChange?.(next / divisor)
  }

  return (
    <div className={`relative ${className ?? ''}`}>
      <span
        className="absolute left-3 top-1/2 -translate-y-1/2 text-[#D4A853] text-sm font-semibold pointer-events-none select-none"
        aria-hidden
      >
        {symbol}
      </span>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        value={display}
        onChange={e => commit(digitsToMinor(e.target.value))}
        onFocus={e => {
          const el = e.currentTarget
          requestAnimationFrame(() => {
            try {
              const len = el.value.length
              el.setSelectionRange(len, len)
            } catch {
              /* noop */
            }
          })
        }}
        onClick={e => {
          const el = e.currentTarget
          try {
            const len = el.value.length
            el.setSelectionRange(len, len)
          } catch {
            /* noop */
          }
        }}
        onBlur={() => onCommit?.(minor / divisor)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault()
            onCommit?.(minor / divisor)
            ;(e.target as HTMLInputElement).blur()
          }
          if ((e.ctrlKey || e.metaKey) && e.key === 'Backspace') {
            e.preventDefault()
            commit(0)
          }
        }}
        placeholder="0,00"
        className="w-full bg-[#0a0a0a] border border-[#3a3a3a] focus:border-[#D4A853] focus:ring-1 focus:ring-[#D4A853]/30 focus:outline-none text-white text-sm rounded-lg pl-12 pr-3 py-2.5 transition-colors tabular-nums text-right font-medium disabled:opacity-60 disabled:cursor-not-allowed"
      />
    </div>
  )
}
