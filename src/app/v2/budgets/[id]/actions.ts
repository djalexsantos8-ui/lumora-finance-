'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { calcItemTotals, type BudgetItemV2 } from '@/lib/v2/budget-calc'

/**
 * Server actions do editor de orçamento V2.
 *
 * RLS protege escritas — usuário só consegue mexer no próprio workspace.
 * Trigger SQL recalc_budget_v2_totals atualiza budgets_v2.* sempre que
 * budget_items_v2 muda. Aqui só fazemos os UPDATE/INSERT/DELETE.
 */

export type ActionResult = { ok: true } | { ok: false; error: string }

interface SaveBudgetInput {
  id:                   string
  name?:                string | null
  client_id?:           string | null
  agency_id?:           string | null
  project_type?:        string | null
  start_date?:          string | null
  end_date?:            string | null
  location?:            string | null
  status?:              string | null
  margin_percent?:      number | null
  tax_percent?:         number | null
  discount_amount?:     number | null
  payment_terms?:       string | null
  validity_days?:       number | null
  delivery_days?:       number | null
  revisions_included?:  number | null
  notes_internal?:      string | null
  notes_client?:        string | null
}

export async function saveBudget(input: SaveBudgetInput): Promise<ActionResult> {
  const sb = await createClient()
  const { id, ...patch } = input

  const { error } = await sb
    .from('budgets_v2')
    .update(patch as Record<string, unknown>)
    .eq('id', id)

  if (error) return { ok: false, error: error.message }
  revalidatePath(`/v2/budgets/${id}`)
  return { ok: true }
}

export async function addItem(budgetId: string): Promise<ActionResult & { id?: string }> {
  const sb = await createClient()

  const { data: budget } = await sb
    .from('budgets_v2')
    .select('workspace_id')
    .eq('id', budgetId)
    .maybeSingle()

  if (!budget) return { ok: false, error: 'budget_not_found' }

  const { data: lastItems } = await sb
    .from('budget_items_v2')
    .select('sort_order')
    .eq('budget_id', budgetId)
    .order('sort_order', { ascending: false })
    .limit(1)

  const nextOrder =
    (lastItems && lastItems[0]?.sort_order != null ? Number(lastItems[0].sort_order) : -1) + 1

  const { data, error } = await sb
    .from('budget_items_v2')
    .insert({
      budget_id:    budgetId,
      workspace_id: budget.workspace_id,
      description:  'Novo item',
      category:     'Geral',
      unit:         'unidade',
      days:         1,
      people:       1,
      quantity:     1,
      unit_price:   0,
      unit_cost:    0,
      total:        0,
      total_cost:   0,
      sort_order:   nextOrder,
    })
    .select('id')
    .single()

  if (error || !data) return { ok: false, error: error?.message ?? 'insert_failed' }
  revalidatePath(`/v2/budgets/${budgetId}`)
  return { ok: true, id: data.id }
}

interface UpdateItemPatch {
  description?: string
  category?:    string
  unit?:        string
  days?:        number
  people?:      number
  quantity?:    number
  unit_price?:  number
  unit_cost?:   number
  sort_order?:  number
}

export async function updateItem(
  itemId: string,
  patch: UpdateItemPatch
): Promise<ActionResult> {
  const sb = await createClient()

  // Se mudou algo que afeta total/total_cost, recalcula
  const affectsTotals =
    patch.unit_price !== undefined ||
    patch.unit_cost  !== undefined ||
    patch.days       !== undefined ||
    patch.people     !== undefined ||
    patch.quantity   !== undefined

  let payload: Record<string, unknown> = { ...patch }

  if (affectsTotals) {
    const { data: existing } = await sb
      .from('budget_items_v2')
      .select('unit_price, unit_cost, days, people, quantity, budget_id')
      .eq('id', itemId)
      .maybeSingle()

    if (!existing) return { ok: false, error: 'item_not_found' }

    const merged: BudgetItemV2 = {
      unit_price: patch.unit_price ?? existing.unit_price,
      unit_cost:  patch.unit_cost  ?? existing.unit_cost,
      days:       patch.days       ?? existing.days,
      people:     patch.people     ?? existing.people,
      quantity:   patch.quantity   ?? existing.quantity,
    }

    const { total, total_cost } = calcItemTotals(merged)
    payload = { ...payload, total, total_cost }
  }

  const { error, data } = await sb
    .from('budget_items_v2')
    .update(payload)
    .eq('id', itemId)
    .select('budget_id')
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  if (data?.budget_id) revalidatePath(`/v2/budgets/${data.budget_id}`)
  return { ok: true }
}

export async function removeItem(
  itemId: string,
  budgetId: string
): Promise<ActionResult> {
  const sb = await createClient()
  const { error } = await sb.from('budget_items_v2').delete().eq('id', itemId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/v2/budgets/${budgetId}`)
  return { ok: true }
}

export async function reorderItems(
  budgetId: string,
  itemIds: string[]
): Promise<ActionResult> {
  const sb = await createClient()
  // Em batch — uma transação seria ideal, mas RLS já protege.
  for (let i = 0; i < itemIds.length; i++) {
    await sb.from('budget_items_v2').update({ sort_order: i }).eq('id', itemIds[i])
  }
  revalidatePath(`/v2/budgets/${budgetId}`)
  return { ok: true }
}
