/**
 * V2 Gate — controla quem pode acessar rotas `/v2/*`.
 *
 * Estado dogfooding: enquanto V2 está em construção (~2026-04 a 2026-06),
 * só admins (com `admin_grants` ativo) acessam /v2/*.
 *
 * Rollout: quando V2 estiver pronta, flip do flag `v2_public_release=true`
 * libera pra todos os users autenticados.
 *
 * Defesa em profundidade:
 *   1. Middleware (proxy.ts) intercepta /v2/* primeiro
 *   2. app/v2/layout.tsx redunda checagem no SSR
 *   3. Feature flag global em DB (sem deploy pra rollout)
 */
import { unstable_cache } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

/** Cache 60s: flag muda raro mas queremos resposta rápida quando muda. */
const getFlag = unstable_cache(
  async (key: string): Promise<boolean> => {
    try {
      const sb = await createClient()
      const { data } = await sb
        .from('feature_flags_global')
        .select('enabled')
        .eq('flag_key', key)
        .maybeSingle()
      return data?.enabled ?? false
    } catch {
      return false  // fail closed
    }
  },
  ['v2-feature-flag'],
  { revalidate: 60, tags: ['feature-flags'] }
)

/**
 * Verifica se userId tem permissão pra acessar /v2/*.
 *
 * Cascata:
 *   1. Se v2_public_release=true → todos passam
 *   2. Senão, precisa ter admin_grants ativo (expires_at null OR > now)
 */
export async function isV2Allowed(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false

  // 1. Public release on → todos passam
  if (await getFlag('v2_public_release')) return true

  // 2. Admin only (dogfooding mode)
  try {
    const sb = await createClient()
    const { data: grant } = await sb
      .from('admin_grants')
      .select('user_id, expires_at')
      .eq('user_id', userId)
      .maybeSingle()

    if (!grant) return false
    if (grant.expires_at && new Date(grant.expires_at) < new Date()) return false
    return true
  } catch {
    return false  // fail closed
  }
}

/**
 * Lê todas as flags V2 (uso em UI de admin pra mostrar estado de rollout).
 */
export async function getV2Flags(): Promise<{
  public_release: boolean
  force_redirect: boolean
  signup_enabled: boolean
}> {
  const [publicRelease, forceRedirect, signupEnabled] = await Promise.all([
    getFlag('v2_public_release'),
    getFlag('v2_force_redirect'),
    getFlag('v2_signup_enabled'),
  ])

  return {
    public_release: publicRelease,
    force_redirect: forceRedirect,
    signup_enabled: signupEnabled,
  }
}
