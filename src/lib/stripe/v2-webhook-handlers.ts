/**
 * Webhook handlers V2 — assinaturas Lumora (Creator/Enterprise + Extra User).
 *
 * Dispatch a partir de `route.ts` quando o evento for V2 (detectado via
 * metadata.workspace_id + price_id mapeado em STRIPE_PRICES).
 *
 * V1 NÃO É TOCADA — handler V1 segue intacto em route.ts.
 *
 * Eventos tratados:
 *   - customer.subscription.created
 *   - customer.subscription.updated   (inclui mudanças de items/quantity do extra user)
 *   - customer.subscription.deleted
 *   - invoice.paid                     (renovação → reset créditos IA)
 *   - invoice.payment_failed           (cartão recusado → past_due)
 *   - customer.subscription.trial_will_end
 *
 * Idempotency: cada evento é registrado em `stripe_webhook_events` antes
 * de processar; se já está com `processed=true`, retorna early.
 */

import Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/server'
import { lookupPriceId, totalLimitsFor, type Plan, type BillingPeriod } from './products'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

type AdminClient = ReturnType<typeof createAdminClient>

interface HandlerResult {
  received: true
  action: string
  [key: string]: unknown
}

/**
 * Detecta se um evento Stripe pertence à V2 (Lumora — Creator/Enterprise/Extra).
 *
 * Critério: o evento contém um price_id que está em STRIPE_PRICES
 * (creator/enterprise/extraUser × monthly/yearly).
 */
export function isV2Event(event: Stripe.Event): boolean {
  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'customer.subscription.trial_will_end': {
      const sub = event.data.object as Stripe.Subscription
      return sub.items.data.some(item => lookupPriceId(item.price.id) !== null)
    }
    case 'invoice.paid':
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      // Stripe v22+: line.pricing.price_details.price (não line.price)
      // Cast pra any cobre ambos os formatos durante transição de versão SDK
      return (invoice.lines?.data ?? []).some(line => {
        const lineAny = line as unknown as {
          price?: { id?: string }
          pricing?: { price_details?: { price?: string } }
        }
        const priceId =
          lineAny.price?.id ?? lineAny.pricing?.price_details?.price ?? null
        return priceId ? lookupPriceId(priceId) !== null : false
      })
    }
    default:
      return false
  }
}

/**
 * Dispatcher principal: recebe evento V2 e roteia pro handler específico.
 * Idempotency é tratada em route.ts antes de chamar este dispatcher.
 */
export async function handleV2Event(event: Stripe.Event): Promise<HandlerResult> {
  const supabase = createAdminClient()

  switch (event.type) {
    case 'customer.subscription.created':
      return handleSubscriptionCreated(event.data.object as Stripe.Subscription, supabase)
    case 'customer.subscription.updated':
      return handleSubscriptionUpdated(event.data.object as Stripe.Subscription, supabase)
    case 'customer.subscription.deleted':
      return handleSubscriptionDeleted(event.data.object as Stripe.Subscription, supabase)
    case 'invoice.paid':
      return handleInvoicePaid(event.data.object as Stripe.Invoice, supabase)
    case 'invoice.payment_failed':
      return handleInvoicePaymentFailed(event.data.object as Stripe.Invoice, supabase)
    case 'customer.subscription.trial_will_end':
      return handleTrialWillEnd(event.data.object as Stripe.Subscription, supabase)
    default:
      return { received: true, action: 'ignored', reason: 'unsupported_event' }
  }
}

/**
 * Inspeciona items da subscription pra extrair: plan base, billing, e
 * total de extra_user quantity (sum se houver múltiplos items).
 */
interface SubscriptionShape {
  plan: Plan | null
  baseBilling: BillingPeriod | null
  extraUserQuantity: number
  basePriceId: string | null
}

function inspectSubscription(sub: Stripe.Subscription): SubscriptionShape {
  let plan: Plan | null = null
  let baseBilling: BillingPeriod | null = null
  let basePriceId: string | null = null
  let extraUserQuantity = 0

  for (const item of sub.items.data) {
    const lookup = lookupPriceId(item.price.id)
    if (!lookup) continue

    if (lookup.kind === 'plan') {
      plan = lookup.plan
      baseBilling = lookup.billing
      basePriceId = item.price.id
    } else if (lookup.kind === 'extra_user') {
      extraUserQuantity += item.quantity ?? 0
    }
  }

  return { plan, baseBilling, basePriceId, extraUserQuantity }
}

function tsToIso(ts: number | null | undefined): string | null {
  return ts ? new Date(ts * 1000).toISOString() : null
}

async function handleSubscriptionCreated(
  sub: Stripe.Subscription,
  supabase: AdminClient
): Promise<HandlerResult> {
  const workspaceId = sub.metadata?.workspace_id
  const userId = sub.metadata?.user_id

  if (!workspaceId || !userId) {
    return { received: true, action: 'skipped', reason: 'missing_metadata' }
  }

  const shape = inspectSubscription(sub)
  if (!shape.plan || !shape.baseBilling || !shape.basePriceId) {
    return { received: true, action: 'skipped', reason: 'no_plan_item' }
  }

  // current_period_* podem ser null em trial recém-criado (Stripe v22+ usa em items)
  const item = sub.items.data.find(i => i.price.id === shape.basePriceId)
  const periodStart = (item as { current_period_start?: number } | undefined)?.current_period_start
  const periodEnd = (item as { current_period_end?: number } | undefined)?.current_period_end

  await supabase.from('subscriptions_v2').upsert(
    {
      workspace_id: workspaceId,
      user_id: userId,
      stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
      stripe_subscription_id: sub.id,
      stripe_price_id: shape.basePriceId,
      plan: shape.plan,
      status: sub.status,
      trial_start_at: tsToIso(sub.trial_start),
      trial_end_at: tsToIso(sub.trial_end),
      current_period_start: tsToIso(periodStart),
      current_period_end: tsToIso(periodEnd),
      cancel_at_period_end: sub.cancel_at_period_end,
      metadata: sub.metadata as Record<string, string>,
    },
    { onConflict: 'stripe_subscription_id' }
  )

  // Atualiza workspace com plan + max_users + créditos IA (incluindo extra users)
  const limits = totalLimitsFor(shape.plan, shape.baseBilling, shape.extraUserQuantity)
  await supabase
    .from('workspaces')
    .update({
      plan: shape.plan,
      max_users: limits.max_users,
      ai_credits_monthly: limits.ai_credits_monthly,
      ai_credits_remaining: limits.ai_credits_monthly,
      ai_credits_reset_at: tsToIso(periodEnd),
    })
    .eq('id', workspaceId)

  return {
    received: true,
    action: 'subscription_created',
    workspace_id: workspaceId,
    plan: shape.plan,
    billing: shape.baseBilling,
    extra_users: shape.extraUserQuantity,
    max_users: limits.max_users,
    ai_credits_monthly: limits.ai_credits_monthly,
  }
}

async function handleSubscriptionUpdated(
  sub: Stripe.Subscription,
  supabase: AdminClient
): Promise<HandlerResult> {
  const shape = inspectSubscription(sub)
  if (!shape.plan || !shape.baseBilling || !shape.basePriceId) {
    return { received: true, action: 'skipped', reason: 'no_plan_item' }
  }

  const item = sub.items.data.find(i => i.price.id === shape.basePriceId)
  const periodStart = (item as { current_period_start?: number } | undefined)?.current_period_start
  const periodEnd = (item as { current_period_end?: number } | undefined)?.current_period_end

  await supabase
    .from('subscriptions_v2')
    .update({
      stripe_price_id: shape.basePriceId,
      plan: shape.plan,
      status: sub.status,
      current_period_start: tsToIso(periodStart),
      current_period_end: tsToIso(periodEnd),
      cancel_at_period_end: sub.cancel_at_period_end,
      canceled_at: tsToIso(sub.canceled_at),
      trial_end_at: tsToIso(sub.trial_end),
    })
    .eq('stripe_subscription_id', sub.id)

  // Workspace pode ter mudado plan (upgrade) ou extra users (add-on)
  const workspaceId = sub.metadata?.workspace_id
  if (workspaceId) {
    const limits = totalLimitsFor(shape.plan, shape.baseBilling, shape.extraUserQuantity)
    await supabase
      .from('workspaces')
      .update({
        plan: shape.plan,
        max_users: limits.max_users,
        ai_credits_monthly: limits.ai_credits_monthly,
        // NÃO reseta ai_credits_remaining aqui — só em invoice.paid (renovação)
      })
      .eq('id', workspaceId)
  }

  return {
    received: true,
    action: 'subscription_updated',
    status: sub.status,
    plan: shape.plan,
    extra_users: shape.extraUserQuantity,
  }
}

async function handleSubscriptionDeleted(
  sub: Stripe.Subscription,
  supabase: AdminClient
): Promise<HandlerResult> {
  await supabase
    .from('subscriptions_v2')
    .update({
      status: 'canceled',
      canceled_at: tsToIso(sub.canceled_at) ?? new Date().toISOString(),
    })
    .eq('stripe_subscription_id', sub.id)

  // Workspace.plan mantém até fim do period (cancel_at_period_end policy).
  // Worker separado pode degradar pra 'creator' quando current_period_end < now() (futuro).
  return { received: true, action: 'subscription_canceled', subscription_id: sub.id }
}

async function handleInvoicePaid(
  invoice: Stripe.Invoice,
  supabase: AdminClient
): Promise<HandlerResult> {
  // Só processa renovação de ciclo (não primeira fatura, que pode ser trial $0)
  if (invoice.billing_reason !== 'subscription_cycle' && invoice.billing_reason !== 'subscription_create') {
    return { received: true, action: 'skipped', reason: 'not_renewal' }
  }

  // Em Stripe v22+, subscription ID está em invoice.parent.subscription_details.subscription
  const parent = invoice.parent as { subscription_details?: { subscription?: string } } | null
  const subId = parent?.subscription_details?.subscription
  if (!subId) {
    return { received: true, action: 'skipped', reason: 'no_subscription' }
  }

  const sub = await stripe.subscriptions.retrieve(subId)
  const shape = inspectSubscription(sub)
  if (!shape.plan || !shape.baseBilling) {
    return { received: true, action: 'skipped', reason: 'no_v2_plan' }
  }

  const { data: subRow } = await supabase
    .from('subscriptions_v2')
    .select('workspace_id')
    .eq('stripe_subscription_id', subId)
    .maybeSingle()

  if (!subRow) {
    return { received: true, action: 'skipped', reason: 'subscription_v2_not_found' }
  }

  // Reset de créditos no início do novo ciclo
  const limits = totalLimitsFor(shape.plan, shape.baseBilling, shape.extraUserQuantity)
  const item = sub.items.data.find(i => i.price.id === shape.basePriceId)
  const periodEnd = (item as { current_period_end?: number } | undefined)?.current_period_end

  await supabase
    .from('workspaces')
    .update({
      ai_credits_remaining: limits.ai_credits_monthly,
      ai_credits_reset_at: tsToIso(periodEnd),
    })
    .eq('id', subRow.workspace_id)

  return {
    received: true,
    action: 'credits_reset',
    workspace_id: subRow.workspace_id,
    credits: limits.ai_credits_monthly,
  }
}

async function handleInvoicePaymentFailed(
  invoice: Stripe.Invoice,
  supabase: AdminClient
): Promise<HandlerResult> {
  const parent = invoice.parent as { subscription_details?: { subscription?: string } } | null
  const subId = parent?.subscription_details?.subscription
  if (!subId) {
    return { received: true, action: 'skipped', reason: 'no_subscription' }
  }

  await supabase
    .from('subscriptions_v2')
    .update({ status: 'past_due' })
    .eq('stripe_subscription_id', subId)

  // TODO EPIC-47: disparar email "atualize seu cartão" via Resend
  return { received: true, action: 'marked_past_due', subscription_id: subId }
}

async function handleTrialWillEnd(
  sub: Stripe.Subscription,
  supabase: AdminClient
): Promise<HandlerResult> {
  // Stripe dispara 1 dia antes do trial expirar
  // TODO EPIC-47: disparar email "seu trial acaba amanhã" via Resend
  return { received: true, action: 'trial_will_end_notified', subscription_id: sub.id }
}
