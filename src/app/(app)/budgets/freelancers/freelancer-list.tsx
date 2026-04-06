'use client'

import { useState, useTransition } from 'react'
import { deleteFreelancer } from '@/lib/actions/freelancers'
import { formatCurrency, FREELANCER_ROLE_LABELS } from '@/lib/utils/format'
import FreelancerModal from './freelancer-modal'
import type { Freelancer } from '@/types/freelancer'

interface FreelancerListProps {
  freelancers: Freelancer[]
}

export default function FreelancerList({ freelancers }: FreelancerListProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Freelancer | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function openCreate() {
    setEditing(null)
    setModalOpen(true)
  }

  function openEdit(freelancer: Freelancer) {
    setEditing(freelancer)
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditing(null)
  }

  function handleDelete(id: string) {
    if (!confirm('Remover este profissional do catálogo?')) return
    setDeletingId(id)
    startTransition(async () => {
      await deleteFreelancer(id)
      setDeletingId(null)
    })
  }

  return (
    <>
      {/* Header da seção */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Catálogo de Profissionais</h1>
          <p className="text-[#a3a3a3] text-sm mt-0.5">
            {freelancers.length === 0
              ? 'Nenhum profissional cadastrado ainda'
              : `${freelancers.length} profissional${freelancers.length !== 1 ? 'is' : ''} cadastrado${freelancers.length !== 1 ? 's' : ''}`
            }
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-[#D4A853] hover:bg-[#E8C47A] text-[#0a0a0a] font-semibold text-sm px-4 py-2.5 rounded-xl transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Novo Profissional
        </button>
      </div>

      {/* Lista vazia */}
      {freelancers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#141414] border border-[#2a2a2a] flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-[#D4A853]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <p className="text-white font-medium mb-1">Nenhum profissional ainda</p>
          <p className="text-[#525252] text-sm max-w-xs mb-6">
            Cadastre sua equipe de profissionais para agilizar a montagem dos seus orçamentos.
          </p>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 bg-[#D4A853] hover:bg-[#E8C47A] text-[#0a0a0a] font-semibold text-sm px-4 py-2.5 rounded-xl transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Adicionar primeiro profissional
          </button>
        </div>
      ) : (
        /* Grid de cards */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {freelancers.map((freelancer) => (
            <div
              key={freelancer.id}
              className={`
                bg-[#141414] border border-[#2a2a2a] rounded-xl p-4
                transition-all hover:border-[#3a3a3a]
                ${deletingId === freelancer.id ? 'opacity-40 pointer-events-none' : ''}
              `}
            >
              {/* Nome + função */}
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{freelancer.name}</p>
                  <p className="text-xs text-[#D4A853] mt-0.5">
                    {FREELANCER_ROLE_LABELS[freelancer.role]}
                  </p>
                </div>
                {/* Ações */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => openEdit(freelancer)}
                    className="p-1.5 text-[#525252] hover:text-white hover:bg-[#1c1c1c] rounded-lg transition-colors"
                    title="Editar"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDelete(freelancer.id)}
                    disabled={isPending}
                    className="p-1.5 text-[#525252] hover:text-[#ef4444] hover:bg-[#ef4444]/10 rounded-lg transition-colors"
                    title="Remover"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Diária */}
              <div className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-[#525252]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm text-[#a3a3a3]">
                  {freelancer.daily_rate
                    ? `${formatCurrency(freelancer.daily_rate, freelancer.currency)}/dia`
                    : <span className="text-[#525252]">Diária não definida</span>
                  }
                </span>
              </div>

              {/* Observações */}
              {freelancer.notes && (
                <p className="text-xs text-[#525252] mt-2 line-clamp-2">
                  {freelancer.notes}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      <FreelancerModal
        open={modalOpen}
        freelancer={editing}
        onClose={closeModal}
      />
    </>
  )
}
