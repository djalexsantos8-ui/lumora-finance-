import { createAdminClient } from '@/lib/supabase/server'
import { checkAdmin } from '@/lib/auth/is-admin'
import { redirect } from 'next/navigation'
import { getAICreditAdminKpis } from '@/lib/ai/admin-actions'

export const dynamic = 'force-dynamic'

// ── KPIs ─────────────────────────────────────────────────────────────────────

async function loadKpis() {
  const supabase = createAdminClient()

  const nowIso = new Date().toISOString()
  const d30 = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const d7  = new Date(Date.now() -  7 * 86_400_000).toISOString()

  const [
    profiles,
    profiles30,
    profiles7,
    subs,
    grants,
    coupons,
    couponUsages,
    recentSignups,
    jobsTotal,
    jobs30,
    budgetsTotal,
    budgets30,
    ordersTotal,
    orders30,
    recurring,
    clientsTotal,
    feedbackTotal,
    feedbackOpen,
    workspacesTotal,
  ] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', d30),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', d7),
    supabase.from('subscriptions').select('status, plan, trial_ends_at'),
    supabase.from('admin_grants').select('id, expires_at'),
    supabase.from('coupon_codes').select('id, is_active', { count: 'exact' }),
    supabase.from('coupon_usages').select('id', { count: 'exact', head: true }),
    supabase
      .from('profiles')
      .select('id, full_name, email, created_at')
      .order('created_at', { ascending: false })
      .limit(5),
    supabase.from('jobs').select('id', { count: 'exact', head: true }),
    supabase.from('jobs').select('id', { count: 'exact', head: true }).gte('created_at', d30),
    supabase.from('budgets').select('id', { count: 'exact', head: true }),
    supabase.from('budgets').select('id', { count: 'exact', head: true }).gte('created_at', d30),
    supabase.from('orders').select('id', { count: 'exact', head: true }),
    supabase.from('orders').select('id', { count: 'exact', head: true }).gte('created_at', d30),
    supabase.from('recurring_revenue').select('id, status', { count: 'exact' }),
    supabase.from('clients').select('id', { count: 'exact', head: true }).is('deleted_at', null),
    supabase.from('feedback').select('id', { count: 'exact', head: true }),
    supabase.from('feedback').select('id', { count: 'exact', head: true }).in('status', ['novo','triagem','planejado','em_andamento']),
    supabase.from('workspaces').select('id', { count: 'exact', head: true }),
  ])

  const subRows = subs.data ?? []
  const statusCount = (s: string) => subRows.filter(r => r.status === s).length

  const now = Date.now()
  const trialingAll = subRows.filter(r => r.status === 'trialing')
  const trialingActive = trialingAll.filter(
    r => r.trial_ends_at && new Date(r.trial_ends_at).getTime() > now
  ).length
  const trialingExpired = trialingAll.length - trialingActive

  const activeCoupons = (coupons.data ?? []).filter(c => c.is_active).length

  const grantsValid = (grants.data ?? []).filter(g =>
    !g.expires_at || new Date(g.expires_at).getTime() > now
  ).length

  const recurringRows = recurring.data ?? []
  const recurringActive = recurringRows.filter(r => r.status === 'active').length

  return {
    totalUsers:        profiles.count ?? 0,
    signups30:         profiles30.count ?? 0,
    signups7:          profiles7.count ?? 0,
    totalWorkspaces:   workspacesTotal.count ?? 0,
    totalSubs:         subRows.length,
    trialing:          trialingActive,
    trialingExpired,
    active:            statusCount('active'),
    pastDue:           statusCount('past_due'),
    canceled:          statusCount('canceled'),
    paused:            statusCount('paused'),
    monthly:           subRows.filter(r => r.plan === 'monthly').length,
    annual:            subRows.filter(r => r.plan === 'annual').length,
    totalGrants:       grantsValid,
    totalCoupons:      coupons.count ?? 0,
    activeCoupons,
    totalCouponUsages: couponUsages.count ?? 0,
    recentSignups:     recentSignups.data ?? [],
    jobsTotal:         jobsTotal.count ?? 0,
    jobs30:            jobs30.count ?? 0,
    budgetsTotal:      budgetsTotal.count ?? 0,
    budgets30:         budgets30.count ?? 0,
    ordersTotal:       ordersTotal.count ?? 0,
    orders30:          orders30.count ?? 0,
    recurringTotal:    recurring.count ?? 0,
    recurringActive,
    clientsTotal:      clientsTotal.count ?? 0,
    feedbackTotal:     feedbackTotal.count ?? 0,
    feedbackOpen:      feedbackOpen.count ?? 0,
    nowIso,
  }
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function AdminOverviewPage() {
  // Double-check server-side (layout já protege, mas redundância é segurança)
  const check = await checkAdmin()
  if (!check.isAdmin) redirect('/dashboard')

  const [k, aiKpis] = await Promise.all([
    loadKpis(),
    getAICreditAdminKpis(),
  ])

  const includedUsagePct = aiKpis.included_limit_month > 0
    ? Math.round((aiKpis.included_used_month / aiKpis.included_limit_month) * 100)
    : 0

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
          <span className="text-[#525252]"> · LGPD: apenas agregados — nenhum conteúdo de projeto ou dado de cliente final exposto.</span>
        </p>
      </div>

      {/* Usuários & Subscriptions */}
      <section>
        <h2 className="text-xs uppercase tracking-wider text-[#a3a3a3] mb-3">
          Usuários & Assinaturas
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="Total de usuários"      value={k.totalUsers} />
          <Kpi label="Workspaces"              value={k.totalWorkspaces} />
          <Kpi label="Signups 7d"              value={k.signups7} accent={k.signups7 > 0 ? 'gold' : undefined} />
          <Kpi label="Signups 30d"             value={k.signups30} />
          <Kpi label="Subscriptions"           value={k.totalSubs} />
          <Kpi label="Trials ativos"           value={k.trialing} accent="gold" />
          <Kpi label="Trials expirados"        value={k.trialingExpired} accent={k.trialingExpired > 0 ? 'red' : undefined} />
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

      {/* Atividade do produto (sem conteúdo, só volumes) */}
      <section>
        <h2 className="text-xs uppercase tracking-wider text-[#a3a3a3] mb-3">
          Atividade do produto <span className="text-[#525252] normal-case tracking-normal">· volumes agregados</span>
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="Freelances (total)"      value={k.jobsTotal} />
          <Kpi label="Freelances 30d"          value={k.jobs30} accent={k.jobs30 > 0 ? 'gold' : undefined} />
          <Kpi label="Orçamentos (total)"      value={k.budgetsTotal} />
          <Kpi label="Orçamentos 30d"          value={k.budgets30} />
          <Kpi label="Pedidos (total)"         value={k.ordersTotal} />
          <Kpi label="Pedidos 30d"             value={k.orders30} />
          <Kpi label="Receitas recorrentes"    value={k.recurringTotal} />
          <Kpi label="Recorrentes ativas"      value={k.recurringActive} accent={k.recurringActive > 0 ? 'green' : undefined} />
          <Kpi label="Clientes cadastrados"    value={k.clientsTotal} />
        </div>
      </section>

      {/* Créditos de IA */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs uppercase tracking-wider text-[#a3a3a3]">
            Créditos de IA
          </h2>
          <a href="/admin/ai-credits" className="text-[10px] uppercase tracking-wider text-[#D4A853] hover:text-[#E8C47A] transition-colors">
            Gerenciar →
          </a>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="Concedidos ativos"       value={aiKpis.granted_active} accent="gold" />
          <Kpi label="Concedidos (histórico)"  value={aiKpis.granted_lifetime} />
          <Kpi label="Comprados ativos"        value={aiKpis.purchased_active} />
          <Kpi label="Consumidos este mês"     value={aiKpis.consumed_this_month} />
          <Kpi label="Workspaces c/ atividade" value={aiKpis.active_workspaces} />
          <Kpi label="Plano incluído usado"    value={aiKpis.included_used_month} sub={`${includedUsagePct}% do teto mensal`} />
          <Kpi label="Plano incluído teto"     value={aiKpis.included_limit_month} sub="soma dos planos ativos" />
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

      {/* Feedback */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs uppercase tracking-wider text-[#a3a3a3]">
            Feedback dos usuários
          </h2>
          <a href="/admin/feedback" className="text-[10px] uppercase tracking-wider text-[#D4A853] hover:text-[#E8C47A] transition-colors">
            Ver todos →
          </a>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Kpi label="Total recebido"      value={k.feedbackTotal} />
          <Kpi label="Em aberto"           value={k.feedbackOpen} accent={k.feedbackOpen > 0 ? 'red' : 'green'} />
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

      {/* LGPD footer */}
      <div className="rounded-lg border border-[#1a1a1a] bg-[#0d0d0d] p-4 text-[11px] text-[#737373] leading-relaxed">
        <strong className="block mb-1 text-[#a3a3a3]">LGPD / Privacidade</strong>
        Este painel exibe apenas volumes agregados e metadados do owner do workspace.
        Nenhum conteúdo de projeto, dado de cliente final, descrição comercial ou valor
        financeiro privado é exposto aqui. Métricas de atividade (freelances, orçamentos,
        pedidos) são contagens — não conteúdo.
      </div>
    </div>
  )
}

// ── KPI card ─────────────────────────────────────────────────────────────────

function Kpi({
  label,
  value,
  accent,
  sub,
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
      <p className="text-[10px] uppercase tracking-wider text-[#525252] mb-1">
        {label}
      </p>
      <p className={`text-2xl font-bold tabular-nums ${color}`}>
        {value.toLocaleString('pt-BR')}
      </p>
      {sub && (
        <p className="text-[10px] text-[#525252] mt-1">{sub}</p>
      )}
    </div>
  )
}
