'use client'

import { useEffect } from 'react'
import Link from 'next/link'

/**
 * Error boundary por-rota para /admin/feedback/[id].
 *
 * Se algo explodir aqui (payload ruim, client component quebrado, etc.),
 * renderiza uma tela controlada em vez de cair no global-error.tsx
 * ("Erro inesperado" genérico). Mantém sidebar/topbar do admin layout.
 */
export default function FeedbackDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log client-side — em server, o Next.js já loga no stdout do Vercel
    console.error('[admin/feedback/[id]/error]', error)
  }, [error])

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <Link href="/admin/feedback" className="text-xs text-[#a3a3a3] hover:text-white">
          ← Voltar para a inbox
        </Link>
        <h1 className="text-2xl font-bold mt-2 text-red-400">Falha ao abrir este feedback</h1>
        <p className="text-sm text-[#a3a3a3] mt-1">
          Algo quebrou na renderização deste feedback específico. A inbox e o resto do admin
          continuam funcionando.
        </p>
      </div>

      <section className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-xs text-red-300 space-y-2">
        <div><span className="text-red-400/70">Mensagem:</span> {error.message || '(sem mensagem)'}</div>
        {error.digest && (
          <div><span className="text-red-400/70">Digest:</span> <code>{error.digest}</code></div>
        )}
        <div className="text-[10px] text-red-400/50 pt-2 border-t border-red-500/20">
          Esse erro foi logado no console. Copie o digest e os detalhes do console do browser
          para reportar.
        </div>
      </section>

      <div className="flex gap-2">
        <button
          onClick={() => reset()}
          className="text-xs font-semibold px-3 py-2 rounded-md bg-[#D4A853] hover:bg-[#E8C47A] text-[#0a0a0a] transition-colors"
        >
          Tentar novamente
        </button>
        <Link
          href="/admin/feedback"
          className="text-xs px-3 py-2 rounded-md border border-[#2a2a2a] text-[#a3a3a3] hover:text-white hover:border-[#3a3a3a] transition-colors"
        >
          Voltar para a inbox
        </Link>
      </div>
    </div>
  )
}
