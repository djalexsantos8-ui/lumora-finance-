'use client'

import { useState, useTransition, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { bulkDeleteBudgets, deleteEmptyDraftBudgets } from '@/lib/actions/budgets'
import { formatCurrency } from '@/lib/utils/format'
import type { Budget, BudgetStatus } from '@/types/budget'

interface Props {
  budgets: Budget[]
}

// ─── lista com sele\u00e7\u00e3o em massa ──────────────────────────────────────────
//
// Check individual em cada linha + toolbar no topo quando algum selecionado.
// "Selecionar todos" seleciona TODOS da lista filtrada atual. A\u00e7\u00f5es:
//   · Excluir selecionados (bulkDelete)
//   · Limpar rascunhos vazios (sem depender de sele\u00e7\u00e3o \u2014 action pr\u00f3pria)
//
// Usa server actions + router.refresh() pra re-hidratar a lista ap\u00f3s a\u00e7\u00e3o.
// Otimista nos IDs removidos: some imediatamente da UI; se a action falhar,
// reverte e mostra toast simples via alert().

export default function BudgetsList({ budgets: initialBudgets }: Props) {
  const router = useRouter()
  const [budgets, setBudgets] = useState<Budget[]>(initialBudgets)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState<'cleanup' | 'bulk' | null>(null)

  const allSelected = budgets.length > 0 && selected.size === budgets.length
  const someSelected = selected.size > 0

  // Agrupa por status pra mostrar contadores r\u00e1pidos no header
  const counts = useMemo(() => {
    const c: Record<BudgetStatus, number> = {
      draft: 0, sent: 0, approved: 0, rejected: 0, expired: 0,
    }
    for (const b of budgets) c[b.status] = (c[b.status] ?? 0) + 1
    return c
  }, [budgets])

  function toggleOne(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(budgets.map(b => b.id)))
  }

  function handleBulkDelete() {
    if (selected.size === 0) return
    const ids = [...selected]

    // Optimistic: remove da UI imediatamente
    const prevList = budgets
    setBudgets(prev => prev.filter(b => !selected.has(b.id)))
    setSelected(new Set())
    setConfirming(null)

    startTransition(async () => {
      const res = await bulkDeleteBudgets(ids)
      if (!res.success) {
        // Revert
        setBudgets(prevList)
        alert(res.message ?? 'Erro ao excluir. Tente novamente.')
      } else {
        router.refresh()
      }
    })
  }

  function handleCleanupEmpty() {
    setConfirming(null)
    startTransition(async () => {
      const res = await deleteEmptyDraftBudgets()
      if (!res.success) {
        alert(res.message ?? 'Erro na limpeza.')
        return
      }
      if (res.count === 0) {
        alert('Nenhum rascunho vazio encontrado.')
        return
      }
      // Recarrega do servidor pra refletir o estado real
      router.refresh()
      // Feedback local
      alert(`${res.count} rascunho${res.count !== 1 ? 's' : ''} vazio${res.count !== 1 ? 's' : ''} limpo${res.count !== 1 ? 's' : ''}.`)
    })
  }

  // Estado vazio \u2014 sem or\u00e7amentos nenhum no workspace
  if (budgets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-14 h-14 rounded-2xl bg-[#141414] border border-[#2a2a2a] flex items-center justify-center mb-4">
          <svg className="w-7 h-7 text-[#D4A853]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <p className="text-white font-medium mb-1">Nenhum orçamento ainda</p>
        <p className="text-[#525252] text-sm max-w-xs mb-6">
          Crie orçamentos profissionais com cálculo de margem e PDFs apresentáveis para seus clientes.
        </p>
        <Link
          href="/budgets/new"
          prefetch
          className="flex items-center gap-2 bg-[#D4A853] hover:bg-[#E8C47A] text-[#0a0a0a] font-semibold text-sm px-4 py-2.5 rounded-xl transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Criar primeiro orçamento
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-[#a3a3a3] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="accent-[#D4A853] w-4 h-4"
            />
            {allSelected ? 'Desmarcar todos' : 'Selecionar todos'}
          </label>

          {counts.draft > 0 && (
            <button
              onClick={() => setConfirming('cleanup')}
              disabled={isPending}
              className="text-xs font-medium text-[#a3a3a3] hover:text-white bg-[#1c1c1c] hover:bg-[#262626] border border-[#2a2a2a] px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              title="Remove rascunhos sem título, sem cliente, sem descrição, sem itens e com total R$ 0,00"
            >
              Limpar rascunhos vazios
            </button>
          )}
        </div>

        {someSelected && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#a3a3a3]">
              {selected.size} selecionado{selected.size !== 1 ? 's' : ''}
            </span>
            <button
              onClick={() => setConfirming('bulk')}
              disabled={isPending}
              className="flex items-center gap-1.5 text-xs font-semibold text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Excluir selecionados
            </button>
          </div>
        )}
      </div>

      {/* Modal de confirmação */}
      {confirming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setConfirming(null)}
        >
          <div
            className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-6 max-w-sm w-full"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-white font-semibold mb-2">
              {confirming === 'bulk'
                ? `Excluir ${selected.size} orçamento${selected.size !== 1 ? 's' : ''}?`
                : 'Limpar rascunhos vazios?'}
            </h3>
            <p className="text-[#a3a3a3] text-sm mb-5">
              {confirming === 'bulk'
                ? 'Os orçamentos selecionados serão excluídos. Esta ação pode ser revertida no banco em caso de engano.'
                : 'Serão removidos apenas rascunhos sem título, sem cliente, sem descrição, sem itens e com total R$ 0,00. Itens com qualquer conteúdo ficam intactos.'}
            </p>
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => setConfirming(null)}
                className="text-sm text-[#a3a3a3] hover:text-white px-4 py-2 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirming === 'bulk' ? handleBulkDelete : handleCleanupEmpty}
                disabled={isPending}
                className="text-sm font-semibold text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                {isPending ? 'Processando…' : confirming === 'bulk' ? 'Excluir' : 'Limpar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lista */}
      <div className="space-y-2">
        {budgets.map(budget => {
          const isChecked = selected.has(budget.id)
          return (
            <div
              key={budget.id}
              className={`
                flex items-center gap-3 bg-[#141414] border rounded-xl p-4 transition-all group
                ${isChecked ? 'border-[#D4A853]/40 bg-[#D4A853]/5' : 'border-[#2a2a2a] hover:border-[#3a3a3a]'}
              `}
            >
              {/* Checkbox */}
              <label
                className="shrink-0 cursor-pointer p-1 -m-1"
                onClick={e => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleOne(budget.id)}
                  className="accent-[#D4A853] w-4 h-4 cursor-pointer"
                />
              </label>

              {/* Link pra detail */}
              <Link
                href={`/budgets/${budget.id}`}
                className="flex items-center justify-between flex-1 min-w-0 gap-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <p className="text-sm font-semibold text-white truncate">
                      {budget.title || 'Orçamento sem título'}
                    </p>
                    <StatusBadge status={budget.status} />
                  </div>
                  <p className="text-xs text-[#525252] truncate">
                    {budget.client_name || 'Cliente não informado'}
                  </p>
                </div>
                <div className="flex items-center gap-4 shrink-0 ml-4">
                  <div className="text-right hidden sm:block">
                    <p className="text-sm font-semibold text-white">
                      {formatCurrency(budget.total, budget.currency)}
                    </p>
                    <p className="text-xs text-[#525252]">total</p>
                  </div>
                  <svg
                    className="w-4 h-4 text-[#525252] group-hover:text-[#a3a3a3] transition-colors"
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── status badge (mesmo estilo do budget-editor) ────────────────────────────

function StatusBadge({ status }: { status: BudgetStatus }) {
  const map: Record<BudgetStatus, { label: string; cls: string }> = {
    draft:    { label: 'Rascunho', cls: 'bg-[#262626] text-[#a3a3a3]' },
    sent:     { label: 'Enviado',  cls: 'bg-blue-500/10 text-blue-400' },
    approved: { label: 'Aprovado', cls: 'bg-emerald-500/10 text-emerald-400' },
    rejected: { label: 'Rejeitado', cls: 'bg-red-500/10 text-red-400' },
    expired:  { label: 'Expirado',  cls: 'bg-[#262626] text-[#525252]' },
  }
  const { label, cls } = map[status] ?? map.draft
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${cls}`}>
      {label}
    </span>
  )
}
