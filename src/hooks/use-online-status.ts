'use client'

/**
 * src/hooks/use-online-status.ts
 *
 * Hook leve para saber se o navegador está conectado (`navigator.onLine`).
 * Usado para mostrar banner de offline e desabilitar botões de submit
 * quando não faz sentido tentar uma server action (vai travar em fetch
 * até o browser fechar a conexão).
 *
 * `navigator.onLine` tem pegadinhas (retorna `true` em alguns casos mesmo
 * sem internet real), então tratamos isso como "heurística otimista":
 * um `false` é forte indicativo de offline; um `true` ainda exige timeout
 * no submit.
 *
 * SSR-safe: retorna `true` (otimista) no primeiro render; sincroniza no
 * efeito. Evita mismatch de hidratação.
 */

import { useEffect, useState } from 'react'

export function useOnlineStatus(): boolean {
  // SSR: assume online (default otimista).
  const [online, setOnline] = useState<boolean>(true)

  useEffect(() => {
    // Sync inicial.
    if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
      setOnline(navigator.onLine)
    }

    function handleOnline()  { setOnline(true) }
    function handleOffline() { setOnline(false) }

    window.addEventListener('online',  handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online',  handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return online
}
