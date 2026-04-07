import { NextResponse }          from 'next/server'
import { createClient }           from '@/lib/supabase/server'
import { Resend }                 from 'resend'
import { buildPaymentReminders }  from '@/types/job'
import type { Job }               from '@/types/job'
import type { FixedCost }         from '@/types/expense'
import { FIXED_COST_CATEGORY_LABELS } from '@/types/expense'
import { formatCurrency }         from '@/lib/utils/format'

// ─── Secret guard ─────────────────────────────────────────────────────────────
// Vercel injeta o header "authorization" automaticamente para cron jobs.
// Em dev, chame com ?secret=CRON_SECRET

export const dynamic = 'force-dynamic'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isPaidThisMonth(lastPaidDate: string | null | undefined): boolean {
  if (!lastPaidDate) return false
  const now = new Date()
  const [y, m] = lastPaidDate.split('-').map(Number)
  return y === now.getFullYear() && m === (now.getMonth() + 1)
}

interface FixedCostAlert {
  description: string
  category:    string
  amount:      number
  currency:    string
  billing_day: number
  daysUntilDue: number
}

function buildFixedCostAlerts(costs: FixedCost[]): FixedCostAlert[] {
  const todayDay = new Date().getDate()
  const alerts: FixedCostAlert[] = []

  for (const c of costs) {
    if (!c.is_active || c.is_installment) continue
    if (isPaidThisMonth(c.last_paid_date)) continue
    const billingDay   = c.billing_day ?? 1
    const daysUntilDue = billingDay - todayDay
    if (daysUntilDue > 7) continue
    alerts.push({
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
  if (d === 0) return 'VENCE HOJE'
  if (d === 1) return 'vence amanhã'
  return `em ${d} dias`
}

// ─── Email template ───────────────────────────────────────────────────────────

function buildEmailHtml(params: {
  recipientName: string
  fixedAlerts:   FixedCostAlert[]
  jobReminders:  ReturnType<typeof buildPaymentReminders>
  today:         string
}): string {
  const { recipientName, fixedAlerts, jobReminders, today } = params
  const [y, m, d] = today.split('-')
  const dateFormatted = `${d}/${m}/${y}`

  const urgentFixed  = fixedAlerts.filter(a => a.daysUntilDue <= 0)
  const upcomingFixed = fixedAlerts.filter(a => a.daysUntilDue > 0)
  const overdueJobs  = jobReminders.filter(r => r.status === 'overdue')
  const dueTodayJobs = jobReminders.filter(r => r.status === 'due_today')
  const pendingJobs  = jobReminders.filter(r => r.status === 'pending')

  function row(cols: [string, string, string]): string {
    return `
      <tr>
        <td style="padding:10px 16px;border-bottom:1px solid #1c1c1c;font-size:13px;color:#fff;">${cols[0]}</td>
        <td style="padding:10px 16px;border-bottom:1px solid #1c1c1c;font-size:11px;color:#737373;">${cols[1]}</td>
        <td style="padding:10px 16px;border-bottom:1px solid #1c1c1c;font-size:13px;color:#fff;text-align:right;font-weight:600;">${cols[2]}</td>
      </tr>`
  }

  function section(title: string, color: string, rows: string): string {
    if (!rows.trim()) return ''
    return `
      <div style="margin-bottom:28px;">
        <p style="font-size:10px;font-weight:700;letter-spacing:0.1em;color:${color};margin:0 0 10px 0;">${title}</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #2a2a2a;border-radius:10px;overflow:hidden;background:#141414;">
          ${rows}
        </table>
      </div>`
  }

  const urgentFixedRows = [
    ...urgentFixed.map(a => row([
      a.description,
      `${FIXED_COST_CATEGORY_LABELS[a.category as keyof typeof FIXED_COST_CATEGORY_LABELS] ?? a.category} · dia ${a.billing_day}`,
      `${formatCurrency(a.amount, a.currency)}/mês`,
    ])),
    ...overdueJobs.map(r => row([
      r.job_title,
      `${r.client_name} · venceu ${r.due_date.split('-').reverse().join('/')}`,
      formatCurrency(r.amount_due, r.currency),
    ])),
    ...dueTodayJobs.map(r => row([
      r.job_title,
      `${r.client_name} · vence hoje`,
      formatCurrency(r.amount_due, r.currency),
    ])),
  ].join('')

  const upcomingRows = upcomingFixed.map(a => row([
    a.description,
    `${FIXED_COST_CATEGORY_LABELS[a.category as keyof typeof FIXED_COST_CATEGORY_LABELS] ?? a.category} · ${dayLabel(a.daysUntilDue)}`,
    `${formatCurrency(a.amount, a.currency)}/mês`,
  ])).join('')

  const pendingRows = pendingJobs.map(r => row([
    r.job_title,
    `${r.client_name} · vence ${r.due_date.split('-').reverse().join('/')}`,
    formatCurrency(r.amount_due, r.currency),
  ])).join('')

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:580px;margin:0 auto;padding:32px 16px;">

    <!-- Header -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:32px;padding-bottom:20px;border-bottom:1px solid #1c1c1c;">
      <span style="font-size:13px;font-weight:700;color:#fff;letter-spacing:0.05em;">
        LUMORA <span style="color:#D4A853;">FINANCE</span>
      </span>
      <span style="font-size:11px;color:#525252;">${dateFormatted}</span>
    </div>

    <!-- Title -->
    <h1 style="font-size:18px;font-weight:700;color:#fff;margin:0 0 6px 0;">Resumo de alertas</h1>
    <p style="font-size:13px;color:#737373;margin:0 0 28px 0;">Olá${recipientName ? `, ${recipientName}` : ''}. Aqui está o resumo financeiro do dia.</p>

    ${section('⚠️  URGENTE — vencendo hoje / em atraso', '#ef4444', urgentFixedRows)}
    ${section('🔔  ESTA SEMANA — vencimentos próximos', '#f59e0b', upcomingRows)}
    ${section('📋  JOBS — pagamentos pendentes', '#737373', pendingRows)}

    <!-- CTA -->
    <div style="text-align:center;margin-top:32px;">
      <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://lumora.finance'}/notifications"
        style="display:inline-block;background:#D4A853;color:#0a0a0a;font-size:13px;font-weight:700;padding:12px 28px;border-radius:10px;text-decoration:none;">
        Ver todas as notificações
      </a>
    </div>

    <!-- Footer -->
    <p style="font-size:11px;color:#3a3a3a;text-align:center;margin-top:32px;">
      Lumora Finance · Este email é enviado automaticamente todo dia às 8h.<br>
      Você pode gerenciar preferências em <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://lumora.finance'}/settings" style="color:#525252;">Configurações</a>.
    </p>
  </div>
</body>
</html>`
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  // Auth check (Vercel cron or manual with secret)
  const authHeader = request.headers.get('authorization')
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')

  const cronSecret = process.env.CRON_SECRET
  const isVercelCron = authHeader === `Bearer ${cronSecret}`
  const isManual     = secret === cronSecret

  if (cronSecret && !isVercelCron && !isManual) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 })
  }

  const resend  = new Resend(resendKey)
  const supabase = await createClient()
  const today   = new Date().toLocaleDateString('en-CA')

  // Fetch all workspaces to send notifications
  const { data: workspaces } = await supabase
    .from('workspace_members')
    .select('workspace_id, user_id, email')
    .eq('role', 'owner')
    .eq('status', 'active')

  if (!workspaces?.length) {
    return NextResponse.json({ sent: 0, message: 'No workspaces found' })
  }

  let sent = 0
  const errors: string[] = []

  for (const ws of workspaces) {
    try {
      // Fetch fixed costs + jobs for this workspace
      const [{ data: costsRaw }, { data: jobsRaw }] = await Promise.all([
        supabase
          .from('fixed_costs')
          .select('*')
          .eq('workspace_id', ws.workspace_id)
          .is('deleted_at', null)
          .eq('is_active', true)
          .eq('is_recurring', true),
        supabase
          .from('jobs')
          .select('*')
          .eq('workspace_id', ws.workspace_id)
          .is('deleted_at', null)
          .not('status', 'eq', 'cancelled'),
      ])

      const fixedAlerts  = buildFixedCostAlerts((costsRaw ?? []) as FixedCost[])
      const jobReminders = buildPaymentReminders((jobsRaw ?? []) as Job[], today)

      // Don't send if nothing to alert
      if (fixedAlerts.length === 0 && jobReminders.length === 0) continue

      // Get display name from profiles if available
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', ws.user_id)
        .maybeSingle()

      const recipientName = profile?.full_name ?? ''
      const recipientEmail = ws.email

      if (!recipientEmail) continue

      const html = buildEmailHtml({ recipientName, fixedAlerts, jobReminders, today })

      const urgentCount = fixedAlerts.filter(a => a.daysUntilDue <= 0).length
        + jobReminders.filter(r => r.status === 'overdue' || r.status === 'due_today').length

      const subject = urgentCount > 0
        ? `⚠️ ${urgentCount} alerta${urgentCount !== 1 ? 's' : ''} urgente${urgentCount !== 1 ? 's' : ''} — Lumora Finance`
        : `🔔 Resumo financeiro do dia — Lumora Finance`

      await resend.emails.send({
        from:    'Lumora Finance <notificacoes@lumora.finance>',
        to:      [recipientEmail],
        subject,
        html,
      })

      sent++
    } catch (err) {
      errors.push(`ws ${ws.workspace_id}: ${String(err)}`)
    }
  }

  return NextResponse.json({
    ok: true,
    sent,
    errors: errors.length ? errors : undefined,
    date: today,
  })
}
