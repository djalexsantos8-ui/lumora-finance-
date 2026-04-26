import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/sidebar'
import PlanIndicator from '@/components/sidebar/plan-indicator'
import { getPlanStateForUser } from '@/lib/billing/plan-state'
import AppFooter from '@/components/layout/app-footer'
import FeedbackWidget from '@/components/feedback/feedback-widget'
import OnboardingOverlay from '@/components/onboarding/onboarding-overlay'
import OfflineBanner from '@/components/common/offline-banner'
import type { WorkspaceSettings } from '@/types/workspace-settings'

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

  // ── Onboarding gate ─────────────────────────────────────────────────────────
  // Carrega profile + workspace_settings em paralelo. Se onboarding não foi
  // completado, monta o overlay. Se profile falhar (por algum motivo), NÃO
  // bloqueia o app — apenas não mostra onboarding (comportamento defensivo).
  const [profileRes, settingsRes, workspaceMemberRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('onboarding_completed, full_name')
      .eq('id', user.id)
      .maybeSingle(),
    // workspace_settings pode não existir ainda — tudo opcional.
    (async () => {
      const { data: m } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle()
      if (!m) return { data: null, workspaceId: null as string | null }
      const { data } = await supabase
        .from('workspace_settings')
        .select('*')
        .eq('workspace_id', m.workspace_id)
        .maybeSingle()
      return { data, workspaceId: m.workspace_id }
    })(),
    supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle(),
  ])

  const onboardingCompleted = profileRes.data?.onboarding_completed === true
  const fullName            = profileRes.data?.full_name ?? null
  const firstName           = fullName ? fullName.split(' ')[0] : null
  const workspaceId         = workspaceMemberRes.data?.workspace_id ?? settingsRes.workspaceId ?? null
  const existingSettings    = settingsRes.data as WorkspaceSettings | null
  // Se já tem dados da empresa configurados, começamos direto no tour.
  const hasCompanyData = Boolean(
    existingSettings?.company_name?.trim() || existingSettings?.company_logo_url
  )
  const startStep: 'welcome' | 'company' | 'tour' = hasCompanyData ? 'tour' : 'welcome'

  const showOnboarding = !onboardingCompleted && Boolean(workspaceId)

  // Plan state V2 — null se user só V1 (PlanIndicator também trata)
  const planState = await getPlanStateForUser(user.id)

  return (
    <div className="flex h-screen bg-[#0a0a0a] overflow-hidden">
      <Sidebar
        userEmail={user.email ?? ''}
        isAdmin={isAdmin}
        planIndicator={<PlanIndicator state={planState} />}
      />
      <main className="flex-1 overflow-y-auto flex flex-col">
        <OfflineBanner />
        <div className="flex-1">{children}</div>
        <AppFooter />
      </main>
      {/* Widget flutuante de feedback — disponível em toda área autenticada */}
      <FeedbackWidget />

      {/* Onboarding overlay — primeiro acesso. Server layout decide se monta. */}
      {showOnboarding && workspaceId && (
        <OnboardingOverlay
          workspaceId={workspaceId}
          userFirstName={firstName}
          initialSettings={existingSettings}
          startStep={startStep}
        />
      )}
    </div>
  )
}
