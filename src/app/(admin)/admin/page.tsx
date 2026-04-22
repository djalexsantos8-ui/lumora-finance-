import { createAdminClient } from '@/lib/supabase/server'
import { checkAdmin } from '@/lib/auth/is-admin'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

// ── KPIs ─────────────────────────────────────────────────────────────────────

async function loadKpis() {
  const supabase = createAdminClient()

  const [
    profiles,
    subs,
    grants,
    coupons,
    couponUsages,
    recentSignups,
  ] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('subscriptions').select('status, plan'),
    supabase.from('admin_grants').select('id', { count: 'exact', head: true }),
    supabase.from('coupon_codes').select('id, is_active', { count: 'exact' }),
    supabase.from('coupon_usages').select('id', { count: 'exact', head: true }),
    supabase
      .from('profiles')
      .select('id, full_name, email, created_at')
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  const subRows = subs.data ?? []
  const statusCount = (s: string) => subRows.filter(r => r.status === s).length
  const activeCoupons = (coupons.data ?? []).filter(c => c.is_active).length

  return {
    totalUsers:        profiles.count ?? 0,
    totalSubs:         subRows.length,
    trialing:          statusCount('trialing'),
    active:            statusCount('active'),
    pastDue:           statusCount('past_due'),
    canceled:          statusCount('canceled'),
    paused:            statusCount('paused'),
    monthly:           subRows.filter(r => r.plan === 'monthly').length,
    annual:            subRows.filter(r => r.plan === 'annual').length,
    totalGrants:       grants.count ?? 0,
    totalCoupons:      coupons.count ?? 0,
    activeCoupons,
    totalCouponUsages: couponUsages.count ?? 0,
    recentSignups:     recentSignups.data ?? [],
  }
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function AdminOverviewPage() {
  // Double-check server-side (layout já protege, mas redundância é segurança)
  const check = await checkAdmin()
  if (!check.isAdmin) redirect('/dashboard')

  const k = await loadKpis()

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-[#D4A853] font-semibold mb-1">
          Overview
        </p>
        <h1 className="text-2xl font-bold">Painel administrativo</h1>
        <p className="text-sm text-[#737373] mt-1">
          Snapshot em tempo real da plataforma. Leituras via service-role (bypassa RLS com segurança).
        </p>
      </div>

      {/* Usuários & Subscriptions */}
      <section>
        <h2 className="text-xs uppercase tracking-wider text-[#a3a3a3] mb-3">
          Usuários & Assinaturas
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="Total de usuários"      value={k.totalUsers} />
          <Kpi label="Subscriptions"           value={k.totalSubs} />
          <Kpi label="Em trial"                value={k.trialing} accent="gold" />
          <Kpi label="Ativos pagando"          value={k.active} accent="green" />
          <Kpi label="Past due"                value={k.pastDue} accent={k.pastDue > 0 ? 'red' : undefined} />
          <Kpi label="Pausados"                value={k.paused} />
          <Kpi label="Cancelados"              value={k.canceled} />
          <Kpi label="Grants ativos"           value={k.totalGrants} />
        </div>
      </section>

      {/* Distribuição de plano */}
      <section>
        <h2 className="text-xs uppercase tracking-wider text-[#a3a3a3] mb-3">
          Distribuição de plano
        </h2>
        <div className="grid grid-cols-2 gap-3 md:max-w-md">
          <Kpi label="Mensal"   value={k.monthly} />
          <Kpi label="Anual"    value={k.annual} />
        </div>
      </section>

      {/* Cupons */}
      <section>
        <h2 className="text-xs uppercase tracking-wider text-[#a3a3a3] mb-3">
          Cupons & Influencers
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Kpi label="Cupons cadastrados"  value={k.totalCoupons} />
          <Kpi label="Cupons ativos"       value={k.activeCoupons} accent={k.activeCoupons > 0 ? 'gold' : undefined} />
          <Kpi label="Usos totais"         value={k.totalCouponUsages} />
        </div>
      </section>

      {/* Últimos signups */}
      <section>
        <h2 className="text-xs uppercase tracking-wider text-[#a3a3a3] mb-3">
          Últimos cadastros
        </h2>
        {k.recentSignups.length === 0 ? (
          <div className="rounded-lg border border-[#1a1a1a] bg-[#0d0d0d] p-6 text-sm text-[#525252]">
            Nenhum usuário ainda.
          </div>
        ) : (
          <div className="rounded-lg border border-[#1a1a1a] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#111] text-[10px] uppercase tracking-wider text-[#737373]">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">Nome</th>
                  <th className="text-left px-4 py-2.5 font-medium">Email</th>
                  <th className="text-right px-4 py-2.5 font-medium">Criado em</th>
                </tr>
              </thead>
              <tbody>
                {k.recentSignups.map(u => (
                  <tr key={u.id} className="border-t border-[#1a1a1a] hover:bg-[#0d0d0d]">
                    <td className="px-4 py-2.5">{u.full_name}</td>
                    <td className="px-4 py-2.5 text-[#a3a3a3]">{u.email}</td>
                    <td className="px-4 py-2.5 text-right text-[#737373] text-xs">
                      {new Date(u.created_at).toLocaleString('pt-BR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

// ── KPI card ─────────────────────────────────────────────────────────────────

function Kpi({
  label,
  value,
  accent,
}: {
  label: string
  value: number
  accent?: 'gold' | 'green' | 'red'
}) {
  const color =
    accent === 'gold'  ? 'text-[#D4A853]' :
    accent === 'green' ? 'text-emerald-400' :
    accent === 'red'   ? 'text-red-400' :
                         'text-white'

  return (
    <div className="rounded-lg border border-[#1a1a1a] bg-[#0d0d0d] p-4">
      <p className="text-[10px] uppercase tracking-wider text-[#525252] mb-1">
        {label}
      </p>
      <p className={`text-2xl font-bold tabular-nums ${color}`}>
        {value.toLocaleString('pt-BR')}
      </p>
    </div>
  )
}
