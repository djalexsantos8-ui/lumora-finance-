'use client'

/**
 * MoneyField — input monetário com digitação em modo CENTAVOS.
 *
 * Spec definida pelo usuário (2026-04-24):
 *   1     → R$ 0,01
 *   10    → R$ 0,10
 *   100   → R$ 1,00
 *   1000  → R$ 10,00
 *   150000 → R$ 1.500,00
 *
 * Cada dígito digitado desloca a vírgula (estilo caixa registradora). Letras
 * e símbolos são ignorados; só dígitos contam. Backspace zera último centavo.
 *
 * Inclui seletor de moeda integrado (BRL/USD/EUR). Trocar moeda PRESERVA o
 * valor numérico — só muda o símbolo exibido (R$ / $ / €).
 *
 * Emite para o pai o valor DECIMAL (ex: 1500.00), nunca a string formatada.
 * Persistir no banco deve usar o number recebido aqui.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { getCurrencySymbol } from '@/lib/utils/format'

export type MoneyCurrency = 'BRL' | 'USD' | 'EUR'

export const MONEY_FIELD_CURRENCIES: MoneyCurrency[] = ['BRL', 'USD', 'EUR']

interface MoneyFieldProps {
  /** Valor decimal atual (ex: 1500 = R$ 1.500,00). */
  value:            number
  /** Código da moeda. */
  currency:         MoneyCurrency | string
  /** Chamado com o novo valor decimal sempre que o usuário edita. */
  onValueChange:    (value: number) => void
  /** Chamado quando o usuário troca a moeda. Opcional. */
  onCurrencyChange?: (currency: MoneyCurrency) => void
  /** Lista de moedas permitidas no seletor. Default: BRL/USD/EUR. */
  allowedCurrencies?: MoneyCurrency[]
  /** Esconde o seletor de moeda (ex: quando a entidade é single-currency). */
  hideCurrency?:    boolean
  disabled?:        boolean
  autoFocus?:       boolean
  /** Dispara quando usuário aperta Enter. */
  onEnter?:         () => void
  className?:       string
  ariaLabel?:       string
}

/**
 * Formata `cents` (inteiro) para string pt-BR com 2 casas.
 * Ex: 150000 → "1.500,00", 1 → "0,01", 0 → "0,00".
 */
function formatCents(cents: number): string {
  const safe = Number.isFinite(cents) ? Math.max(0, Math.floor(cents)) : 0
  const value = safe / 100
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * Extrai só os dígitos da string e converte para inteiro de centavos.
 * Limita a 15 dígitos para evitar overflow de Number (10^15 ≈ R$ 10 trilhões).
 */
function digitsToCents(raw: string): number {
  const digits = (raw.match(/\d/g) ?? []).join('').slice(0, 15)
  if (!digits) return 0
  const n = parseInt(digits, 10)
  return Number.isFinite(n) ? n : 0
}

export function MoneyField({
  value,
  currency,
  onValueChange,
  onCurrencyChange,
  allowedCurrencies = MONEY_FIELD_CURRENCIES,
  hideCurrency = false,
  disabled = false,
  autoFocus = false,
  onEnter,
  className,
  ariaLabel,
}: MoneyFieldProps) {
  // Estado interno em centavos (inteiro). Fonte da verdade para formatação.
  const initialCents = Math.max(0, Math.round((Number(value) || 0) * 100))
  const [cents, setCents] = useState<number>(initialCents)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Sincroniza quando o valor externo muda (ex: carregou dado do servidor).
  useEffect(() => {
    const externalCents = Math.max(0, Math.round((Number(value) || 0) * 100))
    if (externalCents !== cents) {
      setCents(externalCents)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const symbol = getCurrencySymbol(currency)
  const display = useMemo(() => formatCents(cents), [cents])

  function commit(nextCents: number) {
    setCents(nextCents)
    onValueChange(nextCents / 100)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const nextCents = digitsToCents(e.target.value)
    commit(nextCents)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      onEnter?.()
      return
    }
    // Ctrl/Cmd + Backspace: zera tudo. Fallback UX para usuário em loop.
    if ((e.ctrlKey || e.metaKey) && e.key === 'Backspace') {
      e.preventDefault()
      commit(0)
    }
  }

  function handleFocus(e: React.FocusEvent<HTMLInputElement>) {
    // Cursor sempre no final — UX de caixa registradora.
    const el = e.currentTarget
    requestAnimationFrame(() => {
      try {
        const len = el.value.length
        el.setSelectionRange(len, len)
      } catch {
        /* noop */
      }
    })
  }

  function handleClick(e: React.MouseEvent<HTMLInputElement>) {
    const el = e.currentTarget
    const len = el.value.length
    try {
      el.setSelectionRange(len, len)
    } catch {
      /* noop */
    }
  }

  const baseInputCls =
    'w-full bg-[#0a0a0a] border border-[#3a3a3a] rounded-lg text-sm ' +
    'text-white placeholder-[#737373] focus:outline-none ' +
    'focus:border-[#D4A853] focus:ring-1 focus:ring-[#D4A853]/30 ' +
    'transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

  const selectCls =
    'bg-[#0a0a0a] border border-[#3a3a3a] rounded-lg text-sm text-white ' +
    'px-2 py-2.5 focus:outline-none focus:border-[#D4A853] ' +
    'focus:ring-1 focus:ring-[#D4A853]/30 transition-colors shrink-0 ' +
    'disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer'

  return (
    <div className={`flex gap-2 ${className ?? ''}`}>
      {!hideCurrency && (
        <select
          value={currency}
          onChange={e => onCurrencyChange?.(e.target.value as MoneyCurrency)}
          disabled={disabled || !onCurrencyChange}
          aria-label="Moeda"
          className={`${selectCls} w-[84px]`}
        >
          {allowedCurrencies.map(c => (
            <option key={c} value={c} className="bg-[#141414]">
              {c}
            </option>
          ))}
        </select>
      )}

      <div className="relative flex-1">
        <span
          aria-hidden
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[#D4A853] text-sm font-semibold pointer-events-none select-none"
        >
          {symbol}
        </span>
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          value={display}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onClick={handleClick}
          disabled={disabled}
          autoFocus={autoFocus}
          aria-label={ariaLabel ?? 'Valor'}
          placeholder="0,00"
          className={`${baseInputCls} pl-12 pr-3 py-2.5 text-right font-medium tabular-nums`}
        />
      </div>
    </div>
  )
}
