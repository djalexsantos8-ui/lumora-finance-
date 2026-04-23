'use client'

/**
 * src/components/ui/auto-grow-textarea.tsx
 *
 * Textarea que cresce em altura conforme o usuário digita, com piso e teto
 * configuráveis. Padrão oficial do Lumora para campos de texto longos
 * (descrição, escopo, notas internas, briefings, etc).
 *
 * Decisão de UX (2026-04-23):
 *   • Autosize real (scrollHeight) em vez de textareas fixos minúsculos.
 *   • minRows = 4 (≈2× o antigo rows=2) garante conforto mesmo vazio.
 *   • maxRows = 18 evita que um texto gigantesco empurre o layout da
 *     tela inteira — a partir daí vira scroll interno.
 *   • Sem resize manual do browser: a resolução é única e previsível.
 *   • forwardRef pra permitir foco programático no futuro.
 */

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type TextareaHTMLAttributes,
} from 'react'

export interface AutoGrowTextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'rows' | 'style'> {
  /** Altura mínima em linhas. Default 4 — conforto pra qualquer campo longo. */
  minRows?: number
  /** Teto em linhas antes de virar scroll interno. Default 18. */
  maxRows?: number
}

/**
 * Resolve o "line-height px" efetivo do elemento. Usa getComputedStyle para
 * respeitar o font-size/line-height real aplicado via className.
 */
function getLineHeightPx(el: HTMLTextAreaElement): number {
  const cs = window.getComputedStyle(el)
  const lh = parseFloat(cs.lineHeight)
  if (Number.isFinite(lh) && lh > 0) return lh
  // Fallback: ~1.5 × font-size.
  const fs = parseFloat(cs.fontSize) || 14
  return fs * 1.5
}

export const AutoGrowTextarea = forwardRef<
  HTMLTextAreaElement,
  AutoGrowTextareaProps
>(function AutoGrowTextarea(
  { minRows = 4, maxRows = 18, onChange, onInput, className, value, ...rest },
  externalRef,
) {
  const innerRef = useRef<HTMLTextAreaElement | null>(null)
  useImperativeHandle(externalRef, () => innerRef.current as HTMLTextAreaElement)

  const resize = useCallback(() => {
    const el = innerRef.current
    if (!el) return
    const lh = getLineHeightPx(el)
    const cs = window.getComputedStyle(el)
    const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
    const border = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth)
    const minH = lh * minRows + pad + border
    const maxH = lh * maxRows + pad + border

    // Reset pra medir o scrollHeight limpo.
    el.style.height = 'auto'
    const needed = el.scrollHeight + border
    const next = Math.max(minH, Math.min(needed, maxH))
    el.style.height = `${next}px`
    el.style.overflowY = needed > maxH ? 'auto' : 'hidden'
  }, [minRows, maxRows])

  // Mede no mount e toda vez que `value` muda externamente (ex: IA preenche).
  useLayoutEffect(() => {
    resize()
  }, [resize, value])

  return (
    <textarea
      ref={innerRef}
      value={value}
      onChange={e => {
        onChange?.(e)
        resize()
      }}
      onInput={e => {
        onInput?.(e)
        resize()
      }}
      className={className}
      style={{ resize: 'none', overflowY: 'hidden' }}
      {...rest}
    />
  )
})
