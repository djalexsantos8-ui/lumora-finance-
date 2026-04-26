import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'

/**
 * EPIC-11 — Paywall direcionado por feature.
 *
 * Decide se um workspace tem acesso a uma feature premium.
 *
 * Fonte da verdade: tabela `feature_gates` (mapeamento feature -> plano mínimo)
 * + estado canônico do plano vindo de `subscriptions_v2`.
 *
 * Cache:
 *   - `feature_gates`: 5min via unstable_cache (raramente muda — seed via migration)
 *   - `hasFeature`: NÃO cacheia por workspace (estado muda com webhook em tempo real)
 *
 * Defense in depth:
 *   1. UI: ícone 💎 nos itens premium
 *   2. Middleware: redireciona /crm/* etc → /upgrade?feature=...
 *   3. Server actions: chamam hasFeature() antes de mutation
 */

const PLAN_RANK: Record<string, number> = { creator: 1, enterprise: 2 }

export interface FeatureGate {
  feature_key:        string
  min_plan:           string
  display_name:       string
  description:        string
  upgrade_pitch:      string
  icon:               string
  example_image_url:  string | null
}

export interface WorkspacePlanShape {
  /** Coluna `plan` em workspaces ou subscriptions_v2 (creator/enterprise/null). */
  plan:   string | null
  /** Status canônico vindo de subscriptions_v2. */
  status: string | null
}

/** Lê todos os gates do banco com cache de 5 minutos. */
export const getFeatureGates = unstable_cache(
  async (): Promise<FeatureGate[]> => {
    try {
      const sb = createAdminClient()
      const { data } = await sb.from('feature_gates').select('*')
      return (data ?? []) as FeatureGate[]
    } catch {
      return []
    }
  },
  ['feature-gates'],
  { revalidate: 300, tags: ['feature-gates'] }
)

/**
 * Verifica se um workspace tem acesso a uma feature.
 *
 * Regras:
 *   - status='trialing'                       → acesso TOTAL (fail-open intencional, decisão #2 + #15)
 *   - status='past_due'/'unpaid'/'canceled'   → BLOQUEADO em tudo premium
 *   - status='active' + plan>=min_plan        → liberado
 *   - feature sem registro em feature_gates   → liberado (fail-open)
 *   - erro/sem dados                          → BLOQUEADO (fail-closed)
 */
export async function hasFeature(
  workspace: WorkspacePlanShape | null,
  featureKey: string
): Promise<boolean> {
  if (!workspace) return false

  // Trial = acesso total (incentivo: usuário experimenta tudo nos 7 dias)
  if (workspace.status === 'trialing') return true

  // Status crítico — bloqueia
  if (
    workspace.status === 'past_due' ||
    workspace.status === 'unpaid' ||
    workspace.status === 'canceled' ||
    workspace.status === 'incomplete_expired'
  ) {
    return false
  }

  // Active sem plano populado = anomalia, bloqueia
  if (workspace.status !== 'active' || !workspace.plan) return false

  const gates = await getFeatureGates()
  const gate  = gates.find((g) => g.feature_key === featureKey)
  if (!gate) return true // feature sem gate = livre

  const userRank = PLAN_RANK[workspace.plan] ?? 0
  const reqRank  = PLAN_RANK[gate.min_plan] ?? 99
  return userRank >= reqRank
}

/** Lê um gate específico (pra renderizar copy do paywall). */
export async function getGate(featureKey: string): Promise<FeatureGate | null> {
  const gates = await getFeatureGates()
  return gates.find((g) => g.feature_key === featureKey) ?? null
}

/**
 * Helper: dado um userId, lê subscriptions_v2 e retorna shape pra hasFeature.
 * Use em server actions / pages que ainda não têm o objeto workspace na mão.
 */
export async function getWorkspacePlanForUser(
  userId: string
): Promise<WorkspacePlanShape | null> {
  try {
    const sb = createAdminClient()
    const { data } = await sb
      .from('subscriptions_v2')
      .select('plan, status')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ plan: string | null; status: string | null }>()
    return data ?? null
  } catch {
    return null
  }
}
