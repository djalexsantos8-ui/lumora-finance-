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

  // Verifica se tem admin_grant ativo — usado para mostrar link da área admin.
  // A checagem real de acesso é feita no layout de /admin (defense in depth).
  const nowIso = new Date().toISOString()
  const { data: grant } = await supabase
    .from('admin_grants')
    .select('id')
    .eq('user_id', user.id)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .limit(1)
    .maybeSingle()
  const isAdmin = Boolean(grant)

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
    // Caso 1: registro existe mas user_id está NULL (usuário criado antes do trigger correto)
    // Detecta pelo email e corrige user_id no lugar
    const { data: orphanMember } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('email', user.email ?? '')
      .is('user_id', null)
      .limit(1)
      .maybeSingle()

    if (orphanMember) {
      await supabase
        .from('workspace_members')
        .update({ user_id: user.id, status: 'active' })
        .eq('workspace_id', orphanMember.workspace_id)
        .eq('email', user.email ?? '')
        .is('user_id', null)
    } else {
      // Caso 2: registro existe por user_id mas status não é active
      const { data: anyMember } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle()

      if (!anyMember) {
        // Caso 3: nenhum registro — cria workspace + member do zero
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
              email:        user.email ?? '',
              role:         'owner',
              status:       'active',
            })
        }
      } else {
        // Caso 4: workspace existe mas status não é active — corrige
        await supabase
          .from('workspace_members')
          .update({ status: 'active' })
          .eq('workspace_id', anyMember.workspace_id)
          .eq('user_id', user.id)
      }
    }
  }
  // ───────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen bg-[#0a0a0a] overflow-hidden">
      <Sidebar userEmail={user.email ?? ''} isAdmin={isAdmin} />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
