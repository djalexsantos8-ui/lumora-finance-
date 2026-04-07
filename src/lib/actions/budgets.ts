'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { BudgetActionResult, BudgetMarginType, BudgetStatus } from '@/types/budget'

// ─── helpers ──────────────────────────────────────────────────────────────────

async function getWorkspaceId(userId: string): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()
  return data?.workspace_id ?? null
}

// Recalcula subtotal, margin_amount e total a partir dos itens ativos
export async function recalculateBudgetTotals(budgetId: string): Promise<void> {
  const supabase = await createClient()

  const { data: budget } = await supabase
    .from('budgets')
    .select('margin_type, margin_input')
    .eq('id', budgetId)
    .single()

  if (!budget) return

  const { data: items } = await supabase
    .from('budget_items')
    .select('total_value')
    .eq('budget_id', budgetId)
    .is('deleted_at', null)

  const subtotal = (items ?? []).reduce(
    (sum, item) => sum + Number(item.total_value),
    0
  )

  const marginAmount =
    budget.margin_type === 'percentage'
      ? (subtotal * Number(budget.margin_input)) / 100
      : Number(budget.margin_input)

  const total = subtotal + marginAmount

  await supabase
    .from('budgets')
    .update({
      subtotal:      Math.round(subtotal * 100) / 100,
      margin_amount: Math.round(marginAmount * 100) / 100,
      total:         Math.round(total * 100) / 100,
    })
    .eq('id', budgetId)
}

// ─── CREATE — cria rascunho e redireciona para o editor ───────────────────────

export async function createBudget(): Promise<never> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()

  if (authErr || !user) redirect('/login')

  const workspaceId = await getWorkspaceId(user.id)
  if (!workspaceId) redirect('/dashboard')

  const { data, error } = await supabase
    .from('budgets')
    .insert({
      workspace_id: workspaceId,
      created_by:   user.id,
      title:        'Orçamento sem título',
      client_name:  '',
      status:       'draft',
      currency:     'BRL',
    })
    .select('id')
    .single()

  if (error || !data) {
    console.error('[budgets/create]', error)
    redirect('/budgets')
  }

  revalidatePath('/budgets')
  redirect(`/budgets/${data.id}`)
}

// ─── UPDATE INFO — salva dados do projeto (chamado pelo auto-save) ─────────────

export async function updateBudgetInfo(
  id: string,
  fields: {
    title?:               string
    client_name?:         string
    project_description?: string
    deliverables?:        string
    event_date?:          string
    valid_until?:         string
    currency?:            string
    notes_internal?:      string
  }
): Promise<BudgetActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()

  if (authErr || !user) return { success: false, error: 'Não autorizado.' }

  const payload: Record<string, unknown> = {}

  if (fields.title !== undefined)
    payload.title = fields.title.trim() || 'Orçamento sem título'
  if (fields.client_name !== undefined)
    payload.client_name = fields.client_name.trim()
  if (fields.project_description !== undefined)
    payload.project_description = fields.project_description.trim() || null
  if (fields.deliverables !== undefined)
    payload.deliverables = fields.deliverables.trim() || null
  if (fields.event_date !== undefined)
    payload.event_date = fields.event_date || null
  if (fields.valid_until !== undefined)
    payload.valid_until = fields.valid_until || null
  if (fields.currency !== undefined)
    payload.currency = fields.currency
  if (fields.notes_internal !== undefined)
    payload.notes_internal = fields.notes_internal.trim() || null

  const { data, error } = await supabase
    .from('budgets')
    .update(payload)
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single()

  if (error) {
    console.error('[budgets/update-info]', error)
    return { success: false, error: 'Erro ao salvar orçamento.' }
  }

  revalidatePath('/budgets')
  revalidatePath(`/budgets/${id}`)
  return { success: true, data }
}

// ─── UPDATE MARGIN — atualiza margem e recalcula totais ───────────────────────

export async function updateBudgetMargin(
  id: string,
  marginType: BudgetMarginType,
  marginInput: number
): Promise<BudgetActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()

  if (authErr || !user) return { success: false, error: 'Não autorizado.' }

  const { data: current } = await supabase
    .from('budgets')
    .select('subtotal')
    .eq('id', id)
    .single()

  if (!current) return { success: false, error: 'Orçamento não encontrado.' }

  const subtotal = Number(current.subtotal)
  const marginAmount =
    marginType === 'percentage'
      ? (subtotal * marginInput) / 100
      : marginInput
  const total = subtotal + marginAmount

  const { data, error } = await supabase
    .from('budgets')
    .update({
      margin_type:   marginType,
      margin_input:  Math.round(marginInput * 100) / 100,
      margin_amount: Math.round(marginAmount * 100) / 100,
      total:         Math.round(total * 100) / 100,
    })
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single()

  if (error) {
    console.error('[budgets/update-margin]', error)
    return { success: false, error: 'Erro ao atualizar margem.' }
  }

  return { success: true, data }
}

// ─── UPDATE STATUS ────────────────────────────────────────────────────────────

export async function updateBudgetStatus(
  id: string,
  status: BudgetStatus
): Promise<BudgetActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()

  if (authErr || !user) return { success: false, error: 'Não autorizado.' }

  const timestamps: Record<string, string> = {}
  if (status === 'sent')     timestamps.sent_at     = new Date().toISOString()
  if (status === 'approved') timestamps.approved_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('budgets')
    .update({ status, ...timestamps })
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single()

  if (error) {
    console.error('[budgets/update-status]', error)
    return { success: false, error: 'Erro ao atualizar status.' }
  }

  revalidatePath('/budgets')
  revalidatePath(`/budgets/${id}`)
  return { success: true, data }
}

// ─── SOFT DELETE ──────────────────────────────────────────────────────────────

export async function deleteBudget(id: string): Promise<BudgetActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()

  if (authErr || !user) return { success: false, error: 'Não autorizado.' }

  const { error } = await supabase
    .from('budgets')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)

  if (error) {
    console.error('[budgets/delete]', error)
    return { success: false, error: 'Erro ao excluir orçamento.' }
  }

  revalidatePath('/budgets')
  return { success: true }
}
