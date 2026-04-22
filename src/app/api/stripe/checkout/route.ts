import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'
import { getPlan } from '@/lib/stripe/pricing'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

/**
 * POST /api/stripe/checkout
 *
 * Modelo de trial SEM CARTÃO:
 * - O usuário vira trialing no signup (trigger handle_new_user do Supabase),
 *   com trial_ends_at = signup + 7 dias. Nenhuma subscription Stripe existe
 *   nessa fase.
 * - Quando o trial vence (middleware detecta trial_ends_at < now), ele é
 *   redirecionado para /upgrade.
 * - Aqui criamos a subscription Stripe já pagante. O webhook vai sincronizar
 *   status='active' quando o pagamento for aprovado.
 *
 * Body: { plan: 'monthly' | 'yearly', promotionCode?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const planConfig = getPlan(body.plan)

    if (!planConfig) {
      return NextResponse.json({ error: 'Plano inválido' }, { status: 400 })
    }

    // Busca ou cria o customer Stripe vinculado ao usuário
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, stripe_customer_id')
      .eq('id', user.id)
      .single()

    let customerId = profile?.stripe_customer_id

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email!,
        name: profile?.full_name ?? undefined,
        metadata: { supabase_user_id: user.id },
      })
      customerId = customer.id

      await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id)
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL!

    const sessionParams: Parameters<typeof stripe.checkout.sessions.create>[0] = {
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: planConfig.priceId, quantity: 1 }],
      // Sem trial_period_days: o trial é local (7 dias no DB). No Stripe, o
      // usuário já entra pagando quando converter.
      subscription_data: {
        metadata: { supabase_user_id: user.id },
      },
      allow_promotion_codes: true,
      success_url: `${appUrl}/dashboard?checkout=success`,
      cancel_url: `${appUrl}/upgrade`,
    }

    // Se veio código promocional direto (ex: link de influencer), aplica
    if (body.promotionCode && typeof body.promotionCode === 'string') {
      try {
        const promos = await stripe.promotionCodes.list({
          code: body.promotionCode,
          active: true,
          limit: 1,
        })
        if (promos.data.length > 0) {
          sessionParams.discounts = [{ promotion_code: promos.data[0].id }]
          // discounts e allow_promotion_codes são mutuamente exclusivos
          delete sessionParams.allow_promotion_codes
        }
      } catch (e) {
        console.warn('[checkout] promotion code lookup falhou:', e)
      }
    }

    const session = await stripe.checkout.sessions.create(sessionParams)

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('[stripe/checkout] Erro:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
