'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { checkAdmin } from '@/lib/auth/is-admin'
import { revalidatePath } from 'next/cache'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

type ActionResult = { ok: true; message?: string } | { ok: false; error: string }

type CreateCouponInput = {
  code: string
  discount_type: 'percentage' | 'fixed'
  discount_value: number
  duration: 'once' | 'repeating' | 'forever'
  duration_months?: number | null
  max_uses?: number | null
  expires_at?: string | null   // ISO date
  affiliate_id?: string | null
  notes?: string | null
}

/**
 * Cria cupom + promotion_code no Stripe e espelha em coupon_codes.
 * Idempotente no sentido de não duplicar code igual (constraint unique no DB).
 */
export async function createCouponAction(input: CreateCouponInput): Promise<ActionResult> {
  const admin = await checkAdmin()
  if (!admin.isAdmin) return { ok: false, error: 'Acesso negado' }

  const code = (input.code || '').trim().toUpperCase()
  if (!code || !/^[A-Z0-9_-]{3,32}$/.test(code)) {
    return { ok: false, error: 'Código inválido (A-Z, 0-9, 3-32 chars)' }
  }
  if (!Number.isFinite(input.discount_value) || input.discount_value <= 0) {
    return { ok: false, error: 'Valor de desconto inválido' }
  }
  if (input.discount_type === 'percentage' && input.discount_value > 100) {
    return { ok: false, error: 'Porcentagem não pode passar de 100' }
  }
  if (input.duration === 'repeating') {
    if (!input.duration_months || input.duration_months < 1) {
      return { ok: false, error: 'Duração recorrente precisa de duration_months ≥ 1' }
    }
  }

  const supabase = createAdminClient()

  // Verifica duplicidade no DB
  const { data: existing } = await supabase
    .from('coupon_codes')
    .select('id')
    .eq('code', code)
    .maybeSingle()
  if (existing) {
    return { ok: false, error: 'Já existe cupom com esse código' }
  }

  // Valida affiliate
  if (input.affiliate_id) {
    const { data: aff } = await supabase
      .from('affiliates')
      .select('id')
      .eq('id', input.affiliate_id)
      .maybeSingle()
    if (!aff) return { ok: false, error: 'Influencer não encontrado' }
  }

  // 1. Cria o coupon no Stripe
  let stripeCouponId: string | null = null
  try {
    const stripeCouponParams: Stripe.CouponCreateParams = {
      duration: input.duration,
      name: code,
      metadata: { source: 'lumora-admin' },
    }
    if (input.discount_type === 'percentage') {
      stripeCouponParams.percent_off = input.discount_value
    } else {
      stripeCouponParams.amount_off = Math.round(input.discount_value * 100) // reais → centavos
      stripeCouponParams.currency = 'brl'
    }
    if (input.duration === 'repeating' && input.duration_months) {
      stripeCouponParams.duration_in_months = input.duration_months
    }
    if (input.max_uses) {
      stripeCouponParams.max_redemptions = input.max_uses
    }
    if (input.expires_at) {
      stripeCouponParams.redeem_by = Math.floor(new Date(input.expires_at).getTime() / 1000)
    }

    const stripeCoupon = await stripe.coupons.create(stripeCouponParams)
    stripeCouponId = stripeCoupon.id

    // 2. Cria o promotion_code amarrado ao coupon
    await stripe.promotionCodes.create({
      promotion: { type: 'coupon', coupon: stripeCoupon.id },
      code,
      active: true,
      metadata: { source: 'lumora-admin' },
      ...(input.max_uses ? { max_redemptions: input.max_uses } : {}),
      ...(input.expires_at
        ? { expires_at: Math.floor(new Date(input.expires_at).getTime() / 1000) }
        : {}),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido na Stripe'
    console.error('[coupons/create] stripe err:', err)
    return { ok: false, error: `Stripe: ${msg}` }
  }

  // 3. Persiste no Supabase
  const { error } = await supabase.from('coupon_codes').insert({
    code,
    discount_type: input.discount_type,
    discount_value: input.discount_value,
    duration: input.duration,
    duration_months: input.duration === 'repeating' ? input.duration_months : null,
    max_uses: input.max_uses ?? null,
    expires_at: input.expires_at ?? null,
    affiliate_id: input.affiliate_id ?? null,
    stripe_coupon_id: stripeCouponId,
    is_active: true,
  })

  if (error) {
    // Rollback Stripe (best effort)
    if (stripeCouponId) {
      try { await stripe.coupons.del(stripeCouponId) } catch {}
    }
    return { ok: false, error: `Supabase: ${error.message}` }
  }

  revalidatePath('/admin/coupons')
  return { ok: true, message: `Cupom ${code} criado` }
}

export async function toggleCouponActiveAction(id: string): Promise<ActionResult> {
  const admin = await checkAdmin()
  if (!admin.isAdmin) return { ok: false, error: 'Acesso negado' }
  if (!id) return { ok: false, error: 'ID inválido' }

  const supabase = createAdminClient()

  const { data: current, error: readErr } = await supabase
    .from('coupon_codes')
    .select('id, is_active, stripe_coupon_id, code')
    .eq('id', id)
    .single()

  if (readErr || !current) return { ok: false, error: 'Cupom não encontrado' }

  const newActive = !current.is_active

  // Ativa/desativa no Stripe (promotion_code) se houver par
  if (current.stripe_coupon_id) {
    try {
      // Atualiza promotion_codes com mesmo `code`
      const promos = await stripe.promotionCodes.list({
        code: current.code,
        limit: 1,
      })
      if (promos.data.length > 0) {
        await stripe.promotionCodes.update(promos.data[0].id, { active: newActive })
      }
      // Cupom Stripe propriamente dito: só pode ser deletado, não desativado.
      // Mantemos o coupon e desativamos só o promotion_code (que é o que o
      // cliente digita). Isso preserva histórico de uso.
    } catch (err) {
      console.warn('[coupons/toggle] stripe warn:', err)
    }
  }

  const { error } = await supabase
    .from('coupon_codes')
    .update({ is_active: newActive, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/coupons')
  return { ok: true, message: newActive ? 'Cupom reativado' : 'Cupom desativado' }
}

export async function createAffiliateAction(input: {
  name: string
  email: string
  commission_type?: 'percentage' | 'fixed'
  commission_value?: number
  notes?: string
}): Promise<ActionResult & { id?: string }> {
  const admin = await checkAdmin()
  if (!admin.isAdmin) return { ok: false, error: 'Acesso negado' }

  const name = (input.name || '').trim()
  const email = (input.email || '').trim().toLowerCase()
  if (!name || !email) return { ok: false, error: 'Nome e email obrigatórios' }

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('affiliates')
    .insert({
      name,
      email,
      commission_type: input.commission_type ?? 'percentage',
      commission_value: input.commission_value ?? 0,
      notes: input.notes ?? null,
      is_active: true,
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/coupons')
  return { ok: true, id: data.id, message: 'Influencer cadastrado' }
}
