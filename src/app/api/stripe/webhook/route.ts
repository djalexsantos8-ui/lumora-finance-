import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/server'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

// Necessário para leitura correta da assinatura do webhook
export const dynamic = 'force-dynamic'

function mapStripeStatus(stripeStatus: string): string {
  const map: Record<string, string> = {
    trialing: 'trialing',
    active: 'active',
    past_due: 'past_due',
    canceled: 'canceled',
    paused: 'paused',
    incomplete: 'incomplete',
    incomplete_expired: 'canceled',
    unpaid: 'past_due',
  }
  return map[stripeStatus] ?? 'incomplete'
}

function mapPlan(interval: string | null | undefined): 'monthly' | 'annual' | null {
  if (interval === 'month') return 'monthly'
  if (interval === 'year') return 'annual'
  return null
}

async function handleSubscriptionChange(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  subscription: Stripe.Subscription
) {
  const userId = subscription.metadata?.supabase_user_id
  if (!userId) {
    console.warn('[webhook] subscription sem supabase_user_id:', subscription.id)
    return
  }

  const item = subscription.items.data[0]
  const interval = item?.price?.recurring?.interval ?? null

  // Em Stripe v22, current_period_start/end ficam no item, não na subscription raiz
  const periodStart = item?.current_period_start
  const periodEnd = item?.current_period_end

  await supabase.from('subscriptions').upsert(
    {
      user_id: userId,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: subscription.customer as string,
      status: mapStripeStatus(subscription.status),
      plan: mapPlan(interval),
      trial_ends_at: subscription.trial_end
        ? new Date(subscription.trial_end * 1000).toISOString()
        : null,
      current_period_start: periodStart
        ? new Date(periodStart * 1000).toISOString()
        : null,
      current_period_end: periodEnd
        ? new Date(periodEnd * 1000).toISOString()
        : null,
      canceled_at: subscription.canceled_at
        ? new Date(subscription.canceled_at * 1000).toISOString()
        : null,
    },
    { onConflict: 'user_id' }
  )
}

export async function POST(request: NextRequest) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')

  if (!sig) {
    return NextResponse.json({ error: 'Sem assinatura' }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    console.error('[webhook] Falha na validação da assinatura:', err)
    return NextResponse.json({ error: 'Assinatura inválida' }, { status: 400 })
  }

  const supabase = createAdminClient()

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.paused': {
        const subscription = event.data.object as Stripe.Subscription
        await handleSubscriptionChange(supabase, subscription)
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const userId = subscription.metadata?.supabase_user_id
        if (userId) {
          await supabase
            .from('subscriptions')
            .update({
              status: 'canceled',
              canceled_at: new Date().toISOString(),
            })
            .eq('user_id', userId)
        }
        break
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice
        // Stripe v22: subscription ID via invoice.parent.subscription_details
        const subId = (invoice.parent as any)?.subscription_details?.subscription as string | null
        if (!subId) break

        const subscription = await stripe.subscriptions.retrieve(subId)
        await handleSubscriptionChange(supabase, subscription)
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const subId = (invoice.parent as any)?.subscription_details?.subscription as string | null
        if (!subId) break

        const subscription = await stripe.subscriptions.retrieve(subId)
        // Stripe já seta status para past_due após falha — apenas sincroniza
        await handleSubscriptionChange(supabase, subscription)
        break
      }

      default:
        // Evento não tratado — retorna 200 para o Stripe não reenviar
        break
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('[webhook] Erro ao processar evento:', event.type, error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
