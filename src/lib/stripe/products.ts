/**
 * Stripe products + prices da Lumora V2.
 *
 * Single source of truth pra mapear (plano, billing) → price_id Stripe.
 * Usado por:
 *   - signup com cartão (EPIC-09): cria checkout session com price escolhido
 *   - paywall direcionado (EPIC-11): redirect pra upgrade Enterprise
 *   - webhook (EPIC-08): identifica plan a partir do price_id recebido
 *
 * IMPORTANTE: env vars devem estar setadas em .env.local E Vercel production.
 *   STRIPE_PRICE_CREATOR_MONTHLY
 *   STRIPE_PRICE_CREATOR_YEARLY
 *   STRIPE_PRICE_ENTERPRISE_MONTHLY
 *   STRIPE_PRICE_ENTERPRISE_YEARLY
 *   STRIPE_PRICE_EXTRA_USER
 *   STRIPE_PRICE_AI_CREDITS_50
 */

export type Plan = 'creator' | 'enterprise'
export type BillingPeriod = 'monthly' | 'yearly'

export const STRIPE_PRICES = {
  creator: {
    monthly: process.env.STRIPE_PRICE_CREATOR_MONTHLY,
    yearly: process.env.STRIPE_PRICE_CREATOR_YEARLY,
  },
  enterprise: {
    monthly: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY,
    yearly: process.env.STRIPE_PRICE_ENTERPRISE_YEARLY,
  },
  addons: {
    extra_user: process.env.STRIPE_PRICE_EXTRA_USER,
    ai_credits_50: process.env.STRIPE_PRICE_AI_CREDITS_50,
  },
} as const

export interface PlanLimits {
  max_users: number
  ai_credits_monthly: number
}

const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  creator: { max_users: 2, ai_credits_monthly: 100 },
  enterprise: { max_users: 5, ai_credits_monthly: 300 },
}

/**
 * Retorna o price_id Stripe pra (plano, billing).
 * Lança Error se env var faltando — falha fast em dev/prod.
 */
export function priceIdFor(plan: Plan, billing: BillingPeriod): string {
  const id = STRIPE_PRICES[plan][billing]
  if (!id) {
    throw new Error(
      `Stripe price ID não configurado pra plan=${plan}, billing=${billing}. ` +
      `Setar STRIPE_PRICE_${plan.toUpperCase()}_${billing.toUpperCase()} em env vars.`
    )
  }
  return id
}

/**
 * Retorna metadata canônica do plano (limits + créditos IA).
 * Usado pra popular workspaces.max_users + ai_credits_monthly após webhook.
 */
export function planLimitsFor(plan: Plan): PlanLimits {
  return PLAN_LIMITS[plan]
}

/**
 * Mapping reverso: dado um price_id, descobre (plan, billing).
 * Usado no webhook handler (EPIC-08) pra identificar plan a partir do evento.
 */
export function planFromPriceId(priceId: string): { plan: Plan; billing: BillingPeriod } | null {
  for (const plan of ['creator', 'enterprise'] as const) {
    for (const billing of ['monthly', 'yearly'] as const) {
      if (STRIPE_PRICES[plan][billing] === priceId) {
        return { plan, billing }
      }
    }
  }
  return null
}

/** Add-ons disponíveis (Enterprise pode comprar avulsos). */
export function addonPriceId(addon: 'extra_user' | 'ai_credits_50'): string {
  const id = STRIPE_PRICES.addons[addon]
  if (!id) {
    throw new Error(`Add-on ${addon} não tem price_id configurado.`)
  }
  return id
}
