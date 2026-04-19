'use client'

/**
 * DebtorsDrawer — painel lateral "Freelances a Receber".
 *
 * Fonte de dados: props (filtrada client-side do array já carregado pela
 * listagem do mês). Zero query nova, zero roundtrip. Reativo ao estado
 * local — quando o parent atualiza `jobs` (ex: após bulk pay), o drawer
 * reflete automaticamente.
 *
 * Critério de "devedor":
 *   · status != 'paid' AND status != 'cancelled'
 *   · getAmountDue(job) > 0  (total > amount_paid)
 *
 * Ordenação: maior valor em aberto primeiro.
 *
 * Ações:
 *   · "Marcar como pago" por linha → reusa bulkMarkJobsAsPaid([id])
 *   · Seleção múltipla + "Pagar selecionados" → bulkMarkJobsAsPaid(ids)
 *
 * UX:
 *   · Item removido da lista imediatamente após sucesso (via parent)
 *   · Animação fade-out leve durante remoção
 *   · Toast de feedback
 *   · Empty state: "Tudo em dia por aqui 👌"
 *
 * Layout:
 *   · Desktop (>=md): drawer lateral direita, ~380px
 *   · Mobile: full-screen slide-in
 *   · Portal no document.body (bypass overflow do layout)
 *   · Esc / click no backdrop fecha (exceto durante ação)
 */

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils/format'
import { getAmountDue } from '@/types/job'
import { bulkMarkJobsAsPaid } from '@/lib/actions/jobs'
import type { Job } from '@/types/job'

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  open:    boolean
  jobs:    Job[]                 // lista completa do mês (parent)
  onClose: () => void
  /** Notifica o parent após pagamentos bem-sucedidos (pra refresh). */
  onPaid?: (ids: string[]) => void
}

// ─── Row ──────────────────────────────────────────────────────────────────────

interface Row {
  id:         string
  title:      string
  clientName: string | null
  total:      number
  paid:       number
  remaining:  number
  hasClient:  boolean
  statusLabel: string
  statusCls:   string
}

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  in_progress:     { label: 'Em andamento',  cls: 'bg-blue-500/10 text-blue-400'       },
  delivered:       { label: 'Entregue',       cls: 'bg-purple-500/10 text-purple-400'   },
  pending_payment: { label: 'Aguard. pagto.', cls: 'bg-amber-500/10 text-amber-400'     },
}

function toRow(job: Job): Row {
  const base  = Number(job.revenue_total) || Number(job.total_value)
  const total = base + Number(job.cost_total)
  const paid  = Number(job.amount_paid)
  const stat  = STATUS_LABELS[job.status] ?? { label: job.status, cls: 'bg-[#1c1c1c] text-[#525252]' }
  return {
    id:          job.id,
    title:       job.title || 'Freelance sem título',
    clientName:  job.client?.name ?? job.client_name ?? null,
    total,
    paid,
    remaining:   Math.max(0, total - paid),
    hasClient:   !!job.client_id,
    statusLabel: stat.label,
    statusCls:   stat.cls,
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DebtorsDrawer({ open, jobs, onClose, onPaid }: Props) {
  const router = useRouter()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set())
  const [bulkProcessing, setBulkProcessing] = useState(false)
  // IDs em fade-out antes de sumir — animação leve
  const [fadingIds, setFadingIds] = useState<Set<string>>(new Set())

  // ── Derivação memoizada: filtro + ordenação + rows ────────────────────────
  const rows = useMemo<Row[]>(() => {
    return jobs
      .filter(j => j.status !== 'paid' && j.status !== 'cancelled')
      .filter(j => getAmountDue(j) > 0)
      .filter(j => !fadingIds.has(j.id)) // esconde os que acabaram de ser pagos
      .map(toRow)
      .sort((a, b) => b.remaining - a.remaining)
  }, [jobs, fadingIds])

  // Summary memoizado
  const summary = useMemo(() => {
    const total = rows.reduce((s, r) => s + r.remaining, 0)
    const count = rows.length
    const avg   = count > 0 ? total / count : 0
    return { total, count, avg }
  }, [rows])

  // Seleção só vale para rows ainda visíveis
  const selectedValid = useMemo(() => {
    const visibleIds = new Set(rows.map(r => r.id))
    return Array.from(selectedIds).filter(id => visibleIds.has(id))
  }, [rows, selectedIds])

  const selectedTotal = useMemo(() => {
    return rows
      .filter(r => selectedIds.has(r.id))
      .reduce((s, r) => s + r.remaining, 0)
  }, [rows, selectedIds])

  // ── Esc fecha ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !bulkProcessing && processingIds.size === 0) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, bulkProcessing, processingIds.size, onClose])

  // ── Reset seleção ao fechar ────────────────────────────────────────────────
  function handleClose() {
    if (bulkProcessing || processingIds.size > 0) return
    setSelectedIds(new Set())
    onClose()
  }

  function toggleOne(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else              next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelectedIds(prev =>
      prev.size === rows.length
        ? new Set()
        : new Set(rows.map(r => r.id)),
    )
  }

  // ── Mark single as paid (reusa bulkMarkJobsAsPaid com array de 1) ─────────
  async function handlePaySingle(row: Row) {
    if (processingIds.has(row.id)) return
    if (!row.hasClient) {
      toast.error('Vincule um cliente antes de marcar como pago.')
      return
    }

    setProcessingIds(prev => new Set(prev).add(row.id))
    try {
      const res = await bulkMarkJobsAsPaid([row.id])

      if (res.processed.length > 0) {
        // Fade out → parent refresh → item some naturalmente
        setFadingIds(prev => new Set(prev).add(row.id))
        setTimeout(() => {
          onPaid?.([row.id])
          router.refresh()
          setFadingIds(prev => {
            const n = new Set(prev)
            n.delete(row.id)
            return n
          })
        }, 250)
        toast.success(`${row.title} — pago (${formatCurrency(row.remaining)})`)
      } else {
        const skip = res.skipped[0]
        toast.error(skipReasonToMessage(skip?.reason))
      }
    } catch (err) {
      console.error('[debtors/pay-single]', err)
      toast.error('Erro inesperado.')
    } finally {
      setProcessingIds(prev => {
        const n = new Set(prev)
        n.delete(row.id)
        return n
      })
    }
  }

  // ── Pagar selecionados (bulk) ──────────────────────────────────────────────
  async function handlePayBulk() {
    if (bulkProcessing || selectedValid.length === 0) return
    const ids = selectedValid

    setBulkProcessing(true)
    try {
      const res = await bulkMarkJobsAsPaid(ids)

      if (res.processed.length > 0) {
        const paidIds = res.processed.map(p => p.id)
        const paidTotal = res.processed.reduce((s, p) => s + p.amount, 0)

        // Fade out em todos
        setFadingIds(prev => {
          const n = new Set(prev)
          paidIds.forEach(id => n.add(id))
          return n
        })
        setTimeout(() => {
          onPaid?.(paidIds)
          router.refresh()
          setFadingIds(prev => {
            const n = new Set(prev)
            paidIds.forEach(id => n.delete(id))
            return n
          })
        }, 250)

        toast.success(
          `${res.processed.length} freelance${res.processed.length !== 1 ? 's' : ''} pago${res.processed.length !== 1 ? 's' : ''} — ${formatCurrency(paidTotal)}`,
        )
        setSelectedIds(new Set())
      }

      const errors = res.skipped.filter(s => s.reason === 'error' || s.reason === 'not_found')
      const noClient = res.skipped.filter(s => s.reason === 'no_client')
      if (errors.length > 0) toast.error(`${errors.length} falharam.`)
      if (noClient.length > 0) toast.error(`${noClient.length} sem cliente vinculado.`)
    } catch (err) {
      console.error('[debtors/pay-bulk]', err)
      toast.error('Erro inesperado.')
    } finally {
      setBulkProcessing(false)
    }
  }

  // ── Guard: não renderiza nada se fechado ou SSR ───────────────────────────
  if (!open || typeof document === 'undefined') return null

  const allSelected = rows.length > 0 && selectedValid.length === rows.length

  const content = (
    <div
      className="fixed inset-0 z-[90] flex justify-end bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="debtors-title"
      onClick={handleClose}
    >
      <aside
        className="w-full max-w-full md:w-[420px] h-full bg-[#0f0f0f] border-l border-[#1f1f1f] shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 border-b border-[#1f1f1f]">
          <div className="min-w-0">
            <h2 id="debtors-title" className="text-base font-semibold text-white">
              Freelances a receber
            </h2>
            <p className="text-xs text-[#525252] mt-0.5">
              Valores em aberto do mês
            </p>
          </div>
          <button
            onClick={handleClose}
            disabled={bulkProcessing || processingIds.size > 0}
            aria-label="Fechar"
            className="text-[#525252] hover:text-white transition-colors p-1 rounded-lg disabled:opacity-30"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {rows.length === 0 ? (
          // ── Empty state ───────────────────────────────────────────────────
          <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-white font-semibold mb-1">Tudo em dia por aqui 👌</p>
            <p className="text-[#525252] text-sm max-w-xs">
              Nenhum valor em aberto neste mês. Bom trabalho.
            </p>
          </div>
        ) : (
          <>
            {/* ── Summary ─────────────────────────────────────────────────── */}
            <div className="grid grid-cols-3 gap-2 px-5 py-4 border-b border-[#1f1f1f] bg-[#0a0a0a]">
              <SummaryCard
                label="A RECEBER"
                value={formatCurrency(summary.total)}
                valueCls="text-[#D4A853]"
                emphasized
              />
              <SummaryCard
                label="FREELANCES"
                value={String(summary.count)}
                valueCls="text-white"
              />
              <SummaryCard
                label="TICKET MÉDIO"
                value={formatCurrency(summary.avg)}
                valueCls="text-[#a3a3a3]"
              />
            </div>

            {/* ── Barra de seleção (sticky) ───────────────────────────────── */}
            <div className="flex items-center justify-between gap-3 px-5 py-2.5 border-b border-[#1f1f1f] bg-[#0f0f0f]">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="w-3.5 h-3.5 rounded border-[#3a3a3a] bg-[#0a0a0a] accent-[#D4A853] cursor-pointer"
                />
                <span className="text-[11px] text-[#a3a3a3]">
                  {selectedValid.length > 0
                    ? `${selectedValid.length} selecionado${selectedValid.length !== 1 ? 's' : ''} · ${formatCurrency(selectedTotal)}`
                    : 'Selecionar todos'}
                </span>
              </label>

              {selectedValid.length > 0 && (
                <button
                  onClick={handlePayBulk}
                  disabled={bulkProcessing}
                  className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-md bg-[#D4A853] hover:bg-[#E8C47A] text-[#0a0a0a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {bulkProcessing ? (
                    <Spinner />
                  ) : (
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  Pagar selecionados
                </button>
              )}
            </div>

            {/* ── Lista (scroll interno) ──────────────────────────────────── */}
            <ul className="flex-1 overflow-y-auto divide-y divide-[#1f1f1f]">
              {rows.map(row => (
                <DebtorRow
                  key={row.id}
                  row={row}
                  selected={selectedIds.has(row.id)}
                  processing={processingIds.has(row.id)}
                  disabled={bulkProcessing}
                  onToggle={() => toggleOne(row.id)}
                  onPay={() => handlePaySingle(row)}
                  onNavigate={handleClose}
                />
              ))}
            </ul>
          </>
        )}
      </aside>
    </div>
  )

  return createPortal(content, document.body)
}

// ─── SummaryCard ──────────────────────────────────────────────────────────────

function SummaryCard({
  label, value, valueCls, emphasized = false,
}: {
  label:       string
  value:       string
  valueCls:    string
  emphasized?: boolean
}) {
  return (
    <div className={`rounded-lg px-2.5 py-2 ${emphasized ? 'bg-[#141414] border border-[#2a2a2a]' : ''}`}>
      <p className="text-[9px] font-semibold text-[#525252] tracking-widest mb-0.5 truncate">
        {label}
      </p>
      <p className={`text-sm font-bold truncate ${valueCls}`}>{value}</p>
    </div>
  )
}

// ─── DebtorRow ────────────────────────────────────────────────────────────────

function DebtorRow({
  row, selected, processing, disabled, onToggle, onPay, onNavigate,
}: {
  row:        Row
  selected:   boolean
  processing: boolean
  disabled:   boolean
  onToggle:   () => void
  onPay:      () => void
  onNavigate: () => void
}) {
  return (
    <li className="flex items-start gap-2.5 px-4 py-3 hover:bg-[#141414] transition-colors">
      {/* checkbox */}
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        disabled={processing || disabled}
        className="mt-1 w-3.5 h-3.5 shrink-0 rounded border-[#3a3a3a] bg-[#0a0a0a] accent-[#D4A853] cursor-pointer disabled:opacity-40"
      />

      {/* conteúdo principal */}
      <Link
        href={`/freelances/${row.id}`}
        onClick={onNavigate}
        className="flex-1 min-w-0 group"
      >
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <p className="text-xs font-semibold text-white group-hover:text-[#D4A853] transition-colors truncate">
            {row.title}
          </p>
          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${row.statusCls}`}>
            {row.statusLabel}
          </span>
        </div>
        <p className="text-[11px] text-[#525252] truncate">
          {row.clientName || 'Sem cliente vinculado'}
        </p>
        <div className="flex items-center gap-3 mt-1.5 text-[10px] text-[#525252]">
          <span>Total: <span className="text-[#a3a3a3]">{formatCurrency(row.total)}</span></span>
          <span>Pago: <span className="text-[#a3a3a3]">{formatCurrency(row.paid)}</span></span>
        </div>
      </Link>

      {/* valor restante + ação */}
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <span className="text-sm font-bold text-[#D4A853]">
          {formatCurrency(row.remaining)}
        </span>
        <button
          onClick={onPay}
          disabled={processing || disabled || !row.hasClient}
          title={!row.hasClient ? 'Vincule um cliente antes' : 'Marcar como pago'}
          className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-md border border-[#D4A853]/30 text-[#D4A853] hover:bg-[#D4A853]/10 hover:border-[#D4A853]/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {processing ? (
            <Spinner />
          ) : (
            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
          Pago
        </button>
      </div>
    </li>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

function skipReasonToMessage(reason?: string): string {
  switch (reason) {
    case 'already_paid': return 'Freelance já está pago.'
    case 'no_client':    return 'Vincule um cliente antes de pagar.'
    case 'not_found':    return 'Freelance não encontrado.'
    default:             return 'Não foi possível pagar este freelance.'
  }
}
