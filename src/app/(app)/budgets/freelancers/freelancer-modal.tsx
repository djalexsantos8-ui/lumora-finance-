'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { createFreelancer, updateFreelancer } from '@/lib/actions/freelancers'
import { useActionToast } from '@/hooks/use-action-toast'
import {
  FREELANCER_ROLES,
  SUPPORTED_CURRENCIES,
} from '@/lib/utils/format'
import type { Freelancer } from '@/types/freelancer'
import { MoneyInput } from '@/components/ui/money-input'

interface FreelancerModalProps {
  open: boolean
  freelancer?: Freelancer | null
  onClose: () => void
}

export default function FreelancerModal({
  open,
  freelancer,
  onClose,
}: FreelancerModalProps) {
  const formRef = useRef<HTMLFormElement>(null)
  const [isPending, startTransition] = useTransition()
  const { handleResult } = useActionToast()

  const isEdit = Boolean(freelancer)

  const [dailyRate, setDailyRate] = useState<number>(
    freelancer?.daily_rate ? Number(freelancer.daily_rate) : 0
  )
  const [currency, setCurrency]   = useState<string>(freelancer?.currency ?? 'BRL')

  useEffect(() => {
    if (open) {
      formRef.current?.reset()
      setDailyRate(freelancer?.daily_rate ? Number(freelancer.daily_rate) : 0)
      setCurrency(freelancer?.currency ?? 'BRL')
    }
  }, [open, freelancer])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && open) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)

    startTransition(async () => {
      const result = isEdit && freelancer
        ? await updateFreelancer(freelancer.id, formData)
        : await createFreelancer(formData)

      handleResult(result)

      if (result.success) onClose()
    })
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="bg-[#141414] border border-[#2a2a2a] rounded-2xl w-full max-w-md shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-[#1a1a1a]">
            <h2 className="text-base font-semibold text-white">
              {isEdit ? 'Editar Profissional' : 'Novo Profissional'}
            </h2>
            <button
              onClick={onClose}
              className="text-[#525252] hover:text-white transition-colors"
              aria-label="Fechar"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Form */}
          <form ref={formRef} onSubmit={handleSubmit} className="p-6 space-y-4">

            {/* Nome */}
            <div>
              <label className="block text-xs font-medium text-[#a3a3a3] mb-1.5">
                Nome <span className="text-[#D4A853]">*</span>
              </label>
              <input
                name="name"
                type="text"
                required
                maxLength={120}
                defaultValue={freelancer?.name ?? ''}
                placeholder="Ex: João Silva"
                className="w-full bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#525252] focus:outline-none focus:border-[#D4A853]/50 focus:ring-1 focus:ring-[#D4A853]/20 transition-colors"
              />
            </div>

            {/* Função */}
            <div>
              <label className="block text-xs font-medium text-[#a3a3a3] mb-1.5">
                Função
              </label>
              <select
                name="role"
                defaultValue={freelancer?.role ?? 'other'}
                className="w-full bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#D4A853]/50 focus:ring-1 focus:ring-[#D4A853]/20 transition-colors appearance-none cursor-pointer"
              >
                {FREELANCER_ROLES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            {/* Diária + Moeda */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#a3a3a3] mb-1.5">
                  Valor da diária
                </label>
                <MoneyInput
                  value={dailyRate}
                  currency={currency}
                  onChange={setDailyRate}
                  ariaLabel="Valor da diária"
                />
                {/* Shadow field para FormData */}
                <input type="hidden" name="daily_rate" value={dailyRate} />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#a3a3a3] mb-1.5">
                  Moeda
                </label>
                <select
                  name="currency"
                  value={currency}
                  onChange={e => setCurrency(e.target.value)}
                  className="w-full bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#D4A853]/50 focus:ring-1 focus:ring-[#D4A853]/20 transition-colors appearance-none cursor-pointer"
                >
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Observações */}
            <div>
              <label className="block text-xs font-medium text-[#a3a3a3] mb-1.5">
                Observações
              </label>
              <textarea
                name="notes"
                rows={3}
                defaultValue={freelancer?.notes ?? ''}
                placeholder="Contato, especialidade, disponibilidade..."
                className="w-full bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#525252] focus:outline-none focus:border-[#D4A853]/50 focus:ring-1 focus:ring-[#D4A853]/20 transition-colors resize-none"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                disabled={isPending}
                className="flex-1 bg-[#1c1c1c] hover:bg-[#262626] disabled:opacity-50 border border-[#2a2a2a] text-[#a3a3a3] hover:text-white rounded-xl py-2.5 text-sm font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="flex-1 bg-[#D4A853] hover:bg-[#E8C47A] disabled:opacity-60 disabled:cursor-not-allowed text-[#0a0a0a] rounded-xl py-2.5 text-sm font-semibold transition-colors flex items-center justify-center gap-2"
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
                  isEdit ? 'Salvar alterações' : 'Adicionar'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
