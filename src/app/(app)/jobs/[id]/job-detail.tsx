'use client'

import { useState, useTransition, useRef } from 'react'
import Link from 'next/link'
import { formatCurrency } from '@/lib/utils/format'
import { updateJobStatus, updateJob, addPayment, deletePayment } from '@/lib/actions/jobs'
import {
  addRevenueItem, updateRevenueItem, deleteRevenueItem,
  addCostItem,    updateCostItem,    deleteCostItem,
} from '@/lib/actions/job-items'
import { calcJobFinancials, JOB_COST_CATEGORY_LABELS } from '@/types/job'
import type {
  Job, JobRevenueItem, JobCostItem, JobPayment,
  JobStatus, JobCategory, JobCostCategory, PaymentCondition,
} from '@/types/job'

// ─── Config ───────────────────────────────────────────────────────────────────

const STATUS_MAP: Record<JobStatus, { label: string; cls: string }> = {
  in_progress:     { label: 'Em andamento',  cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20'          },
  delivered:       { label: 'Entregue',       cls: 'bg-purple-500/10 text-purple-400 border-purple-500/20'    },
  pending_payment: { label: 'Pag. pendente', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20'       },
  paid:            { label: 'Pago',           cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  cancelled:       { label: 'Cancelado',      cls: 'bg-[#262626] text-[#525252] border-[#2a2a2a]'             },
}

const CATEGORY_LABELS: Record<JobCategory, string> = {
  wedding:     'Casamento',
  corporate:   'Corporativo',
  social:      'Social',
  documentary: 'Documentário',
  other:       'Outros',
}

const PAYMENT_COND_LABELS: Record<PaymentCondition, string> = {
  upfront: 'À vista',
  '7d':  '7 dias', '15d': '15 dias', '30d': '30 dias',
  '60d': '60 dias', '90d': '90 dias',
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  job:                Job
  initialRevenueItems: JobRevenueItem[]
  initialCostItems:    JobCostItem[]
  initialPayments:     JobPayment[]
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function JobDetail({
  job: initialJob,
  initialRevenueItems,
  initialCostItems,
  initialPayments,
}: Props) {
  const [job,          setJob]          = useState<Job>(initialJob)
  const [revenueItems, setRevenueItems] = useState<JobRevenueItem[]>(initialRevenueItems)
  const [costItems,    setCostItems]    = useState<JobCostItem[]>(initialCostItems)
  const [payments,     setPayments]     = useState<JobPayment[]>(initialPayments)
  const [toast,        setToast]        = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Inline editing
  const [editingField, setEditingField] = useState<string | null>(null)
  const [titleDraft,   setTitleDraft]   = useState(job.title)
  const [clientDraft,  setClientDraft]  = useState(job.client_name)
  const [dateDraft,    setDateDraft]    = useState(job.job_date)

  // Payment form
  const [showPayForm,   setShowPayForm]   = useState(false)
  const [payAmount,     setPayAmount]     = useState('')
  const [payDate,       setPayDate]       = useState(today())
  const [payNotes,      setPayNotes]      = useState('')
  const [deletingPayId, setDeletingPayId] = useState<string | null>(null)

  const [isPending, startTransition] = useTransition()

  const fin = calcJobFinancials(job)

  // ── Toast ──────────────────────────────────────────────────────────────────

  function showToast(type: 'success' | 'error', message: string) {
    setToast({ type, message })
    setTimeout(() => setToast(null), 3000)
  }

  // ── Status ─────────────────────────────────────────────────────────────────

  function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStatus = e.target.value as JobStatus
    startTransition(async () => {
      const res = await updateJobStatus(job.id, newStatus)
      if (res.success && res.data) setJob(res.data)
      else if (!res.success) showToast('error', res.error)
    })
  }

  // ── Field save ─────────────────────────────────────────────────────────────

  async function saveField(field: string) {
    const payload: Parameters<typeof updateJob>[1] = {}
    if (field === 'title')       payload.title       = titleDraft
    if (field === 'client_name') payload.client_name = clientDraft
    if (field === 'job_date')    payload.job_date    = dateDraft
    const res = await updateJob(job.id, payload)
    if (res.success && res.data) setJob(res.data)
    else if (!res.success) showToast('error', res.error)
    setEditingField(null)
  }

  // ── Payments ───────────────────────────────────────────────────────────────

  async function handleAddPayment(e: React.FormEvent) {
    e.preventDefault()
    const amount = parseFloat(payAmount.replace(',', '.'))
    if (!amount || amount <= 0) { showToast('error', 'Informe um valor válido.'); return }
    startTransition(async () => {
      const res = await addPayment(job.id, { amount, received_at: payDate, notes: payNotes.trim() || undefined, currency: job.currency })
      if (res.success) {
        if (res.data) setPayments(prev => [res.data!, ...prev])
        if (res.job)  setJob(res.job)
        setPayAmount(''); setPayDate(today()); setPayNotes(''); setShowPayForm(false)
        showToast('success', 'Pagamento registrado.')
      } else {
        showToast('error', res.error)
      }
    })
  }

  async function handleDeletePayment(paymentId: string) {
    setDeletingPayId(paymentId)
    const res = await deletePayment(paymentId, job.id)
    setDeletingPayId(null)
    if (res.success) {
      setPayments(prev => prev.filter(p => p.id !== paymentId))
      if (res.job) setJob(res.job)
      showToast('success', 'Pagamento removido.')
    } else if (!res.success) {
      showToast('error', res.error)
    }
  }

  // ── Revenue items ──────────────────────────────────────────────────────────

  async function handleAddRevenueItem(description: string, quantity: number, unit_value: number) {
    const res = await addRevenueItem(job.id, { description, quantity, unit_value })
    if (res.success) {
      if (res.data) setRevenueItems(prev => [...prev, res.data as JobRevenueItem])
      if (res.job)  setJob(res.job)
    } else {
      showToast('error', res.error)
    }
  }

  async function handleUpdateRevenueItem(itemId: string, fields: { description?: string; quantity?: number; unit_value?: number }) {
    const res = await updateRevenueItem(itemId, job.id, fields)
    if (res.success) {
      if (res.data) setRevenueItems(prev => prev.map(i => i.id === itemId ? res.data as JobRevenueItem : i))
      if (res.job)  setJob(res.job)
    } else {
      showToast('error', res.error)
    }
  }

  async function handleDeleteRevenueItem(itemId: string) {
    const res = await deleteRevenueItem(itemId, job.id)
    if (res.success) {
      setRevenueItems(prev => prev.filter(i => i.id !== itemId))
      if (res.job) setJob(res.job)
    } else {
      showToast('error', res.error)
    }
  }

  // ── Cost items ─────────────────────────────────────────────────────────────

  async function handleAddCostItem(description: string, category: JobCostCategory, quantity: number, unit_value: number) {
    const res = await addCostItem(job.id, { description, category, quantity, unit_value })
    if (res.success) {
      if (res.data) setCostItems(prev => [...prev, res.data as JobCostItem])
      if (res.job)  setJob(res.job)
    } else {
      showToast('error', res.error)
    }
  }

  async function handleUpdateCostItem(itemId: string, fields: { description?: string; category?: JobCostCategory; quantity?: number; unit_value?: number }) {
    const res = await updateCostItem(itemId, job.id, fields)
    if (res.success) {
      if (res.data) setCostItems(prev => prev.map(i => i.id === itemId ? res.data as JobCostItem : i))
      if (res.job)  setJob(res.job)
    } else {
      showToast('error', res.error)
    }
  }

  async function handleDeleteCostItem(itemId: string) {
    const res = await deleteCostItem(itemId, job.id)
    if (res.success) {
      setCostItems(prev => prev.filter(i => i.id !== itemId))
      if (res.job) setJob(res.job)
    } else {
      showToast('error', res.error)
    }
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const progressPct = fin.revenue > 0
    ? Math.min(100, Math.round((fin.received / fin.revenue) * 100))
    : 0
  const { label: statusLabel, cls: statusCls } = STATUS_MAP[job.status] ?? STATUS_MAP.in_progress

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-full p-6 md:p-8 max-w-3xl mx-auto pb-20">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6 text-sm text-[#525252]">
        <Link href="/jobs" className="hover:text-white transition-colors">Jobs</Link>
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-[#a3a3a3] truncate">{job.title}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="min-w-0 flex-1">
          {editingField === 'title' ? (
            <input autoFocus value={titleDraft} onChange={e => setTitleDraft(e.target.value)}
              onBlur={() => saveField('title')}
              onKeyDown={e => { if (e.key === 'Enter') saveField('title'); if (e.key === 'Escape') setEditingField(null) }}
              className="text-2xl font-bold bg-transparent border-b border-[#D4A853] text-white outline-none w-full pb-0.5" />
          ) : (
            <h1 className="text-2xl font-bold text-white cursor-pointer hover:text-[#D4A853] transition-colors truncate"
              onClick={() => { setTitleDraft(job.title); setEditingField('title') }} title="Clique para editar">
              {job.title || 'Job sem título'}
            </h1>
          )}
          {editingField === 'client_name' ? (
            <input autoFocus value={clientDraft} onChange={e => setClientDraft(e.target.value)}
              onBlur={() => saveField('client_name')}
              onKeyDown={e => { if (e.key === 'Enter') saveField('client_name'); if (e.key === 'Escape') setEditingField(null) }}
              className="text-sm bg-transparent border-b border-[#D4A853] text-[#a3a3a3] outline-none mt-1 w-full" />
          ) : (
            <p className="text-sm text-[#a3a3a3] mt-1 cursor-pointer hover:text-white transition-colors"
              onClick={() => { setClientDraft(job.client_name); setEditingField('client_name') }} title="Clique para editar">
              {job.client_name || 'Cliente não informado'}
              {job.category && (
                <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-[#1c1c1c] border border-[#2a2a2a] text-[#525252]">
                  {CATEGORY_LABELS[job.category]}
                </span>
              )}
            </p>
          )}
        </div>
        <select value={job.status} onChange={handleStatusChange} disabled={isPending}
          className={`text-xs font-semibold px-3 py-1.5 rounded-lg border cursor-pointer outline-none appearance-none disabled:opacity-60 shrink-0 ${statusCls}`}>
          {(Object.keys(STATUS_MAP) as JobStatus[]).map(s => (
            <option key={s} value={s} className="bg-[#141414] text-white">{STATUS_MAP[s].label}</option>
          ))}
        </select>
      </div>

      {/* ── 4 cards financeiros ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <FinCard label="RECEITA"   value={fin.revenue}   currency={job.currency} color="text-white" />
        <FinCard label="CUSTO"     value={fin.cost}      currency={job.currency} color="text-red-400" />
        <FinCard label="LUCRO"     value={fin.profit}    currency={job.currency} color={fin.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}
          sub={fin.revenue > 0 ? `${fin.margin_pct.toFixed(1)}% margem` : undefined} />
        <FinCard label="A RECEBER" value={fin.due}       currency={job.currency} color={fin.due > 0 ? 'text-[#D4A853]' : 'text-[#525252]'}
          sub={job.payment_due_date && fin.due > 0 ? `vence ${formatDate(job.payment_due_date)}` : undefined} />
      </div>

      {/* Barra de progresso */}
      {fin.revenue > 0 && job.status !== 'cancelled' && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-[#525252]">
              {formatCurrency(fin.received, job.currency)} recebido de {formatCurrency(fin.revenue, job.currency)}
            </span>
            <span className="text-[10px] text-[#525252]">{progressPct}%</span>
          </div>
          <div className="h-1.5 w-full bg-[#1c1c1c] rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-500 ${
              progressPct === 100 ? 'bg-emerald-500' : progressPct > 0 ? 'bg-[#D4A853]' : 'bg-[#2a2a2a]'
            }`} style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      )}

      {/* ── Receita ──────────────────────────────────────────────────────────── */}
      <ItemTable
        title="Receita"
        subtitle="o que você cobra"
        total={fin.revenue}
        currency={job.currency}
        emptyMessage="Nenhum item de receita. Adicione o que você vai cobrar do cliente."
        addLabel="+ Item de receita"
        onAdd={(desc, qty, val) => handleAddRevenueItem(desc, qty, val)}
        rows={revenueItems.map(item => ({
          id:          item.id,
          description: item.description,
          quantity:    item.quantity,
          unit_value:  item.unit_value,
          total_value: item.total_value,
          badge:       null,
        }))}
        onUpdate={(id, fields) => handleUpdateRevenueItem(id, fields)}
        onDelete={(id) => handleDeleteRevenueItem(id)}
      />

      {/* ── Custos ───────────────────────────────────────────────────────────── */}
      <CostTable
        total={fin.cost}
        currency={job.currency}
        items={costItems}
        onAdd={(desc, cat, qty, val) => handleAddCostItem(desc, cat, qty, val)}
        onUpdate={(id, fields) => handleUpdateCostItem(id, fields)}
        onDelete={(id) => handleDeleteCostItem(id)}
      />

      {/* ── Info ─────────────────────────────────────────────────────────────── */}
      <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-5 mb-6">
        <h2 className="text-sm font-semibold text-white mb-3">Detalhes</h2>
        <div className="space-y-2.5">
          <InfoRow label="Data do job">
            {editingField === 'job_date' ? (
              <input autoFocus type="date" value={dateDraft} onChange={e => setDateDraft(e.target.value)}
                onBlur={() => saveField('job_date')}
                onKeyDown={e => { if (e.key === 'Enter') saveField('job_date'); if (e.key === 'Escape') setEditingField(null) }}
                className="text-xs bg-[#1c1c1c] border border-[#D4A853]/50 rounded px-2 py-1 text-white outline-none" />
            ) : (
              <span className="text-xs text-white cursor-pointer hover:text-[#D4A853] transition-colors"
                onClick={() => { setDateDraft(job.job_date); setEditingField('job_date') }}>
                {formatDate(job.job_date)}
              </span>
            )}
          </InfoRow>
          <InfoRow label="Vencimento"><span className="text-xs text-white">{formatDate(job.payment_due_date)}</span></InfoRow>
          <InfoRow label="Condição"><span className="text-xs text-white">{PAYMENT_COND_LABELS[job.payment_condition]}</span></InfoRow>
        </div>
      </div>

      {/* ── Pagamentos ───────────────────────────────────────────────────────── */}
      <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white">Pagamentos recebidos</h2>
          <button onClick={() => setShowPayForm(!showPayForm)}
            className="flex items-center gap-1.5 text-xs font-semibold text-[#D4A853] hover:text-[#E8C47A] transition-colors">
            <svg className={`w-3.5 h-3.5 transition-transform ${showPayForm ? 'rotate-45' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Registrar pagamento
          </button>
        </div>

        {showPayForm && (
          <form onSubmit={handleAddPayment} className="bg-[#1c1c1c] border border-[#2a2a2a] rounded-xl p-4 mb-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>VALOR</label>
                <input autoFocus type="text" inputMode="decimal" placeholder="0,00"
                  value={payAmount} onChange={e => setPayAmount(e.target.value)} required className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>DATA</label>
                <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} required className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>OBSERVAÇÃO (opcional)</label>
              <input type="text" placeholder="Ex: Entrada, saldo final..." value={payNotes} onChange={e => setPayNotes(e.target.value)} className={inputCls} />
            </div>
            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={isPending} className={btnGold}>
                {isPending ? <Spinner /> : null} Confirmar
              </button>
              <button type="button" onClick={() => setShowPayForm(false)} className="text-xs text-[#525252] hover:text-white transition-colors px-3 py-2">
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
                  <p className="text-sm font-semibold text-emerald-400">+ {formatCurrency(Number(p.amount), p.currency)}</p>
                  <p className="text-xs text-[#525252] mt-0.5">
                    {formatDate(p.received_at)}
                    {p.notes && <span className="ml-2 text-[#3a3a3a]">· {p.notes}</span>}
                  </p>
                </div>
                <button onClick={() => handleDeletePayment(p.id)} disabled={deletingPayId === p.id}
                  className="ml-3 text-[#3a3a3a] hover:text-red-400 disabled:opacity-40 transition-colors p-1 shrink-0">
                  {deletingPayId === p.id ? <Spinner /> : <TrashIcon />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-3 rounded-xl text-sm font-medium border shadow-xl z-50 ${
          toast.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'
        }`}>
          {toast.message}
        </div>
      )}
    </div>
  )
}

// ─── FinCard ──────────────────────────────────────────────────────────────────

function FinCard({ label, value, currency, color, sub }: { label: string; value: number; currency: string; color: string; sub?: string }) {
  return (
    <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-4">
      <p className="text-[10px] font-semibold text-[#525252] tracking-widest mb-1">{label}</p>
      <p className={`text-base font-bold ${color}`}>{formatCurrency(value, currency)}</p>
      {sub && <p className="text-[10px] text-[#525252] mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── ItemTable (receita) ──────────────────────────────────────────────────────

interface ItemTableProps {
  title:        string
  subtitle:     string
  total:        number
  currency:     string
  emptyMessage: string
  addLabel:     string
  rows: { id: string; description: string; quantity: number; unit_value: number; total_value: number; badge: string | null }[]
  onAdd:    (description: string, quantity: number, unit_value: number) => void
  onUpdate: (id: string, fields: { description?: string; quantity?: number; unit_value?: number }) => void
  onDelete: (id: string) => void
}

function ItemTable({ title, subtitle, total, currency, emptyMessage, addLabel, rows, onAdd, onUpdate, onDelete }: ItemTableProps) {
  const [adding,  setAdding]  = useState(false)
  const [newDesc, setNewDesc] = useState('')
  const [newQty,  setNewQty]  = useState('1')
  const [newVal,  setNewVal]  = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDesc,  setEditDesc]  = useState('')
  const [editQty,   setEditQty]   = useState('')
  const [editVal,   setEditVal]   = useState('')

  function submitAdd() {
    const qty = parseFloat(newQty.replace(',', '.')) || 1
    const val = parseFloat(newVal.replace(',', '.')) || 0
    if (!newDesc.trim()) return
    onAdd(newDesc.trim(), qty, val)
    setNewDesc(''); setNewQty('1'); setNewVal(''); setAdding(false)
  }

  function startEdit(row: typeof rows[number]) {
    setEditingId(row.id)
    setEditDesc(row.description)
    setEditQty(String(row.quantity))
    setEditVal(String(row.unit_value))
  }

  function submitEdit(id: string) {
    const qty = parseFloat(editQty.replace(',', '.')) || 1
    const val = parseFloat(editVal.replace(',', '.')) || 0
    onUpdate(id, { description: editDesc, quantity: qty, unit_value: val })
    setEditingId(null)
  }

  return (
    <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-5 mb-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          <p className="text-[10px] text-[#525252] mt-0.5">{subtitle}</p>
        </div>
        <button onClick={() => setAdding(true)} className="text-xs font-semibold text-[#D4A853] hover:text-[#E8C47A] transition-colors">
          {addLabel}
        </button>
      </div>

      {/* Cabeçalho */}
      {(rows.length > 0 || adding) && (
        <div className="grid grid-cols-[1fr_60px_90px_90px_32px] gap-2 mb-1 px-1">
          <span className={labelCls}>DESCRIÇÃO</span>
          <span className={`${labelCls} text-right`}>QTD</span>
          <span className={`${labelCls} text-right`}>UNIT.</span>
          <span className={`${labelCls} text-right`}>TOTAL</span>
          <span />
        </div>
      )}

      {/* Linhas */}
      <div className="space-y-1">
        {rows.map(row => (
          <div key={row.id}>
            {editingId === row.id ? (
              <div className="grid grid-cols-[1fr_60px_90px_90px_32px] gap-2 items-center">
                <input autoFocus value={editDesc} onChange={e => setEditDesc(e.target.value)}
                  onBlur={() => submitEdit(row.id)}
                  onKeyDown={e => { if (e.key === 'Enter') submitEdit(row.id); if (e.key === 'Escape') setEditingId(null) }}
                  className={inputSm} />
                <input value={editQty} onChange={e => setEditQty(e.target.value)} onBlur={() => submitEdit(row.id)}
                  onKeyDown={e => { if (e.key === 'Enter') submitEdit(row.id); if (e.key === 'Escape') setEditingId(null) }}
                  className={`${inputSm} text-right`} />
                <input value={editVal} onChange={e => setEditVal(e.target.value)} onBlur={() => submitEdit(row.id)}
                  onKeyDown={e => { if (e.key === 'Enter') submitEdit(row.id); if (e.key === 'Escape') setEditingId(null) }}
                  className={`${inputSm} text-right`} />
                <span className="text-xs text-right text-[#525252]">
                  {formatCurrency((parseFloat(editQty) || 1) * (parseFloat(editVal) || 0), currency)}
                </span>
                <span />
              </div>
            ) : (
              <div className="grid grid-cols-[1fr_60px_90px_90px_32px] gap-2 items-center group rounded-lg hover:bg-[#1c1c1c] px-1 py-1 cursor-pointer"
                onClick={() => startEdit(row)}>
                <span className="text-sm text-white truncate">{row.description}</span>
                <span className="text-xs text-[#a3a3a3] text-right">{row.quantity}×</span>
                <span className="text-xs text-[#a3a3a3] text-right">{formatCurrency(row.unit_value, currency)}</span>
                <span className="text-xs font-semibold text-white text-right">{formatCurrency(row.total_value, currency)}</span>
                <button onClick={e => { e.stopPropagation(); onDelete(row.id) }}
                  className="opacity-0 group-hover:opacity-100 text-[#525252] hover:text-red-400 transition-all p-0.5">
                  <TrashIcon />
                </button>
              </div>
            )}
          </div>
        ))}

        {/* Nova linha */}
        {adding && (
          <div className="grid grid-cols-[1fr_60px_90px_90px_32px] gap-2 items-center">
            <input autoFocus placeholder="Descrição" value={newDesc} onChange={e => setNewDesc(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submitAdd(); if (e.key === 'Escape') { setAdding(false) } }}
              className={inputSm} />
            <input placeholder="1" value={newQty} onChange={e => setNewQty(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submitAdd() }}
              className={`${inputSm} text-right`} />
            <input placeholder="0,00" value={newVal} onChange={e => setNewVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submitAdd() }}
              className={`${inputSm} text-right`} />
            <span className="text-xs text-right text-[#525252]">
              {formatCurrency((parseFloat(newQty) || 1) * (parseFloat(newVal.replace(',', '.')) || 0), currency)}
            </span>
            <button onClick={() => setAdding(false)} className="text-[#525252] hover:text-white p-0.5">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Empty state */}
      {rows.length === 0 && !adding && (
        <p className="text-xs text-[#525252] text-center py-4">{emptyMessage}</p>
      )}

      {/* Total */}
      {rows.length > 0 && (
        <div className="flex justify-end mt-3 pt-3 border-t border-[#1c1c1c]">
          <span className="text-sm font-bold text-white">{formatCurrency(total, currency)}</span>
        </div>
      )}
    </div>
  )
}

// ─── CostTable ────────────────────────────────────────────────────────────────

interface CostTableProps {
  total:    number
  currency: string
  items:    JobCostItem[]
  onAdd:    (description: string, category: JobCostCategory, quantity: number, unit_value: number) => void
  onUpdate: (id: string, fields: { description?: string; category?: JobCostCategory; quantity?: number; unit_value?: number }) => void
  onDelete: (id: string) => void
}

function CostTable({ total, currency, items, onAdd, onUpdate, onDelete }: CostTableProps) {
  const [adding,   setAdding]   = useState(false)
  const [newDesc,  setNewDesc]  = useState('')
  const [newCat,   setNewCat]   = useState<JobCostCategory>('other')
  const [newQty,   setNewQty]   = useState('1')
  const [newVal,   setNewVal]   = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDesc,  setEditDesc]  = useState('')
  const [editCat,   setEditCat]   = useState<JobCostCategory>('other')
  const [editQty,   setEditQty]   = useState('')
  const [editVal,   setEditVal]   = useState('')

  function submitAdd() {
    const qty = parseFloat(newQty.replace(',', '.')) || 1
    const val = parseFloat(newVal.replace(',', '.')) || 0
    if (!newDesc.trim()) return
    onAdd(newDesc.trim(), newCat, qty, val)
    setNewDesc(''); setNewCat('other'); setNewQty('1'); setNewVal(''); setAdding(false)
  }

  function startEdit(item: JobCostItem) {
    setEditingId(item.id); setEditDesc(item.description)
    setEditCat(item.category); setEditQty(String(item.quantity)); setEditVal(String(item.unit_value))
  }

  function submitEdit(id: string) {
    const qty = parseFloat(editQty.replace(',', '.')) || 1
    const val = parseFloat(editVal.replace(',', '.')) || 0
    onUpdate(id, { description: editDesc, category: editCat, quantity: qty, unit_value: val })
    setEditingId(null)
  }

  const catOptions = Object.entries(JOB_COST_CATEGORY_LABELS) as [JobCostCategory, string][]

  return (
    <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-5 mb-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-white">Custos</h2>
          <p className="text-[10px] text-[#525252] mt-0.5">o que você gasta no projeto</p>
        </div>
        <button onClick={() => setAdding(true)} className="text-xs font-semibold text-[#D4A853] hover:text-[#E8C47A] transition-colors">
          + Item de custo
        </button>
      </div>

      {(items.length > 0 || adding) && (
        <div className="grid grid-cols-[80px_1fr_60px_90px_90px_32px] gap-2 mb-1 px-1">
          <span className={labelCls}>CATEGORIA</span>
          <span className={labelCls}>DESCRIÇÃO</span>
          <span className={`${labelCls} text-right`}>QTD</span>
          <span className={`${labelCls} text-right`}>UNIT.</span>
          <span className={`${labelCls} text-right`}>TOTAL</span>
          <span />
        </div>
      )}

      <div className="space-y-1">
        {items.map(item => (
          <div key={item.id}>
            {editingId === item.id ? (
              <div className="grid grid-cols-[80px_1fr_60px_90px_90px_32px] gap-2 items-center">
                <select value={editCat} onChange={e => setEditCat(e.target.value as JobCostCategory)} className={inputSm}>
                  {catOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <input autoFocus value={editDesc} onChange={e => setEditDesc(e.target.value)}
                  onBlur={() => submitEdit(item.id)}
                  onKeyDown={e => { if (e.key === 'Enter') submitEdit(item.id); if (e.key === 'Escape') setEditingId(null) }}
                  className={inputSm} />
                <input value={editQty} onChange={e => setEditQty(e.target.value)} className={`${inputSm} text-right`}
                  onBlur={() => submitEdit(item.id)} onKeyDown={e => { if (e.key === 'Enter') submitEdit(item.id) }} />
                <input value={editVal} onChange={e => setEditVal(e.target.value)} className={`${inputSm} text-right`}
                  onBlur={() => submitEdit(item.id)} onKeyDown={e => { if (e.key === 'Enter') submitEdit(item.id) }} />
                <span className="text-xs text-right text-[#525252]">
                  {formatCurrency((parseFloat(editQty) || 1) * (parseFloat(editVal) || 0), currency)}
                </span>
                <span />
              </div>
            ) : (
              <div className="grid grid-cols-[80px_1fr_60px_90px_90px_32px] gap-2 items-center group rounded-lg hover:bg-[#1c1c1c] px-1 py-1 cursor-pointer"
                onClick={() => startEdit(item)}>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1c1c1c] border border-[#2a2a2a] text-[#525252] truncate">
                  {JOB_COST_CATEGORY_LABELS[item.category]}
                </span>
                <span className="text-sm text-white truncate">{item.description}</span>
                <span className="text-xs text-[#a3a3a3] text-right">{item.quantity}×</span>
                <span className="text-xs text-[#a3a3a3] text-right">{formatCurrency(item.unit_value, currency)}</span>
                <span className="text-xs font-semibold text-white text-right">{formatCurrency(item.total_value, currency)}</span>
                <button onClick={e => { e.stopPropagation(); onDelete(item.id) }}
                  className="opacity-0 group-hover:opacity-100 text-[#525252] hover:text-red-400 transition-all p-0.5">
                  <TrashIcon />
                </button>
              </div>
            )}
          </div>
        ))}

        {adding && (
          <div className="grid grid-cols-[80px_1fr_60px_90px_90px_32px] gap-2 items-center">
            <select value={newCat} onChange={e => setNewCat(e.target.value as JobCostCategory)} className={inputSm}>
              {catOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <input autoFocus placeholder="Descrição" value={newDesc} onChange={e => setNewDesc(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submitAdd(); if (e.key === 'Escape') setAdding(false) }}
              className={inputSm} />
            <input placeholder="1" value={newQty} onChange={e => setNewQty(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submitAdd() }} className={`${inputSm} text-right`} />
            <input placeholder="0,00" value={newVal} onChange={e => setNewVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submitAdd() }} className={`${inputSm} text-right`} />
            <span className="text-xs text-right text-[#525252]">
              {formatCurrency((parseFloat(newQty) || 1) * (parseFloat(newVal.replace(',', '.')) || 0), currency)}
            </span>
            <button onClick={() => setAdding(false)} className="text-[#525252] hover:text-white p-0.5">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {items.length === 0 && !adding && (
        <p className="text-xs text-[#525252] text-center py-4">Nenhum custo registrado. Adicione o que você gasta neste projeto.</p>
      )}

      {items.length > 0 && (
        <div className="flex justify-end mt-3 pt-3 border-t border-[#1c1c1c]">
          <span className="text-sm font-bold text-red-400">{formatCurrency(total, currency)}</span>
        </div>
      )}
    </div>
  )
}

// ─── InfoRow ──────────────────────────────────────────────────────────────────

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-[#525252]">{label}</span>
      {children}
    </div>
  )
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function TrashIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function today() { return new Date().toISOString().split('T')[0] }
function formatDate(iso: string | null) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

const labelCls = 'block text-[10px] font-semibold text-[#525252] tracking-widest'
const inputCls = 'w-full bg-[#141414] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white placeholder-[#525252] focus:outline-none focus:border-[#D4A853]/50 focus:ring-1 focus:ring-[#D4A853]/20 transition-colors'
const inputSm  = 'w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded px-2 py-1 text-xs text-white placeholder-[#525252] focus:outline-none focus:border-[#D4A853]/50 transition-colors'
const btnGold  = 'flex items-center gap-2 bg-[#D4A853] hover:bg-[#E8C47A] disabled:opacity-60 text-[#0a0a0a] font-semibold text-xs px-4 py-2 rounded-lg transition-colors'
