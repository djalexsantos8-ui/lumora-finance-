import { unstable_cache } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

/**
 * Feature flags V2 — leem da tabela `feature_flags_global` (criada EPIC-12).
 *
 * Controlam rollout sem precisar deploy:
 *   - v2_signup_enabled: permite que /escolher-plano apareça pra novos signups
 *   - v2_public_release: V2 inteira liberada (não só admins)
 *   - v2_force_redirect: V1 redireciona automaticamente pra V2
 *
 * Toggle via SQL:
 *   update public.feature_flags_global
 *      set enabled = true, updated_at = now()
 *    where flag_key = 'v2_signup_enabled';
 *
 * Cache 60s pra refletir flip rápido sem queimar DB.
 */

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
      return false // fail closed
    }
  },
  ['v2-feature-flag-app'],
  { revalidate: 60, tags: ['feature-flags'] }
)

export async function isV2SignupEnabled(): Promise<boolean> {
  return getFlag('v2_signup_enabled')
}

export async function isV2PublicRelease(): Promise<boolean> {
  return getFlag('v2_public_release')
}

export async function isV2ForceRedirect(): Promise<boolean> {
  return getFlag('v2_force_redirect')
}
