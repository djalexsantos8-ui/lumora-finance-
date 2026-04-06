import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/sidebar'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // ── Garante que o usuário tem um workspace ativo ────────────────────────────
  // Se não existir, cria automaticamente (idempotente — seguro rodar sempre)
  const { data: existingMember } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  if (!existingMember) {
    // Verifica se já existe um workspace para este usuário (status diferente de active)
    const { data: anyMember } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (!anyMember) {
      // Cria workspace + member do zero
      const { data: newWorkspace } = await supabase
        .from('workspaces')
        .insert({ name: 'Meu Workspace', owner_id: user.id })
        .select('id')
        .single()

      if (newWorkspace) {
        await supabase
          .from('workspace_members')
          .insert({
            workspace_id: newWorkspace.id,
            user_id:      user.id,
            role:         'owner',
            status:       'active',
          })
      }
    } else {
      // Workspace existe mas status não é active — corrige
      await supabase
        .from('workspace_members')
        .update({ status: 'active' })
        .eq('workspace_id', anyMember.workspace_id)
        .eq('user_id', user.id)
    }
  }
  // ───────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen bg-[#0a0a0a] overflow-hidden">
      <Sidebar userEmail={user.email ?? ''} />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
