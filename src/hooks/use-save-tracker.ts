'use client'

/**
 * useSaveTracker — rastreia persistências in-flight e expõe estado agregado.
 *
 * Problema: o detalhe do freelance tem autosave por campo (blur/commit dispara
 * actions individuais). Cada save acontece isolado, sem agregação central.
 * Para dar ao usuário um indicador claro ("salvo/salvando") e um botão manual
 * de Salvar que respeite concorrência, precisamos de um contador global.
 *
 * Design:
 *   · `track(promise)` → incrementa contador, aguarda, decrementa. Retorna o
 *     resultado original. Usado para envolver TODA chamada de action que
 *     persista dados.
 *   · `savingCount`    → quantas operações estão in-flight. 0 = ocioso.
 *   · `lastSavedAt`    → timestamp ISO do último save bem-sucedido.
 *   · `lastError`      → mensagem do último erro (limpa após novo save OK).
 *   · `waitForIdle()`  → Promise que resolve quando savingCount atinge 0.
 *     Útil para botão Salvar que quer esperar autosaves terminarem antes
 *     de disparar uma nova requisição (evita duplicação).
 *   · `markSuccess()`  → opcional: atualiza lastSavedAt sem passar por track
 *     (útil quando o save já foi feito mas queremos "confirmar" no UI).
 *   · `markError(msg)` → opcional: registra erro manualmente.
 *
 * Contrato com actions:
 *   Actions do projeto retornam `{ success, message, ... }`. O tracker NÃO
 *   assume esse shape. Quem chama interpreta o resultado e chama markError
 *   explicitamente se quiser. O track() só serve para contar in-flights.
 */

import { useCallback, useRef, useState } from 'react'

export interface SaveTrackerState {
  savingCount: number
  lastSavedAt: string | null   // ISO timestamp
  lastError:   string | null
  isSaving:    boolean         // savingCount > 0
}

export interface SaveTracker extends SaveTrackerState {
  /** Envolve uma promise de save. Conta in-flight + atualiza lastSavedAt. */
  track: <T>(promise: Promise<T>) => Promise<T>
  /** Espera savingCount atingir 0 (timeout em ms; default 10s). */
  waitForIdle: (timeoutMs?: number) => Promise<void>
  /** Registra sucesso manualmente (atualiza timestamp, limpa erro). */
  markSuccess: () => void
  /** Registra erro manualmente. */
  markError: (message: string) => void
  /** Limpa estado de erro sem alterar timestamp. */
  clearError: () => void
}

export function useSaveTracker(): SaveTracker {
  const [savingCount, setSavingCount] = useState(0)
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const [lastError,   setLastError]   = useState<string | null>(null)

  // Ref espelhada do contador — leitura síncrona para waitForIdle
  // (setState é async, ref é sempre o valor mais recente).
  const countRef = useRef(0)

  const inc = useCallback(() => {
    countRef.current += 1
    setSavingCount(countRef.current)
  }, [])

  const dec = useCallback(() => {
    countRef.current = Math.max(0, countRef.current - 1)
    setSavingCount(countRef.current)
  }, [])

  const track = useCallback(<T,>(promise: Promise<T>): Promise<T> => {
    inc()
    return promise
      .then((result) => {
        setLastSavedAt(new Date().toISOString())
        setLastError(null)
        return result
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Erro ao salvar.'
        setLastError(msg)
        throw err
      })
      .finally(() => {
        dec()
      })
  }, [inc, dec])

  // Espera o contador zerar — polling leve (10ms) com timeout.
  // Alternativa seria pub/sub mas com 1-2 saves concorrentes polling é OK.
  const waitForIdle = useCallback(async (timeoutMs = 10_000): Promise<void> => {
    if (countRef.current === 0) return
    const start = Date.now()
    return new Promise((resolve) => {
      const check = () => {
        if (countRef.current === 0) return resolve()
        if (Date.now() - start >= timeoutMs) return resolve() // desiste silenciosamente
        setTimeout(check, 20)
      }
      check()
    })
  }, [])

  const markSuccess = useCallback(() => {
    setLastSavedAt(new Date().toISOString())
    setLastError(null)
  }, [])

  const markError = useCallback((message: string) => {
    setLastError(message)
  }, [])

  const clearError = useCallback(() => {
    setLastError(null)
  }, [])

  return {
    savingCount,
    lastSavedAt,
    lastError,
    isSaving: savingCount > 0,
    track,
    waitForIdle,
    markSuccess,
    markError,
    clearError,
  }
}
