import { createAdminClient } from '@/lib/supabase/server'

/**
 * Estado canônico do plano de um user — usado pra renderizar PlanIndicator
 * na sidebar e qualquer outra UI que precise saber estado da assinatura.
 *
 * Cascata de detecção:
 *   1. Sem user → null
 *   2. status=past_due → past-due (cobrança falhou, ação urgente)
 *   3. status=trialing + trial_end_at <= 2 dias → trial-warn (banner âmbar)
 *   4. status=trialing → trial (badge dourado)
 *   5. status=active + plan=enterprise → enterprise
 *   6. status=active + plan=creator → creator
 *   7. status=canceled / null → no-sub (V1 user ou nunca assinou V2)
 */

export type PlanState =
  | { kind: 'trial'; daysLeft: number; endsAt: Date }
  | { kind: 'trial-warn'; daysLeft: number; endsAt: Date }
  | { kind: 'creator'; nextChargeAt: Date | null }
  | { kind: 'enterprise'; nextChargeAt: Date | null }
  | { kind: 'past-due' }
  | { kind: 'no-sub' }

interface SubscriptionRow {
  status: string
  plan: string | null
  trial_end_at: string | null
  current_period_end: string | null
}

function diffInDays(a: Date, b: Date): number {
  const ms = a.getTime() - b.getTime()
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)))
}

export function computePlanState(sub: SubscriptionRow | null): PlanState {
  if (!sub) return { kind: 'no-sub' }
  if (sub.status === 'canceled' || sub.status === 'incomplete_expired') {
    return { kind: 'no-sub' }
  }
  if (sub.status === 'past_due' || sub.status === 'unpaid') {
    return { kind: 'past-due' }
  }

  const now = new Date()

  if (sub.status === 'trialing' && sub.trial_end_at) {
    const endsAt = new Date(sub.trial_end_at)
    const daysLeft = diffInDays(endsAt, now)
    return daysLeft <= 2
      ? { kind: 'trial-warn', daysLeft, endsAt }
      : { kind: 'trial', daysLeft, endsAt }
  }

  if (sub.status === 'active') {
    const nextChargeAt = sub.current_period_end ? new Date(sub.current_period_end) : null
    if (sub.plan === 'enterprise') {
      return { kind: 'enterprise', nextChargeAt }
    }
    return { kind: 'creator', nextChargeAt }
  }

  return { kind: 'no-sub' }
}

/**
 * Lê estado do plano do user atual a partir de subscriptions_v2.
 * Retorna `null` se ainda não há subscription V2 (V1 user puro).
 */
export async function getPlanStateForUser(userId: string): Promise<PlanState | null> {
  try {
    const sb = createAdminClient()
    const { data } = await sb
      .from('subscriptions_v2')
      .select('status, plan, trial_end_at, current_period_end')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<SubscriptionRow>()

    if (!data) return null
    return computePlanState(data)
  } catch {
    return null
  }
}

export function formatNextCharge(d: Date): string {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}
