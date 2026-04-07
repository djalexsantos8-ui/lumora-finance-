import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createJob } from '@/lib/actions/jobs'
import { formatCurrency } from '@/lib/utils/format'
import { getPaymentStatus, getAmountDue } from '@/types/job'
import type { Job, JobStatus } from '@/types/job'

export const metadata = { title: 'Jobs — Lumora Finance' }

// ─── Filtro de mês atual ──────────────────────────────────────────────────────

function currentMonthRange(): { from: string; to: string } {
  const now   = new Date()
  const year  = now.getFullYear()
  const month = now.getMonth() // 0-indexed

  const from = new Date(year, month, 1).toISOString().split('T')[0]
  const to   = new Date(year, month + 1, 0).toISOString().split('T')[0]
  return { from, to }
}

function monthLabel(): string {
  return new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function JobsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  if (!member) redirect('/dashboard')

  const { from, to } = currentMonthRange()

  const { data: jobs } = await supabase
    .from('jobs')
    .select('*')
    .eq('workspace_id', member.workspace_id)
    .is('deleted_at', null)
    .gte('job_date', from)
    .lte('job_date', to)
    .order('job_date', { ascending: false })

  const list = (jobs ?? []) as Job[]

  // Totalizadores do mês
  const totalBruto    = list.reduce((s, j) => s + Number(j.total_value), 0)
  const totalRecebido = list.reduce((s, j) => s + Number(j.amount_paid), 0)
  const totalPendente = list.reduce((s, j) => s + getAmountDue(j), 0)

  return (
    <div className="min-h-full p-6 md:p-8">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Jobs</h1>
          <p className="text-[#a3a3a3] text-sm mt-0.5 capitalize">
            {monthLabel()} · {list.length} job{list.length !== 1 ? 's' : ''}
          </p>
        </div>

        <form action={createJob}>
          <button
            type="submit"
            className="flex items-center gap-2 bg-[#D4A853] hover:bg-[#E8C47A] text-[#0a0a0a] font-semibold text-sm px-4 py-2.5 rounded-xl transition-colors shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Novo Job
          </button>
        </form>
      </div>

      {/* ── Sumário financeiro do mês (só aparece se houver jobs) ─────────── */}
      {list.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-4">
            <p className="text-[10px] font-semibold text-[#525252] tracking-widest mb-1">TOTAL BRUTO</p>
            <p className="text-base font-bold text-white">{formatCurrency(totalBruto)}</p>
          </div>
          <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-4">
            <p className="text-[10px] font-semibold text-[#525252] tracking-widest mb-1">RECEBIDO</p>
            <p className="text-base font-bold text-emerald-400">{formatCurrency(totalRecebido)}</p>
          </div>
          <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-4">
            <p className="text-[10px] font-semibold text-[#525252] tracking-widest mb-1">A RECEBER</p>
            <p className="text-base font-bold text-[#D4A853]">{formatCurrency(totalPendente)}</p>
          </div>
        </div>
      )}

      {/* ── Lista / Empty state ───────────────────────────────────────────── */}
      {list.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-2">
          {list.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Job Card ─────────────────────────────────────────────────────────────────

function JobCard({ job }: { job: Job }) {
  const amountDue    = getAmountDue(job)
  const payStatus    = getPaymentStatus(job)
  const isPaidFull   = payStatus === 'paid'
  const hasPartial   = payStatus === 'partial'

  // Progresso de pagamento (0–100)
  const progressPct =
    job.total_value > 0
      ? Math.min(100, Math.round((Number(job.amount_paid) / Number(job.total_value)) * 100))
      : 0

  const jobDateFormatted = formatJobDate(job.job_date)

  return (
    <Link
      href={`/jobs/${job.id}`}
      className="block bg-[#141414] border border-[#2a2a2a] hover:border-[#3a3a3a] rounded-xl p-4 transition-all group"
    >
      {/* Linha principal */}
      <div className="flex items-start justify-between gap-4">
        {/* Esquerda: título + cliente + data */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <p className="text-sm font-semibold text-white truncate">
              {job.title || 'Job sem título'}
            </p>
            <JobStatusBadge status={job.status} />
            {job.category && <CategoryBadge category={job.category} />}
          </div>
          <p className="text-xs text-[#525252] truncate">
            {job.client_name || 'Cliente não informado'}
            {job.client_name && jobDateFormatted && (
              <span className="text-[#3a3a3a] mx-1.5">·</span>
            )}
            {jobDateFormatted && (
              <span>{jobDateFormatted}</span>
            )}
          </p>
        </div>

        {/* Direita: valores + chevron */}
        <div className="flex items-center gap-4 shrink-0">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-bold text-white">
              {formatCurrency(Number(job.total_value), job.currency)}
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

      {/* Barra de progresso de pagamento (só aparece se total > 0 e não cancelado) */}
      {job.total_value > 0 && job.status !== 'cancelled' && (
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

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState() {
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
        Crie seu primeiro job para acompanhar seus recebimentos e o andamento dos seus projetos.
      </p>
      <form action={createJob}>
        <button
          type="submit"
          className="flex items-center gap-2 bg-[#D4A853] hover:bg-[#E8C47A] text-[#0a0a0a] font-semibold text-sm px-4 py-2.5 rounded-xl transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Criar primeiro job
        </button>
      </form>
    </div>
  )
}

// ─── Badges ───────────────────────────────────────────────────────────────────

function JobStatusBadge({ status }: { status: JobStatus }) {
  const map: Record<JobStatus, { label: string; cls: string }> = {
    in_progress:     { label: 'Em andamento',    cls: 'bg-blue-500/10 text-blue-400'     },
    delivered:       { label: 'Entregue',         cls: 'bg-purple-500/10 text-purple-400' },
    pending_payment: { label: 'Pagamento pend.', cls: 'bg-amber-500/10 text-amber-400'   },
    paid:            { label: 'Pago',             cls: 'bg-emerald-500/10 text-emerald-400' },
    cancelled:       { label: 'Cancelado',        cls: 'bg-[#262626] text-[#525252]'      },
  }
  const { label, cls } = map[status] ?? map.in_progress
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${cls}`}>
      {label}
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatJobDate(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
