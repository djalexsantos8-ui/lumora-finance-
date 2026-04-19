'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createFreelanceDraft } from '@/lib/actions/jobs'

interface NewJobButtonProps {
  label?: string
}

export function NewJobButton({ label = 'Novo Freelance' }: NewJobButtonProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      const result = await createFreelanceDraft()
      if (result.success) {
        router.push(`/freelances/${result.id}`)
      } else {
        // Falha rara (auth/workspace já disparam redirect da action).
        // Log + alerta leve; não quebra a lista.
        console.error('[new-freelance]', result.message)
        alert(result.message)
      }
    })
  }

  return (
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
  )
}
