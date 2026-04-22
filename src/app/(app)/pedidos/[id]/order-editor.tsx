'use client'

/**
 * OrderEditor — Fase 3c (Blueprint 2026-04-21)
 *
 * Herda o melhor de:
 *   · Freelances (StatusStepper, FreelanceDateRange, ClientCombobox, save inline)
 *   · Orçamentos (Items com categoria/quantidade/valor, live total)
 *
 * Novos campos (migration 20260421040000_orders_full_schema.sql):
 *   · project_description, deliverables, lead_source, client_segment,
 *     notes_internal, payment_condition
 *   · order_date_start + order_date_end + is_multi_day (via FreelanceDateRange adapter)
 *   · revenue_total / cost_total (calculados por trigger — read-only aqui)
 *
 * Sub-seções:
 *   · Itens de receita (order_items)   — inline rows
 *   · Itens de custo   (order_cost_items) — inline rows
 *   · Arquivos         (order_files)   — pattern de job-files
 *
 * Graceful degradation:
 *   · Se migration não foi aplicada ainda, as seções exibem aviso e somem
 *     sem quebrar o resto do editor. Ver `tableMissing` em list*.
 */

import { useState, useTransition, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ClientCombobox } from '@/components/clients/client-combobox'
import { TagCombobox } from '@/components/freelances/tag-combobox'
import { FreelanceDateRange } from '@/components/freelances/date-range'
import { LEAD_SOURCES } from '@/lib/canonical/lead-sources'
import { CLIENT_SEGMENTS } from '@/lib/canonical/segments'
import { SUPPORTED_CURRENCIES, formatCurrency } from '@/lib/utils/format'
import { MoneyInput } from '@/components/ui/money-input'
import { updateOrder, deleteOrder } from '@/lib/actions/orders'
import {
  addOrderItem,
  updateOrderItem,
  deleteOrderItem,
  addOrderCostItem,
  updateOrderCostItem,
  deleteOrderCostItem,
} from '@/lib/actions/order-items'
import {
  addOrderPayment,
  deleteOrderPayment,
} from '@/lib/actions/order-payments'
import {
  createExpense,
  deleteExpense,
} from '@/lib/actions/expenses'
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS } from '@/types/expense'
import type { Expense, ExpenseCategory } from '@/types/expense'
import type {
  Order,
  OrderStatus,
  OrderItem,
  OrderCostItem,
  OrderFile,
  OrderItemCategory,
  OrderCostCategory,
  OrderPayment,
} from '@/types/order'
import { OrderStatusBadge } from '../pedidos-list'
import { OrderFileUploadModal } from '@/components/orders/order-file-upload-modal'
import { OrderComprovantesList } from '@/components/orders/order-comprovantes-list'

interface Props {
  order:       Order
  items:       OrderItem[]
  costItems:   OrderCostItem[]
  files:       OrderFile[]
  initialPayments?:      OrderPayment[]
  initialOrderExpenses?: Expense[]
  itemsTableMissing:     boolean
  costsTableMissing:     boolean
  filesTableMissing:     boolean
}

const STATUS_OPTIONS: { value: OrderStatus; label: string }[] = [
  { value: 'draft',       label: 'Rascunho'     },
  { value: 'in_progress', label: 'Em andamento' },
  { value: 'delivered',   label: 'Entregue'     },
  { value: 'paid',        label: 'Pago'         },
  { value: 'cancelled',   label: 'Cancelado'    },
]

const ITEM_CATEGORIES: { value: OrderItemCategory; label: string }[] = [
  { value: 'service',   label: 'Serviço'    },
  { value: 'product',   label: 'Produto'    },
  { value: 'team',      label: 'Equipe'     },
  { value: 'equipment', label: 'Equipamento'},
  { value: 'other',     label: 'Outro'      },
]

const COST_CATEGORIES: { value: OrderCostCategory; label: string }[] = [
  { value: 'equipment_rental', label: 'Aluguel de equipamento' },
  { value: 'team',             label: 'Equipe'                 },
  { value: 'travel',           label: 'Viagem'                 },
  { value: 'accommodation',    label: 'Hospedagem'             },
  { value: 'food',             label: 'Alimentação'            },
  { value: 'software',         label: 'Software'               },
  { value: 'other',            label: 'Outro'                  },
]

// ─── helpers ────────────────────────────────────────────────────────────────

const inputCls =
  'w-full bg-[#0a0a0a] border border-[#2a2a2a] focus:border-[#D4A853] ' +
  'focus:outline-none text-white text-sm rounded-lg px-3 py-2.5 transition-colors'

// ─── helpers inline (paridade ServiceTable / RepassTable do job-detail) ──
const inputSm =
  'w-full bg-transparent border border-[#2a2a2a] focus:border-[#D4A853] ' +
  'focus:outline-none text-white text-sm rounded-md px-2 py-1 transition-colors'

const labelCls =
  'text-[9px] font-semibold uppercase tracking-wider text-[#525252]'

function TrashIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
    </svg>
  )
}

function Spinner() {
  return (
    <svg className="w-3.5 h-3.5 animate-spin text-[#D4A853]" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  )
}

// ─── Componente principal ───────────────────────────────────────────────────

export default function OrderEditor({
  order,
  items: initialItems,
  costItems: initialCostItems,
  files: initialFiles,
  initialPayments = [],
  initialOrderExpenses = [],
  itemsTableMissing,
  costsTableMissing,
  filesTableMissing,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // Estado do header / meta
  const [form, setForm] = useState({
    title:               order.title,
    client_id:           order.client_id,
    client_name:         order.client_name ?? '',
    order_date:          order.order_date,
    order_date_start:    order.order_date_start ?? order.order_date,
    order_date_end:      order.order_date_end,
    event_date:          order.event_date ?? '',
    delivery_date:       order.delivery_date ?? '',
    currency:            order.currency,
    amount:              order.amount,
    amount_paid:         order.amount_paid,
    status:              order.status,
    notes:               order.notes ?? '',
    project_description: order.project_description ?? '',
    deliverables:        order.deliverables ?? '',
    lead_source:         order.lead_source ?? '',
    client_segment:      order.client_segment ?? '',
    notes_internal:      order.notes_internal ?? '',
    payment_condition:   order.payment_condition ?? '',
  })

  const [items, setItems]         = useState<OrderItem[]>(initialItems)
  const [costItems, setCostItems] = useState<OrderCostItem[]>(initialCostItems)
  const [files, setFiles]         = useState<OrderFile[]>(initialFiles)
  const [payments, setPayments]   = useState<OrderPayment[]>(initialPayments)
  const [orderExpenses, setOrderExpenses] = useState<Expense[]>(initialOrderExpenses)

  const [revenueTotal, setRevenueTotal] = useState(Number(order.revenue_total ?? 0))
  const [costTotal, setCostTotal]       = useState(Number(order.cost_total ?? 0))

  // Modal compartilhado de upload (aberto pelo botão "Comprovante" no bloco Repasses)
  const [uploadOpen, setUploadOpen]     = useState(false)

  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [error, setError]     = useState<string | null>(null)

  // ─── Save do card principal ──────────────────────────────────────────────

  function handleSave() {
    startTransition(async () => {
      setError(null)
      const res = await updateOrder(order.id, {
        title:               form.title,
        client_name:         form.client_name,
        order_date:          form.order_date_start,
        order_date_start:    form.order_date_start,
        order_date_end:      form.order_date_end,
        is_multi_day:        !!form.order_date_end && form.order_date_end !== form.order_date_start,
        event_date:          form.event_date || null,
        delivery_date:       form.delivery_date || null,
        currency:            form.currency,
        amount:              Number(form.amount) || 0,
        amount_paid:         Number(form.amount_paid) || 0,
        status:              form.status,
        notes:               form.notes || null,
        project_description: form.project_description || null,
        deliverables:        form.deliverables || null,
        lead_source:         form.lead_source || null,
        client_segment:      form.client_segment || null,
        notes_internal:      form.notes_internal || null,
        payment_condition:   form.payment_condition || null,
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
        toast.error(res.message ?? 'Erro ao excluir pedido.')
        return
      }
      router.push('/pedidos')
    })
  }

  // ─── Datas (adapter FreelanceDateRange) ──────────────────────────────────

  function handleDateCommit(start: string, end: string | null) {
    setForm(f => ({
      ...f,
      order_date:       start,
      order_date_start: start,
      order_date_end:   end,
    }))
    // Auto-save
    startTransition(async () => {
      await updateOrder(order.id, {
        order_date:       start,
        order_date_start: start,
        order_date_end:   end,
        is_multi_day:     !!end && end !== start,
      })
      router.refresh()
    })
  }

  return (
    <div className="min-h-full p-6 md:p-8 max-w-4xl mx-auto">
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
        <div className="flex items-center gap-3">
          <Link
            href={`/api/orders/${order.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[#a3a3a3] hover:text-white border border-[#2a2a2a] hover:border-[#3a3a3a] rounded-lg px-3 py-1.5 transition-colors"
          >
            PDF
          </Link>
          <OrderStatusBadge status={form.status} />
        </div>
      </div>

      {/* ═══ 5 cards financeiros ═══════════════════════════════════════════
          Espelha Freelances/job-detail.tsx. Visão imediata do estado financeiro:
          ITENS DO PEDIDO (receita) · REPASSES (pass-through) · TOTAL (cliente
          paga) · RECEBIDO · A RECEBER. Neutro quanto ao banco — usa revenueTotal
          / costTotal calculados por trigger e amount_paid já presente no order. */}
      {(() => {
        const fin = {
          revenue:  revenueTotal,
          cost:     costTotal,
          total:    revenueTotal + costTotal,
          received: Number(form.amount_paid) || 0,
        }
        const due = Math.max(0, fin.total - fin.received)
        const progressPct = fin.total > 0
          ? Math.min(100, Math.round((fin.received / fin.total) * 100))
          : 0
        return (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
              <FinCardMini label="ITENS DO PEDIDO" value={fin.revenue} currency={form.currency}
                color="text-white" tooltip="Total pelos seus itens/serviços." />
              <FinCardMini label="REPASSES" value={fin.cost} currency={form.currency}
                color="text-[#a3a3a3]" tooltip="Você paga e o cliente reembolsa. Neutro." />
              <FinCardMini label="TOTAL" value={fin.total} currency={form.currency}
                color="text-white"
                tooltip="Itens + repasses. Total que o cliente paga."
                sub={fin.cost > 0 ? `${formatCurrency(fin.revenue, form.currency)} + repasses` : undefined} />
              <FinCardMini label="RECEBIDO" value={fin.received} currency={form.currency}
                color={fin.received > 0 ? 'text-emerald-400' : 'text-[#525252]'}
                sub={fin.total > 0 && fin.received > 0
                  ? `${Math.round((fin.received / fin.total) * 100)}% do total`
                  : undefined} />
              <FinCardMini label="A RECEBER" value={due} currency={form.currency}
                color={due > 0 ? 'text-[#D4A853]' : 'text-emerald-400'} />
            </div>
            {fin.total > 0 && form.status !== 'cancelled' && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-[#525252]">
                    {formatCurrency(fin.received, form.currency)} recebido de {formatCurrency(fin.total, form.currency)}
                  </span>
                  <span className="text-[10px] text-[#525252]">{progressPct}%</span>
                </div>
                <div className="h-1.5 w-full bg-[#1c1c1c] rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-500 ${
                    progressPct === 100 ? 'bg-emerald-500'
                    : progressPct > 0   ? 'bg-[#D4A853]'
                    :                     'bg-[#2a2a2a]'
                  }`} style={{ width: `${progressPct}%` }} />
                </div>
              </div>
            )}
          </>
        )
      })()}

      {/* ═══ Card Principal ═══════════════════════════════════════════════ */}
      <div className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-6 space-y-5 mb-6">
        {/* Título — auto-clear do placeholder de rascunho ao focar (menos 1 clique) */}
        <div>
          <label className="block text-xs text-[#a3a3a3] mb-1.5">Título</label>
          <input
            type="text"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            onFocus={e => {
              if (form.title === 'Pedido sem título') {
                setForm(f => ({ ...f, title: '' }))
                e.currentTarget.select()
              }
            }}
            className={inputCls}
            placeholder="Pedido sem título"
          />
        </div>

        {/* Cliente + Segmento + Lead Source */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-3">
            <label className="block text-xs text-[#a3a3a3] mb-1.5">Cliente</label>
            <ClientCombobox
              defaultValue={form.client_name}
              onChange={v => setForm(f => ({ ...f, client_name: v }))}
              onSelectExisting={c => setForm(f => ({ ...f, client_name: c.name, client_id: c.id }))}
              placeholder="Digite ou selecione um cliente"
            />
          </div>
          <div>
            <label className="block text-xs text-[#a3a3a3] mb-1.5">Segmento</label>
            <TagCombobox
              value={form.client_segment}
              options={CLIENT_SEGMENTS}
              onCommit={v => setForm(f => ({ ...f, client_segment: v }))}
              placeholder="ex: Casamento, E-commerce…"
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs text-[#a3a3a3] mb-1.5">Origem do lead</label>
            <TagCombobox
              value={form.lead_source}
              options={LEAD_SOURCES}
              onCommit={v => setForm(f => ({ ...f, lead_source: v }))}
              placeholder="ex: Instagram, Indicação…"
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs text-[#a3a3a3] mb-1.5">Condição de pagamento</label>
            <input
              type="text"
              value={form.payment_condition}
              onChange={e => setForm(f => ({ ...f, payment_condition: e.target.value }))}
              className={inputCls}
              placeholder="ex: 50% entrada + 50% na entrega"
            />
          </div>
        </div>

        {/* Datas */}
        <div>
          <label className="block text-xs text-[#a3a3a3] mb-1.5">Datas do pedido</label>
          <FreelanceDateRange
            startDate={form.order_date_start}
            endDate={form.order_date_end}
            onCommit={handleDateCommit}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-[#a3a3a3] mb-1.5">Data do evento (opcional)</label>
            <input
              type="date"
              value={form.event_date}
              onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs text-[#a3a3a3] mb-1.5">Entrega (opcional)</label>
            <input
              type="date"
              value={form.delivery_date}
              onChange={e => setForm(f => ({ ...f, delivery_date: e.target.value }))}
              className={inputCls}
            />
          </div>
        </div>

        {/* Descrição do projeto */}
        <div>
          <label className="block text-xs text-[#a3a3a3] mb-1.5">Descrição do projeto</label>
          <textarea
            value={form.project_description}
            onChange={e => setForm(f => ({ ...f, project_description: e.target.value }))}
            rows={2}
            className={`${inputCls} resize-none`}
            placeholder="Contexto do projeto, objetivo, estilo…"
          />
        </div>

        {/* Entregáveis */}
        <div>
          <label className="block text-xs text-[#a3a3a3] mb-1.5">Entregáveis</label>
          <textarea
            value={form.deliverables}
            onChange={e => setForm(f => ({ ...f, deliverables: e.target.value }))}
            rows={3}
            className={`${inputCls} resize-none`}
            placeholder="O que será entregue? Quantas peças? Em qual formato?"
          />
        </div>

        {/* Financeiro */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-[#a3a3a3] mb-1.5">Moeda</label>
            <select
              value={form.currency}
              onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
              className={inputCls}
            >
              {SUPPORTED_CURRENCIES.map(c => (
                <option key={c.code} value={c.code}>{c.code}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-[#a3a3a3] mb-1.5">Valor total</label>
            <MoneyInput
              value={form.amount}
              currency={form.currency}
              onChange={v => setForm(f => ({ ...f, amount: v }))}
              ariaLabel="Valor total"
            />
          </div>
          <div>
            <label className="block text-xs text-[#a3a3a3] mb-1.5">Valor pago</label>
            <MoneyInput
              value={form.amount_paid}
              currency={form.currency}
              onChange={v => setForm(f => ({ ...f, amount_paid: v }))}
              ariaLabel="Valor pago"
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-[#a3a3a3] mb-1.5">Observações públicas</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={3}
              className={`${inputCls} resize-none`}
              placeholder="Observações visíveis no PDF…"
            />
          </div>
          <div>
            <label className="block text-xs text-[#a3a3a3] mb-1.5">Notas internas</label>
            <textarea
              value={form.notes_internal}
              onChange={e => setForm(f => ({ ...f, notes_internal: e.target.value }))}
              rows={3}
              className={`${inputCls} resize-none`}
              placeholder="Só você vê estas notas."
            />
          </div>
        </div>

        {/* Resumo — espelha Freelances: só Despesa + Lucro Estimado */}
        <div className="pt-4 border-t border-[#2a2a2a]">
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-[10px] text-[#525252] tracking-widest">DESPESA</dt>
              <dd className="text-sm text-[#a3a3a3] tabular-nums">
                − {formatCurrency(costTotal, form.currency)}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] text-[#D4A853] tracking-widest">LUCRO ESTIMADO</dt>
              <dd
                className={`text-sm font-semibold tabular-nums ${
                  (revenueTotal - costTotal) >= 0 ? 'text-emerald-400' : 'text-red-400'
                }`}
                title="Receita dos itens − custo dos itens deste pedido. Aproximação simples; não considera impostos."
              >
                {formatCurrency(revenueTotal - costTotal, form.currency)}
              </dd>
            </div>
          </dl>
          <div className="mt-3 flex justify-end">
            {savedAt && !error && (
              <span className="text-xs text-emerald-400">Salvo às {savedAt}</span>
            )}
            {error && <span className="text-xs text-red-400">{error}</span>}
          </div>
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

      {/* ═══ Serviços (paridade Freelances) ═══════════════════════════════ */}
      {itemsTableMissing ? (
        <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-5 mb-4">
          <MigrationPendingNotice section="itens" />
        </div>
      ) : (
        <ItemsSection
          orderId={order.id}
          currency={form.currency}
          items={items}
          total={revenueTotal}
          onChange={(next, order) => {
            setItems(next)
            if (order) setRevenueTotal(Number(order.revenue_total ?? 0))
          }}
        />
      )}

      {/* ═══ Repasses ao cliente (paridade Freelances) ═══════════════════ */}
      {costsTableMissing ? (
        <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-5 mb-4">
          <MigrationPendingNotice section="custos" />
        </div>
      ) : (
        <CostItemsSection
          orderId={order.id}
          currency={form.currency}
          items={costItems}
          total={costTotal}
          onChange={(next, order) => {
            setCostItems(next)
            if (order) setCostTotal(Number(order.cost_total ?? 0))
          }}
          files={files}
          onAddFile={filesTableMissing ? undefined : () => setUploadOpen(true)}
          onFileDeletedOptimistic={(fileId) =>
            setFiles(prev => prev.filter(f => f.id !== fileId))
          }
          onFileDeleteRollback={(file) =>
            setFiles(prev => [file, ...prev.filter(f => f.id !== file.id)])
          }
        />
      )}

      {/* ═══ Despesas deste pedido ═════════════════════════════════════════
          Saída de bolso. Reutiliza tabela expenses (expenses.order_id = este
          pedido). Lucro estimado = itens − despesas. Paridade com Freelances. */}
      <OrderExpensesSection
        orderId={order.id}
        currency={form.currency}
        expenses={orderExpenses}
        revenueTotal={revenueTotal}
        onChange={setOrderExpenses}
      />

      {/* ═══ Pagamentos recebidos ══════════════════════════════════════════
          Paridade com Freelances: lista de order_payments + form inline
          para registrar novo recebimento. Trigger no banco atualiza
          orders.amount_paid automaticamente. */}
      <OrderPaymentsSection
        orderId={order.id}
        currency={form.currency}
        payments={payments}
        totalDue={Math.max(0, (revenueTotal + costTotal) - (Number(form.amount_paid) || 0))}
        onChange={(next, updatedOrder) => {
          setPayments(next)
          if (updatedOrder) {
            setForm(f => ({ ...f, amount_paid: Number(updatedOrder.amount_paid ?? 0) }))
          }
          router.refresh()
        }}
      />

      {/* Modal compartilhado de upload de comprovante (disparado pelo bloco Repasses) */}
      {!filesTableMissing && (
        <OrderFileUploadModal
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          workspaceId={order.workspace_id}
          orderId={order.id}
          onUploaded={(file) => setFiles(prev => [file, ...prev])}
        />
      )}

      {/* Modal de confirmação delete */}
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

// ─── Migration Pending Notice ───────────────────────────────────────────────

function MigrationPendingNotice({ section }: { section: string }) {
  return (
    <div className="text-xs text-amber-400 bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
      A seção de {section} depende de uma migration do banco ainda não aplicada.
      Abra <span className="font-mono">SETUP-MIGRATIONS.md</span> e aplique{' '}
      <span className="font-mono">20260421040000_orders_full_schema.sql</span> no Supabase.
    </div>
  )
}

// ─── ItemsSection (Serviços — paridade ServiceTable do Freelances) ──────────
//
// Header: "Serviços" · subtitle "o que você cobra do cliente" · botão
// "+ Adicionar serviço" no topo direito. Tabela inline com grid
// categoria/descrição/qtd/unit./total e edição inline (click na linha).
// Empty state: texto "Nenhum serviço adicionado ainda." (sem botão — o do
// header basta).

function ItemsSection({
  orderId,
  currency,
  items,
  total,
  onChange,
}: {
  orderId:  string
  currency: string
  items:    OrderItem[]
  total:    number
  onChange: (next: OrderItem[], order?: Order) => void
}) {
  const [adding,       setAdding]       = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [newDesc,      setNewDesc]      = useState('')
  const [newCat,       setNewCat]       = useState<OrderItemCategory | ''>('')
  const [newQty,       setNewQty]       = useState('1')
  const [newUnit,      setNewUnit]      = useState('')
  const [newlyAddedId, setNewlyAddedId] = useState<string | null>(null)
  const [editingId,    setEditingId]    = useState<string | null>(null)
  const [editDesc,     setEditDesc]     = useState('')
  const [editCat,      setEditCat]      = useState<OrderItemCategory | ''>('')
  const [editQty,      setEditQty]      = useState('')
  const [editUnit,     setEditUnit]     = useState('')
  const addRowRef  = useRef<HTMLDivElement>(null)
  const addDescRef = useRef<HTMLInputElement>(null)

  function cancelAdd() {
    setAdding(false); setNewDesc(''); setNewCat(''); setNewQty('1'); setNewUnit('')
  }

  async function submitAdd(): Promise<boolean> {
    if (isSubmitting) return false
    if (!newDesc.trim()) { cancelAdd(); return false }
    setIsSubmitting(true)
    const res = await addOrderItem(orderId, {
      description: newDesc.trim(),
      quantity:    newQty,
      unit_value:  newUnit,
      category:    newCat || null,
    })
    setIsSubmitting(false)
    if (!res.success) { toast.error(res.message); return false }
    if (res.data) {
      onChange([...items, res.data as OrderItem], res.order as Order | undefined)
      setNewlyAddedId((res.data as OrderItem).id)
      setTimeout(() => setNewlyAddedId(null), 1200)
    }
    setNewDesc(''); setNewCat(''); setNewQty('1'); setNewUnit('')
    setAdding(false)
    return true
  }

  function handleHeaderButtonClick() {
    if (adding) { addDescRef.current?.focus(); return }
    setAdding(true)
  }

  function handleAddKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter')  { e.preventDefault(); submitAdd() }
    if (e.key === 'Escape') { cancelAdd() }
  }

  function handleAddBlur(e: React.FocusEvent<HTMLDivElement>) {
    if (isSubmitting) return
    const next = e.relatedTarget as Node | null
    if (addRowRef.current && next && addRowRef.current.contains(next)) return
    submitAdd()
  }

  function startEdit(item: OrderItem) {
    setEditingId(item.id)
    setEditDesc(item.description)
    setEditCat((item.category ?? '') as OrderItemCategory | '')
    setEditQty(String(item.quantity))
    setEditUnit(String(item.unit_value))
  }

  async function submitEdit(id: string) {
    const current = items.find(i => i.id === id)
    if (!current) { setEditingId(null); return }
    const res = await updateOrderItem(id, orderId, {
      description: editDesc,
      quantity:    editQty,
      unit_value:  editUnit,
      category:    editCat ? (editCat as OrderItemCategory) : null,
    })
    if (!res.success) { toast.error(res.message); setEditingId(null); return }
    if (res.data) {
      const updated = items.map(i => i.id === id ? (res.data as OrderItem) : i)
      onChange(updated, res.order as Order | undefined)
    }
    setEditingId(null)
  }

  function handleDelete(item: OrderItem) {
    const optimistic = items.filter(i => i.id !== item.id)
    onChange(optimistic)
    startTransitionDelete(async () => {
      const res = await deleteOrderItem(item.id, orderId)
      if (!res.success) { onChange(items); toast.error(res.message) }
      else if (res.order) onChange(optimistic, res.order as Order)
    })
  }
  const [, startTransitionDelete] = useTransition()

  return (
    <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-5 mb-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-1">
        <div>
          <h2 className="text-sm font-semibold text-white">Serviços</h2>
          <p className="text-[10px] text-[#525252] mt-0.5">
            {items.length > 0
              ? `${items.length} ${items.length === 1 ? 'item' : 'itens'} · ${formatCurrency(total, currency)}`
              : 'o que você cobra do cliente'}
          </p>
        </div>
        <button
          type="button"
          onMouseDown={e => e.preventDefault()}
          onClick={handleHeaderButtonClick}
          className="flex items-center gap-1.5 text-xs font-semibold text-[#D4A853] hover:text-[#E8C47A] transition-colors px-2.5 py-1.5 rounded-lg border border-[#D4A853]/20 hover:border-[#D4A853]/40 shrink-0"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Adicionar serviço
        </button>
      </div>

      {/* Cabeçalho de colunas */}
      {(items.length > 0 || adding) && (
        <div className="grid grid-cols-[80px_1fr_56px_84px_84px_28px] gap-2 mb-1 px-1 mt-4">
          <span className={labelCls}>CATEGORIA</span>
          <span className={labelCls}>DESCRIÇÃO</span>
          <span className={`${labelCls} text-right`}>QTD</span>
          <span className={`${labelCls} text-right`}>UNIT.</span>
          <span className={`${labelCls} text-right`}>TOTAL</span>
          <span />
        </div>
      )}

      {/* Linhas */}
      <div className="space-y-1">
        {items.map(it => {
          const isNew = it.id === newlyAddedId
          const catLabel = it.category ? ITEM_CATEGORIES.find(c => c.value === it.category)?.label : null
          return (
            <div key={it.id}>
              {editingId === it.id ? (
                <div className="grid grid-cols-[80px_1fr_56px_84px_84px_28px] gap-2 items-center bg-[#1a1a1a] rounded-lg px-1 py-1">
                  <select
                    value={editCat}
                    onChange={e => setEditCat(e.target.value as OrderItemCategory | '')}
                    className={inputSm}
                  >
                    <option value="" className="bg-[#141414]">—</option>
                    {ITEM_CATEGORIES.map(c => <option key={c.value} value={c.value} className="bg-[#141414]">{c.label}</option>)}
                  </select>
                  <input autoFocus value={editDesc} onChange={e => setEditDesc(e.target.value)}
                    onBlur={() => submitEdit(it.id)}
                    onKeyDown={e => { if (e.key === 'Enter') submitEdit(it.id); if (e.key === 'Escape') setEditingId(null) }}
                    className={inputSm} />
                  <input value={editQty} onChange={e => setEditQty(e.target.value)}
                    onBlur={() => submitEdit(it.id)}
                    onKeyDown={e => { if (e.key === 'Enter') submitEdit(it.id); if (e.key === 'Escape') setEditingId(null) }}
                    className={`${inputSm} text-right`} />
                  <input value={editUnit} onChange={e => setEditUnit(e.target.value)}
                    onBlur={() => submitEdit(it.id)}
                    onKeyDown={e => { if (e.key === 'Enter') submitEdit(it.id); if (e.key === 'Escape') setEditingId(null) }}
                    className={`${inputSm} text-right`} />
                  <span className="text-xs text-right text-[#525252]">
                    {formatCurrency((parseFloat(editQty) || 1) * (parseFloat(editUnit.replace(',', '.')) || 0), currency)}
                  </span>
                  <span />
                </div>
              ) : (
                <div
                  className={`grid grid-cols-[80px_1fr_56px_84px_84px_28px] gap-2 items-center group rounded-lg px-1 py-1 cursor-pointer transition-all duration-500 ${
                    isNew ? 'bg-[#D4A853]/10 border border-[#D4A853]/20' : 'hover:bg-[#1c1c1c] border border-transparent'
                  }`}
                  onClick={() => startEdit(it)}
                >
                  {catLabel ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1c1c1c] border border-[#2a2a2a] text-[#525252] truncate">{catLabel}</span>
                  ) : (
                    <span className="text-[10px] text-[#3a3a3a]">—</span>
                  )}
                  <span className="text-sm text-white truncate">{it.description}</span>
                  <span className="text-xs text-[#a3a3a3] text-right">{Number(it.quantity)}×</span>
                  <span className="text-xs text-[#a3a3a3] text-right">{formatCurrency(Number(it.unit_value), currency)}</span>
                  <span className="text-xs font-semibold text-white text-right">{formatCurrency(Number(it.total_value), currency)}</span>
                  <button onClick={e => { e.stopPropagation(); handleDelete(it) }}
                    className="opacity-0 group-hover:opacity-100 text-[#525252] hover:text-red-400 transition-all p-0.5">
                    <TrashIcon />
                  </button>
                </div>
              )}
            </div>
          )
        })}

        {adding && (
          <div
            ref={addRowRef}
            tabIndex={-1}
            onBlur={handleAddBlur}
            className="bg-[#1c1c1c] rounded-lg px-2 py-2 border border-[#D4A853]/20 outline-none"
          >
            <div className="grid grid-cols-[80px_1fr_56px_84px_84px_28px] gap-2 items-center">
              <select
                value={newCat}
                onChange={e => setNewCat(e.target.value as OrderItemCategory | '')}
                onKeyDown={handleAddKeyDown}
                disabled={isSubmitting}
                className={inputSm}
              >
                <option value="" className="bg-[#141414]">—</option>
                {ITEM_CATEGORIES.map(c => <option key={c.value} value={c.value} className="bg-[#141414]">{c.label}</option>)}
              </select>
              <input
                ref={addDescRef}
                autoFocus
                placeholder="Descrição do serviço"
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                onKeyDown={handleAddKeyDown}
                disabled={isSubmitting}
                className={inputSm}
              />
              <input
                placeholder="1"
                value={newQty}
                onChange={e => setNewQty(e.target.value)}
                onKeyDown={handleAddKeyDown}
                disabled={isSubmitting}
                className={`${inputSm} text-right`}
              />
              <input
                placeholder="0,00"
                value={newUnit}
                onChange={e => setNewUnit(e.target.value)}
                onKeyDown={handleAddKeyDown}
                disabled={isSubmitting}
                className={`${inputSm} text-right`}
              />
              <span className="text-xs text-right text-[#525252]">
                {formatCurrency((parseFloat(newQty) || 1) * (parseFloat(newUnit.replace(',', '.')) || 0), currency)}
              </span>
              <span />
            </div>
            <div className="flex items-center justify-end gap-1.5 mt-2 pt-2 border-t border-[#262626]">
              {isSubmitting && <Spinner />}
              <button
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => submitAdd()}
                disabled={isSubmitting || !newDesc.trim()}
                className="inline-flex items-center gap-1.5 text-xs font-semibold bg-[#D4A853] hover:bg-[#E8C47A] disabled:opacity-50 disabled:cursor-not-allowed text-[#0a0a0a] px-3 py-1.5 rounded-lg transition-colors"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
                Adicionar
              </button>
              <button
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={cancelAdd}
                disabled={isSubmitting}
                aria-label="Descartar linha"
                title="Descartar"
                className="text-[#737373] hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-[#1f1f1f] disabled:opacity-40"
              >
                <TrashIcon />
              </button>
            </div>
          </div>
        )}
      </div>

      {items.length === 0 && !adding && (
        <p className="text-xs text-[#525252] text-center py-6">Nenhum serviço adicionado ainda.</p>
      )}

      {items.length > 0 && (
        <div className="flex justify-end mt-3 pt-3 border-t border-[#1c1c1c]">
          <span className="text-sm font-bold text-white">{formatCurrency(total, currency)}</span>
        </div>
      )}
    </div>
  )
}

// ─── CostItemsSection (Repasses ao cliente — paridade RepassTable) ──────────
//
// Header: título "Repasses ao cliente" + tooltip "?" + subtitle helper,
// botão "+ Adicionar repasse" no topo direito. Tabela inline com grid
// categoria/descrição/qtd/unit./total e edição inline. Empty state rich.
// Footer explicativo com total quando há itens.

function CostItemsSection({
  orderId,
  currency,
  items,
  total,
  onChange,
  files,
  onAddFile,
  onFileDeletedOptimistic,
  onFileDeleteRollback,
}: {
  orderId:  string
  currency: string
  items:    OrderCostItem[]
  total:    number
  onChange: (next: OrderCostItem[], order?: Order) => void
  files?:   OrderFile[]
  onAddFile?: () => void
  onFileDeletedOptimistic?: (fileId: string) => void
  onFileDeleteRollback?:    (file: OrderFile) => void
}) {
  const [adding,       setAdding]       = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [newDesc,      setNewDesc]      = useState('')
  const [newCat,       setNewCat]       = useState<OrderCostCategory>('other')
  const [newQty,       setNewQty]       = useState('1')
  const [newUnit,      setNewUnit]      = useState('')
  const [newlyAddedId, setNewlyAddedId] = useState<string | null>(null)
  const [editingId,    setEditingId]    = useState<string | null>(null)
  const [editDesc,     setEditDesc]     = useState('')
  const [editCat,      setEditCat]      = useState<OrderCostCategory>('other')
  const [editQty,      setEditQty]      = useState('')
  const [editUnit,     setEditUnit]     = useState('')
  const addRowRef  = useRef<HTMLDivElement>(null)
  const addDescRef = useRef<HTMLInputElement>(null)
  const [, startTransitionDelete] = useTransition()

  function cancelAdd() {
    setAdding(false); setNewDesc(''); setNewCat('other'); setNewQty('1'); setNewUnit('')
  }

  async function submitAdd(): Promise<boolean> {
    if (isSubmitting) return false
    if (!newDesc.trim()) { cancelAdd(); return false }
    setIsSubmitting(true)
    const res = await addOrderCostItem(orderId, {
      description: newDesc.trim(),
      category:    newCat,
      quantity:    newQty,
      unit_value:  newUnit,
    })
    setIsSubmitting(false)
    if (!res.success) { toast.error(res.message); return false }
    if (res.data) {
      onChange([...items, res.data as OrderCostItem], res.order as Order | undefined)
      setNewlyAddedId((res.data as OrderCostItem).id)
      setTimeout(() => setNewlyAddedId(null), 1200)
    }
    setNewDesc(''); setNewCat('other'); setNewQty('1'); setNewUnit('')
    setAdding(false)
    return true
  }

  function handleHeaderButtonClick() {
    if (adding) { addDescRef.current?.focus(); return }
    setAdding(true)
  }

  function handleAddKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter')  { e.preventDefault(); submitAdd() }
    if (e.key === 'Escape') { cancelAdd() }
  }

  function handleAddBlur(e: React.FocusEvent<HTMLDivElement>) {
    if (isSubmitting) return
    const next = e.relatedTarget as Node | null
    if (addRowRef.current && next && addRowRef.current.contains(next)) return
    submitAdd()
  }

  function startEdit(item: OrderCostItem) {
    setEditingId(item.id)
    setEditDesc(item.description)
    setEditCat(item.category as OrderCostCategory)
    setEditQty(String(item.quantity))
    setEditUnit(String(item.unit_value))
  }

  async function submitEdit(id: string) {
    const current = items.find(i => i.id === id)
    if (!current) { setEditingId(null); return }
    const res = await updateOrderCostItem(id, orderId, {
      description: editDesc,
      category:    editCat,
      quantity:    editQty,
      unit_value:  editUnit,
    })
    if (!res.success) { toast.error(res.message); setEditingId(null); return }
    if (res.data) {
      const updated = items.map(i => i.id === id ? (res.data as OrderCostItem) : i)
      onChange(updated, res.order as Order | undefined)
    }
    setEditingId(null)
  }

  function handleDelete(item: OrderCostItem) {
    const optimistic = items.filter(i => i.id !== item.id)
    onChange(optimistic)
    startTransitionDelete(async () => {
      const res = await deleteOrderCostItem(item.id, orderId)
      if (!res.success) { onChange(items); toast.error(res.message) }
      else if (res.order) onChange(optimistic, res.order as Order)
    })
  }

  return (
    <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-5 mb-4">
      {/* Header com tooltip */}
      <div className="flex items-start justify-between mb-1">
        <div>
          <div className="flex items-center gap-1.5">
            <h2 className="text-sm font-semibold text-white">Repasses ao cliente</h2>
            <span
              title="Itens que você paga mas repassa ao cliente. Não reduzem seu lucro real."
              className="w-4 h-4 rounded-full bg-[#1c1c1c] border border-[#2a2a2a] text-[#525252] text-[9px] font-bold flex items-center justify-center cursor-help hover:bg-[#262626] transition-colors shrink-0 select-none"
            >?</span>
          </div>
          <p className="text-[10px] text-[#525252] mt-0.5">
            {items.length > 0
              ? `${items.length} ${items.length === 1 ? 'repasse' : 'repasses'} · ${formatCurrency(total, currency)}`
              : 'aluguel de gear, viagem cobrada, diária de assistente...'}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {onAddFile && (
            <button
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={onAddFile}
              title="Anexar comprovante (recibo, nota, foto do pagamento)"
              className="flex items-center gap-1.5 text-xs font-medium text-[#a3a3a3] hover:text-white transition-colors px-2.5 py-1.5 rounded-lg border border-[#2a2a2a] hover:border-[#3a3a3a] hover:bg-[#1c1c1c]"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
              Comprovante
            </button>
          )}
          <button
            type="button"
            onMouseDown={e => e.preventDefault()}
            onClick={handleHeaderButtonClick}
            className="flex items-center gap-1.5 text-xs font-semibold text-[#D4A853] hover:text-[#E8C47A] transition-colors px-2.5 py-1.5 rounded-lg border border-[#D4A853]/20 hover:border-[#D4A853]/40"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Adicionar repasse
          </button>
        </div>
      </div>

      {(items.length > 0 || adding) && (
        <div className="grid grid-cols-[80px_1fr_56px_84px_84px_28px] gap-2 mb-1 px-1 mt-4">
          <span className={labelCls}>CATEGORIA</span>
          <span className={labelCls}>DESCRIÇÃO</span>
          <span className={`${labelCls} text-right`}>QTD</span>
          <span className={`${labelCls} text-right`}>UNIT.</span>
          <span className={`${labelCls} text-right`}>TOTAL</span>
          <span />
        </div>
      )}

      <div className="space-y-1">
        {items.map(it => {
          const isNew = it.id === newlyAddedId
          const catLabel = COST_CATEGORIES.find(c => c.value === it.category)?.label ?? it.category
          return (
            <div key={it.id}>
              {editingId === it.id ? (
                <div className="grid grid-cols-[80px_1fr_56px_84px_84px_28px] gap-2 items-center bg-[#1a1a1a] rounded-lg px-1 py-1">
                  <select value={editCat} onChange={e => setEditCat(e.target.value as OrderCostCategory)} className={inputSm}>
                    {COST_CATEGORIES.map(c => <option key={c.value} value={c.value} className="bg-[#141414]">{c.label}</option>)}
                  </select>
                  <input autoFocus value={editDesc} onChange={e => setEditDesc(e.target.value)}
                    onBlur={() => submitEdit(it.id)}
                    onKeyDown={e => { if (e.key === 'Enter') submitEdit(it.id); if (e.key === 'Escape') setEditingId(null) }}
                    className={inputSm} />
                  <input value={editQty} onChange={e => setEditQty(e.target.value)}
                    onBlur={() => submitEdit(it.id)} onKeyDown={e => { if (e.key === 'Enter') submitEdit(it.id) }}
                    className={`${inputSm} text-right`} />
                  <input value={editUnit} onChange={e => setEditUnit(e.target.value)}
                    onBlur={() => submitEdit(it.id)} onKeyDown={e => { if (e.key === 'Enter') submitEdit(it.id) }}
                    className={`${inputSm} text-right`} />
                  <span className="text-xs text-right text-[#525252]">
                    {formatCurrency((parseFloat(editQty) || 1) * (parseFloat(editUnit.replace(',', '.')) || 0), currency)}
                  </span>
                  <span />
                </div>
              ) : (
                <div
                  className={`grid grid-cols-[80px_1fr_56px_84px_84px_28px] gap-2 items-center group rounded-lg px-1 py-1 cursor-pointer transition-all duration-500 ${
                    isNew ? 'bg-[#D4A853]/10 border border-[#D4A853]/20' : 'hover:bg-[#1c1c1c] border border-transparent'
                  }`}
                  onClick={() => startEdit(it)}
                >
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1c1c1c] border border-[#2a2a2a] text-[#525252] truncate">{catLabel}</span>
                  <span className="text-sm text-white truncate">{it.description}</span>
                  <span className="text-xs text-[#a3a3a3] text-right">{Number(it.quantity)}×</span>
                  <span className="text-xs text-[#a3a3a3] text-right">{formatCurrency(Number(it.unit_value), currency)}</span>
                  <span className="text-xs font-semibold text-white text-right">{formatCurrency(Number(it.total_value), currency)}</span>
                  <button onClick={e => { e.stopPropagation(); handleDelete(it) }}
                    className="opacity-0 group-hover:opacity-100 text-[#525252] hover:text-red-400 transition-all p-0.5">
                    <TrashIcon />
                  </button>
                </div>
              )}
            </div>
          )
        })}

        {adding && (
          <div
            ref={addRowRef}
            tabIndex={-1}
            onBlur={handleAddBlur}
            className="bg-[#1c1c1c] rounded-lg px-2 py-2 border border-[#D4A853]/20 outline-none"
          >
            <div className="grid grid-cols-[80px_1fr_56px_84px_84px_28px] gap-2 items-center">
              <select
                value={newCat}
                onChange={e => setNewCat(e.target.value as OrderCostCategory)}
                onKeyDown={handleAddKeyDown}
                disabled={isSubmitting}
                className={inputSm}
              >
                {COST_CATEGORIES.map(c => <option key={c.value} value={c.value} className="bg-[#141414]">{c.label}</option>)}
              </select>
              <input
                ref={addDescRef}
                autoFocus
                placeholder="Ex: Aluguel drone, viagem..."
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                onKeyDown={handleAddKeyDown}
                disabled={isSubmitting}
                className={inputSm}
              />
              <input
                placeholder="1"
                value={newQty}
                onChange={e => setNewQty(e.target.value)}
                onKeyDown={handleAddKeyDown}
                disabled={isSubmitting}
                className={`${inputSm} text-right`}
              />
              <input
                placeholder="0,00"
                value={newUnit}
                onChange={e => setNewUnit(e.target.value)}
                onKeyDown={handleAddKeyDown}
                disabled={isSubmitting}
                className={`${inputSm} text-right`}
              />
              <span className="text-xs text-right text-[#525252]">
                {formatCurrency((parseFloat(newQty) || 1) * (parseFloat(newUnit.replace(',', '.')) || 0), currency)}
              </span>
              <span />
            </div>
            <div className="flex items-center justify-end gap-1.5 mt-2 pt-2 border-t border-[#262626]">
              {isSubmitting && <Spinner />}
              <button
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => submitAdd()}
                disabled={isSubmitting || !newDesc.trim()}
                className="inline-flex items-center gap-1.5 text-xs font-semibold bg-[#D4A853] hover:bg-[#E8C47A] disabled:opacity-50 disabled:cursor-not-allowed text-[#0a0a0a] px-3 py-1.5 rounded-lg transition-colors"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
                Adicionar
              </button>
              <button
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={cancelAdd}
                disabled={isSubmitting}
                aria-label="Descartar linha"
                title="Descartar"
                className="text-[#737373] hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-[#1f1f1f] disabled:opacity-40"
              >
                <TrashIcon />
              </button>
            </div>
          </div>
        )}
      </div>

      {items.length === 0 && !adding && (
        <p className="text-xs text-[#525252] text-center py-6">
          Nenhum repasse registrado. Aluguel de gear, viagem cobrada do cliente, diária de assistente...
        </p>
      )}

      {items.length > 0 && (
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#1c1c1c]">
          <span className="text-[10px] text-[#525252]">cobrado do cliente · não reduz seu lucro</span>
          <span className="text-sm font-bold text-[#a3a3a3]">{formatCurrency(total, currency)}</span>
        </div>
      )}

      {/* Comprovantes anexados (nota, recibo, foto do pagamento) */}
      {files && files.length > 0 && onFileDeletedOptimistic && onFileDeleteRollback && (
        <OrderComprovantesList
          files={files}
          onFileDeletedOptimistic={onFileDeletedOptimistic}
          onFileDeleteRollback={onFileDeleteRollback}
        />
      )}
    </div>
  )
}

// ─── OrderExpensesSection ──────────────────────────────────────────────────
// Despesas operacionais do pedido (saída de bolso). Espelha
// JobExpensesSection do Freelances. Usa expenses.order_id (migration
// 20260422050000). Exibe lucro estimado = revenueTotal − totalExpenses.

function OrderExpensesSection({
  orderId,
  currency,
  expenses,
  revenueTotal,
  onChange,
}: {
  orderId:      string
  currency:     string
  expenses:     Expense[]
  revenueTotal: number
  onChange:     (next: Expense[]) => void
}) {
  const [adding, setAdding] = useState(false)
  const [isPending, startTransition] = useTransition()

  const [desc, setDesc] = useState('')
  const [cat, setCat]   = useState<ExpenseCategory>('other')
  const [amount, setAmount] = useState('')
  const [dateInput, setDateInput] = useState(new Date().toISOString().slice(0, 10))

  function reset() {
    setDesc(''); setCat('other'); setAmount(''); setDateInput(new Date().toISOString().slice(0, 10))
  }

  function handleAdd() {
    const amt = parseFloat(amount.replace(',', '.'))
    if (!desc.trim()) { toast.error('Descrição obrigatória.'); return }
    if (!amt || amt <= 0) { toast.error('Valor inválido.'); return }
    startTransition(async () => {
      const res = await createExpense({
        description:   desc.trim(),
        category:      cat,
        amount:        amt,
        currency,
        expense_date:  dateInput,
        is_deductible: true,
        order_id:      orderId,
      })
      if (!res.success) { toast.error(res.message); return }
      if (res.data) onChange([res.data as Expense, ...expenses])
      reset()
      setAdding(false)
    })
  }

  function handleDelete(exp: Expense) {
    if (!confirm(`Remover "${exp.description}"?`)) return
    const optimistic = expenses.filter(e => e.id !== exp.id)
    onChange(optimistic)
    startTransition(async () => {
      const res = await deleteExpense(exp.id)
      if (!res.success) {
        onChange(expenses)
        toast.error(res.message)
      }
    })
  }

  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount || 0), 0)
  const lucro = Math.max(0, revenueTotal - totalExpenses)

  return (
    <div className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-6 mb-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-white">Despesas deste pedido</h2>
          <p className="text-[10px] text-[#525252] mt-0.5">
            o que saiu do seu bolso neste pedido (motoboy, estacionamento, etc).
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdding(v => !v)}
          className="flex items-center gap-1.5 text-xs font-semibold text-[#D4A853] hover:text-[#E8C47A] transition-colors px-2.5 py-1.5 rounded-lg border border-[#D4A853]/20 hover:border-[#D4A853]/40"
        >
          <svg className={`w-3 h-3 transition-transform ${adding ? 'rotate-45' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Adicionar despesa
        </button>
      </div>

      {adding && (
        <div className="bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg p-4 mb-3 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
            <input
              autoFocus
              type="text"
              placeholder="Descrição"
              value={desc}
              onChange={e => setDesc(e.target.value)}
              className={inputCls + ' md:col-span-2'}
            />
            <select
              value={cat}
              onChange={e => setCat(e.target.value as ExpenseCategory)}
              className={inputCls}
            >
              {EXPENSE_CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className={inputCls + ' text-right'}
            />
            <input
              type="date"
              value={dateInput}
              onChange={e => setDateInput(e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => { reset(); setAdding(false) }}
              className="text-xs text-[#a3a3a3] hover:text-white px-3 py-1.5 rounded transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleAdd}
              disabled={isPending}
              className="text-xs font-semibold text-[#0a0a0a] bg-[#D4A853] hover:bg-[#E8C47A] disabled:opacity-60 px-3 py-1.5 rounded transition-colors"
            >
              {isPending ? 'Salvando…' : 'Adicionar'}
            </button>
          </div>
        </div>
      )}

      {expenses.length === 0 && !adding ? (
        <p className="text-xs text-[#525252] text-center py-6">
          Nenhuma despesa registrada ainda.
        </p>
      ) : (
        <div className="space-y-0">
          {expenses.map(exp => (
            <div key={exp.id} className="flex items-center justify-between py-2.5 border-b border-[#1c1c1c] last:border-0">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white truncate">
                  {exp.description}
                  <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-[#1c1c1c] text-[#a3a3a3] uppercase tracking-wider">
                    {EXPENSE_CATEGORY_LABELS[exp.category]}
                  </span>
                </p>
                <p className="text-xs text-[#525252] mt-0.5">
                  {exp.expense_date.split('-').reverse().join('/')}
                </p>
              </div>
              <p className="text-sm font-semibold text-red-400 shrink-0 ml-3">
                − {formatCurrency(Number(exp.amount), exp.currency)}
              </p>
              <button
                onClick={() => handleDelete(exp)}
                disabled={isPending}
                className="ml-2 text-[#3a3a3a] hover:text-red-400 disabled:opacity-40 transition-colors p-1 shrink-0"
                aria-label="Remover despesa"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-6 mt-4 pt-4 border-t border-[#1c1c1c]">
        <div>
          <p className="text-[10px] text-[#525252] tracking-widest uppercase">Despesa</p>
          <p className="text-sm font-semibold text-red-400 mt-1">
            − {formatCurrency(totalExpenses, currency)}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-[#525252] tracking-widest uppercase">Lucro estimado</p>
          <p className="text-sm font-semibold text-emerald-400 mt-1">
            {formatCurrency(lucro, currency)}
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── OrderPaymentsSection ──────────────────────────────────────────────────
// Lista + form inline para registrar pagamentos recebidos.

function OrderPaymentsSection({
  orderId,
  currency,
  payments,
  totalDue,
  onChange,
}: {
  orderId:  string
  currency: string
  payments: OrderPayment[]
  totalDue: number
  onChange: (next: OrderPayment[], order?: Order) => void
}) {
  const [showForm, setShowForm] = useState(false)
  const [isPending, startTransition] = useTransition()

  const [amount, setAmount] = useState('')
  const [date, setDate]     = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes]   = useState('')

  function reset() { setAmount(''); setDate(new Date().toISOString().slice(0, 10)); setNotes('') }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const amt = parseFloat(amount.replace(',', '.'))
    if (!amt || amt <= 0) { toast.error('Valor inválido.'); return }
    startTransition(async () => {
      const res = await addOrderPayment(orderId, {
        amount:      amt,
        received_at: date,
        notes:       notes.trim() || undefined,
        currency,
      })
      if (!res.success) { toast.error(res.message); return }
      if (res.data) onChange([res.data, ...payments], res.order)
      reset()
      setShowForm(false)
    })
  }

  function handleDelete(id: string) {
    if (!confirm('Remover este pagamento?')) return
    const optimistic = payments.filter(p => p.id !== id)
    onChange(optimistic)
    startTransition(async () => {
      const res = await deleteOrderPayment(id, orderId)
      if (!res.success) {
        onChange(payments)
        toast.error(res.message)
      } else if (res.order) {
        onChange(optimistic, res.order)
      }
    })
  }

  return (
    <div className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-white">Pagamentos recebidos</h2>
        <button
          onClick={() => {
            if (!showForm && totalDue > 0) {
              setAmount(totalDue.toFixed(2).replace('.', ','))
            }
            setShowForm(v => !v)
          }}
          className="flex items-center gap-1.5 text-xs font-semibold text-[#D4A853] hover:text-[#E8C47A] transition-colors"
        >
          <svg className={`w-3.5 h-3.5 transition-transform ${showForm ? 'rotate-45' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Registrar pagamento
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-[#1c1c1c] border border-[#2a2a2a] rounded-xl p-4 mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-semibold text-[#525252] tracking-widest uppercase">VALOR</label>
              <input
                autoFocus
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                required
                className={inputCls + ' mt-1'}
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-[#525252] tracking-widest uppercase">DATA</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                required
                className={inputCls + ' mt-1'}
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-[#525252] tracking-widest uppercase">OBSERVAÇÃO (opcional)</label>
            <input
              type="text"
              placeholder="Ex: Entrada, saldo final..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className={inputCls + ' mt-1'}
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={isPending}
              className="text-xs font-semibold text-[#0a0a0a] bg-[#D4A853] hover:bg-[#E8C47A] disabled:opacity-60 px-3 py-2 rounded-lg transition-colors"
            >
              {isPending ? 'Salvando…' : 'Confirmar'}
            </button>
            <button
              type="button"
              onClick={() => { reset(); setShowForm(false) }}
              className="text-xs text-[#525252] hover:text-white transition-colors px-3 py-2"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {payments.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-[#525252]">Nenhum pagamento registrado</p>
          <p className="text-xs text-[#3a3a3a] mt-1">Registre quando receber do cliente</p>
        </div>
      ) : (
        <div className="space-y-0">
          {payments.map(p => (
            <div key={p.id} className="flex items-center justify-between py-2.5 border-b border-[#1c1c1c] last:border-0">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-emerald-400">
                  + {formatCurrency(Number(p.amount), p.currency)}
                </p>
                <p className="text-xs text-[#525252] mt-0.5">
                  {(p.paid_at ?? p.created_at.slice(0, 10)).split('-').reverse().join('/')}
                  {p.notes && <span className="ml-2 text-[#3a3a3a]">· {p.notes}</span>}
                </p>
              </div>
              <button
                onClick={() => handleDelete(p.id)}
                disabled={isPending}
                className="ml-3 text-[#3a3a3a] hover:text-red-400 disabled:opacity-40 transition-colors p-1 shrink-0"
                aria-label="Remover pagamento"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── FinCardMini ────────────────────────────────────────────────────────────
// Versão leve do FinCard de job-detail.tsx. Sem animação de flash (menos
// state, menos re-render) — o pedido não tem item-level live sync tão
// agressivo quanto o freelance. Se futuramente precisar de flash, basta
// promover para usar useEffect+ref como no job-detail.

function FinCardMini({
  label, value, currency, color, sub, tooltip,
}: {
  label: string; value: number; currency: string; color: string
  sub?: string; tooltip?: string
}) {
  return (
    <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-4">
      <div className="flex items-center gap-1 mb-1">
        <p className="text-[10px] font-semibold text-[#525252] tracking-widest">{label}</p>
        {tooltip && (
          <span title={tooltip}
            className="w-3.5 h-3.5 rounded-full bg-[#1c1c1c] border border-[#2a2a2a] text-[#525252] text-[8px] font-bold flex items-center justify-center cursor-help hover:bg-[#262626] transition-colors shrink-0 select-none">
            ?
          </span>
        )}
      </div>
      <p className={`text-base font-bold ${color}`}>
        {formatCurrency(value, currency)}
      </p>
      {sub && <p className="text-[10px] text-[#525252] mt-0.5">{sub}</p>}
    </div>
  )
}
