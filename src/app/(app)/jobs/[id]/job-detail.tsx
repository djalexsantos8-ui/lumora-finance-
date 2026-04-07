'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { formatCurrency } from '@/lib/utils/format'
import { updateJobStatus, updateJob, addPayment, deletePayment } from '@/lib/actions/jobs'
import { getAmountDue } from '@/types/job'
import type { Job, JobPayment, JobStatus, JobCategory, PaymentCondition } from '@/types/job'

interface Props {
  job:             Job
  initialPayments: JobPayment[]
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_MAP: Record<JobStatus, { label: string; cls: string }> = {
  in_progress:     { label: 'Em andamento',   cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20'       },
  delivered:       { label: 'Entregue',        cls: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  pending_payment: { label: 'Pag. pendente',  cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20'    },
  paid:            { label: 'Pago',            cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  cancelled:       { label: 'Cancelado',       cls: 'bg-[#262626] text-[#525252] border-[#2a2a2a]'          },
}

const CATEGORY_LABELS: Record<JobCategory, string> = {
  wedding:     'Casamento',
  corporate:   'Corporativo',
  social:      'Social',
  documentary: 'Documentário',
  other:       'Outros',
}

const PAYMENT_CONDITION_LABELS: Record<PaymentCondition, string> = {
  upfront: 'À vista / Antecipado',
  '7d':    '7 dias',
  '15d':   '15 dias',
  '30d':   '30 dias',
  '60d':   '60 dias',
  '90d':   '90 dias',
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function JobDetail({ job: initialJob, initialPayments }: Props) {
  const [job,      setJob]      = useState<Job>(initialJob)
  const [payments, setPayments] = useState<JobPayment[]>(initialPayments)
  const [toast,    setToast]    = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // ── Editing state ──────────────────────────────────────────────────────────
  const [editingField, setEditingField] = useState<string | null>(null)
  const [titleDraft,   setTitleDraft]   = useState(job.title)
  const [clientDraft,  setClientDraft]  = useState(job.client_name)
  const [valueDraft,   setValueDraft]   = useState(String(job.total_value))
  const [dateDraft,    setDateDraft]    = useState(job.job_date)

  // ── Payment form state ─────────────────────────────────────────────────────
  const [showPayForm,    setShowPayForm]    = useState(false)
  const [payAmount,      setPayAmount]      = useState('')
  const [payDate,        setPayDate]        = useState(today())
  const [payNotes,       setPayNotes]       = useState('')
  const [deletingPayId,  setDeletingPayId]  = useState<string | null>(null)

  const [isPending, startTransition] = useTransition()

  function showToast(type: 'success' | 'error', message: string) {
    setToast({ type, message })
    setTimeout(() => setToast(null), 3500)
  }

  // ── Status change ──────────────────────────────────────────────────────────

  function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStatus = e.target.value as JobStatus
    startTransition(async () => {
      const res = await updateJobStatus(job.id, newStatus)
      if (res.success && res.data) {
        setJob(res.data)
        showToast('success', 'Status atualizado.')
      } else if (!res.success) {
        showToast('error', res.error)
      }
    })
  }

  // ── Field save ─────────────────────────────────────────────────────────────

  async function saveField(field: string) {
    const payload: Parameters<typeof updateJob>[1] = {}
    if (field === 'title')       payload.title       = titleDraft
    if (field === 'client_name') payload.client_name = clientDraft
    if (field === 'total_value') payload.total_value = parseFloat(valueDraft.replace(',', '.')) || 0
    if (field === 'job_date')    payload.job_date    = dateDraft

    const res = await updateJob(job.id, payload)
    if (res.success && res.data) {
      setJob(res.data)
      showToast('success', 'Salvo.')
    } else if (!res.success) {
      showToast('error', res.error)
    }
    setEditingField(null)
  }

  // ── Add payment ────────────────────────────────────────────────────────────

  async function handleAddPayment(e: React.FormEvent) {
    e.preventDefault()
    const amount = parseFloat(payAmount.replace(',', '.'))
    if (!amount || amount <= 0) {
      showToast('error', 'Informe um valor válido.')
      return
    }

    startTransition(async () => {
      const res = await addPayment(job.id, {
        amount,
        received_at: payDate,
        notes:       payNotes.trim() || undefined,
        currency:    job.currency,
      })

      if (res.success) {
        if (res.data)  setPayments(prev => [res.data!, ...prev])
        if (res.job)   setJob(res.job)
        setPayAmount('')
        setPayDate(today())
        setPayNotes('')
        setShowPayForm(false)
        showToast('success', 'Pagamento registrado.')
      } else {
        showToast('error', res.error)
      }
    })
  }

  // ── Delete payment ─────────────────────────────────────────────────────────

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

  // ── Derived ────────────────────────────────────────────────────────────────

  const amountDue   = getAmountDue(job)
  const progressPct = job.total_value > 0
    ? Math.min(100, Math.round((Number(job.amount_paid) / Number(job.total_value)) * 100))
    : 0
  const { label: statusLabel, cls: statusCls } = STATUS_MAP[job.status] ?? STATUS_MAP.in_progress

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-full p-6 md:p-8 max-w-3xl mx-auto">

      {/* ── Breadcrumb ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-6 text-sm text-[#525252]">
        <Link href="/jobs" className="hover:text-white transition-colors">Jobs</Link>
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-[#a3a3a3] truncate">{job.title}</span>
      </div>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="min-w-0 flex-1">
          {/* Título editável */}
          {editingField === 'title' ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={e => setTitleDraft(e.target.value)}
              onBlur={() => saveField('title')}
              onKeyDown={e => { if (e.key === 'Enter') saveField('title'); if (e.key === 'Escape') setEditingField(null) }}
              className="text-2xl font-bold bg-transparent border-b border-[#D4A853] text-white outline-none w-full pb-0.5"
            />
          ) : (
            <h1
              className="text-2xl font-bold text-white cursor-pointer hover:text-[#D4A853] transition-colors truncate"
              onClick={() => { setTitleDraft(job.title); setEditingField('title') }}
              title="Clique para editar"
            >
              {job.title || 'Job sem título'}
            </h1>
          )}

          {/* Cliente editável */}
          {editingField === 'client_name' ? (
            <input
              autoFocus
              value={clientDraft}
              onChange={e => setClientDraft(e.target.value)}
              onBlur={() => saveField('client_name')}
              onKeyDown={e => { if (e.key === 'Enter') saveField('client_name'); if (e.key === 'Escape') setEditingField(null) }}
              className="text-sm bg-transparent border-b border-[#D4A853] text-[#a3a3a3] outline-none mt-1 w-full"
            />
          ) : (
            <p
              className="text-sm text-[#a3a3a3] mt-1 cursor-pointer hover:text-white transition-colors"
              onClick={() => { setClientDraft(job.client_name); setEditingField('client_name') }}
              title="Clique para editar"
            >
              {job.client_name || 'Cliente não informado'}
              {job.category && (
                <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-[#1c1c1c] border border-[#2a2a2a] text-[#525252]">
                  {CATEGORY_LABELS[job.category]}
                </span>
              )}
            </p>
          )}
        </div>

        {/* Status dropdown */}
        <div className="shrink-0">
          <select
            value={job.status}
            onChange={handleStatusChange}
            disabled={isPending}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border cursor-pointer outline-none appearance-none transition-opacity disabled:opacity-60 ${statusCls}`}
          >
            {(Object.keys(STATUS_MAP) as JobStatus[]).map(s => (
              <option key={s} value={s} className="bg-[#141414] text-white">
                {STATUS_MAP[s].label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Sumário financeiro ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {/* Total — editável */}
        <div
          className="bg-[#141414] border border-[#2a2a2a] hover:border-[#3a3a3a] rounded-xl p-4 cursor-pointer transition-colors"
          onClick={() => { setValueDraft(String(job.total_value)); setEditingField('total_value') }}
          title="Clique para editar"
        >
          <p className="text-[10px] font-semibold text-[#525252] tracking-widest mb-1">TOTAL</p>
          {editingField === 'total_value' ? (
            <input
              autoFocus
              type="number"
              value={valueDraft}
              onChange={e => setValueDraft(e.target.value)}
              onBlur={() => saveField('total_value')}
              onKeyDown={e => { if (e.key === 'Enter') saveField('total_value'); if (e.key === 'Escape') setEditingField(null) }}
              className="text-base font-bold bg-transparent text-white outline-none w-full border-b border-[#D4A853]"
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <p className="text-base font-bold text-white">{formatCurrency(Number(job.total_value), job.currency)}</p>
          )}
          <p className="text-[10px] text-[#3a3a3a] mt-0.5">clique p/ editar</p>
        </div>

        <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-4">
          <p className="text-[10px] font-semibold text-[#525252] tracking-widest mb-1">RECEBIDO</p>
          <p className="text-base font-bold text-emerald-400">{formatCurrency(Number(job.amount_paid), job.currency)}</p>
          {progressPct > 0 && progressPct < 100 && (
            <p className="text-[10px] text-[#525252] mt-0.5">{progressPct}% do total</p>
          )}
          {progressPct === 100 && (
            <p className="text-[10px] text-emerald-400 mt-0.5">100% pago ✓</p>
          )}
        </div>

        <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-4">
          <p className="text-[10px] font-semibold text-[#525252] tracking-widest mb-1">A RECEBER</p>
          <p className={`text-base font-bold ${amountDue > 0 ? 'text-[#D4A853]' : 'text-[#525252]'}`}>
            {formatCurrency(amountDue, job.currency)}
          </p>
          {/* Data de vencimento */}
          {job.payment_due_date && amountDue > 0 && (
            <p className="text-[10px] text-[#525252] mt-0.5">
              vence {formatDate(job.payment_due_date)}
            </p>
          )}
        </div>
      </div>

      {/* Barra de progresso */}
      {job.total_value > 0 && job.status !== 'cancelled' && (
        <div className="mb-6">
          <div className="h-1.5 w-full bg-[#1c1c1c] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                progressPct === 100 ? 'bg-emerald-500' : progressPct > 0 ? 'bg-[#D4A853]' : 'bg-[#2a2a2a]'
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* ── Info do job ──────────────────────────────────────────────────────── */}
      <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-5 mb-6 space-y-3">
        <h2 className="text-sm font-semibold text-white mb-3">Detalhes</h2>

        {/* Data do job */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-[#525252]">Data do job</span>
          {editingField === 'job_date' ? (
            <input
              autoFocus
              type="date"
              value={dateDraft}
              onChange={e => setDateDraft(e.target.value)}
              onBlur={() => saveField('job_date')}
              onKeyDown={e => { if (e.key === 'Enter') saveField('job_date'); if (e.key === 'Escape') setEditingField(null) }}
              className="text-xs bg-[#1c1c1c] border border-[#D4A853]/50 rounded px-2 py-1 text-white outline-none"
            />
          ) : (
            <span
              className="text-xs text-white cursor-pointer hover:text-[#D4A853] transition-colors"
              onClick={() => { setDateDraft(job.job_date); setEditingField('job_date') }}
              title="Clique para editar"
            >
              {formatDate(job.job_date)}
            </span>
          )}
        </div>

        {/* Vencimento */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-[#525252]">Vencimento</span>
          <span className="text-xs text-white">{formatDate(job.payment_due_date)}</span>
        </div>

        {/* Condição de pagamento */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-[#525252]">Condição</span>
          <span className="text-xs text-white">{PAYMENT_CONDITION_LABELS[job.payment_condition]}</span>
        </div>

        {/* Tipo */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-[#525252]">Tipo</span>
          <span className="text-xs text-white capitalize">{job.job_type}</span>
        </div>
      </div>

      {/* ── Pagamentos ───────────────────────────────────────────────────────── */}
      <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white">Pagamentos recebidos</h2>
          <button
            onClick={() => setShowPayForm(!showPayForm)}
            className="flex items-center gap-1.5 text-xs font-semibold text-[#D4A853] hover:text-[#E8C47A] transition-colors"
          >
            <svg className={`w-3.5 h-3.5 transition-transform ${showPayForm ? 'rotate-45' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Registrar pagamento
          </button>
        </div>

        {/* Formulário de novo pagamento */}
        {showPayForm && (
          <form onSubmit={handleAddPayment} className="bg-[#1c1c1c] border border-[#2a2a2a] rounded-xl p-4 mb-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-[#525252] tracking-widest mb-1.5">VALOR</label>
                <input
                  autoFocus
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={payAmount}
                  onChange={e => setPayAmount(e.target.value)}
                  required
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-[#525252] tracking-widest mb-1.5">DATA</label>
                <input
                  type="date"
                  value={payDate}
                  onChange={e => setPayDate(e.target.value)}
                  required
                  className={inputCls}
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-[#525252] tracking-widest mb-1.5">OBSERVAÇÃO (opcional)</label>
              <input
                type="text"
                placeholder="Ex: Entrada, saldo final..."
                value={payNotes}
                onChange={e => setPayNotes(e.target.value)}
                className={inputCls}
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={isPending}
                className="flex items-center gap-2 bg-[#D4A853] hover:bg-[#E8C47A] disabled:opacity-60 text-[#0a0a0a] font-semibold text-xs px-4 py-2 rounded-lg transition-colors"
              >
                {isPending ? (
                  <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : null}
                Confirmar
              </button>
              <button
                type="button"
                onClick={() => setShowPayForm(false)}
                className="text-xs text-[#525252] hover:text-white transition-colors px-3 py-2"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        {/* Lista de pagamentos */}
        {payments.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-[#525252]">Nenhum pagamento registrado ainda</p>
            <p className="text-xs text-[#3a3a3a] mt-1">Use o botão acima para registrar um recebimento</p>
          </div>
        ) : (
          <div className="space-y-2">
            {payments.map(p => (
              <div
                key={p.id}
                className="flex items-center justify-between py-2.5 border-b border-[#1c1c1c] last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-emerald-400">
                    + {formatCurrency(Number(p.amount), p.currency)}
                  </p>
                  <p className="text-xs text-[#525252] mt-0.5">
                    {formatDate(p.received_at)}
                    {p.notes && <span className="ml-2 text-[#3a3a3a]">· {p.notes}</span>}
                  </p>
                </div>
                <button
                  onClick={() => handleDeletePayment(p.id)}
                  disabled={deletingPayId === p.id}
                  className="ml-3 text-[#3a3a3a] hover:text-red-400 disabled:opacity-40 transition-colors p-1 shrink-0"
                  title="Remover pagamento"
                >
                  {deletingPayId === p.id ? (
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Toast ────────────────────────────────────────────────────────────── */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-3 rounded-xl text-sm font-medium border shadow-xl z-50 transition-all ${
          toast.type === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
            : 'bg-red-500/10 border-red-500/20 text-red-400'
        }`}>
          {toast.message}
        </div>
      )}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().split('T')[0]
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

const inputCls =
  'w-full bg-[#141414] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white ' +
  'placeholder-[#525252] focus:outline-none focus:border-[#D4A853]/50 ' +
  'focus:ring-1 focus:ring-[#D4A853]/20 transition-colors'
