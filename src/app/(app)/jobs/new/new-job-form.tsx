'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { createJobFromForm } from '@/lib/actions/jobs'
import { todayISO } from '@/lib/utils/format'

export function NewJobForm() {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)

    startTransition(async () => {
      const result = await createJobFromForm(formData)
      // result só existe em caso de erro — redirect() ocorre antes em sucesso
      if (result) setError(result.message)
    })
  }

  return (
    <div className="min-h-full p-6 md:p-8 max-w-lg mx-auto">

      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Link
          href="/jobs"
          className="p-1.5 rounded-lg text-[#525252] hover:text-white hover:bg-[#1c1c1c] transition-colors"
          aria-label="Voltar para jobs"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-xl font-bold text-white">Novo Job</h1>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-6 space-y-5">

          {/* Título */}
          <div>
            <label className="block text-[10px] font-semibold text-[#525252] tracking-widest mb-2">
              TÍTULO <span className="text-[#D4A853]">*</span>
            </label>
            <input
              autoFocus
              name="title"
              type="text"
              required
              maxLength={200}
              placeholder="Ex: Casamento Ana & Pedro"
              disabled={isPending}
              className="w-full bg-[#1c1c1c] border border-[#2a2a2a] rounded-xl px-4 py-3 text-sm text-white placeholder-[#525252] focus:outline-none focus:border-[#D4A853]/50 focus:ring-1 focus:ring-[#D4A853]/20 transition-colors disabled:opacity-60"
            />
          </div>

          {/* Data */}
          <div>
            <label className="block text-[10px] font-semibold text-[#525252] tracking-widest mb-2">
              DATA <span className="text-[#D4A853]">*</span>
            </label>
            <input
              name="job_date"
              type="date"
              required
              defaultValue={todayISO()}
              disabled={isPending}
              className="w-full bg-[#1c1c1c] border border-[#2a2a2a] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#D4A853]/50 focus:ring-1 focus:ring-[#D4A853]/20 transition-colors disabled:opacity-60"
            />
          </div>

          {/* Cliente */}
          <div>
            <label className="block text-[10px] font-semibold text-[#525252] tracking-widest mb-2">
              CLIENTE <span className="text-[#3a3a3a]">· opcional</span>
            </label>
            <input
              name="client_name"
              type="text"
              maxLength={200}
              placeholder="Nome do cliente"
              disabled={isPending}
              className="w-full bg-[#1c1c1c] border border-[#2a2a2a] rounded-xl px-4 py-3 text-sm text-white placeholder-[#525252] focus:outline-none focus:border-[#D4A853]/50 focus:ring-1 focus:ring-[#D4A853]/20 transition-colors disabled:opacity-60"
            />
          </div>

          {/* Erro inline */}
          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5">
              {error}
            </p>
          )}

        </div>

        {/* Ações */}
        <div className="flex gap-3 mt-5">
          <button
            type="submit"
            disabled={isPending}
            className="flex-1 flex items-center justify-center gap-2 bg-[#D4A853] hover:bg-[#E8C47A] disabled:opacity-60 disabled:cursor-not-allowed text-[#0a0a0a] font-semibold text-sm py-3 rounded-xl transition-colors"
          >
            {isPending ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Salvando...
              </>
            ) : (
              'Salvar Job'
            )}
          </button>

          <Link
            href="/jobs"
            className="flex items-center justify-center px-6 py-3 rounded-xl text-sm font-medium text-[#a3a3a3] hover:text-white bg-[#1c1c1c] hover:bg-[#262626] border border-[#2a2a2a] transition-colors"
          >
            Voltar
          </Link>
        </div>
      </form>

    </div>
  )
}
