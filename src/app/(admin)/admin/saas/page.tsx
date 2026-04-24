import { createAdminClient } from '@/lib/supabase/server'
import { checkAdmin } from '@/lib/auth/is-admin'
import { redirect } from 'next/navigation'
import { PLANS } from '@/lib/stripe/pricing'

export const dynamic = 'force-dynamic'

/**
 * /admin/saas — Dashboard SaaS (FASE 3, Deploy H.3 2026-04-24).
 *
 * Métricas read-only calculadas on-the-fly a partir da tabela `subscriptions`.
 * Nada persistido aqui — cada refresh recomputa. Suficiente enquanto o volume
 * é baixo (< 10k subs). Quando escalar, migrar para uma materialized view
 * diária.
 *
 * Fórmulas (referência):
 *   · MRR = Σ (mensal_ativas × R$59,90) + (anuais_ativas × R$399/12)
 *   · ARR = MRR × 12
 *   · Churn 30d = canceled_at nos últimos 30d / active_at_start_of_period
 *   · Trial→Paid conversion = (trials que viraram active) / (trials finalizados)
 *
 * Privacidade: apenas agregados. Nenhum user_id / email exposto.
 */

// ── helpers ──────────────────────────────────────────────────────────────────

function brl(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function pct(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return `${(n * 100).toFixed(1)}%`
}

// ── KPIs ─────────────────────────────────────────────────────────────────────

type SubRow = {
  id: string
  status: string
  plan: string | null
  trial_ends_at: string | null
  current_period_start: string | null
  current_period_end: string | null
  canceled_at: string | null
  created_at: string
}

async function loadSaasKpis() {
  const supabase = createAdminClient()

  const now     = Date.now()
  const d30ago  = new Date(now - 30 * 86_400_000)
  const d60ago  = new Date(now - 60 * 86_400_000)

  // Puxa TODAS subs (V1 é baixo volume; otimizar depois).
  const { data: subs, error } = await supabase
    .from('subscriptions')
    .select('id, status, plan, trial_ends_at, current_period_start, current_period_end, canceled_at, created_at')

  if (error) {
    return {
      error: error.message,
      mrrCents: 0, arrCents: 0,
      activeMonthly: 0, activeAnnual: 0,
      activeTotal: 0, trialingActive: 0, trialingExpired: 0,
      pastDue: 0, paused: 0, canceledTotal: 0,
      canceled30d: 0, canceled3060d: 0,
      churn30d: 0, churnPrev: 0, churnDelta: 0,
      trialsEnded: 0, trialsConverted: 0, conversionRate: 0,
      arpuCents: 0, ltvCents: 0,
      signupsThisMonth: 0, newPayingThisMonth: 0,
    }
  }

  const rows = (subs ?? []) as SubRow[]

  // Active (pagando agora)
  const activeMonthly = rows.filter(r => r.status === 'active' && r.plan === 'monthly').length
  const activeAnnual  = rows.filter(r => r.status === 'active' && r.plan === 'annual' ).length
  const activeTotal   = activeMonthly + activeAnnual

  // MRR em centavos — anual dividido por 12.
  const mrrCents =
    activeMonthly * PLANS.monthly.amountCents +
    Math.round(activeAnnual  * (PLANS.yearly.amountCents / 12))
  const arrCents = mrrCents * 12

  // Trial status
  const trialingAll = rows.filter(r => r.status === 'trialing')
  const trialingActive = trialingAll.filter(
    r => r.trial_ends_at && new Date(r.trial_ends_at).getTime() > now
  ).length
  const trialingExpired = trialingAll.length - trialingActive

  const pastDue  = rows.filter(r => r.status === 'past_due').length
  const paused   = rows.filter(r => r.status === 'paused'  ).length
  const canceledTotal = rows.filter(r => r.status === 'canceled').length

  // Churn 30d — canceled_at nos últimos 30d / active no início do período.
  // "Active no início" ≈ active hoje + canceled nesse período.
  const canceled30d = rows.filter(r =>
    r.canceled_at && new Date(r.canceled_at) >= d30ago
  ).length
  const canceled3060d = rows.filter(r => {
    if (!r.canceled_at) return false
    const d = new Date(r.canceled_at).getTime()
    return d >= d60ago.getTime() && d < d30ago.getTime()
  }).length

  const activeAtStartOfPeriod = activeTotal + canceled30d
  const churn30d = activeAtStartOfPeriod > 0 ? canceled30d / activeAtStartOfPeriod : 0

  const activeAtStart60d = activeTotal + canceled30d + canceled3060d
  const churnPrev = activeAtStart60d > 0 ? canceled3060d / activeAtStart60d : 0
  const churnDelta = churn30d - churnPrev

  // Trial → paid conversion.
  // Usa: trials cujo trial_ends_at JÁ PASSOU.
  //   converted = trials cujo status virou active em qualquer momento.
  // Proxy aceitável: quem tem status active E tem trial_ends_at preenchido no passado.
  const trialsWithEndedWindow = rows.filter(r =>
    r.trial_ends_at && new Date(r.trial_ends_at).getTime() <= now
  )
  const trialsEnded = trialsWithEndedWindow.length
  const trialsConverted = trialsWithEndedWindow.filter(r => r.status === 'active').length
  const conversionRate = trialsEnded > 0 ? trialsConverted / trialsEnded : 0

  // ARPU (Average Revenue Per User) — MRR / active_total.
  const arpuCents = activeTotal > 0 ? Math.round(mrrCents / activeTotal) : 0

  // LTV simplificado = ARPU / churn_rate (mensal). Se churn=0, usa 24 meses.
  const churnMonthly = churn30d > 0 ? churn30d : 1 / 24
  const ltvCents = Math.round(arpuCents / churnMonthly)

  // Growth this month
  const d1 = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const signupsThisMonth = rows.filter(r => new Date(r.created_at) >= d1).length
  const newPayingThisMonth = rows.filter(r =>
    r.status === 'active' &&
    r.current_period_start && new Date(r.current_period_start) >= d1
  ).length

  return {
    error: null,
    mrrCents, arrCents,
    activeMonthly, activeAnnual, activeTotal,
    trialingActive, trialingExpired,
    pastDue, paused, canceledTotal,
    canceled30d, canceled3060d,
    churn30d, churnPrev, churnDelta,
    trialsEnded, trialsConverted, conversionRate,
    arpuCents, ltvCents,
    signupsThisMonth, newPayingThisMonth,
  }
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function AdminSaasPage() {
  const check = await checkAdmin()
  if (!check.isAdmin) redirect('/dashboard')

  const k = await loadSaasKpis()

  if (k.error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">SaaS Metrics</h1>
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-6 text-sm text-red-400">
          <strong className="block mb-1">Erro ao carregar métricas</strong>
          {k.error}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-[#D4A853] font-semibold mb-1">
          SaaS Metrics · Deploy H.3
        </p>
        <h1 className="text-2xl font-bold">Receita & Churn</h1>
        <p className="text-sm text-[#737373] mt-1">
          MRR, ARR, churn 30d e conversão de trial → paid. Recalculado on-the-fly a partir
          das subscriptions do Stripe.
          <span className="text-[#525252]"> · LGPD: apenas agregados — nenhum email ou user_id exposto.</span>
        </p>
      </div>

      {/* Top-line revenue */}
      <section>
        <h2 className="text-xs uppercase tracking-wider text-[#a3a3a3] mb-3">
          Receita recorrente
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <BigKpi
            label="MRR"
            value={brl(k.mrrCents)}
            sub={`${k.activeTotal} assinatura${k.activeTotal === 1 ? '' : 's'} pagando`}
            accent="gold"
          />
          <BigKpi
            label="ARR"
            value={brl(k.arrCents)}
            sub="MRR × 12"
          />
          <BigKpi
            label="ARPU"
            value={brl(k.arpuCents)}
            sub="receita média por cliente"
          />
        </div>
      </section>

      {/* Subscription breakdown */}
      <section>
        <h2 className="text-xs uppercase tracking-wider text-[#a3a3a3] mb-3">
          Composição da base
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="Ativos (mensal)"   value={k.activeMonthly} accent="green" />
          <Kpi label="Ativos (anual)"    value={k.activeAnnual}  accent="green" />
          <Kpi label="Trials ativos"     value={k.trialingActive} accent="gold" />
          <Kpi label="Trials expirados"  value={k.trialingExpired} accent={k.trialingExpired > 0 ? 'red' : undefined} />
          <Kpi label="Past due"          value={k.pastDue} accent={k.pastDue > 0 ? 'red' : undefined} />
          <Kpi label="Pausados"          value={k.paused} />
          <Kpi label="Cancelados (total)" value={k.canceledTotal} />
          <Kpi label="Cancelados 30d"    value={k.canceled30d} accent={k.canceled30d > 0 ? 'red' : undefined} />
        </div>
      </section>

      {/* Churn */}
      <section>
        <h2 className="text-xs uppercase tracking-wider text-[#a3a3a3] mb-3">
          Churn
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <BigKpi
            label="Churn 30d"
            value={pct(k.churn30d)}
            sub={`${k.canceled30d} cancelamento${k.canceled30d === 1 ? '' : 's'} nos últimos 30 dias`}
            accent={k.churn30d > 0.05 ? 'red' : k.churn30d > 0.02 ? 'gold' : 'green'}
          />
          <BigKpi
            label="Churn período anterior"
            value={pct(k.churnPrev)}
            sub={`${k.canceled3060d} em 30–60d atrás`}
          />
          <BigKpi
            label="Δ Churn"
            value={(k.churnDelta >= 0 ? '+' : '') + pct(k.churnDelta)}
            sub={k.churnDelta > 0 ? 'piorou vs período anterior' : k.churnDelta < 0 ? 'melhorou vs período anterior' : 'sem variação'}
            accent={k.churnDelta > 0 ? 'red' : k.churnDelta < 0 ? 'green' : undefined}
          />
        </div>
      </section>

      {/* Trial conversion */}
      <section>
        <h2 className="text-xs uppercase tracking-wider text-[#a3a3a3] mb-3">
          Conversão de trial
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <BigKpi
            label="Conversion rate"
            value={pct(k.conversionRate)}
            sub={`${k.trialsConverted} de ${k.trialsEnded} trials encerrados viraram pagantes`}
            accent={k.conversionRate > 0.25 ? 'green' : k.conversionRate > 0.10 ? 'gold' : undefined}
          />
          <Kpi label="Trials encerrados"   value={k.trialsEnded} />
          <Kpi label="Trials → pagantes"   value={k.trialsConverted} accent="green" />
        </div>
      </section>

      {/* Crescimento */}
      <section>
        <h2 className="text-xs uppercase tracking-wider text-[#a3a3a3] mb-3">
          Crescimento do mês
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Kpi label="Novas subs este mês" value={k.signupsThisMonth} accent="gold" />
          <Kpi label="Novos pagantes"      value={k.newPayingThisMonth} accent="green" />
          <Kpi label="LTV estimado"        value={k.ltvCents > 0 ? Math.round(k.ltvCents / 100) : 0} sub={`${brl(k.ltvCents)} · ARPU/churn`} />
        </div>
      </section>

      {/* Metodologia */}
      <div className="rounded-lg border border-[#1a1a1a] bg-[#0d0d0d] p-4 text-[11px] text-[#737373] leading-relaxed space-y-2">
        <strong className="block text-[#a3a3a3]">Metodologia</strong>
        <p>
          <strong className="text-[#d4d4d4]">MRR:</strong> assinaturas com status=active,
          mensais × R$ 59,90 + anuais × (R$ 399 / 12).
        </p>
        <p>
          <strong className="text-[#d4d4d4]">Churn 30d:</strong> cancelamentos
          dos últimos 30 dias dividido por (ativos hoje + cancelados no período).
          Churn saudável: &lt; 2% ao mês. Alerta: &gt; 5%.
        </p>
        <p>
          <strong className="text-[#d4d4d4]">Conversão de trial:</strong>
          trials com trial_ends_at no passado que viraram active. Benchmark SaaS B2C:
          10–25% é bom; &gt; 25% é excelente.
        </p>
        <p>
          <strong className="text-[#d4d4d4]">LTV:</strong> ARPU / churn mensal. Se churn=0,
          usa 24 meses como proxy. Métrica aproximada — útil apenas com base &gt; 50 subs.
        </p>
      </div>
    </div>
  )
}

// ── KPI cards ────────────────────────────────────────────────────────────────

function Kpi({
  label, value, accent, sub,
}: {
  label: string
  value: number
  accent?: 'gold' | 'green' | 'red'
  sub?: string
}) {
  const color =
    accent === 'gold'  ? 'text-[#D4A853]' :
    accent === 'green' ? 'text-emerald-400' :
    accent === 'red'   ? 'text-red-400' :
                         'text-white'
  return (
    <div className="rounded-lg border border-[#1a1a1a] bg-[#0d0d0d] p-4">
      <p className="text-[10px] uppercase tracking-wider text-[#525252] mb-1">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${color}`}>{value.toLocaleString('pt-BR')}</p>
      {sub && <p className="text-[10px] text-[#525252] mt-1">{sub}</p>}
    </div>
  )
}

function BigKpi({
  label, value, sub, accent,
}: {
  label: string
  value: string
  sub?: string
  accent?: 'gold' | 'green' | 'red'
}) {
  const color =
    accent === 'gold'  ? 'text-[#D4A853]' :
    accent === 'green' ? 'text-emerald-400' :
    accent === 'red'   ? 'text-red-400' :
                         'text-white'
  const border =
    accent === 'gold'  ? 'border-[#D4A853]/30' :
    accent === 'green' ? 'border-emerald-500/30' :
    accent === 'red'   ? 'border-red-500/30' :
                         'border-[#1a1a1a]'
  return (
    <div className={`rounded-xl border ${border} bg-[#0d0d0d] p-6`}>
      <p className="text-[10px] uppercase tracking-wider text-[#525252] mb-2">{label}</p>
      <p className={`text-3xl md:text-4xl font-bold tabular-nums ${color}`}>{value}</p>
      {sub && <p className="text-[11px] text-[#737373] mt-2 leading-relaxed">{sub}</p>}
    </div>
  )
}
