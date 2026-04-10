'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getWorkspaceId } from '@/lib/utils/workspace'
import type { ActionResult, FreelancerRole } from '@/types/freelancer'

function parseRate(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.,]/g, '').replace(',', '.')
  const val = parseFloat(cleaned)
  return isNaN(val) || val < 0 ? null : Math.round(val * 100) / 100
}

// ─── CREATE ──────────────────────────────────────────────────────────────────

export async function createFreelancer(
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()

  if (authErr || !user) return { success: false, message: 'Não autorizado.' }

  const workspaceId = await getWorkspaceId(user.id)
  if (!workspaceId) return { success: false, message: 'Workspace não encontrado.' }

  const name = (formData.get('name') as string | null)?.trim() ?? ''
  const role = (formData.get('role') as FreelancerRole | null) ?? 'other'
  const dailyRateRaw = (formData.get('daily_rate') as string | null) ?? ''
  const currency = (formData.get('currency') as string | null) ?? 'BRL'
  const notes = (formData.get('notes') as string | null)?.trim() ?? ''

  if (!name) return { success: false, message: 'Nome é obrigatório.' }
  if (name.length > 120) return { success: false, message: 'Nome muito longo (máx. 120 caracteres).' }

  const dailyRate = dailyRateRaw ? parseRate(dailyRateRaw) : null

  const { data, error } = await supabase
    .from('freelancers')
    .insert({
      workspace_id: workspaceId,
      created_by: user.id,
      name,
      role,
      daily_rate: dailyRate,
      currency,
      notes: notes || null,
    })
    .select()
    .single()

  if (error) {
    console.error('[freelancers/create]', error)
    return { success: false, message: 'Erro ao criar profissional.' }
  }

  revalidatePath('/budgets/freelancers')
  return { success: true, data }
}

// ─── UPDATE ──────────────────────────────────────────────────────────────────

export async function updateFreelancer(
  id: string,
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()

  if (authErr || !user) return { success: false, message: 'Não autorizado.' }

  const name = (formData.get('name') as string | null)?.trim() ?? ''
  const role = (formData.get('role') as FreelancerRole | null) ?? 'other'
  const dailyRateRaw = (formData.get('daily_rate') as string | null) ?? ''
  const currency = (formData.get('currency') as string | null) ?? 'BRL'
  const notes = (formData.get('notes') as string | null)?.trim() ?? ''

  if (!name) return { success: false, message: 'Nome é obrigatório.' }
  if (name.length > 120) return { success: false, message: 'Nome muito longo (máx. 120 caracteres).' }

  const dailyRate = dailyRateRaw ? parseRate(dailyRateRaw) : null

  // RLS garante que só membros do workspace podem atualizar
  const { data, error } = await supabase
    .from('freelancers')
    .update({
      name,
      role,
      daily_rate: dailyRate,
      currency,
      notes: notes || null,
    })
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single()

  if (error) {
    console.error('[freelancers/update]', error)
    return { success: false, message: 'Erro ao atualizar profissional.' }
  }

  revalidatePath('/budgets/freelancers')
  return { success: true, data }
}

// ─── SOFT DELETE ──────────────────────────────────────────────────────────────

export async function deleteFreelancer(id: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()

  if (authErr || !user) return { success: false, message: 'Não autorizado.' }

  // Soft delete: apenas preenche deleted_at
  // RLS garante workspace correto
  const { error } = await supabase
    .from('freelancers')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)

  if (error) {
    console.error('[freelancers/delete]', error)
    return { success: false, message: 'Erro ao remover profissional.' }
  }

  revalidatePath('/budgets/freelancers')
  return { success: true }
}
