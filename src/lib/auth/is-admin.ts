import { createClient } from '@/lib/supabase/server'

/** Resultado canônico de verificação de acesso admin. */
export type AdminCheck =
  | { isAdmin: false; reason: 'not_authenticated' | 'no_grant' | 'expired_grant' | 'error' }
  | {
      isAdmin: true
      userId: string
      email: string
      grantType: 'free' | 'trial' | 'partner'
      expiresAt: string | null
    }

/**
 * Verifica se o usuário autenticado tem um admin_grant ativo.
 * Uso: em Server Components / Route Handlers / Server Actions.
 *
 * Fonte da verdade: tabela `admin_grants` (email, user_id, grant_type, expires_at).
 * Grant é ativo quando `expires_at` é null OU futuro.
 *
 * Não usa service-role aqui — a policy `admin_grants: own read` permite o
 * próprio user ler seu grant via auth.uid(), o que é suficiente e respeita RLS.
 */
export async function checkAdmin(): Promise<AdminCheck> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { isAdmin: false, reason: 'not_authenticated' }

    const nowIso = new Date().toISOString()
    const { data: grant, error } = await supabase
      .from('admin_grants')
      .select('grant_type, expires_at')
      .eq('user_id', user.id)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .limit(1)
      .maybeSingle()

    if (error) return { isAdmin: false, reason: 'error' }
    if (!grant)  return { isAdmin: false, reason: 'no_grant' }

    return {
      isAdmin:   true,
      userId:    user.id,
      email:     user.email ?? '',
      grantType: grant.grant_type as 'free' | 'trial' | 'partner',
      expiresAt: grant.expires_at,
    }
  } catch {
    return { isAdmin: false, reason: 'error' }
  }
}
