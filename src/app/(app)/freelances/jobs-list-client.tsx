'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { formatCurrency, formatJobDateRange } from '@/lib/utils/format'
import { bulkDeleteJobs, bulkMarkJobsAsPaid } from '@/lib/actions/jobs'
import { getPaymentStatus, getAmountDue, getPaymentReminderStatus } from '@/types/job'
import type { Job, PaymentReminderStatus } from '@/types/job'
import { getJobState } from '@/lib/domain/job-state'
import type { JobStateResult } from '@/lib/domain/job-state'
import { NewJobButton } from './new-job-button'
import { isDraftFreelance } from '@/lib/utils/is-draft-freelance'
import { DraftBadge } from '@/components/freelances/draft-badge'
import { BulkPayConfirm, type BulkPayPreviewItem } from '@/components/freelances/bulk-pay-confirm'
import { DebtorsDrawer } from '@/components/freelances/debtors-drawer'

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  jobs:       Job[]
  monthLabel: string
}

// ─── Component ────────────────────────────────────────────────────────────────

export function JobsListClient({ jobs: initialJobs, monthLabel }: Props) {
  const router = useRouter()
  const [jobs,        setJobs]        = useState<Job[]>(initialJobs)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isPending,   startTransition] = useTransition()

  // ── Bulk pay state ──────────────────────────────────────────────────────
  // `bulkPayOpen` controla o modal. `bulkPayProcessing` é mutex dedicado
  // para evitar duplo-clique disparar múltiplas requests concorrentes.
  const [bulkPayOpen,       setBulkPayOpen]       = useState(false)
  const [bulkPayProcessing, setBulkPayProcessing] = useState(false)

  // ── Debtors drawer state ────────────────────────────────────────────────
  const [debtorsOpen, setDebtorsOpen] = useState(false)

  // Data local estável (calculada uma vez no mount)
  const [today] = useState<string>(() => new Date().toLocaleDateString('en-CA'))

  const allSelected = jobs.length > 0 && selectedIds.size === jobs.length
  const hasSelection = selectedIds.size > 0

  // ── Preview dos selecionados para o modal (memoizado) ─────────────────────
  // Source of truth: mesmo cálculo que o server fará.
  //   · já pago (status=paid) → marca skip='already_paid' (não entra no total)
  //   · sem client_id         → marca skip='no_client'     (não entra no total)
  //   · senão                 → amount = getAmountDue(job) (remaining)
  const bulkPayPreview = useMemo<BulkPayPreviewItem[]>(() => {
    return jobs
      .filter(j => selectedIds.has(j.id))
      .map<BulkPayPreviewItem>(j => {
        if (j.status === 'paid') {
          return { id: j.id, title: j.title, amount: 0, skip: 'already_paid' }
        }
        if (!j.client_id) {
          return { id: j.id, title: j.title, amount: 0, skip: 'no_client' }
        }
        return {
          id:     j.id,
          title:  j.title,
          amount: getAmountDue(j),
        }
      })
  }, [jobs, selectedIds])

  const payableCount = bulkPayPreview.filter(i => !i.skip).length
  const payableTotal = bulkPayPreview
    .filter(i => !i.skip)
    .reduce((s, i) => s + i.amount, 0)

  // Totalizadores — total_job inclui repasses (o que o cliente paga de fato)
  const totalBruto    = jobs.reduce((s, j) => {
    const base = Number(j.revenue_total) || Number(j.total_value)
    return s + base + Number(j.cost_total)
  }, 0)
  const totalRecebido = jobs.reduce((s, j) => s + Number(j.amount_paid), 0)
  const totalPendente = jobs.reduce((s, j) => s + getAmountDue(j), 0)

  // ── Alertas de vencimento ─────────────────────────────────────────────────
  const REMINDER_ORDER: Record<PaymentReminderStatus, number> = {
    overdue: 0, due_today: 1, pending: 2, ok: 3,
  }

  // Ordena: atrasados → vence hoje → pendentes → outros (por data desc dentro de cada grupo)
  const sortedJobs = [...jobs].sort((a, b) => {
    const ra = getPaymentReminderStatus(a, today)
    const rb = getPaymentReminderStatus(b, today)
    const diff = REMINDER_ORDER[ra] - REMINDER_ORDER[rb]
    if (diff !== 0) return diff
    return b.job_date.localeCompare(a.job_date)
  })

  const overdueJobs   = jobs.filter(j => getPaymentReminderStatus(j, today) === 'overdue')
  const dueTodayJobs  = jobs.filter(j => getPaymentReminderStatus(j, today) === 'due_today')
  const overdueTotal  = overdueJobs.reduce((s, j) => s + getAmountDue(j), 0)
  const dueTodayTotal = dueTodayJobs.reduce((s, j) => s + getAmountDue(j), 0)

  function toggleOne(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelectedIds(prev =>
      prev.size === jobs.length ? new Set() : new Set(jobs.map(j => j.id))
    )
  }

  function handleBulkDelete() {
    const count = selectedIds.size
    if (!window.confirm(`Excluir ${count} job${count !== 1 ? 's' : ''} selecionado${count !== 1 ? 's' : ''}? Esta ação não pode ser desfeita.`)) return
    const ids = Array.from(selectedIds)
    startTransition(async () => {
      const res = await bulkDeleteJobs(ids)
      if (res.success) {
        setJobs(prev => prev.filter(j => !ids.includes(j.id)))
        setSelectedIds(new Set())
      } else {
        alert(res.message ?? 'Erro ao excluir jobs.')
      }
    })
  }

  // ── Bulk pay handler ────────────────────────────────────────────────────
  //
  // Mutex (`bulkPayProcessing`) + desabilita botão no modal → garante que o
  // usuário não consiga disparar duas requests concorrentes. O backend já é
  // idempotente (lê status atual e skipa se paid), mas evitamos o round-trip.
  async function handleConfirmBulkPay() {
    if (bulkPayProcessing) return
    const ids = bulkPayPreview.filter(i => !i.skip).map(i => i.id)
    if (ids.length === 0) { setBulkPayOpen(false); return }

    setBulkPayProcessing(true)
    try {
      const res = await bulkMarkJobsAsPaid(ids)

      if (!res.success && res.processed.length === 0) {
        toast.error(res.message ?? 'Nenhum freelance pôde ser pago.')
        return
      }

      // Feedback: toast verde com contagem + valor, e avisos dos ignorados
      if (res.processed.length > 0) {
        const totalPaid = res.processed.reduce((s, p) => s + p.amount, 0)
        toast.success(
          `${res.processed.length} freelance${res.processed.length !== 1 ? 's' : ''} marcado${res.processed.length !== 1 ? 's' : ''} como pago — ${formatCurrency(totalPaid)}`,
        )
      }

      const errorSkips = res.skipped.filter(s => s.reason === 'error' || s.reason === 'not_found')
      if (errorSkips.length > 0) {
        toast.error(`${errorSkips.length} falharam. Tente novamente.`)
      }

      setBulkPayOpen(false)
      setSelectedIds(new Set())
      // Sincroniza lista com o banco (cards de topo recalculam automaticamente)
      router.refresh()
    } catch (err) {
      console.error('[bulk-pay]', err)
      toast.error('Erro inesperado. Tente novamente.')
    } finally {
      setBulkPayProcessing(false)
    }
  }

  // ── Empty state ──────────────────────────────────────────────────────────────

  if (jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-14 h-14 rounded-2xl bg-[#141414] border border-[#2a2a2a] flex items-center justify-center mb-4">
          <svg className="w-7 h-7 text-[#D4A853]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <p className="text-white font-semibold mb-1">Tudo pronto pra começar</p>
        <p className="text-[#525252] text-sm max-w-xs mb-6">
          Crie seu primeiro freelance para acompanhar seus recebimentos e o andamento dos seus projetos.
        </p>
        <NewJobButton label="Criar primeiro freelance" />
      </div>
    )
  }

  return (
    <>
      {/* ── Contagem ──────────────────────────────────────────────────────────── */}
      <p className="text-[#525252] text-xs mb-4 capitalize">
        {monthLabel} · {jobs.length} job{jobs.length !== 1 ? 's' : ''}
      </p>

      {/* ── Sumário financeiro ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-4">
          <p className="text-[10px] font-semibold text-[#525252] tracking-widest mb-1">TOTAL BRUTO</p>
          <p className="text-base font-bold text-white">{formatCurrency(totalBruto)}</p>
        </div>
        <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-4">
          <p className="text-[10px] font-semibold text-[#525252] tracking-widest mb-1">RECEBIDO</p>
          <p className="text-base font-bold text-emerald-400">{formatCurrency(totalRecebido)}</p>
        </div>
        <button
          type="button"
          onClick={() => setDebtorsOpen(true)}
          disabled={totalPendente <= 0}
          title={totalPendente > 0 ? 'Ver freelances com valor em aberto' : 'Nenhum valor em aberto'}
          className="text-left bg-[#141414] border border-[#2a2a2a] hover:border-[#D4A853]/40 rounded-xl p-4 transition-colors group disabled:cursor-default disabled:hover:border-[#2a2a2a]"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold text-[#525252] tracking-widest">A RECEBER</p>
            {totalPendente > 0 && (
              <svg className="w-3 h-3 text-[#525252] group-hover:text-[#D4A853] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            )}
          </div>
          <p className="text-base font-bold text-[#D4A853] mt-1">{formatCurrency(totalPendente)}</p>
          {totalPendente > 0 && (
            <p className="text-[10px] text-[#525252] mt-1 group-hover:text-[#a3a3a3] transition-colors">
              Ver em aberto →
            </p>
          )}
        </button>
      </div>

      {/* ── Drawer de devedores ───────────────────────────────────────────── */}
      <DebtorsDrawer
        open={debtorsOpen}
        jobs={jobs}
        onClose={() => setDebtorsOpen(false)}
      />

      {/* ── Barra de seleção múltipla ─────────────────────────────────────────── */}
      {hasSelection && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-[#1c1c1c] border border-[#2a2a2a] rounded-xl px-4 py-3 mb-3 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="w-4 h-4 rounded border-[#3a3a3a] bg-[#0a0a0a] accent-[#D4A853] cursor-pointer"
            />
            <div className="min-w-0">
              <p className="text-sm text-[#a3a3a3]">
                {selectedIds.size} selecionado{selectedIds.size !== 1 ? 's' : ''}
              </p>
              {payableCount > 0 && (
                <p className="text-[11px] text-[#525252] truncate">
                  {payableCount} a pagar · <span className="text-[#D4A853] font-semibold">{formatCurrency(payableTotal)}</span>
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Pagar selecionados — dourado */}
            <button
              onClick={() => setBulkPayOpen(true)}
              disabled={isPending || bulkPayProcessing || payableCount === 0}
              title={payableCount === 0 ? 'Nenhum freelance válido para pagar' : 'Pagar freelances selecionados'}
              className="flex items-center gap-2 text-xs font-semibold text-[#0a0a0a] bg-[#D4A853] hover:bg-[#E8C47A] disabled:bg-[#2a2a2a] disabled:text-[#525252] disabled:cursor-not-allowed transition-colors px-3 py-1.5 rounded-lg"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M5 13l4 4L19 7" />
              </svg>
              Pagar selecionados
            </button>

            {/* Excluir — vermelho */}
            <button
              onClick={handleBulkDelete}
              disabled={isPending || bulkPayProcessing}
              className="flex items-center gap-2 text-xs font-semibold text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors px-3 py-1.5 rounded-lg border border-red-500/20 hover:border-red-500/40"
            >
              {isPending ? (
                <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              )}
              Excluir selecionados
            </button>
          </div>
        </div>
      )}

      {/* ── Modal de confirmação de pagamento em lote ─────────────────────── */}
      <BulkPayConfirm
        open={bulkPayOpen}
        items={bulkPayPreview}
        isProcessing={bulkPayProcessing}
        onClose={() => !bulkPayProcessing && setBulkPayOpen(false)}
        onConfirm={handleConfirmBulkPay}
      />

      {/* ── Banner de alertas de vencimento ──────────────────────────────────── */}
      {(overdueJobs.length > 0 || dueTodayJobs.length > 0) && (
        <div className="flex items-start gap-3 bg-red-500/5 border border-red-500/20 rounded-xl px-4 py-3 mb-4">
          <svg className="w-4 h-4 shrink-0 text-red-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="flex flex-wrap gap-x-4 gap-y-1 min-w-0">
            {overdueJobs.length > 0 && (
              <span className="text-xs font-semibold text-red-400">
                {overdueJobs.length} {overdueJobs.length === 1 ? 'job atrasado' : 'jobs atrasados'}
                {' · '}{formatCurrency(overdueTotal)}
              </span>
            )}
            {dueTodayJobs.length > 0 && (
              <span className="text-xs font-semibold text-amber-400">
                {dueTodayJobs.length} {dueTodayJobs.length === 1 ? 'vence hoje' : 'vencem hoje'}
                {' · '}{formatCurrency(dueTodayTotal)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Lista de jobs ─────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        {sortedJobs.map((job) => (
          <div key={job.id} className="flex items-center gap-2.5">
            {/* Checkbox */}
            <input
              type="checkbox"
              checked={selectedIds.has(job.id)}
              onChange={() => toggleOne(job.id)}
              className="w-4 h-4 shrink-0 rounded border-[#3a3a3a] bg-[#0a0a0a] accent-[#D4A853] cursor-pointer"
            />
            {/* Card */}
            <JobCard job={job} today={today} className="flex-1 min-w-0" />
          </div>
        ))}
      </div>
    </>
  )
}

// ─── Job Card ─────────────────────────────────────────────────────────────────

function JobCard({ job, className = '', today }: { job: Job; className?: string; today: string }) {
  const amountDue      = getAmountDue(job)
  const payStatus      = getPaymentStatus(job)
  const isPaidFull     = payStatus === 'paid'
  const hasPartial     = payStatus === 'partial'
  const reminderStatus = getPaymentReminderStatus(job, today)
  const isDraft        = isDraftFreelance(job)
  // total_job = serviços + repasses — o que o cliente efetivamente paga
  const serviceBase = Number(job.revenue_total) || Number(job.total_value)
  const totalJob    = serviceBase + Number(job.cost_total)

  const progressPct = totalJob > 0
    ? Math.min(100, Math.round((Number(job.amount_paid) / totalJob) * 100))
    : 0

  const jobDateFormatted = formatJobDateRange(job)
  const jobState         = getJobState(job, today)

  return (
    <Link
      href={`/freelances/${job.id}`}
      className={`block bg-[#141414] border border-[#2a2a2a] hover:border-[#3a3a3a] rounded-xl p-4 transition-all group ${className}`}
    >
      {/* Linha principal */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <p className={`text-sm font-semibold truncate ${isDraft ? 'text-[#a3a3a3] italic' : 'text-white'}`}>
              {isDraft ? 'Freelance sem título' : (job.title || 'Freelance sem título')}
            </p>
            {isDraft && <DraftBadge />}
            <JobStateBadge {...jobState} />
            {job.category && <CategoryBadge category={job.category} />}
            {reminderStatus === 'overdue'   && <PaymentReminderBadge status="overdue" />}
            {reminderStatus === 'due_today' && <PaymentReminderBadge status="due_today" />}
          </div>
          <p className="text-xs text-[#525252] truncate">
            {job.client_name || 'Cliente não informado'}
            {job.client_name && jobDateFormatted && (
              <span className="text-[#3a3a3a] mx-1.5">·</span>
            )}
            {jobDateFormatted && <span>{jobDateFormatted}</span>}
          </p>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-bold text-white">
              {formatCurrency(totalJob, job.currency)}
            </p>
            {isPaidFull ? (
              <p className="text-[10px] font-semibold text-emerald-400">pago ✓</p>
            ) : hasPartial ? (
              <p className="text-[10px] text-[#D4A853]">
                {formatCurrency(amountDue, job.currency)} a receber
              </p>
            ) : (
              <p className="text-[10px] text-[#525252]">não recebido</p>
            )}
          </div>
          <svg
            className="w-4 h-4 text-[#525252] group-hover:text-[#a3a3a3] transition-colors shrink-0"
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>

      {/* Barra de progresso */}
      {totalJob > 0 && job.status !== 'cancelled' && (
        <div className="mt-3">
          <div className="h-1 w-full bg-[#262626] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                isPaidFull ? 'bg-emerald-500' : hasPartial ? 'bg-[#D4A853]' : 'bg-[#2a2a2a]'
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}
    </Link>
  )
}

// ─── Badges ───────────────────────────────────────────────────────────────────

// Mapeamento de cor semântica → classe Tailwind
// Centralizado aqui para que mudanças visuais não exijam tocar em job-state.ts
const STATE_COLOR_CLS: Record<JobStateResult['color'], string> = {
  gray:  'bg-[#1c1c1c] text-[#525252]',
  blue:  'bg-blue-500/10 text-blue-400',
  amber: 'bg-amber-500/10 text-amber-400',
  green: 'bg-emerald-500/10 text-emerald-400',
}

function JobStateBadge({ label, color }: JobStateResult) {
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${STATE_COLOR_CLS[color]}`}>
      {label}
    </span>
  )
}

function PaymentReminderBadge({ status }: { status: 'overdue' | 'due_today' }) {
  if (status === 'overdue') {
    return (
      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 bg-red-500/10 text-red-400 border border-red-500/20">
        Atrasado
      </span>
    )
  }
  return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 bg-amber-500/10 text-amber-400 border border-amber-500/20">
      Vence hoje
    </span>
  )
}

function CategoryBadge({ category }: { category: string }) {
  const labels: Record<string, string> = {
    wedding:     'Casamento',
    corporate:   'Corporativo',
    social:      'Social',
    documentary: 'Documentário',
    other:       'Outros',
  }
  return (
    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#1c1c1c] border border-[#2a2a2a] text-[#525252] shrink-0">
      {labels[category] ?? category}
    </span>
  )
}

