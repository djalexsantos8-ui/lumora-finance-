'use client'

/**
 * Error boundary local para /budgets (lista).
 *
 * Mesma estratégia do /budgets/[id]/error.tsx: captura crash da lista sem
 * derrubar a plataforma toda, preserva sidebar e mostra digest + mensagem.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Props {
  error: Error & { digest?: string }
  reset: () => void
}

export default function BudgetsListError({ error, reset }: Props) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    console.error('[/budgets/error]', {
      message: error.message,
      digest:  error.digest,
      stack:   error.stack,
    })
  }, [error])

  async function handleCopy() {
    const payload = [
      `URL: ${typeof window !== 'undefined' ? window.location.pathname : '—'}`,
      `When: ${new Date().toISOString()}`,
      `Digest: ${error.digest ?? '—'}`,
      `Message: ${error.message}`,
      error.stack ? `\nStack:\n${error.stack}` : '',
    ].join('\n')
    try {
      await navigator.clipboard.writeText(payload)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copie os detalhes:', payload)
    }
  }

  return (
    <div className="p-6 md:p-8">
      <div className="max-w-2xl rounded-xl border border-red-500/30 bg-red-500/5 p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 font-bold">
            !
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">
              Não foi possível carregar os orçamentos
            </h2>
            <p className="text-xs text-[#a3a3a3] mt-0.5">
              O resto da plataforma segue funcionando normalmente.
            </p>
          </div>
        </div>

        <pre className="text-[11px] bg-[#0a0a0a] border border-[#1f1f1f] rounded-md p-3 overflow-auto max-h-48 text-[#D4A853] whitespace-pre-wrap break-words">
          {error.message || '(sem mensagem)'}
          {error.digest ? `\n\nDigest: ${error.digest}` : ''}
        </pre>

        <button
          onClick={handleCopy}
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
          <Link
            href="/dashboard"
            className="flex-1 text-center bg-[#1a1a1a] hover:bg-[#222] border border-[#2a2a2a] text-white text-sm font-semibold px-4 py-2 rounded-md transition-colors"
          >
            Ir ao dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
