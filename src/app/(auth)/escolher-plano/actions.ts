'use server'

import Stripe from 'stripe'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { priceIdFor, type Plan, type BillingPeriod } from '@/lib/stripe/products'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://www.lumorafinance.com.br'

interface CheckoutInput {
  plan: Plan
  billing: BillingPeriod
}

interface CheckoutResult {
  ok: boolean
  url?: string
  error?: string
}

/**
 * Cria Stripe Checkout Session pro plano selecionado.
 *
 * Fluxo:
 *   1. User autenticado tem workspace (criado no signup pelo trigger handle_new_user)
 *   2. Cria/reutiliza Stripe Customer com metadata workspace_id + user_id
 *   3. Cria Checkout Session em modo 'subscription' com:
 *      - line_item: priceId mapeado de (plan, billing)
 *      - subscription_data.trial_period_days: 7 (cartão obrigatório, sem cobrança)
 *      - subscription_data.metadata: { plan, workspace_id, user_id } pra webhook EPIC-08
 *      - payment_method_collection: 'always' (cartão obrigatório)
 *   4. Retorna URL pra client redirect
 */
export async function createCheckoutSession(
  input: CheckoutInput
): Promise<CheckoutResult> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { ok: false, error: 'not_authenticated' }
    }

    const admin = createAdminClient()

    // 1. Pegar workspace do user (sempre existe — criado no signup pelo trigger)
    const { data: ws } = await admin
      .from('workspaces')
      .select('id, name')
      .eq('owner_id', user.id)
      .maybeSingle()

    if (!ws) {
      return { ok: false, error: 'workspace_not_found' }
    }

    // 2. Verifica se já tem subscription ativa V2
    const { data: existingActive } = await admin
      .from('subscriptions_v2')
      .select('id, status')
      .eq('user_id', user.id)
      .in('status', ['trialing', 'active'])
      .maybeSingle()

    if (existingActive) {
      return { ok: false, error: 'already_subscribed' }
    }

    // 3. Pegar/criar Stripe customer
    let stripeCustomerId: string

    const { data: anyExisting } = await admin
      .from('subscriptions_v2')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (anyExisting?.stripe_customer_id) {
      stripeCustomerId = anyExisting.stripe_customer_id
    } else {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: {
          user_id: user.id,
          workspace_id: ws.id,
          source: 'lumora_v2',
        },
      })
      stripeCustomerId = customer.id
    }

    // 4. Criar Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: stripeCustomerId,
      line_items: [
        {
          price: priceIdFor(input.plan, input.billing),
          quantity: 1,
        },
      ],
      subscription_data: {
        trial_period_days: 7,
        metadata: {
          plan: input.plan,
          billing: input.billing,
          user_id: user.id,
          workspace_id: ws.id,
          source: 'lumora_v2',
        },
      },
      payment_method_collection: 'always', // cartão obrigatório no trial
      allow_promotion_codes: false,
      success_url: `${APP_URL}/pos-signup?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/escolher-plano?canceled=1`,
      locale: 'pt-BR',
    })

    if (!session.url) {
      return { ok: false, error: 'no_checkout_url' }
    }

    return { ok: true, url: session.url }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown_error'
    console.error('[createCheckoutSession]', message)
    return { ok: false, error: message }
  }
}
