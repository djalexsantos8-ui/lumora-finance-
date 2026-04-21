'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { OrderItemActionResult, OrderItemCategory } from '@/types/order'

// ─── helpers ──────────────────────────────────────────────────────────────────

function parseDecimal(raw: string | number): number {
  if (typeof raw === 'number') return isNaN(raw) ? 0 : Math.max(0, raw)
  const cleaned = String(raw).replace(/[^\d.,]/g, '').replace(',', '.')
  const val = parseFloat(cleaned)
  return isNaN(val) ? 0 : Math.max(0, Math.round(val * 100) / 100)
}

async function fetchUpdatedOrder(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orderId: string
) {
  const { data } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .is('deleted_at', null)
    .maybeSingle()
  return data ?? undefined
}

// Detecta erro de tabela inexistente (migration pendente)
function isTableMissing(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null | undefined
  return (
    e?.code === '42P01' ||
    !!e?.message?.includes('does not exist') ||
    !!e?.message?.includes('relation "public.order_items"') ||
    !!e?.message?.includes('relation "public.order_cost_items"')
  )
}

// ─── list ─────────────────────────────────────────────────────────────────────

export async function listOrderItems(orderId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', orderId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    if (isTableMissing(error)) return { items: [], tableMissing: true as const }
    console.error('[order-items/list]', error)
    return { items: [], tableMissing: false as const }
  }
  return { items: data ?? [], tableMissing: false as const }
}

export async function listOrderCostItems(orderId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('order_cost_items')
    .select('*')
    .eq('order_id', orderId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    if (isTableMissing(error)) return { items: [], tableMissing: true as const }
    console.error('[order-items/list-cost]', error)
    return { items: [], tableMissing: false as const }
  }
  return { items: data ?? [], tableMissing: false as const }
}

// ─── REVENUE ITEMS ────────────────────────────────────────────────────────────

export async function addOrderItem(
  orderId: string,
  fields: {
    description: string
    quantity:    number | string
    unit_value:  number | string
    category?:   OrderItemCategory | null
  }
): Promise<OrderItemActionResult> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { success: false, message: 'Não autorizado.' }

  const description = String(fields.description).trim()
  if (!description) return { success: false, message: 'Descrição obrigatória.' }

  const quantity   = Math.max(0.01, parseDecimal(fields.quantity))
  const unit_value = parseDecimal(fields.unit_value)

  const { count } = await supabase
    .from('order_items')
    .select('*', { count: 'exact', head: true })
    .eq('order_id', orderId)
    .is('deleted_at', null)

  const { data, error } = await supabase
    .from('order_items')
    .insert({
      order_id: orderId,
      description,
      category: fields.category ?? null,
      quantity,
      unit_value,
      sort_order: count ?? 0,
    })
    .select()
    .single()

  if (error) {
    console.error('[order-items/add]', error)
    if (isTableMissing(error)) {
      return { success: false, message: 'Migration de pedidos pendente. Veja SETUP-MIGRATIONS.md.' }
    }
    return { success: false, message: 'Erro ao adicionar item.' }
  }

  const order = await fetchUpdatedOrder(supabase, orderId)
  revalidatePath(`/pedidos/${orderId}`)
  return { success: true, data, order }
}

export async function updateOrderItem(
  itemId: string,
  orderId: string,
  fields: {
    description?: string
    quantity?:    number | string
    unit_value?:  number | string
    category?:    OrderItemCategory | null
    show_in_pdf?: boolean
  }
): Promise<OrderItemActionResult> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { success: false, message: 'Não autorizado.' }

  const payload: Record<string, unknown> = {}

  if (fields.description !== undefined) {
    const d = String(fields.description).trim()
    if (!d) return { success: false, message: 'Descrição obrigatória.' }
    payload.description = d
  }
  if (fields.quantity !== undefined)   payload.quantity   = Math.max(0.01, parseDecimal(fields.quantity))
  if (fields.unit_value !== undefined) payload.unit_value = parseDecimal(fields.unit_value)
  if (fields.category !== undefined)   payload.category   = fields.category
  if (fields.show_in_pdf !== undefined) payload.show_in_pdf = fields.show_in_pdf

  if (Object.keys(payload).length === 0) {
    return { success: false, message: 'Nada para atualizar.' }
  }

  const { data, error } = await supabase
    .from('order_items')
    .update(payload)
    .eq('id', itemId)
    .is('deleted_at', null)
    .select()
    .single()

  if (error) {
    console.error('[order-items/update]', error)
    return { success: false, message: 'Erro ao atualizar item.' }
  }

  const order = await fetchUpdatedOrder(supabase, orderId)
  revalidatePath(`/pedidos/${orderId}`)
  return { success: true, data, order }
}

export async function deleteOrderItem(
  itemId: string,
  orderId: string
): Promise<OrderItemActionResult> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { success: false, message: 'Não autorizado.' }

  const { error } = await supabase
    .from('order_items')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', itemId)

  if (error) {
    console.error('[order-items/delete]', error)
    return { success: false, message: 'Erro ao remover item.' }
  }

  const order = await fetchUpdatedOrder(supabase, orderId)
  revalidatePath(`/pedidos/${orderId}`)
  return { success: true, order }
}

// ─── COST ITEMS (custos internos do pedido) ──────────────────────────────────

export async function addOrderCostItem(
  orderId: string,
  fields: {
    description: string
    category:    string
    quantity:    number | string
    unit_value:  number | string
  }
): Promise<OrderItemActionResult> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { success: false, message: 'Não autorizado.' }

  const description = String(fields.description).trim()
  if (!description) return { success: false, message: 'Descrição obrigatória.' }

  const quantity   = Math.max(0.01, parseDecimal(fields.quantity))
  const unit_value = parseDecimal(fields.unit_value)

  const { count } = await supabase
    .from('order_cost_items')
    .select('*', { count: 'exact', head: true })
    .eq('order_id', orderId)
    .is('deleted_at', null)

  const { data, error } = await supabase
    .from('order_cost_items')
    .insert({
      order_id: orderId,
      description,
      category: fields.category || 'other',
      quantity,
      unit_value,
      sort_order: count ?? 0,
    })
    .select()
    .single()

  if (error) {
    console.error('[order-items/add-cost]', error)
    if (isTableMissing(error)) {
      return { success: false, message: 'Migration pendente. Veja SETUP-MIGRATIONS.md.' }
    }
    return { success: false, message: 'Erro ao adicionar custo.' }
  }

  const order = await fetchUpdatedOrder(supabase, orderId)
  revalidatePath(`/pedidos/${orderId}`)
  return { success: true, data, order }
}

export async function deleteOrderCostItem(
  itemId: string,
  orderId: string
): Promise<OrderItemActionResult> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { success: false, message: 'Não autorizado.' }

  const { error } = await supabase
    .from('order_cost_items')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', itemId)

  if (error) {
    console.error('[order-items/delete-cost]', error)
    return { success: false, message: 'Erro ao remover custo.' }
  }

  const order = await fetchUpdatedOrder(supabase, orderId)
  revalidatePath(`/pedidos/${orderId}`)
  return { success: true, order }
}
