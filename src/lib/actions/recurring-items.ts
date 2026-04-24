'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type {
  RecurringItem,
  RecurringCostItem,
  RecurringItemActionResult,
  RecurringCostItemActionResult,
  RecurringItemCategory,
  RecurringCostCategory,
} from '@/types/recurring-revenue'

// ─── helpers ──────────────────────────────────────────────────────────────────

function parseDecimal(raw: string | number): number {
  if (typeof raw === 'number') return isNaN(raw) ? 0 : Math.max(0, raw)
  const cleaned = String(raw).replace(/[^\d.,]/g, '').replace(',', '.')
  const val = parseFloat(cleaned)
  return isNaN(val) ? 0 : Math.max(0, Math.round(val * 100) / 100)
}

function isTableMissing(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null | undefined
  return (
    e?.code === '42P01' ||
    !!e?.message?.includes('does not exist') ||
    !!e?.message?.includes('relation "public.recurring_revenue_items"') ||
    !!e?.message?.includes('relation "public.recurring_revenue_cost_items"')
  )
}

// ─── list ─────────────────────────────────────────────────────────────────────

export async function listRecurringItems(
  recurringId: string
): Promise<{ items: RecurringItem[]; tableMissing: boolean }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('recurring_revenue_items')
    .select('*')
    .eq('recurring_id', recurringId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    if (isTableMissing(error)) return { items: [], tableMissing: true }
    console.error('[recurring-items/list]', error)
    return { items: [], tableMissing: false }
  }
  return { items: (data ?? []) as RecurringItem[], tableMissing: false }
}

export async function listRecurringCostItems(
  recurringId: string
): Promise<{ items: RecurringCostItem[]; tableMissing: boolean }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('recurring_revenue_cost_items')
    .select('*')
    .eq('recurring_id', recurringId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    if (isTableMissing(error)) return { items: [], tableMissing: true }
    console.error('[recurring-items/list-cost]', error)
    return { items: [], tableMissing: false }
  }
  return { items: (data ?? []) as RecurringCostItem[], tableMissing: false }
}

// ─── SERVICE ITEMS (serviços que compõem o mensal) ───────────────────────────

export async function addRecurringItem(
  recurringId: string,
  fields: {
    description: string
    quantity:    number | string
    unit_value:  number | string
    category?:   RecurringItemCategory | null
  }
): Promise<RecurringItemActionResult> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { success: false, message: 'Não autorizado.' }

  const description = String(fields.description).trim()
  if (!description) return { success: false, message: 'Descrição obrigatória.' }

  const quantity   = Math.max(0.01, parseDecimal(fields.quantity))
  const unit_value = parseDecimal(fields.unit_value)

  const { count } = await supabase
    .from('recurring_revenue_items')
    .select('*', { count: 'exact', head: true })
    .eq('recurring_id', recurringId)
    .is('deleted_at', null)

  const { data, error } = await supabase
    .from('recurring_revenue_items')
    .insert({
      recurring_id: recurringId,
      description,
      category: fields.category ?? null,
      quantity,
      unit_value,
      sort_order: count ?? 0,
    })
    .select()
    .single()

  if (error) {
    console.error('[recurring-items/add]', error)
    if (isTableMissing(error)) {
      return { success: false, message: 'Migration de itens pendente.' }
    }
    return { success: false, message: 'Erro ao adicionar serviço.' }
  }

  revalidatePath(`/receitas-recorrentes/${recurringId}`)
  return { success: true, data: data as RecurringItem }
}

export async function updateRecurringItem(
  itemId: string,
  recurringId: string,
  fields: {
    description?: string
    quantity?:    number | string
    unit_value?:  number | string
    category?:    RecurringItemCategory | null
    show_in_pdf?: boolean
  }
): Promise<RecurringItemActionResult> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { success: false, message: 'Não autorizado.' }

  const payload: Record<string, unknown> = {}
  if (fields.description !== undefined) {
    const d = String(fields.description).trim()
    if (!d) return { success: false, message: 'Descrição obrigatória.' }
    payload.description = d
  }
  if (fields.quantity    !== undefined) payload.quantity    = Math.max(0.01, parseDecimal(fields.quantity))
  if (fields.unit_value  !== undefined) payload.unit_value  = parseDecimal(fields.unit_value)
  if (fields.category    !== undefined) payload.category    = fields.category
  if (fields.show_in_pdf !== undefined) payload.show_in_pdf = fields.show_in_pdf

  if (Object.keys(payload).length === 0) {
    return { success: false, message: 'Nada para atualizar.' }
  }

  const { data, error } = await supabase
    .from('recurring_revenue_items')
    .update(payload)
    .eq('id', itemId)
    .is('deleted_at', null)
    .select()
    .single()

  if (error) {
    console.error('[recurring-items/update]', error)
    return { success: false, message: 'Erro ao atualizar serviço.' }
  }

  revalidatePath(`/receitas-recorrentes/${recurringId}`)
  return { success: true, data: data as RecurringItem }
}

export async function deleteRecurringItem(
  itemId: string,
  recurringId: string
): Promise<RecurringItemActionResult> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { success: false, message: 'Não autorizado.' }

  const { error } = await supabase
    .from('recurring_revenue_items')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', itemId)

  if (error) {
    console.error('[recurring-items/delete]', error)
    return { success: false, message: 'Erro ao remover serviço.' }
  }

  revalidatePath(`/receitas-recorrentes/${recurringId}`)
  return { success: true }
}

// ─── COST ITEMS (repasses cobrados do cliente) ───────────────────────────────

export async function addRecurringCostItem(
  recurringId: string,
  fields: {
    description: string
    category:    string
    quantity:    number | string
    unit_value:  number | string
  }
): Promise<RecurringCostItemActionResult> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { success: false, message: 'Não autorizado.' }

  const description = String(fields.description).trim()
  if (!description) return { success: false, message: 'Descrição obrigatória.' }

  const quantity   = Math.max(0.01, parseDecimal(fields.quantity))
  const unit_value = parseDecimal(fields.unit_value)

  const { count } = await supabase
    .from('recurring_revenue_cost_items')
    .select('*', { count: 'exact', head: true })
    .eq('recurring_id', recurringId)
    .is('deleted_at', null)

  const { data, error } = await supabase
    .from('recurring_revenue_cost_items')
    .insert({
      recurring_id: recurringId,
      description,
      category: fields.category || 'other',
      quantity,
      unit_value,
      sort_order: count ?? 0,
    })
    .select()
    .single()

  if (error) {
    console.error('[recurring-items/add-cost]', error)
    if (isTableMissing(error)) {
      return { success: false, message: 'Migration de repasses pendente.' }
    }
    return { success: false, message: 'Erro ao adicionar repasse.' }
  }

  revalidatePath(`/receitas-recorrentes/${recurringId}`)
  return { success: true, data: data as RecurringCostItem }
}

export async function updateRecurringCostItem(
  itemId: string,
  recurringId: string,
  fields: {
    description?: string
    category?:    string
    quantity?:    number | string
    unit_value?:  number | string
  }
): Promise<RecurringCostItemActionResult> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { success: false, message: 'Não autorizado.' }

  const payload: Record<string, unknown> = {}
  if (fields.description !== undefined) {
    const d = String(fields.description).trim()
    if (!d) return { success: false, message: 'Descrição obrigatória.' }
    payload.description = d
  }
  if (fields.category   !== undefined) payload.category   = fields.category || 'other'
  if (fields.quantity   !== undefined) payload.quantity   = Math.max(0.01, parseDecimal(fields.quantity))
  if (fields.unit_value !== undefined) payload.unit_value = parseDecimal(fields.unit_value)

  if (Object.keys(payload).length === 0) {
    return { success: false, message: 'Nada para atualizar.' }
  }

  const { data, error } = await supabase
    .from('recurring_revenue_cost_items')
    .update(payload)
    .eq('id', itemId)
    .is('deleted_at', null)
    .select()
    .single()

  if (error) {
    console.error('[recurring-items/update-cost]', error)
    return { success: false, message: 'Erro ao atualizar repasse.' }
  }

  revalidatePath(`/receitas-recorrentes/${recurringId}`)
  return { success: true, data: data as RecurringCostItem }
}

export async function deleteRecurringCostItem(
  itemId: string,
  recurringId: string
): Promise<RecurringCostItemActionResult> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { success: false, message: 'Não autorizado.' }

  const { error } = await supabase
    .from('recurring_revenue_cost_items')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', itemId)

  if (error) {
    console.error('[recurring-items/delete-cost]', error)
    return { success: false, message: 'Erro ao remover repasse.' }
  }

  revalidatePath(`/receitas-recorrentes/${recurringId}`)
  return { success: true }
}
