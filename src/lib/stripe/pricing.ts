/**
 * Fonte única da verdade para preços da Lumora Finance.
 *
 * Regras:
 * - Valores em BRL (real brasileiro), em centavos (5990 = R$59,90).
 * - Os `priceId` são lidos de env, mas temos fallback com os IDs atuais
 *   para evitar que um deploy sem env var trave o checkout.
 * - Quando trocar de preço, SEMPRE criar price novo no Stripe (preços
 *   são imutáveis) e atualizar os fallbacks + env vars (Vercel).
 *
 * Conta Stripe ativa: acct_1TJ249JPhM2pUhjm (alexandrino@lumoramkt.com).
 */

export type PlanKey = 'monthly' | 'yearly'

export type PlanConfig = {
  key: PlanKey
  priceId: string
  label: string
  priceLabel: string       // "R$ 59,90/mês"
  description: string      // sub-label visual
  amountCents: number      // 5990
  currency: 'BRL'
  interval: 'month' | 'year'
  highlight?: boolean
}

// IDs ativos (2026-04-22). Atualizar aqui ao trocar preço.
const FALLBACK_MONTHLY_PRICE = 'price_1TP4eOJPhM2pUhjm1bSLLUAr'
const FALLBACK_YEARLY_PRICE  = 'price_1TP4eOJPhM2pUhjmsiRW7P0M'

export const PLANS: Record<PlanKey, PlanConfig> = {
  monthly: {
    key: 'monthly',
    priceId: process.env.STRIPE_PRICE_MONTHLY || FALLBACK_MONTHLY_PRICE,
    label: 'Plano Mensal',
    priceLabel: 'R$ 59,90/mês',
    description: 'Cobrado mensalmente',
    amountCents: 5990,
    currency: 'BRL',
    interval: 'month',
  },
  yearly: {
    key: 'yearly',
    priceId: process.env.STRIPE_PRICE_YEARLY || FALLBACK_YEARLY_PRICE,
    label: 'Plano Anual',
    priceLabel: 'R$ 399,00/ano',
    description: 'Equivale a R$ 33,25/mês · Economize 44%',
    amountCents: 39900,
    currency: 'BRL',
    interval: 'year',
    highlight: true,
  },
}

export function getPlan(key: string): PlanConfig | null {
  if (key !== 'monthly' && key !== 'yearly') return null
  return PLANS[key as PlanKey]
}

export const TRIAL_DAYS = 7
