/**
 * src/lib/utils/offline-submit.ts
 *
 * Wrapper para server actions / fetches que protege a UI contra:
 *
 *   1. Usuário offline: rejeita antes de tentar (economiza ~30s de espera).
 *   2. Rede lenta: timeout configurável (default 8s) retorna erro amigável
 *      em vez de deixar o botão girando indefinidamente.
 *
 * Uso típico em um handler de botão Salvar:
 *
 *   const res = await submitWithOfflineGuard(
 *     () => saveBudget(payload),
 *     { timeoutMs: 8000 },
 *   )
 *   if (!res.ok) alert(res.reason === 'offline'
 *     ? 'Você está offline. Verifique a conexão.'
 *     : 'Tempo esgotado. Tente novamente.')
 *
 * Intencionalmente NÃO encapsula o retorno da action — ela continua
 * retornando o mesmo objeto `{ success, message }`. Esse wrapper só
 * controla se ela chega a rodar e por quanto tempo esperamos.
 */

export type OfflineGuardResult<T> =
  | { ok: true;  data: T }
  | { ok: false; reason: 'offline' | 'timeout'; message: string }

interface Options {
  /** Timeout em ms. Default 8000ms. Use valores menores (3000) para handlers de navegação. */
  timeoutMs?: number
  /** Se true, ignora navigator.onLine (útil para testes). Default false. */
  skipOfflineCheck?: boolean
}

export async function submitWithOfflineGuard<T>(
  fn: () => Promise<T>,
  options: Options = {},
): Promise<OfflineGuardResult<T>> {
  const { timeoutMs = 8000, skipOfflineCheck = false } = options

  // Check 1: offline? Aborta antes de tentar.
  if (!skipOfflineCheck && typeof navigator !== 'undefined' && 'onLine' in navigator) {
    if (navigator.onLine === false) {
      return {
        ok: false,
        reason: 'offline',
        message: 'Você está offline. Verifique a conexão e tente novamente.',
      }
    }
  }

  // Check 2: race contra timeout.
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  const timeoutPromise = new Promise<OfflineGuardResult<T>>((resolve) => {
    timeoutId = setTimeout(() => {
      resolve({
        ok: false,
        reason: 'timeout',
        message: 'A operação demorou demais. Verifique a conexão e tente novamente.',
      })
    }, timeoutMs)
  })

  try {
    const actionPromise = fn().then<OfflineGuardResult<T>>((data) => ({ ok: true, data }))
    const result = await Promise.race([actionPromise, timeoutPromise])
    if (timeoutId) clearTimeout(timeoutId)
    return result
  } catch (err) {
    if (timeoutId) clearTimeout(timeoutId)
    // Erro real na action: repassa como "timeout" para o usuário saber que
    // pode tentar de novo. O erro bruto vai pro console.
    console.error('[offline-submit] action threw:', err)
    return {
      ok: false,
      reason: 'timeout',
      message: 'Não foi possível completar. Tente novamente em alguns segundos.',
    }
  }
}
