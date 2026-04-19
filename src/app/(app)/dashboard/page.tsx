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

  const data = await getExecutiveDashboard(member.workspace_id)

  return <DashboardExecutivoClient data={data} />
}
