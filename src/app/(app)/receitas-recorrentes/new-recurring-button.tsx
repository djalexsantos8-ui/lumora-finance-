'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createRecurringRevenueDraft } from '@/lib/actions/recurring-revenue'

export function NewRecurringButton({ label = 'Nova Receita' }: { label?: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleClick() {
    setError(null)
    startTransition(async () => {
      try {
        const result = await createRecurringRevenueDraft()
        if (result.success) {
          router.push(`/receitas-recorrentes/${result.id}`)
        } else {
          console.error('[new-recurring]', result.message)
          setError(result.message || 'Erro ao criar contrato.')
        }
      } catch (e) {
        console.error('[new-recurring] thrown', e)
        setError(e instanceof Error ? e.message : 'Erro inesperado.')
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="flex items-center gap-2 bg-[#D4A853] hover:bg-[#E8C47A] disabled:opacity-60 disabled:cursor-not-allowed text-[#0a0a0a] font-semibold text-sm px-4 py-2.5 rounded-xl transition-colors shrink-0"
      >
        {isPending ? (
          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        )}
        {label}
      </button>
      {error && (
        <p className="text-red-400 text-xs max-w-xs text-right" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
