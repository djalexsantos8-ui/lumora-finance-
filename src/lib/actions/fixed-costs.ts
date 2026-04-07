'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { FixedCostCategory, FixedCostActionResult } from '@/types/expense'

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

export async function createFixedCost(fields: {
  description:   string
  category:      FixedCostCategory
  amount:        number
  currency?:     string
  billing_day:   number
  is_active?:    boolean
  is_deductible: boolean
  notes?:        string
}): Promise<FixedCostActionResult> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { success: false, error: 'Não autorizado.' }

  const workspaceId = await getWorkspaceId(user.id)
  if (!workspaceId) return { success: false, error: 'Workspace não encontrado.' }

  if (!fields.description.trim()) return { success: false, error: 'Descrição obrigatória.' }
  if (fields.amount <= 0)         return { success: false, error: 'Valor deve ser maior que zero.' }

  const billingDay = Math.max(1, Math.min(31, Math.round(fields.billing_day)))

  const { data, error } = await supabase
    .from('fixed_costs')
    .insert({
      workspace_id:  workspaceId,
      description:   fields.description.trim(),
      category:      fields.category,
      amount:        Math.round(fields.amount * 100) / 100,
      currency:      fields.currency ?? 'BRL',
      billing_day:   billingDay,
      is_active:     fields.is_active ?? true,
      is_deductible: fields.is_deductible,
      notes:         fields.notes?.trim() || null,
    })
    .select()
    .single()

  if (error) {
    console.error('[fixed-costs/create]', error)
    return { success: false, error: 'Erro ao criar custo fixo.' }
  }

  revalidatePath('/fixed-costs')
  return { success: true, data }
}

// ─── TOGGLE is_active ─────────────────────────────────────────────────────────

export async function toggleFixedCost(
  id: string,
  isActive: boolean
): Promise<FixedCostActionResult> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { success: false, error: 'Não autorizado.' }

  const { data, error } = await supabase
    .from('fixed_costs')
    .update({ is_active: isActive })
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single()

  if (error) {
    console.error('[fixed-costs/toggle]', error)
    return { success: false, error: 'Erro ao atualizar custo fixo.' }
  }

  revalidatePath('/fixed-costs')
  return { success: true, data }
}

// ─── DELETE (soft) ────────────────────────────────────────────────────────────

export async function deleteFixedCost(id: string): Promise<FixedCostActionResult> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { success: false, error: 'Não autorizado.' }

  const { error } = await supabase
    .from('fixed_costs')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)

  if (error) {
    console.error('[fixed-costs/delete]', error)
    return { success: false, error: 'Erro ao excluir custo fixo.' }
  }

  revalidatePath('/fixed-costs')
  return { success: true }
}
