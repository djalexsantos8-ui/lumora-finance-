/**
 * Stripe products + prices da Lumora (lote fundador V2).
 *
 * Single source of truth pra mapear (plano, billing) → price_id Stripe.
 * Usado por:
 *   - signup com cartão (EPIC-09): cria checkout session com price escolhido
 *   - paywall direcionado (EPIC-11): redirect pra upgrade Enterprise
 *   - webhook (EPIC-08): identifica plan a partir do price_id recebido
 *   - extra user add-on (EPIC-39): adiciona subscription_item ao Enterprise
 *
 * IMPORTANTE: env vars devem estar em .env.local E Vercel production.
 *   STRIPE_PRICE_CREATOR_MONTHLY
 *   STRIPE_PRICE_CREATOR_YEARLY
 *   STRIPE_PRICE_ENTERPRISE_MONTHLY
 *   STRIPE_PRICE_ENTERPRISE_YEARLY
 *   STRIPE_PRICE_EXTRA_USER_MONTHLY
 *   STRIPE_PRICE_EXTRA_USER_YEARLY
 *
 * Conta Stripe LIVE: acct_1TOeT5BawoXuU6g3 (Lumora Solutions).
 * Produtos criados 2026-04-26 com lote fundador (500 vagas OU 2027).
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
  extraUser: {
    monthly: process.env.STRIPE_PRICE_EXTRA_USER_MONTHLY,
    yearly: process.env.STRIPE_PRICE_EXTRA_USER_YEARLY,
  },
} as const

export const STRIPE_PRODUCTS = {
  creator: process.env.STRIPE_PRODUCT_CREATOR,
  enterprise: process.env.STRIPE_PRODUCT_ENTERPRISE,
  extraUser: process.env.STRIPE_PRODUCT_EXTRA_USER,
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
 * Add-on extra user — créditos variam por billing period:
 * - mensal: +30 créditos/mês (não cumulativos)
 * - anual: +50 créditos/mês (não cumulativos)
 *
 * Cada quantity de subscription_item soma 1 usuário e os créditos correspondentes.
 */
export const EXTRA_USER_CREDITS_PER_BILLING: Record<BillingPeriod, number> = {
  monthly: 30,
  yearly: 50,
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
 * Mapping reverso: dado um price_id, descobre (plan|extra, billing).
 * Usado no webhook handler (EPIC-08) pra identificar plan a partir do evento.
 */
export type PriceLookup =
  | { kind: 'plan'; plan: Plan; billing: BillingPeriod }
  | { kind: 'extra_user'; billing: BillingPeriod; credits: number }

export function lookupPriceId(priceId: string): PriceLookup | null {
  for (const plan of ['creator', 'enterprise'] as const) {
    for (const billing of ['monthly', 'yearly'] as const) {
      if (STRIPE_PRICES[plan][billing] === priceId) {
        return { kind: 'plan', plan, billing }
      }
    }
  }
  for (const billing of ['monthly', 'yearly'] as const) {
    if (STRIPE_PRICES.extraUser[billing] === priceId) {
      return {
        kind: 'extra_user',
        billing,
        credits: EXTRA_USER_CREDITS_PER_BILLING[billing],
      }
    }
  }
  return null
}

/** Add-on extra user price (preserva billing alignment com plano base). */
export function extraUserPriceId(billing: BillingPeriod): string {
  const id = STRIPE_PRICES.extraUser[billing]
  if (!id) {
    throw new Error(`Extra user ${billing} price ID não configurado.`)
  }
  return id
}

/**
 * Calcula limits totais do workspace incluindo extras.
 * Webhook chama isso ao processar customer.subscription.updated.
 *
 * @param plan Plan base (creator | enterprise)
 * @param baseBilling Billing do plano base (define créditos do extra user)
 * @param extraUserQuantity Sum dos quantity de subscription_items do add-on extra_user
 */
export function totalLimitsFor(
  plan: Plan,
  baseBilling: BillingPeriod,
  extraUserQuantity: number = 0
): PlanLimits {
  const base = PLAN_LIMITS[plan]
  if (plan !== 'enterprise' || extraUserQuantity === 0) {
    return base
  }
  const extraCredits = EXTRA_USER_CREDITS_PER_BILLING[baseBilling] * extraUserQuantity
  return {
    max_users: base.max_users + extraUserQuantity,
    ai_credits_monthly: base.ai_credits_monthly + extraCredits,
  }
}
