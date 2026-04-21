'use server'

import { revalidatePath } from 'next/cache'
import { createClient as createSupabase } from '@/lib/supabase/server'
import { getWorkspaceId } from '@/lib/utils/workspace'
import { getOrCreateClient } from './clients'
import type {
  RecurringRevenue,
  RecurringRevenueActionResult,
  RecurringFrequency,
  RecurringStatus,
} from '@/types/recurring-revenue'

// ─── helpers ───────────────────────────────────────────────────────────────

async function requireAuth(): Promise<
  | { ok: true; userId: string; workspaceId: string }
  | { ok: false; message: string }
> {
  const supabase = await createSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: 'Não autorizado.' }

  const workspaceId = await getWorkspaceId(user.id)
  if (!workspaceId) return { ok: false, message: 'Workspace não encontrado.' }

  return { ok: true, userId: user.id, workspaceId }
}

// ─── createRecurringRevenueDraft ───────────────────────────────────────────

export async function createRecurringRevenueDraft(): Promise<
  | { success: true; id: string }
  | { success: false; message: string }
> {
  const auth = await requireAuth()
  if (!auth.ok) return { success: false, message: auth.message }

  const supabase = await createSupabase()
  const { data, error } = await supabase
    .from('recurring_revenue')
    .insert({
      workspace_id: auth.workspaceId,
      created_by:   auth.userId,
      title:        'Receita sem título',
      status:       'active',
      frequency:    'monthly',
    })
    .select('id')
    .single()

  if (error || !data) {
    console.error('[recurring-revenue/create-draft]', error)
    return { success: false, message: 'Erro ao criar receita recorrente.' }
  }

  revalidatePath('/receitas-recorrentes')
  return { success: true, id: data.id }
}

// ─── listRecurringRevenue ──────────────────────────────────────────────────

export async function listRecurringRevenue(): Promise<RecurringRevenue[]> {
  const auth = await requireAuth()
  if (!auth.ok) return []

  const supabase = await createSupabase()
  const { data, error } = await supabase
    .from('recurring_revenue')
    .select('*')
    .eq('workspace_id', auth.workspaceId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('[recurring-revenue/list]', error)
    return []
  }
  return (data ?? []) as RecurringRevenue[]
}

// ─── updateRecurringRevenue ────────────────────────────────────────────────

export async function updateRecurringRevenue(
  id: string,
  fields: Partial<{
    title:            string
    client_id:        string | null
    client_name:      string | null
    segment:          string | null
    delivery_type:    string | null
    has_video:        boolean
    has_photo:        boolean
    has_social:       boolean
    currency:         string
    amount:           number
    frequency:        RecurringFrequency
    billing_day:      number | null
    next_delivery_at: string | null
    next_billing_at:  string | null
    status:           RecurringStatus
    notes:            string | null
    started_at:       string
    cancelled_at:     string | null
  }>
): Promise<RecurringRevenueActionResult> {
  const auth = await requireAuth()
  if (!auth.ok) return { success: false, message: auth.message }

  const supabase = await createSupabase()
  const payload: Record<string, unknown> = {}

  let resolvedClient = null
  if (fields.client_name !== undefined) {
    const raw = (fields.client_name ?? '').trim()
    if (raw) {
      const client = await getOrCreateClient(auth.workspaceId, raw)
      if (client) {
        payload.client_id   = client.id
        payload.client_name = client.name
        resolvedClient = client
      } else {
        payload.client_name = raw
      }
    } else {
      payload.client_id   = null
      payload.client_name = ''
    }
  }

  if (fields.client_id !== undefined && fields.client_name === undefined) {
    payload.client_id = fields.client_id
  }

  for (const k of [
    'title',
    'segment',
    'delivery_type',
    'has_video',
    'has_photo',
    'has_social',
    'currency',
    'amount',
    'frequency',
    'billing_day',
    'next_delivery_at',
    'next_billing_at',
    'status',
    'notes',
    'started_at',
    'cancelled_at',
  ] as const) {
    if (fields[k] !== undefined) payload[k] = fields[k]
  }

  if (Object.keys(payload).length === 0) {
    return { success: false, message: 'Nenhum campo para atualizar.' }
  }

  const { data, error } = await supabase
    .from('recurring_revenue')
    .update(payload)
    .eq('id', id)
    .eq('workspace_id', auth.workspaceId)
    .is('deleted_at', null)
    .select('*')
    .single()

  if (error) {
    console.error('[recurring-revenue/update]', error)
    return { success: false, message: 'Erro ao salvar receita recorrente.' }
  }

  revalidatePath('/receitas-recorrentes')
  revalidatePath(`/receitas-recorrentes/${id}`)
  return {
    success: true,
    data: data as RecurringRevenue,
    client: resolvedClient ?? undefined,
  }
}

// ─── deleteRecurringRevenue ────────────────────────────────────────────────

export async function deleteRecurringRevenue(
  id: string
): Promise<{ success: boolean; message?: string }> {
  const auth = await requireAuth()
  if (!auth.ok) return { success: false, message: auth.message }

  const supabase = await createSupabase()
  const { error } = await supabase
    .from('recurring_revenue')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('workspace_id', auth.workspaceId)
    .is('deleted_at', null)

  if (error) {
    console.error('[recurring-revenue/delete]', error)
    return { success: false, message: 'Erro ao remover receita recorrente.' }
  }

  revalidatePath('/receitas-recorrentes')
  return { success: true }
}

// ─── bulkDeleteRecurringRevenue ────────────────────────────────────────────

export async function bulkDeleteRecurringRevenue(
  ids: string[]
): Promise<{ success: boolean; count: number; message?: string }> {
  const auth = await requireAuth()
  if (!auth.ok) return { success: false, count: 0, message: auth.message }
  if (!ids || ids.length === 0) return { success: true, count: 0 }

  const supabase = await createSupabase()
  const { data, error } = await supabase
    .from('recurring_revenue')
    .update({ deleted_at: new Date().toISOString() })
    .in('id', ids)
    .eq('workspace_id', auth.workspaceId)
    .is('deleted_at', null)
    .select('id')

  if (error) {
    console.error('[recurring-revenue/bulk-delete]', error)
    return { success: false, count: 0, message: 'Erro ao excluir receitas.' }
  }

  revalidatePath('/receitas-recorrentes')
  return { success: true, count: data?.length ?? 0 }
}

// ─── getRecurringRevenue ───────────────────────────────────────────────────

export async function getRecurringRevenue(
  id: string
): Promise<RecurringRevenue | null> {
  const auth = await requireAuth()
  if (!auth.ok) return null

  const supabase = await createSupabase()
  const { data, error } = await supabase
    .from('recurring_revenue')
    .select('*')
    .eq('id', id)
    .eq('workspace_id', auth.workspaceId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) {
    console.error('[recurring-revenue/get]', error)
    return null
  }
  return (data as RecurringRevenue) ?? null
}
