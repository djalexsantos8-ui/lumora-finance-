// ─── Dashboard Executivo · Server Page ──────────────────────────────────────
//
// Responsabilidade mínima:
//   1. Autenticar
//   2. Resolver workspace_id do usuário
//   3. Chamar getExecutiveDashboard (composer)
//   4. Passar { agregados, narrativa } pro client
//
// Todo o side-effect de dados vive em getExecutiveDashboard → loadRaw. Aqui
// a gente só orquestra.

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getExecutiveDashboard } from '@/lib/dashboard/composer'
import { DashboardExecutivoClient } from './client'
import DashboardEmptyState from '@/components/dashboard/empty-state'

/**
 * Regra de empty state:
 *   - Se o workspace não tem jobs nem pagamentos nem custos, mostrar onboarding.
 *   - Qualquer sinal de atividade (um freelance criado, um custo, um pagamento)
 *     libera o dashboard completo. Preferimos errar para o lado do "mostrar
 *     dashboard" (inclusive zerado) do que esconder quando já tem dado.
 */
async function hasEnoughDataForInsights(workspaceId: string): Promise<boolean> {
  const supabase = await createClient()
  const [jobsRes, expensesRes, fixedCostsRes] = await Promise.all([
    supabase
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null),
    supabase
      .from('expenses')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null),
    supabase
      .from('fixed_costs')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null),
  ])
  const jobs  = jobsRes.count       ?? 0
  const exp   = expensesRes.count   ?? 0
  const fixed = fixedCostsRes.count ?? 0
  return jobs + exp + fixed > 0
}

export default async function DashboardExecutivoPage() {
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

  if (!member?.workspace_id) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-[#525252] text-sm">Workspace não encontrado.</p>
      </div>
    )
  }

  const hasData = await hasEnoughDataForInsights(member.workspace_id)
  if (!hasData) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle()
    const firstName = profile?.full_name?.split(' ')[0] ?? null
    return <DashboardEmptyState firstName={firstName} />
  }

  const data = await getExecutiveDashboard(member.workspace_id)

  return <DashboardExecutivoClient data={data} />
}
