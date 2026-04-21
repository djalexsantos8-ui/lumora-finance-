'use client'

import { useState, useTransition, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { bulkDeleteRecurringRevenue } from '@/lib/actions/recurring-revenue'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import type {
  RecurringRevenue,
  RecurringStatus,
  RecurringFrequency,
} from '@/types/recurring-revenue'
import { NewRecurringButton } from './new-recurring-button'

interface Props {
  items: RecurringRevenue[]
}

const FREQ_LABEL: Record<RecurringFrequency, string> = {
  weekly:    'Semanal',
  monthly:   'Mensal',
  quarterly: 'Trimestral',
  yearly:    'Anual',
}

// Normaliza amount para MRR (R$/mês) pra dar uma noção de impacto.
function monthlyEquivalent(amount: number, freq: RecurringFrequency): number {
  switch (freq) {
    case 'weekly':    return amount * 4.345 // aprox 4.345 semanas por mês
    case 'monthly':   return amount
    case 'quarterly': return amount / 3
    case 'yearly':    return amount / 12
  }
}

export default function RecurringList({ items: initial }: Props) {
  const router = useRouter()
  const [items, setItems] = useState<RecurringRevenue[]>(initial)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState<'bulk' | null>(null)

  const allSelected = items.length > 0 && selected.size === items.length
  const someSelected = selected.size > 0

  const stats = useMemo(() => {
    let mrr = 0
    const byStatus: Record<RecurringStatus, number> = { active: 0, paused: 0, cancelled: 0 }
    for (const r of items) {
      byStatus[r.status] = (byStatus[r.status] ?? 0) + 1
      if (r.status === 'active') {
        mrr += monthlyEquivalent(Number(r.amount) || 0, r.frequency)
      }
    }
    return { mrr, byStatus }
  }, [items])

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
    else setSelected(new Set(items.map(i => i.id)))
  }

  function handleBulkDelete() {
    if (selected.size === 0) return
    const ids = [...selected]
    const prev = items
    setItems(list => list.filter(i => !selected.has(i.id)))
    setSelected(new Set())
    setConfirming(null)

    startTransition(async () => {
      const res = await bulkDeleteRecurringRevenue(ids)
      if (!res.success) {
        setItems(prev)
        alert(res.message ?? 'Erro ao excluir.')
      } else {
        router.refresh()
      }
    })
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-14 h-14 rounded-2xl bg-[#141414] border border-[#2a2a2a] flex items-center justify-center mb-4">
          <svg className="w-7 h-7 text-[#D4A853]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </div>
        <p className="text-white font-medium mb-1">Nenhuma receita recorrente ainda</p>
        <p className="text-[#525252] text-sm max-w-sm mb-6">
          Registre mensalidades, retainers e contratos que se repetem — o MRR aparece aqui automaticamente.
        </p>
        <NewRecurringButton label="Cadastrar primeiro contrato" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* MRR summary */}
      <div className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-4 flex items-center justify-between">
        <div>
          <p className="text-[11px] text-[#525252] uppercase tracking-wider font-medium">MRR estimado</p>
          <p className="text-xl font-bold text-white">
            {formatCurrency(stats.mrr, 'BRL')}
          </p>
        </div>
        <div className="text-right text-xs text-[#a3a3a3] space-y-0.5">
          <p><span className="text-emerald-400 font-semibold">{stats.byStatus.active}</span> ativos</p>
          {stats.byStatus.paused > 0 && <p>{stats.byStatus.paused} pausados</p>}
          {stats.byStatus.cancelled > 0 && <p className="text-[#525252]">{stats.byStatus.cancelled} cancelados</p>}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <label className="flex items-center gap-2 text-xs text-[#a3a3a3] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            className="accent-[#D4A853] w-4 h-4"
          />
          {allSelected ? 'Desmarcar todos' : 'Selecionar todos'}
        </label>

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

      {/* Confirm modal */}
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
              Excluir {selected.size} receita{selected.size !== 1 ? 's' : ''}?
            </h3>
            <p className="text-[#a3a3a3] text-sm mb-5">
              Os itens selecionados serão removidos do MRR. A ação pode ser revertida no banco.
            </p>
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => setConfirming(null)}
                className="text-sm text-[#a3a3a3] hover:text-white px-4 py-2 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={isPending}
                className="text-sm font-semibold text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                {isPending ? 'Processando…' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lista */}
      <div className="space-y-2">
        {items.map(r => {
          const isChecked = selected.has(r.id)
          return (
            <div
              key={r.id}
              className={`
                flex items-center gap-3 bg-[#141414] border rounded-xl p-4 transition-all group
                ${isChecked ? 'border-[#D4A853]/40 bg-[#D4A853]/5' : 'border-[#2a2a2a] hover:border-[#3a3a3a]'}
              `}
            >
              <label className="shrink-0 cursor-pointer p-1 -m-1" onClick={e => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleOne(r.id)}
                  className="accent-[#D4A853] w-4 h-4 cursor-pointer"
                />
              </label>

              <Link href={`/receitas-recorrentes/${r.id}`} className="flex items-center justify-between flex-1 min-w-0 gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <p className="text-sm font-semibold text-white truncate">
                      {r.title || 'Receita sem título'}
                    </p>
                    <RecurringStatusBadge status={r.status} />
                    {r.segment && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#262626] text-[#a3a3a3]">
                        {r.segment}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#525252] truncate">
                    {r.client_name || 'Cliente não informado'}
                    {r.next_billing_at ? ` · próximo: ${formatDate(r.next_billing_at)}` : ''}
                    {r.delivery_type ? ` · ${r.delivery_type}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-4 shrink-0 ml-4">
                  <div className="text-right hidden sm:block">
                    <p className="text-sm font-semibold text-white">
                      {formatCurrency(r.amount, r.currency)}
                    </p>
                    <p className="text-xs text-[#525252]">{FREQ_LABEL[r.frequency]}</p>
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

export function RecurringStatusBadge({ status }: { status: RecurringStatus }) {
  const map: Record<RecurringStatus, { label: string; cls: string }> = {
    active:    { label: 'Ativo',     cls: 'bg-emerald-500/10 text-emerald-400' },
    paused:    { label: 'Pausado',   cls: 'bg-amber-500/10 text-amber-400' },
    cancelled: { label: 'Cancelado', cls: 'bg-red-500/10 text-red-400' },
  }
  const { label, cls } = map[status] ?? map.active
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${cls}`}>
      {label}
    </span>
  )
}
