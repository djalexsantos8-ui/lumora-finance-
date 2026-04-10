'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { BudgetItemActionResult } from '@/types/budget'

// ─── helpers ──────────────────────────────────────────────────────────────────

function parseDecimal(raw: string): number {
  const cleaned = raw.replace(/[^\d.,]/g, '').replace(',', '.')
  const val = parseFloat(cleaned)
  return isNaN(val) || val < 0 ? 0 : Math.round(val * 100) / 100
}

// Recalcula totals do orçamento após mutação de item
// Retorna o orçamento atualizado
async function recalculateAndReturn(supabase: Awaited<ReturnType<typeof createClient>>, budgetId: string) {
  const { data: budget } = await supabase
    .from('budgets')
    .select('margin_type, margin_input')
    .eq('id', budgetId)
    .single()

  if (!budget) return null

  const { data: items } = await supabase
    .from('budget_items')
    .select('total_value')
    .eq('budget_id', budgetId)
    .is('deleted_at', null)

  const subtotal = (items ?? []).reduce(
    (sum: number, i: { total_value: number }) => sum + Number(i.total_value),
    0
  )

  const marginAmount =
    budget.margin_type === 'percentage'
      ? (subtotal * Number(budget.margin_input)) / 100
      : Number(budget.margin_input)

  const total = subtotal + marginAmount

  const { data: updated } = await supabase
    .from('budgets')
    .update({
      subtotal:      Math.round(subtotal * 100) / 100,
      margin_amount: Math.round(marginAmount * 100) / 100,
      total:         Math.round(total * 100) / 100,
    })
    .eq('id', budgetId)
    .select()
    .single()

  return updated ?? null
}

// ─── CREATE ──────────────────────────────────────────────────────────────────

export async function createBudgetItem(
  budgetId: string,
  formData: FormData
): Promise<BudgetItemActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()

  if (authErr || !user) return { success: false, message: 'Não autorizado.' }

  const label        = (formData.get('label') as string)?.trim() ?? ''
  const category     = (formData.get('category') as string) || null
  const customCat    = (formData.get('custom_category') as string)?.trim() || null
  const freelancerId = (formData.get('freelancer_id') as string) || null
  const quantity     = Math.max(1, parseInt((formData.get('quantity') as string) || '1') || 1)
  const days         = Math.max(0, parseDecimal((formData.get('days') as string) || '1'))
  const unitValue    = parseDecimal((formData.get('unit_value') as string) || '0')
  const showInPdf    = formData.get('show_in_pdf') === 'true'

  if (!label) return { success: false, message: 'Descrição do item é obrigatória.' }

  const totalValue = Math.round(quantity * days * unitValue * 100) / 100

  // Sort order = itens ativos atuais
  const { count } = await supabase
    .from('budget_items')
    .select('*', { count: 'exact', head: true })
    .eq('budget_id', budgetId)
    .is('deleted_at', null)

  const { data, error } = await supabase
    .from('budget_items')
    .insert({
      budget_id:       budgetId,
      freelancer_id:   freelancerId || null,
      category:        category || null,
      custom_category: customCat,
      label,
      quantity,
      days,
      unit_value:  unitValue,
      total_value: totalValue,
      is_custom:   !freelancerId,
      show_in_pdf: showInPdf,
      sort_order:  count ?? 0,
    })
    .select()
    .single()

  if (error) {
    console.error('[budget-items/create]', error)
    return { success: false, message: 'Erro ao adicionar item.' }
  }

  const updatedBudget = await recalculateAndReturn(supabase, budgetId)

  revalidatePath(`/budgets/${budgetId}`)
  return { success: true, data, budget: updatedBudget ?? undefined }
}

// ─── UPDATE ──────────────────────────────────────────────────────────────────

export async function updateBudgetItem(
  itemId: string,
  budgetId: string,
  formData: FormData
): Promise<BudgetItemActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()

  if (authErr || !user) return { success: false, message: 'Não autorizado.' }

  const label        = (formData.get('label') as string)?.trim() ?? ''
  const category     = (formData.get('category') as string) || null
  const customCat    = (formData.get('custom_category') as string)?.trim() || null
  const freelancerId = (formData.get('freelancer_id') as string) || null
  const quantity     = Math.max(1, parseInt((formData.get('quantity') as string) || '1') || 1)
  const days         = Math.max(0, parseDecimal((formData.get('days') as string) || '1'))
  const unitValue    = parseDecimal((formData.get('unit_value') as string) || '0')
  const showInPdf    = formData.get('show_in_pdf') === 'true'

  if (!label) return { success: false, message: 'Descrição do item é obrigatória.' }

  const totalValue = Math.round(quantity * days * unitValue * 100) / 100

  const { data, error } = await supabase
    .from('budget_items')
    .update({
      freelancer_id:   freelancerId || null,
      category:        category || null,
      custom_category: customCat,
      label,
      quantity,
      days,
      unit_value:  unitValue,
      total_value: totalValue,
      show_in_pdf: showInPdf,
    })
    .eq('id', itemId)
    .is('deleted_at', null)
    .select()
    .single()

  if (error) {
    console.error('[budget-items/update]', error)
    return { success: false, message: 'Erro ao atualizar item.' }
  }

  const updatedBudget = await recalculateAndReturn(supabase, budgetId)

  revalidatePath(`/budgets/${budgetId}`)
  return { success: true, data, budget: updatedBudget ?? undefined }
}

// ─── SOFT DELETE ──────────────────────────────────────────────────────────────

export async function deleteBudgetItem(
  itemId: string,
  budgetId: string
): Promise<BudgetItemActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()

  if (authErr || !user) return { success: false, message: 'Não autorizado.' }

  const { error } = await supabase
    .from('budget_items')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', itemId)
    .is('deleted_at', null)

  if (error) {
    console.error('[budget-items/delete]', error)
    return { success: false, message: 'Erro ao remover item.' }
  }

  const updatedBudget = await recalculateAndReturn(supabase, budgetId)

  revalidatePath(`/budgets/${budgetId}`)
  return { success: true, budget: updatedBudget ?? undefined }
}
