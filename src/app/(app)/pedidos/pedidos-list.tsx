'use client'

import { useState, useTransition, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { bulkDeleteOrders } from '@/lib/actions/orders'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import { isDraftOrder } from '@/lib/utils/is-draft-order'
import type { Order, OrderStatus } from '@/types/order'
import { NewOrderButton } from './new-order-button'
import { DraftBadge } from '@/components/freelances/draft-badge'

interface Props {
  orders: Order[]
}

// Lista com seleção em massa — mesmo padrão de /budgets.

export default function PedidosList({ orders: initial }: Props) {
  const router = useRouter()
  const [orders, setOrders] = useState<Order[]>(initial)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState<'bulk' | null>(null)

  const allSelected = orders.length > 0 && selected.size === orders.length
  const someSelected = selected.size > 0

  const counts = useMemo(() => {
    const c: Record<OrderStatus, number> = {
      draft: 0, in_progress: 0, delivered: 0, paid: 0, cancelled: 0,
    }
    for (const o of orders) c[o.status] = (c[o.status] ?? 0) + 1
    return c
  }, [orders])

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
    else setSelected(new Set(orders.map(o => o.id)))
  }

  function handleBulkDelete() {
    if (selected.size === 0) return
    const ids = [...selected]
    const prevList = orders
    setOrders(prev => prev.filter(o => !selected.has(o.id)))
    setSelected(new Set())
    setConfirming(null)

    startTransition(async () => {
      const res = await bulkDeleteOrders(ids)
      if (!res.success) {
        setOrders(prevList)
        alert(res.message ?? 'Erro ao excluir. Tente novamente.')
      } else {
        router.refresh()
      }
    })
  }

  // Empty state
  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-14 h-14 rounded-2xl bg-[#141414] border border-[#2a2a2a] flex items-center justify-center mb-4">
          <svg className="w-7 h-7 text-[#D4A853]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
          </svg>
        </div>
        <p className="text-white font-medium mb-1">Nenhum pedido ainda</p>
        <p className="text-[#525252] text-sm max-w-xs mb-6">
          Registre pedidos de produtos, entregas e vendas pontuais com cliente, valores e status.
        </p>
        <NewOrderButton label="Criar primeiro pedido" />
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

          <div className="hidden sm:flex items-center gap-2 text-[11px] text-[#525252]">
            {counts.in_progress > 0 && <span>{counts.in_progress} em andamento</span>}
            {counts.delivered > 0 && <span>· {counts.delivered} entregue{counts.delivered !== 1 ? 's' : ''}</span>}
            {counts.paid > 0 && <span>· {counts.paid} pago{counts.paid !== 1 ? 's' : ''}</span>}
          </div>
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
              Excluir {selected.size} pedido{selected.size !== 1 ? 's' : ''}?
            </h3>
            <p className="text-[#a3a3a3] text-sm mb-5">
              Os pedidos selecionados serão excluídos. Esta ação pode ser revertida no banco em caso de engano.
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
        {orders.map(order => {
          const isChecked = selected.has(order.id)
          const isDraft   = isDraftOrder(order)
          return (
            <div
              key={order.id}
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
                  onChange={() => toggleOne(order.id)}
                  className="accent-[#D4A853] w-4 h-4 cursor-pointer"
                />
              </label>

              <Link
                href={`/pedidos/${order.id}`}
                className="flex items-center justify-between flex-1 min-w-0 gap-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <p className={`text-sm font-semibold truncate ${isDraft ? 'text-[#a3a3a3] italic' : 'text-white'}`}>
                      {isDraft ? 'Pedido sem título' : (order.title || 'Pedido sem título')}
                    </p>
                    {isDraft ? <DraftBadge /> : <OrderStatusBadge status={order.status} />}
                  </div>
                  <p className="text-xs text-[#525252] truncate">
                    {order.client_name || 'Cliente não informado'}
                    {order.order_date ? ` · ${formatDate(order.order_date)}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-4 shrink-0 ml-4">
                  <div className="text-right hidden sm:block">
                    <p className="text-sm font-semibold text-white">
                      {formatCurrency(order.amount, order.currency)}
                    </p>
                    <p className="text-xs text-[#525252]">
                      {order.amount_paid > 0
                        ? `pago ${formatCurrency(order.amount_paid, order.currency)}`
                        : 'total'}
                    </p>
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

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const map: Record<OrderStatus, { label: string; cls: string }> = {
    draft:       { label: 'Rascunho',    cls: 'bg-[#262626] text-[#a3a3a3]' },
    in_progress: { label: 'Em andamento', cls: 'bg-blue-500/10 text-blue-400' },
    delivered:   { label: 'Entregue',    cls: 'bg-amber-500/10 text-amber-400' },
    paid:        { label: 'Pago',        cls: 'bg-emerald-500/10 text-emerald-400' },
    cancelled:   { label: 'Cancelado',   cls: 'bg-red-500/10 text-red-400' },
  }
  const { label, cls } = map[status] ?? map.draft
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${cls}`}>
      {label}
    </span>
  )
}
