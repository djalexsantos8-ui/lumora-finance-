import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getDashboardData } from '@/lib/dashboard/getDashboardData'
import { DashboardClient } from './dashboard-client'

export default async function DashboardPage() {
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

  const data = await getDashboardData(member.workspace_id)

  return <DashboardClient data={data} />
}
