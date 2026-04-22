'use server'

// ─── Order Payments — Actions ──────────────────────────────────────────────
//
// Server actions para pagamentos recebidos de pedidos. Fase 1b (2026-04-22).
//
// Tabela `order_payments` é pré-existente com schema rico (status enum
// previsto/pago/cancelado, due_date, paid_at, method, reference).
// Estas actions expõem apenas o fluxo "registrar pagamento já recebido":
//   · addOrderPayment → cria com status='pago' e paid_at
//   · deleteOrderPayment → soft delete
//
// Trigger recalculate_order_amount_paid atualiza orders.amount_paid somando
// apenas status='pago' e deleted_at is null.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getWorkspaceId } from '@/lib/utils/workspace'
import type {
  OrderPayment,
  OrderPaymentActionResult,
  Order,
} from '@/types/order'

// ─── listPaymentsByOrder ────────────────────────────────────────────────────

export async function listPaymentsByOrder(
  orderId: string
): Promise<OrderPayment[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const workspaceId = await getWorkspaceId(user.id)
  if (!workspaceId) return []

  const { data, error } = await supabase
    .from('order_payments')
    .select('*')
    .eq('order_id', orderId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .order('paid_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[order-payments/list]', error)
    return []
  }
  return (data ?? []) as OrderPayment[]
}

// ─── addOrderPayment ────────────────────────────────────────────────────────

export async function addOrderPayment(
  orderId: string,
  fields: {
    amount:      number
    received_at: string   // YYYY-MM-DD → grava em paid_at
    notes?:      string
    method?:     string
    currency?:   string
  }
): Promise<OrderPaymentActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, message: 'Não autorizado.' }

  const workspaceId = await getWorkspaceId(user.id)
  if (!workspaceId) return { success: false, message: 'Workspace não encontrado.' }

  if (!fields.amount || fields.amount <= 0)
    return { success: false, message: 'Valor deve ser maior que zero.' }
  if (!fields.received_at)
    return { success: false, message: 'Data do pagamento é obrigatória.' }

  // Moeda padrão do pedido se não informada
  let currency = fields.currency
  if (!currency) {
    const { data: order } = await supabase
      .from('orders')
      .select('currency')
      .eq('id', orderId)
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .maybeSingle()
    currency = order?.currency ?? 'BRL'
  }

  const { data: payment, error } = await supabase
    .from('order_payments')
    .insert({
      workspace_id: workspaceId,
      order_id:     orderId,
      created_by:   user.id,
      amount:       Math.round(fields.amount * 100) / 100,
      currency,
      paid_at:      fields.received_at,
      due_date:     fields.received_at,
      status:       'pago',
      method:       fields.method?.trim() || null,
      notes:        fields.notes?.trim() || null,
    })
    .select('*')
    .single()

  if (error || !payment) {
    console.error('[order-payments/add]', error)
    return { success: false, message: 'Erro ao registrar pagamento.' }
  }

  // Order atualizado (trigger recalculou amount_paid)
  const { data: updatedOrder } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .maybeSingle()

  revalidatePath('/pedidos')
  revalidatePath(`/pedidos/${orderId}`)
  return {
    success: true,
    data:    payment as OrderPayment,
    order:   (updatedOrder ?? undefined) as Order | undefined,
  }
}

// ─── deleteOrderPayment (soft delete) ───────────────────────────────────────

export async function deleteOrderPayment(
  paymentId: string,
  orderId: string
): Promise<OrderPaymentActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, message: 'Não autorizado.' }

  const workspaceId = await getWorkspaceId(user.id)
  if (!workspaceId) return { success: false, message: 'Workspace não encontrado.' }

  const { error } = await supabase
    .from('order_payments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', paymentId)
    .eq('workspace_id', workspaceId)

  if (error) {
    console.error('[order-payments/delete]', error)
    return { success: false, message: 'Erro ao remover pagamento.' }
  }

  const { data: updatedOrder } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .maybeSingle()

  revalidatePath('/pedidos')
  revalidatePath(`/pedidos/${orderId}`)
  return {
    success: true,
    order:   (updatedOrder ?? undefined) as Order | undefined,
  }
}
