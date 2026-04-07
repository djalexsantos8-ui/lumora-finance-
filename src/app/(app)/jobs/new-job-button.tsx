'use client'

import { useFormStatus } from 'react-dom'
import { createJob } from '@/lib/actions/jobs'

// ─── Submit button interno — usa useFormStatus para ler pending do form pai ───

function SubmitBtn({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex items-center gap-2 bg-[#D4A853] hover:bg-[#E8C47A] disabled:opacity-60 disabled:cursor-not-allowed text-[#0a0a0a] font-semibold text-sm px-4 py-2.5 rounded-xl transition-colors shrink-0"
    >
      {pending ? (
        <>
          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Criando...
        </>
      ) : (
        <>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {label}
        </>
      )}
    </button>
  )
}

// ─── Export público — envolve o botão num form com a server action ────────────

export function NewJobButton({ label = 'Novo Job' }: { label?: string }) {
  return (
    <form action={createJob}>
      <SubmitBtn label={label} />
    </form>
  )
}
