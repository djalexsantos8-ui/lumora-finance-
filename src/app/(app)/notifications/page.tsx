import { createClient } from '@/lib/supabase/server'
import { redirect }      from 'next/navigation'
import { buildPaymentReminders } from '@/types/job'
import { formatCurrency }        from '@/lib/utils/format'
import type { Job }      from '@/types/job'
import type { FixedCost } from '@/types/expense'
import { FIXED_COST_CATEGORY_LABELS } from '@/types/expense'

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

  // ── Fetch data ──────────────────────────────────────────────────────────────
  const [{ data: costsRaw }, { data: jobsRaw }] = await Promise.all([
    supabase
      .from('fixed_costs')
      .select('*')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .eq('is_active', true)
      .eq('is_recurring', true),
    supabase
      .from('jobs')
      .select('*')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .not('status', 'eq', 'cancelled'),
  ])

  const today = new Date().toLocaleDateString('en-CA')

  const fixedAlerts  = buildFixedCostAlerts((costsRaw ?? []) as FixedCost[])
  const jobReminders = buildPaymentReminders((jobsRaw ?? []) as Job[], today)

  const overdueFixed   = fixedAlerts.filter(a => a.daysUntilDue < 0)
  const todayFixed     = fixedAlerts.filter(a => a.daysUntilDue === 0)
  const upcomingFixed  = fixedAlerts.filter(a => a.daysUntilDue > 0)

  const overdueJobs    = jobReminders.filter(r => r.status === 'overdue')
  const dueTodayJobs   = jobReminders.filter(r => r.status === 'due_today')
  const pendingJobs    = jobReminders.filter(r => r.status === 'pending')

  const urgentCount    = overdueFixed.length + todayFixed.length + overdueJobs.length + dueTodayJobs.length
  const totalCount     = fixedAlerts.length + jobReminders.length

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
                <AlertRow key={a.id}
                  title={a.description}
                  sub={`Custos Fixos · ${FIXED_COST_CATEGORY_LABELS[a.category as keyof typeof FIXED_COST_CATEGORY_LABELS] ?? a.category} · ${formatDay(a.billing_day)}`}
                  amount={formatCurrency(a.amount, a.currency) + '/mês'}
                  badge={dayLabel(a.daysUntilDue)}
                  badgeColor="red"
                  href="/fixed-costs"
                />
              ))}
              {todayFixed.map(a => (
                <AlertRow key={a.id}
                  title={a.description}
                  sub={`Custos Fixos · ${FIXED_COST_CATEGORY_LABELS[a.category as keyof typeof FIXED_COST_CATEGORY_LABELS] ?? a.category} · ${formatDay(a.billing_day)}`}
                  amount={formatCurrency(a.amount, a.currency) + '/mês'}
                  badge="vence hoje"
                  badgeColor="amber"
                  href="/fixed-costs"
                />
              ))}
              {overdueJobs.map(r => (
                <AlertRow key={r.job_id}
                  title={r.job_title}
                  sub={`Jobs · ${r.client_name} · venceu ${r.due_date.split('-').reverse().join('/')}`}
                  amount={formatCurrency(r.amount_due, r.currency)}
                  badge={`${r.days_delta}d de atraso`}
                  badgeColor="red"
                  href="/jobs"
                />
              ))}
              {dueTodayJobs.map(r => (
                <AlertRow key={r.job_id}
                  title={r.job_title}
                  sub={`Jobs · ${r.client_name}`}
                  amount={formatCurrency(r.amount_due, r.currency)}
                  badge="vence hoje"
                  badgeColor="amber"
                  href="/jobs"
                />
              ))}
            </Section>
          )}

          {/* ── Esta semana ───────────────────────────────────────────────────── */}
          {(upcomingFixed.length > 0) && (
            <Section label="ESTA SEMANA" dot="amber">
              {upcomingFixed.map(a => (
                <AlertRow key={a.id}
                  title={a.description}
                  sub={`Custos Fixos · ${FIXED_COST_CATEGORY_LABELS[a.category as keyof typeof FIXED_COST_CATEGORY_LABELS] ?? a.category} · ${formatDay(a.billing_day)}`}
                  amount={formatCurrency(a.amount, a.currency) + '/mês'}
                  badge={dayLabel(a.daysUntilDue)}
                  badgeColor="gray"
                  href="/fixed-costs"
                />
              ))}
            </Section>
          )}

          {/* ── Jobs com pagamento pendente ───────────────────────────────────── */}
          {pendingJobs.length > 0 && (
            <Section label="PAGAMENTOS PENDENTES" dot="gray">
              {pendingJobs.map(r => (
                <AlertRow key={r.job_id}
                  title={r.job_title}
                  sub={`Jobs · ${r.client_name} · vence ${r.due_date.split('-').reverse().join('/')}`}
                  amount={formatCurrency(r.amount_due, r.currency)}
                  badge="pendente"
                  badgeColor="gray"
                  href="/jobs"
                />
              ))}
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
