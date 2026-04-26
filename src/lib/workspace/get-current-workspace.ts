import { createClient } from '@/lib/supabase/server'

/**
 * Workspace atual do usuário autenticado.
 * Fonte: tabela `workspaces` + `workspace_members` (V2 multi-tenant).
 *
 * Multi-workspace: hoje cada usuário tem só 1 workspace (criado no signup
 * via trigger handle_new_user). Suporte a múltiplos virá quando convites
 * forem ativados (EPIC-38).
 */
export interface Workspace {
  id: string
  name: string
  slug: string | null
  ownerId: string
  plan: 'creator' | 'enterprise' | 'trial'
  maxUsers: number
  aiCreditsMonthly: number
  aiCreditsRemaining: number
  aiCreditsResetAt: string
  role: 'owner' | 'member'
  status: 'active' | 'pending'
}

export type WorkspaceCheck =
  | { ok: false; reason: 'not_authenticated' | 'no_workspace' | 'error' }
  | { ok: true; workspace: Workspace; userId: string }

/**
 * Retorna o workspace ativo do usuário logado.
 * Uso: Server Components / Route Handlers / Server Actions.
 *
 * Estratégia: pega o primeiro membership active do user (ordem: owner first).
 */
export async function getCurrentWorkspace(): Promise<WorkspaceCheck> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { ok: false, reason: 'not_authenticated' }

    const { data, error } = await supabase
      .from('workspace_members')
      .select(`
        role,
        status,
        workspace:workspaces!inner (
          id, name, slug, owner_id, plan, max_users,
          ai_credits_monthly, ai_credits_remaining, ai_credits_reset_at
        )
      `)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('role', { ascending: true })  // 'owner' < 'member' alfabético
      .limit(1)
      .maybeSingle()

    if (error || !data) return { ok: false, reason: 'no_workspace' }

    const ws = (data as unknown as {
      role: 'owner' | 'member'
      status: 'active' | 'pending'
      workspace: {
        id: string
        name: string
        slug: string | null
        owner_id: string
        plan: string
        max_users: number
        ai_credits_monthly: number
        ai_credits_remaining: number
        ai_credits_reset_at: string
      }
    }).workspace

    return {
      ok: true,
      userId: user.id,
      workspace: {
        id: ws.id,
        name: ws.name,
        slug: ws.slug,
        ownerId: ws.owner_id,
        plan: ws.plan as Workspace['plan'],
        maxUsers: ws.max_users,
        aiCreditsMonthly: ws.ai_credits_monthly,
        aiCreditsRemaining: ws.ai_credits_remaining,
        aiCreditsResetAt: ws.ai_credits_reset_at,
        role: data.role as Workspace['role'],
        status: data.status as Workspace['status'],
      },
    }
  } catch {
    return { ok: false, reason: 'error' }
  }
}

/**
 * Throw-version: usa em rotas que exigem workspace ativo.
 * Lança Error pra ser capturado pelo error boundary do Next.
 */
export async function requireWorkspace(): Promise<{
  workspace: Workspace
  userId: string
}> {
  const result = await getCurrentWorkspace()
  if (!result.ok) {
    throw new Error(`Workspace required but ${result.reason}`)
  }
  return { workspace: result.workspace, userId: result.userId }
}
