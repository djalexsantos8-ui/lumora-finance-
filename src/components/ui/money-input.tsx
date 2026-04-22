'use client'

// ─── MoneyInput ──────────────────────────────────────────────────────────────
//
// Input profissional para valores monetários.
//
// Substitui `<input type="number" step="0.01">`, cujo UX é ruim em BR:
//   · stepper (as setinhas) são clicadas por acidente e mudam R$ por 0,01
//   · separador decimal inconsistente (., vs ,)
//   · selecionar tudo + digitar quebra estado (NaN)
//   · placeholder fica "0" e some quando foca
//
// MoneyInput oferece:
//   · prefixo visual da moeda (R$ / US$ / EUR)
//   · aceita tanto "," quanto "." como decimal (normaliza internamente)
//   · formata na blur com locale pt-BR (1.234,56)
//   · o pai recebe SEMPRE um number (nunca string)
//   · aceita Enter para commit imediato
//
// Uso:
//   <MoneyInput value={amount} currency="BRL" onChange={setAmount} />
//
// ⚠️ `onChange` dispara a cada tecla com o NÚMERO parseado. Se quiser commit
//    só na blur/Enter, use `onCommit` em vez de (ou em adição a) `onChange`.

import { useEffect, useState } from 'react'
import { getCurrencyDecimals, getCurrencySymbol } from '@/lib/utils/format'

interface Props {
  /** Valor atual em número puro (ex: 1234.56). */
  value: number
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
  /** Placeholder (já inclui "0,00" por padrão). */
  placeholder?: string
  /** Classe extra (sobrepõe estilos padrão se necessário). */
  className?: string
  /** aria-label para acessibilidade. */
  ariaLabel?: string
}

/**
 * Formata número para pt-BR (1234.56 → "1.234,56") usando o número de
 * casas decimais correto para a moeda (JPY = 0, BRL/USD/EUR = 2). Quando
 * valor é 0, retorna string vazia para deixar placeholder visível.
 */
function formatLocal(value: number, digits: number): string {
  if (!isFinite(value) || value === 0) return ''
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

/**
 * Parse robusto: "1.234,56" → 1234.56 · "1234.56" → 1234.56 ·
 * "R$ 1.234,56" → 1234.56 · "abc" → 0 · "" → 0.
 */
function parseLocal(raw: string): number {
  // Remove símbolos, espaços, letras
  const cleaned = raw.replace(/[^\d.,-]/g, '')
  // Detecta formato: se tem vírgula e ponto, assume ponto=milhar, vírgula=decimal
  // Se tem só vírgula, trata como decimal.
  // Se tem só ponto e parece decimal (1-2 casas após), trata como decimal.
  let normalized = cleaned
  const hasComma = cleaned.includes(',')
  const hasDot   = cleaned.includes('.')
  if (hasComma && hasDot) {
    // pt-BR clássico: "1.234,56"
    normalized = cleaned.replace(/\./g, '').replace(',', '.')
  } else if (hasComma) {
    // Só vírgula: decimal
    normalized = cleaned.replace(',', '.')
  }
  // Só ponto: já está em formato US (1234.56). Se tiver múltiplos pontos
  // (ex: "1.234.56"), remove todos menos o último — ambíguo mas melhor que NaN.
  else if (hasDot && (cleaned.match(/\./g) || []).length > 1) {
    const parts = cleaned.split('.')
    const last  = parts.pop() ?? ''
    normalized  = parts.join('') + '.' + last
  }
  const parsed = parseFloat(normalized)
  return isFinite(parsed) ? parsed : 0
}

export function MoneyInput({
  value,
  currency,
  onChange,
  onCommit,
  disabled,
  autoFocus,
  placeholder,
  className,
  ariaLabel,
}: Props) {
  const decimals = getCurrencyDecimals(currency)

  // display = string mostrada no input. Diverge de value durante digitação.
  const [display, setDisplay] = useState<string>(() => formatLocal(value, decimals))
  const [focused, setFocused] = useState(false)

  // Sincroniza display quando value muda por fora (reset / reload / etc).
  // Só aplica quando NÃO está focado — senão derrapa o cursor do usuário.
  useEffect(() => {
    if (!focused) setDisplay(formatLocal(value, decimals))
  }, [value, focused, decimals])

  const symbol = getCurrencySymbol(currency)

  return (
    <div className={`relative ${className ?? ''}`}>
      <span
        className="absolute left-3 top-1/2 -translate-y-1/2 text-[#737373] text-sm font-medium pointer-events-none select-none"
        aria-hidden
      >
        {symbol}
      </span>
      <input
        type="text"
        inputMode="decimal"
        disabled={disabled}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        value={display}
        onFocus={() => {
          setFocused(true)
          // Ao focar, mostra número "cru" (sem separador de milhar) para facilitar edição.
          if (value > 0) setDisplay(String(value).replace('.', ','))
          else setDisplay('')
        }}
        onChange={e => {
          const raw = e.target.value
          setDisplay(raw)
          if (onChange) onChange(parseLocal(raw))
        }}
        onBlur={() => {
          setFocused(false)
          const parsed = parseLocal(display)
          setDisplay(formatLocal(parsed, decimals))
          if (onCommit) onCommit(parsed)
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault()
            const parsed = parseLocal(display)
            setDisplay(formatLocal(parsed, decimals))
            if (onCommit) onCommit(parsed)
            // Força blur para indicar commit visualmente
            ;(e.target as HTMLInputElement).blur()
          }
        }}
        placeholder={placeholder ?? (decimals === 0 ? '0' : '0,00')}
        className="w-full bg-[#0a0a0a] border border-[#2a2a2a] focus:border-[#D4A853] focus:outline-none text-white text-sm rounded-lg pl-10 pr-3 py-2.5 transition-colors tabular-nums disabled:opacity-60 disabled:cursor-not-allowed"
      />
    </div>
  )
}
