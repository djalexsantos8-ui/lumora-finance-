'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ClientCombobox } from '@/components/clients/client-combobox'
import { SUPPORTED_CURRENCIES, formatCurrency } from '@/lib/utils/format'
import { updateOrder, deleteOrder } from '@/lib/actions/orders'
import type { Order, OrderStatus } from '@/types/order'
import { OrderStatusBadge } from '../pedidos-list'

interface Props {
  order: Order
}

const STATUS_OPTIONS: { value: OrderStatus; label: string }[] = [
  { value: 'draft',       label: 'Rascunho' },
  { value: 'in_progress', label: 'Em andamento' },
  { value: 'delivered',   label: 'Entregue' },
  { value: 'paid',        label: 'Pago' },
  { value: 'cancelled',   label: 'Cancelado' },
]

export default function OrderEditor({ order }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const [form, setForm] = useState({
    title:         order.title,
    client_id:     order.client_id,
    client_name:   order.client_name ?? '',
    order_date:    order.order_date,
    delivery_date: order.delivery_date ?? '',
    currency:      order.currency,
    amount:        order.amount,
    amount_paid:   order.amount_paid,
    status:        order.status,
    notes:         order.notes ?? '',
  })

  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function handleSave() {
    startTransition(async () => {
      setError(null)
      const res = await updateOrder(order.id, {
        title:         form.title,
        client_name:   form.client_name,
        order_date:    form.order_date,
        delivery_date: form.delivery_date || null,
        currency:      form.currency,
        amount:        Number(form.amount) || 0,
        amount_paid:   Number(form.amount_paid) || 0,
        status:        form.status,
        notes:         form.notes || null,
      })
      if (!res.success) {
        setError(res.message)
        return
      }
      setSavedAt(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))
      router.refresh()
    })
  }

  function handleDelete() {
    setConfirmingDelete(false)
    startTransition(async () => {
      const res = await deleteOrder(order.id)
      if (!res.success) {
        alert(res.message ?? 'Erro ao excluir pedido.')
        return
      }
      router.push('/pedidos')
    })
  }

  return (
    <div className="min-h-full p-6 md:p-8 max-w-3xl mx-auto">
      {/* Breadcrumb / back */}
      <div className="flex items-center justify-between mb-6">
        <Link
          href="/pedidos"
          className="flex items-center gap-2 text-sm text-[#a3a3a3] hover:text-white transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
          </svg>
          Voltar para Pedidos
        </Link>
        <OrderStatusBadge status={form.status} />
      </div>

      {/* Card */}
      <div className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-6 space-y-5">
        {/* Título */}
        <div>
          <label className="block text-xs text-[#a3a3a3] mb-1.5">Título</label>
          <input
            type="text"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            className="w-full bg-[#0a0a0a] border border-[#2a2a2a] focus:border-[#D4A853] focus:outline-none text-white text-sm rounded-lg px-3 py-2.5 transition-colors"
            placeholder="Pedido sem título"
          />
        </div>

        {/* Cliente */}
        <div>
          <label className="block text-xs text-[#a3a3a3] mb-1.5">Cliente</label>
          <ClientCombobox
            defaultValue={form.client_name}
            onChange={v => setForm(f => ({ ...f, client_name: v }))}
            onSelectExisting={c => setForm(f => ({ ...f, client_name: c.name, client_id: c.id }))}
            placeholder="Digite ou selecione um cliente"
          />
        </div>

        {/* Datas */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-[#a3a3a3] mb-1.5">Data do pedido</label>
            <input
              type="date"
              value={form.order_date}
              onChange={e => setForm(f => ({ ...f, order_date: e.target.value }))}
              className="w-full bg-[#0a0a0a] border border-[#2a2a2a] focus:border-[#D4A853] focus:outline-none text-white text-sm rounded-lg px-3 py-2.5 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs text-[#a3a3a3] mb-1.5">Entrega (opcional)</label>
            <input
              type="date"
              value={form.delivery_date}
              onChange={e => setForm(f => ({ ...f, delivery_date: e.target.value }))}
              className="w-full bg-[#0a0a0a] border border-[#2a2a2a] focus:border-[#D4A853] focus:outline-none text-white text-sm rounded-lg px-3 py-2.5 transition-colors"
            />
          </div>
        </div>

        {/* Financeiro */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-[#a3a3a3] mb-1.5">Moeda</label>
            <select
              value={form.currency}
              onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
              className="w-full bg-[#0a0a0a] border border-[#2a2a2a] focus:border-[#D4A853] focus:outline-none text-white text-sm rounded-lg px-3 py-2.5 transition-colors"
            >
              {SUPPORTED_CURRENCIES.map(c => (
                <option key={c.code} value={c.code}>{c.code}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-[#a3a3a3] mb-1.5">Valor total</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: Number(e.target.value) }))}
              className="w-full bg-[#0a0a0a] border border-[#2a2a2a] focus:border-[#D4A853] focus:outline-none text-white text-sm rounded-lg px-3 py-2.5 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs text-[#a3a3a3] mb-1.5">Valor pago</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.amount_paid}
              onChange={e => setForm(f => ({ ...f, amount_paid: Number(e.target.value) }))}
              className="w-full bg-[#0a0a0a] border border-[#2a2a2a] focus:border-[#D4A853] focus:outline-none text-white text-sm rounded-lg px-3 py-2.5 transition-colors"
            />
          </div>
        </div>

        {/* Status */}
        <div>
          <label className="block text-xs text-[#a3a3a3] mb-1.5">Status</label>
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setForm(f => ({ ...f, status: opt.value }))}
                className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                  form.status === opt.value
                    ? 'bg-[#D4A853]/10 border-[#D4A853]/50 text-[#D4A853]'
                    : 'bg-[#0a0a0a] border-[#2a2a2a] text-[#a3a3a3] hover:text-white hover:border-[#3a3a3a]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Notas */}
        <div>
          <label className="block text-xs text-[#a3a3a3] mb-1.5">Observações</label>
          <textarea
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            rows={3}
            className="w-full bg-[#0a0a0a] border border-[#2a2a2a] focus:border-[#D4A853] focus:outline-none text-white text-sm rounded-lg px-3 py-2.5 transition-colors resize-none"
            placeholder="Detalhes do pedido, produto, prazo, etc."
          />
        </div>

        {/* Resumo */}
        <div className="flex items-center justify-between pt-4 border-t border-[#2a2a2a]">
          <div className="text-xs text-[#525252]">
            Saldo:{' '}
            <span className="text-white font-semibold">
              {formatCurrency(Math.max(0, Number(form.amount) - Number(form.amount_paid)), form.currency)}
            </span>
          </div>
          {savedAt && !error && (
            <span className="text-xs text-emerald-400">Salvo às {savedAt}</span>
          )}
          {error && <span className="text-xs text-red-400">{error}</span>}
        </div>

        {/* Ações */}
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            disabled={isPending}
            className="text-xs font-medium text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
          >
            Excluir pedido
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="flex items-center gap-2 bg-[#D4A853] hover:bg-[#E8C47A] disabled:opacity-60 text-[#0a0a0a] font-semibold text-sm px-4 py-2.5 rounded-xl transition-colors"
          >
            {isPending ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>

      {/* Modal de confirmação */}
      {confirmingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setConfirmingDelete(false)}
        >
          <div
            className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-6 max-w-sm w-full"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-white font-semibold mb-2">Excluir este pedido?</h3>
            <p className="text-[#a3a3a3] text-sm mb-5">
              O pedido será removido da lista. A ação pode ser revertida no banco.
            </p>
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => setConfirmingDelete(false)}
                className="text-sm text-[#a3a3a3] hover:text-white px-4 py-2 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={isPending}
                className="text-sm font-semibold text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
