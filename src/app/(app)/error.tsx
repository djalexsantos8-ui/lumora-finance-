'use client'

/**
 * Error boundary da área autenticada (app).
 * Captura qualquer erro runtime em rotas filhas e exibe um fallback limpo
 * em vez de derrubar a plataforma inteira.
 *
 * Próximos passos do usuário ao ver este fallback:
 *   · "Tentar novamente" (reset() da árvore que falhou)
 *   · "Voltar ao dashboard" (saída segura)
 *
 * Também deixamos a mensagem do erro visível em dev; em prod mostramos apenas
 * o digest (id do erro) que o Vercel loga nas Functions.
 */

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'

interface Props {
  error: Error & { digest?: string }
  reset: () => void
}

export default function AppError({ error, reset }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    // Loga no console do cliente; Vercel já captura server-side pelo digest.
    console.error('[app/error]', error)
  }, [error])

  const isDev = process.env.NODE_ENV !== 'production'

  // Mostra mensagem em prod também (app pessoal — usuário é o dono).
  // Ajuda a diagnosticar crashes sem precisar vasculhar logs do Vercel.
  const showMessage = true

  async function handleCopyDetails() {
    const details = [
      `URL: ${pathname ?? 'unknown'}`,
      `When: ${new Date().toISOString()}`,
      `Digest: ${error.digest ?? '—'}`,
      `Message: ${error.message}`,
      error.stack ? `\nStack:\n${error.stack}` : '',
    ].join('\n')
    try {
      await navigator.clipboard.writeText(details)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback: seleciona o texto via prompt pra copiar manual
      window.prompt('Copie os detalhes do erro:', details)
    }
  }

  return (
    <div className="min-h-[calc(100vh-0px)] flex items-center justify-center bg-[#0a0a0a] text-white p-6">
      <div className="max-w-md w-full rounded-xl border border-[#1f1f1f] bg-[#111] p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400">
            !
          </div>
          <div>
            <h2 className="text-base font-semibold">Algo deu errado nesta página</h2>
            <p className="text-xs text-[#8a8a8a] mt-0.5">
              A plataforma segue funcionando. Tente novamente ou volte ao dashboard.
            </p>
          </div>
        </div>

        {showMessage && (
          <pre className="text-[11px] bg-[#0a0a0a] border border-[#1f1f1f] rounded-md p-3 overflow-auto max-h-48 text-[#d4a853] whitespace-pre-wrap break-words">
            {error.message || '(sem mensagem)'}
            {error.digest ? `\n\nDigest: ${error.digest}` : ''}
            {isDev && error.stack ? `\n\n${error.stack}` : ''}
          </pre>
        )}

        <button
          onClick={handleCopyDetails}
          className="w-full text-xs text-[#a3a3a3] hover:text-white bg-[#1a1a1a] hover:bg-[#222] border border-[#2a2a2a] px-3 py-1.5 rounded-md transition-colors"
        >
          {copied ? '✓ Copiado' : 'Copiar detalhes (para reportar)'}
        </button>

        <div className="flex gap-2 pt-2">
          <button
            onClick={() => reset()}
            className="flex-1 bg-[#D4A853] hover:bg-[#c49a2c] text-black text-sm font-semibold px-4 py-2 rounded-md transition-colors"
          >
            Tentar novamente
          </button>
          <button
            onClick={() => router.push('/dashboard')}
            className="flex-1 bg-[#1a1a1a] hover:bg-[#222] border border-[#2a2a2a] text-white text-sm font-semibold px-4 py-2 rounded-md transition-colors"
          >
            Ir ao dashboard
          </button>
        </div>
      </div>
    </div>
  )
}
