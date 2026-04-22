import { createAdminClient } from '@/lib/supabase/server'
import { checkAdmin } from '@/lib/auth/is-admin'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

// ── Data loader ──────────────────────────────────────────────────────────────

async function loadUsers() {
  const supabase = createAdminClient()

  // Profiles + subscription (one-to-one via user_id)
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select(`
      id,
      full_name,
      email,
      primary_currency,
      created_at,
      stripe_customer_id,
      subscription:subscriptions!subscriptions_user_id_fkey (
        status,
        plan,
        trial_ends_at,
        current_period_end,
        canceled_at,
        stripe_subscription_id
      )
    `)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) return { rows: [], error: error.message }

  // Admin grants
  const { data: grants } = await supabase
    .from('admin_grants')
    .select('user_id, grant_type, expires_at')

  const grantByUser = new Map(
    (grants ?? [])
      .filter(g => g.user_id)
      .map(g => [g.user_id as string, g])
  )

  // Nº de workspaces em que cada user é membro
  const { data: members } = await supabase
    .from('workspace_members')
    .select('user_id, status')

  const workspaceCount = new Map<string, number>()
  for (const m of members ?? []) {
    if (m.user_id && m.status === 'active') {
      workspaceCount.set(m.user_id, (workspaceCount.get(m.user_id) ?? 0) + 1)
    }
  }

  const rows = (profiles ?? []).map(p => {
    // PostgREST retorna relation single como objeto, mas pode vir como array.
    const sub = Array.isArray(p.subscription) ? p.subscription[0] : p.subscription
    const grant = grantByUser.get(p.id)
    return {
      id:         p.id,
      fullName:   p.full_name,
      email:      p.email,
      currency:   p.primary_currency,
      createdAt:  p.created_at,
      stripeCustomerId: p.stripe_customer_id,
      subStatus:  sub?.status ?? null,
      subPlan:    sub?.plan ?? null,
      trialEnds:  sub?.trial_ends_at ?? null,
      periodEnd:  sub?.current_period_end ?? null,
      canceled:   sub?.canceled_at ?? null,
      stripeSubId: sub?.stripe_subscription_id ?? null,
      grantType:  grant?.grant_type ?? null,
      grantExpires: grant?.expires_at ?? null,
      workspaces: workspaceCount.get(p.id) ?? 0,
    }
  })

  return { rows, error: null as string | null }
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function AdminUsersPage() {
  const check = await checkAdmin()
  if (!check.isAdmin) redirect('/dashboard')

  const { rows, error } = await loadUsers()

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] uppercase tracking-wider text-[#D4A853] font-semibold mb-1">
          Usuários
        </p>
        <h1 className="text-2xl font-bold">Base de usuários</h1>
        <p className="text-sm text-[#737373] mt-1">
          {rows.length} {rows.length === 1 ? 'usuário' : 'usuários'} · mais recentes primeiro
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
          Erro ao carregar: {error}
        </div>
      )}

      <div className="rounded-lg border border-[#1a1a1a] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#111] text-[10px] uppercase tracking-wider text-[#737373]">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium">Usuário</th>
              <th className="text-left px-4 py-2.5 font-medium">Plano/Status</th>
              <th className="text-left px-4 py-2.5 font-medium">Grant</th>
              <th className="text-right px-4 py-2.5 font-medium">Workspaces</th>
              <th className="text-left px-4 py-2.5 font-medium">Stripe</th>
              <th className="text-right px-4 py-2.5 font-medium">Criado</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !error && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-[#525252]">
                  Nenhum usuário cadastrado.
                </td>
              </tr>
            )}
            {rows.map(r => (
              <tr key={r.id} className="border-t border-[#1a1a1a] hover:bg-[#0d0d0d]">
                <td className="px-4 py-3">
                  <div className="font-medium">{r.fullName}</div>
                  <div className="text-xs text-[#737373]">{r.email}</div>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={r.subStatus} plan={r.subPlan} />
                  {r.trialEnds && r.subStatus === 'trialing' && (
                    <div className="text-[10px] text-[#525252] mt-1">
                      trial até {new Date(r.trialEnds).toLocaleDateString('pt-BR')}
                    </div>
                  )}
                  {r.periodEnd && r.subStatus === 'active' && (
                    <div className="text-[10px] text-[#525252] mt-1">
                      renova {new Date(r.periodEnd).toLocaleDateString('pt-BR')}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  {r.grantType ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="text-[10px] uppercase tracking-wider bg-[#D4A853]/10 text-[#D4A853] px-2 py-0.5 rounded">
                        {r.grantType}
                      </span>
                      {r.grantExpires && (
                        <span className="text-[10px] text-[#525252]">
                          até {new Date(r.grantExpires).toLocaleDateString('pt-BR')}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-[#525252] text-xs">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-xs tabular-nums">
                  {r.workspaces}
                </td>
                <td className="px-4 py-3 text-xs text-[#737373]">
                  {r.stripeCustomerId ? (
                    <span title={r.stripeCustomerId}>
                      {r.stripeCustomerId.slice(0, 10)}…
                    </span>
                  ) : (
                    <span className="text-[#525252]">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-xs text-[#737373]">
                  {new Date(r.createdAt).toLocaleDateString('pt-BR')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({
  status,
  plan,
}: {
  status: string | null
  plan: string | null
}) {
  if (!status) {
    return <span className="text-xs text-[#525252]">sem subscription</span>
  }

  const map: Record<string, { label: string; cls: string }> = {
    trialing:  { label: 'Trial',      cls: 'bg-[#D4A853]/10 text-[#D4A853]' },
    active:    { label: 'Ativo',      cls: 'bg-emerald-500/10 text-emerald-400' },
    past_due:  { label: 'Past due',   cls: 'bg-red-500/10 text-red-400' },
    paused:    { label: 'Pausado',    cls: 'bg-orange-500/10 text-orange-400' },
    canceled:  { label: 'Cancelado',  cls: 'bg-[#2a2a2a] text-[#737373]' },
    incomplete:{ label: 'Incompleto', cls: 'bg-[#2a2a2a] text-[#737373]' },
  }
  const pill = map[status] ?? { label: status, cls: 'bg-[#2a2a2a] text-[#a3a3a3]' }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${pill.cls}`}>
        {pill.label}
      </span>
      {plan && (
        <span className="text-[10px] text-[#737373]">
          · {plan === 'monthly' ? 'mensal' : plan === 'annual' ? 'anual' : plan}
        </span>
      )}
    </span>
  )
}
