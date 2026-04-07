'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { ExpenseCategory, ExpenseActionResult } from '@/types/expense'

// ─── helper ───────────────────────────────────────────────────────────────────

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

// ─── CREATE ───────────────────────────────────────────────────────────────────

export async function createExpense(fields: {
  description:   string
  category:      ExpenseCategory
  amount:        number
  currency?:     string
  expense_date:  string   // YYYY-MM-DD
  is_deductible: boolean
  notes?:        string
}): Promise<ExpenseActionResult> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { success: false, error: 'Não autorizado.' }

  const workspaceId = await getWorkspaceId(user.id)
  if (!workspaceId) return { success: false, error: 'Workspace não encontrado.' }

  if (!fields.description.trim()) return { success: false, error: 'Descrição obrigatória.' }
  if (fields.amount <= 0)          return { success: false, error: 'Valor deve ser maior que zero.' }
  if (!fields.expense_date)        return { success: false, error: 'Data obrigatória.' }

  const { data, error } = await supabase
    .from('expenses')
    .insert({
      workspace_id:  workspaceId,
      description:   fields.description.trim(),
      category:      fields.category,
      amount:        Math.round(fields.amount * 100) / 100,
      currency:      fields.currency ?? 'BRL',
      expense_date:  fields.expense_date,
      is_deductible: fields.is_deductible,
      notes:         fields.notes?.trim() || null,
    })
    .select()
    .single()

  if (error) {
    console.error('[expenses/create]', error)
    return { success: false, error: 'Erro ao criar despesa.' }
  }

  revalidatePath('/expenses')
  return { success: true, data }
}

// ─── DELETE (soft) ────────────────────────────────────────────────────────────

export async function deleteExpense(id: string): Promise<ExpenseActionResult> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { success: false, error: 'Não autorizado.' }

  const { error } = await supabase
    .from('expenses')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)

  if (error) {
    console.error('[expenses/delete]', error)
    return { success: false, error: 'Erro ao excluir despesa.' }
  }

  revalidatePath('/expenses')
  return { success: true }
}
