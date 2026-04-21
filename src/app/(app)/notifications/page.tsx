import { createClient } from '@/lib/supabase/server'
import { redirect }      from 'next/navigation'
import { buildPaymentReminders, isJobPending } from '@/types/job'
import { formatCurrency, formatJobDateRange }  from '@/lib/utils/format'
import type { Job }       from '@/types/job'
import type { FixedCost } from '@/types/expense'
import { FIXED_COST_CATEGORY_LABELS } from '@/types/expense'
import { ActionableAlertRow } from './actionable-alert-row'

// ─── Types ────────────────────────────────────────────────────────────────────

interface FixedCostAlert {
  id:          string
  description: string
  category:    string
  amount:      number
  currency:    string
  billing_day: number
  daysUntilDue: number  // negative = overdue, 0 = today, positive = upcoming
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isPaidThisMonth(lastPaidDate: string | null | undefined): boolean {
  if (!lastPaidDate) return false
  const now = new Date()
  const [y, m] = lastPaidDate.split('-').map(Number)
  return y === now.getFullYear() && m === (now.getMonth() + 1)
}

function buildFixedCostAlerts(costs: FixedCost[]): FixedCostAlert[] {
  const now     = new Date()
  const todayDay = now.getDate()
  const alerts: FixedCostAlert[] = []

  for (const c of costs) {
    if (!c.is_active || c.is_installment) continue
    if (isPaidThisMonth(c.last_paid_date)) continue

    const billingDay = c.billing_day ?? 1
    const daysUntilDue = billingDay - todayDay  // negative = overdue this month

    // Only alert if overdue OR due within 7 days
    if (daysUntilDue > 7) continue

    alerts.push({
      id:          c.id,
      description: c.description,
      category:    c.category,
      amount:      Number(c.amount_brl ?? c.amount),
      currency:    c.currency,
      billing_day: billingDay,
      daysUntilDue,
    })
  }

  return alerts.sort((a, b) => a.daysUntilDue - b.daysUntilDue)
}

function dayLabel(d: number): string {
  if (d < 0)  return `${Math.abs(d)}d de atraso`
  if (d === 0) return 'vence hoje'
  if (d === 1) return 'vence amanhã'
  return `em ${d} dias`
}

function formatDay(day: number): string {
  return `dia ${day}`
}

// ─── Helpers para jobs pendentes ──────────────────────────────────────────────

/**
 * Quantos dias desde que o job deveria ter sido atualizado.
 * Retorna 0 se o job está acontecendo hoje (single) ou ainda em andamento (multi).
 */
function pendingJobDelta(job: Job, today: string): number {
  const [ty, tm, td] = today.split('-').map(Number)
  const todayMs = new Date(ty, tm - 1, td).getTime()

  if (!job.is_multi_day) {
    if (!job.job_date) return 0
    const [jy, jm, jd] = job.job_date.split('-').map(Number)
    return Math.round((todayMs - new Date(jy, jm - 1, jd).getTime()) / 86_400_000)
  }

  // Multi-day ainda em andamento (sem fim ou fim >= hoje) → 0 = "hoje"
  if (!job.job_date_end || job.job_date_end >= today) return 0

  const [ey, em, ed] = job.job_date_end.split('-').map(Number)
  return Math.round((todayMs - new Date(ey, em - 1, ed).getTime()) / 86_400_000)
}

function pendingBadge(delta: number, isMultiDay: boolean): { label: string; color: 'amber' | 'red' } {
  if (delta === 0) return { label: isMultiDay ? 'em andamento' : 'hoje', color: 'amber' }
  if (delta === 1) return { label: '1d de atraso', color: 'red' }
  return { label: `${delta}d de atraso`, color: 'red' }
}

/** Ordena: hoje/em-andamento (delta=0) primeiro, depois mais atrasado (maior delta) primeiro. */
function sortPendingJobs(jobs: Job[], today: string): Job[] {
  return [...jobs].sort((a, b) => {
    const da = pendingJobDelta(a, today)
    const db = pendingJobDelta(b, today)
    if (da === 0 && db === 0) return 0
    if (da === 0) return -1
    if (db === 0) return  1
    return db - da  // maior delta (mais atrasado) primeiro
  })
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function NotificationsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  const workspaceId = member?.workspace_id
  if (!workspaceId) redirect('/dashboard')

  const today = new Date().toLocaleDateString('en-CA')

  // ── Fetch data ──────────────────────────────────────────────────────────────
  const [{ data: costsRaw }, { data: jobsRaw }, { data: pendingRaw }] = await Promise.all([
    supabase
      .from('fixed_costs')
      .select('*')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .eq('is_active', true)
      .eq('is_recurring', true),
    // Payment reminders: todos os jobs não-cancelados (inclui futuros — filtrado por due_date)
    supabase
      .from('jobs')
      .select('*')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .not('status', 'eq', 'cancelled'),
    // Pending action: somente in_progress com data já chegada
    supabase
      .from('jobs')
      .select('*')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .eq('status', 'in_progress')
      .or(
        `and(is_multi_day.eq.false,job_date.lte.${today}),` +
        `and(is_multi_day.eq.true,job_date_start.lte.${today})`
      ),
  ])

  const fixedAlerts  = buildFixedCostAlerts((costsRaw ?? []) as FixedCost[])
  const jobReminders = buildPaymentReminders((jobsRaw ?? []) as Job[], today)

  // isJobPending como segunda camada de segurança (lida com NULLs e edge cases)
  const pendingJobs  = sortPendingJobs(
    ((pendingRaw ?? []) as Job[]).filter(j => isJobPending(j, today)),
    today
  )

  const overdueFixed   = fixedAlerts.filter(a => a.daysUntilDue < 0)
  const todayFixed     = fixedAlerts.filter(a => a.daysUntilDue === 0)
  const upcomingFixed  = fixedAlerts.filter(a => a.daysUntilDue > 0)

  const overdueJobs        = jobReminders.filter(r => r.status === 'overdue')
  const dueTodayJobs       = jobReminders.filter(r => r.status === 'due_today')
  const pendingPaymentJobs = jobReminders.filter(r => r.status === 'pending')

  const urgentCount    = overdueFixed.length + todayFixed.length + overdueJobs.length + dueTodayJobs.length
  const totalCount     = fixedAlerts.length + jobReminders.length + pendingJobs.length

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-xl font-bold text-white">Notificações</h1>
          {urgentCount > 0 && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/25">
              {urgentCount} urgent{urgentCount !== 1 ? 'es' : 'e'}
            </span>
          )}
        </div>
        <p className="text-sm text-[#525252]">
          {totalCount === 0
            ? 'Tudo em dia. Nenhum alerta no momento.'
            : `${totalCount} alerta${totalCount !== 1 ? 's' : ''} ativo${totalCount !== 1 ? 's' : ''}`}
        </p>
      </div>

      {totalCount === 0 ? (
        <AllClearState />
      ) : (
        <div className="space-y-8">

          {/* ── Urgente ──────────────────────────────────────────────────────── */}
          {(overdueFixed.length > 0 || todayFixed.length > 0 || overdueJobs.length > 0 || dueTodayJobs.length > 0) && (
            <Section label="URGENTE" dot="red">
              {overdueFixed.map(a => (
                <ActionableAlertRow key={a.id}
                  title={a.description}
                  sub={`Custos Fixos · ${FIXED_COST_CATEGORY_LABELS[a.category as keyof typeof FIXED_COST_CATEGORY_LABELS] ?? a.category} · ${formatDay(a.billing_day)}`}
                  amount={formatCurrency(a.amount, a.currency) + '/mês'}
                  badge={dayLabel(a.daysUntilDue)}
                  badgeColor="red"
                  href="/fixed-costs"
                  action={{ target: 'fixed_cost', id: a.id }}
                />
              ))}
              {todayFixed.map(a => (
                <ActionableAlertRow key={a.id}
                  title={a.description}
                  sub={`Custos Fixos · ${FIXED_COST_CATEGORY_LABELS[a.category as keyof typeof FIXED_COST_CATEGORY_LABELS] ?? a.category} · ${formatDay(a.billing_day)}`}
                  amount={formatCurrency(a.amount, a.currency) + '/mês'}
                  badge="vence hoje"
                  badgeColor="amber"
                  href="/fixed-costs"
                  action={{ target: 'fixed_cost', id: a.id }}
                />
              ))}
              {overdueJobs.map(r => (
                <ActionableAlertRow key={r.job_id}
                  title={r.job_title}
                  sub={`Jobs · ${r.client_name} · venceu ${r.due_date.split('-').reverse().join('/')}`}
                  amount={formatCurrency(r.amount_due, r.currency)}
                  badge={`${r.days_delta}d de atraso`}
                  badgeColor="red"
                  href={`/freelances/${r.job_id}`}
                  action={{ target: 'job', id: r.job_id }}
                />
              ))}
              {dueTodayJobs.map(r => (
                <ActionableAlertRow key={r.job_id}
                  title={r.job_title}
                  sub={`Jobs · ${r.client_name}`}
                  amount={formatCurrency(r.amount_due, r.currency)}
                  badge="vence hoje"
                  badgeColor="amber"
                  href={`/freelances/${r.job_id}`}
                  action={{ target: 'job', id: r.job_id }}
                />
              ))}
            </Section>
          )}

          {/* ── Esta semana ───────────────────────────────────────────────────── */}
          {(upcomingFixed.length > 0) && (
            <Section label="ESTA SEMANA" dot="amber">
              {upcomingFixed.map(a => (
                <ActionableAlertRow key={a.id}
                  title={a.description}
                  sub={`Custos Fixos · ${FIXED_COST_CATEGORY_LABELS[a.category as keyof typeof FIXED_COST_CATEGORY_LABELS] ?? a.category} · ${formatDay(a.billing_day)}`}
                  amount={formatCurrency(a.amount, a.currency) + '/mês'}
                  badge={dayLabel(a.daysUntilDue)}
                  badgeColor="gray"
                  href="/fixed-costs"
                  action={{ target: 'fixed_cost', id: a.id }}
                />
              ))}
            </Section>
          )}

          {/* ── Jobs com pagamento pendente ───────────────────────────────────── */}
          {pendingPaymentJobs.length > 0 && (
            <Section label="PAGAMENTOS PENDENTES" dot="gray">
              {pendingPaymentJobs.map(r => (
                <ActionableAlertRow key={r.job_id}
                  title={r.job_title}
                  sub={`Jobs · ${r.client_name} · vence ${r.due_date.split('-').reverse().join('/')}`}
                  amount={formatCurrency(r.amount_due, r.currency)}
                  badge="pendente"
                  badgeColor="gray"
                  href={`/freelances/${r.job_id}`}
                  action={{ target: 'job', id: r.job_id }}
                />
              ))}
            </Section>
          )}

          {/* ── Jobs pendentes de ação ────────────────────────────────────────── */}
          {pendingJobs.length > 0 && (
            <Section label="JOBS PENDENTES" dot="gray">
              {pendingJobs.map(job => {
                const delta = pendingJobDelta(job, today)
                const { label, color } = pendingBadge(delta, job.is_multi_day)
                const totalValue = Number(job.revenue_total) || Number(job.total_value)
                return (
                  <AlertRow key={job.id}
                    title={job.title || 'Job sem título'}
                    sub={[
                      job.client_name || 'Cliente não informado',
                      formatJobDateRange(job),
                    ].filter(Boolean).join(' · ')}
                    amount={totalValue > 0 ? formatCurrency(totalValue, job.currency) : '—'}
                    badge={label}
                    badgeColor={color}
                    href={`/freelances/${job.id}`}
                  />
                )
              })}
            </Section>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ label, dot, children }: {
  label: string
  dot: 'red' | 'amber' | 'gray'
  children: React.ReactNode
}) {
  const dotColor = { red: 'bg-red-500', amber: 'bg-amber-500', gray: 'bg-[#3a3a3a]' }[dot]
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
        <p className="text-[10px] font-semibold text-[#525252] tracking-widest">{label}</p>
      </div>
      <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl overflow-hidden divide-y divide-[#1c1c1c]">
        {children}
      </div>
    </div>
  )
}

function AlertRow({ title, sub, amount, badge, badgeColor, href }: {
  title:      string
  sub:        string
  amount:     string
  badge:      string
  badgeColor: 'red' | 'amber' | 'gray'
  href:       string
}) {
  const badgeCls = {
    red:   'bg-red-500/10 text-red-400 border-red-500/20',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    gray:  'bg-[#1c1c1c] text-[#525252] border-[#2a2a2a]',
  }[badgeColor]

  return (
    <a href={href} className="flex items-center gap-4 px-4 py-3 hover:bg-[#1a1a1a] transition-colors group">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white truncate group-hover:text-[#D4A853] transition-colors">{title}</p>
        <p className="text-[10px] text-[#525252] mt-0.5 truncate">{sub}</p>
      </div>
      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${badgeCls}`}>
        {badge}
      </span>
      <span className="text-sm font-bold text-white tabular-nums shrink-0">{amount}</span>
    </a>
  )
}

function AllClearState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-5">
        <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <p className="text-white font-semibold mb-1">Tudo em dia</p>
      <p className="text-[#525252] text-sm max-w-xs">
        Nenhum custo fixo vencendo nos próximos 7 dias e nenhum job com pagamento em atraso.
      </p>
    </div>
  )
}
