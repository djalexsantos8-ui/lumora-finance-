'use server'

import { revalidatePath } from 'next/cache'
import { createClient as createSupabase } from '@/lib/supabase/server'
import { getWorkspaceId } from '@/lib/utils/workspace'
import { getOrCreateClient } from './clients'
import type { Order, OrderActionResult, OrderStatus } from '@/types/order'

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

// ─── createOrderDraft ──────────────────────────────────────────────────────
//
// Cria pedido rascunho direto (status=in_progress, data=hoje) e devolve o id.
// O cliente faz o redirect — mesmo padrão de createFreelanceDraft.

export async function createOrderDraft(): Promise<
  | { success: true; id: string }
  | { success: false; message: string }
> {
  const auth = await requireAuth()
  if (!auth.ok) return { success: false, message: auth.message }

  const supabase = await createSupabase()
  const { data, error } = await supabase
    .from('orders')
    .insert({
      workspace_id: auth.workspaceId,
      created_by:   auth.userId,
      title:        'Pedido sem título',
      status:       'in_progress',
      order_date:   new Date().toISOString().slice(0, 10),
    })
    .select('id')
    .single()

  if (error || !data) {
    console.error('[orders/create-draft]', error)
    const detail = error ? `${error.code || '?'}: ${error.message || 'sem mensagem'}` : 'sem dados'
    return { success: false, message: `Erro ao criar pedido — ${detail}` }
  }

  revalidatePath('/pedidos')
  return { success: true, id: data.id }
}

// ─── listOrders ────────────────────────────────────────────────────────────

export async function listOrders(): Promise<Order[]> {
  const auth = await requireAuth()
  if (!auth.ok) return []

  const supabase = await createSupabase()
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('workspace_id', auth.workspaceId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('[orders/list]', error)
    return []
  }
  return (data ?? []) as Order[]
}

// ─── updateOrder ───────────────────────────────────────────────────────────

export async function updateOrder(
  id: string,
  fields: Partial<{
    title:         string
    client_id:     string | null
    client_name:   string | null
    order_date:    string
    delivery_date: string | null
    currency:      string
    amount:        number
    amount_paid:   number
    status:        OrderStatus
    notes:         string | null
  }>
): Promise<OrderActionResult> {
  const auth = await requireAuth()
  if (!auth.ok) return { success: false, message: auth.message }

  const supabase = await createSupabase()
  const payload: Record<string, unknown> = {}

  // Resolve cliente por nome — mesmo padrão de jobs/budgets.
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
    'order_date',
    'delivery_date',
    'currency',
    'amount',
    'amount_paid',
    'status',
    'notes',
  ] as const) {
    if (fields[k] !== undefined) payload[k] = fields[k]
  }

  if (Object.keys(payload).length === 0) {
    return { success: false, message: 'Nenhum campo para atualizar.' }
  }

  const { data, error } = await supabase
    .from('orders')
    .update(payload)
    .eq('id', id)
    .eq('workspace_id', auth.workspaceId)
    .is('deleted_at', null)
    .select('*')
    .single()

  if (error) {
    console.error('[orders/update]', error)
    return { success: false, message: 'Erro ao salvar pedido.' }
  }

  revalidatePath('/pedidos')
  revalidatePath(`/pedidos/${id}`)
  return { success: true, data: data as Order, client: resolvedClient ?? undefined }
}

// ─── deleteOrder ───────────────────────────────────────────────────────────

export async function deleteOrder(
  id: string
): Promise<{ success: boolean; message?: string }> {
  const auth = await requireAuth()
  if (!auth.ok) return { success: false, message: auth.message }

  const supabase = await createSupabase()
  const { error } = await supabase
    .from('orders')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('workspace_id', auth.workspaceId)
    .is('deleted_at', null)

  if (error) {
    console.error('[orders/delete]', error)
    return { success: false, message: 'Erro ao remover pedido.' }
  }

  revalidatePath('/pedidos')
  return { success: true }
}

// ─── bulkDeleteOrders ──────────────────────────────────────────────────────

export async function bulkDeleteOrders(
  ids: string[]
): Promise<{ success: boolean; count: number; message?: string }> {
  const auth = await requireAuth()
  if (!auth.ok) return { success: false, count: 0, message: auth.message }
  if (!ids || ids.length === 0) return { success: true, count: 0 }

  const supabase = await createSupabase()
  const { data, error } = await supabase
    .from('orders')
    .update({ deleted_at: new Date().toISOString() })
    .in('id', ids)
    .eq('workspace_id', auth.workspaceId)
    .is('deleted_at', null)
    .select('id')

  if (error) {
    console.error('[orders/bulk-delete]', error)
    return { success: false, count: 0, message: 'Erro ao excluir pedidos.' }
  }

  revalidatePath('/pedidos')
  return { success: true, count: data?.length ?? 0 }
}

// ─── getOrder ──────────────────────────────────────────────────────────────

export async function getOrder(id: string): Promise<Order | null> {
  const auth = await requireAuth()
  if (!auth.ok) return null

  const supabase = await createSupabase()
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('id', id)
    .eq('workspace_id', auth.workspaceId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) {
    console.error('[orders/get]', error)
    return null
  }
  return (data as Order) ?? null
}
