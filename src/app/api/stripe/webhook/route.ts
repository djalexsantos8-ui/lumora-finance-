import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/server'
import { isV2Event, handleV2Event } from '@/lib/stripe/v2-webhook-handlers'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

// Necessário para leitura correta da assinatura do webhook
export const dynamic = 'force-dynamic'

/**
 * Idempotency log: registra cada evento Stripe ANTES de processar.
 * Stripe pode reenviar o mesmo evento se achar que falhou (timeout, 5xx).
 * Sem isso, processamos 2x e geramos efeitos duplicados.
 */
async function checkAndLogEvent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  event: Stripe.Event
): Promise<{ duplicate: boolean }> {
  const { data: existing } = await supabase
    .from('stripe_webhook_events')
    .select('id, processed')
    .eq('stripe_event_id', event.id)
    .maybeSingle()

  if (existing?.processed) {
    return { duplicate: true }
  }

  await supabase.from('stripe_webhook_events').upsert(
    {
      stripe_event_id: event.id,
      event_type: event.type,
      payload_truncated: {
        id: event.id,
        type: event.type,
        api_version: event.api_version,
        livemode: event.livemode,
        // Só metadata + ids — payload completo NUNCA gravado (LGPD + storage)
        object_id: (event.data.object as { id?: string })?.id ?? null,
        metadata: (event.data.object as { metadata?: Record<string, string> })?.metadata ?? null,
      },
    },
    { onConflict: 'stripe_event_id' }
  )

  return { duplicate: false }
}

async function markEventProcessed(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  eventId: string,
  result: unknown,
  error: string | null = null
) {
  await supabase
    .from('stripe_webhook_events')
    .update({
      processed: error == null,
      processed_at: new Date().toISOString(),
      result: result as Record<string, unknown>,
      error,
    })
    .eq('stripe_event_id', eventId)
}

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

  // Idempotency check — Stripe reenvia em retry e não queremos processar 2x
  const { duplicate } = await checkAndLogEvent(supabase, event)
  if (duplicate) {
    return NextResponse.json({ received: true, duplicate: true })
  }

  try {
    // Dispatch: V2 (Lumora — Creator/Enterprise/Extra) vs V1 legacy
    if (isV2Event(event)) {
      const result = await handleV2Event(event)
      await markEventProcessed(supabase, event.id, result)
      return NextResponse.json(result)
    }

    // V1 legacy handler (intacto — não tocar)
    let v1Result: unknown = { received: true, action: 'ignored' }

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.paused': {
        const subscription = event.data.object as Stripe.Subscription
        await handleSubscriptionChange(supabase, subscription)
        v1Result = { received: true, action: 'v1_subscription_change' }
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
        v1Result = { received: true, action: 'v1_subscription_deleted' }
        break
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice
        // Stripe v22: subscription ID via invoice.parent.subscription_details
        const subId = (invoice.parent as any)?.subscription_details?.subscription as string | null
        if (!subId) break

        const subscription = await stripe.subscriptions.retrieve(subId)
        await handleSubscriptionChange(supabase, subscription)
        v1Result = { received: true, action: 'v1_invoice_paid' }
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const subId = (invoice.parent as any)?.subscription_details?.subscription as string | null
        if (!subId) break

        const subscription = await stripe.subscriptions.retrieve(subId)
        // Stripe já seta status para past_due após falha — apenas sincroniza
        await handleSubscriptionChange(supabase, subscription)
        v1Result = { received: true, action: 'v1_payment_failed' }
        break
      }

      default:
        // Evento não tratado — retorna 200 para o Stripe não reenviar
        v1Result = { received: true, action: 'ignored', event_type: event.type }
        break
    }

    await markEventProcessed(supabase, event.id, v1Result)
    return NextResponse.json(v1Result)
  } catch (error) {
    console.error('[webhook] Erro ao processar evento:', event.type, error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    await markEventProcessed(supabase, event.id, null, errorMessage)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
