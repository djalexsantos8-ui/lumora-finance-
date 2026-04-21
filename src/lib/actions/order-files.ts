'use server'

/**
 * Server actions para metadata de arquivos anexos a pedidos.
 * Mesma arquitetura de job-files: upload direto do client ao Storage,
 * metadata registrada aqui. Bucket: `order-files` (isolamento por workspace).
 */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getWorkspaceId } from '@/lib/utils/workspace'
import type { OrderFile } from '@/types/order'

const BUCKET = 'order-files'

export const ORDER_FILE_MIME_WHITELIST = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/webp',
] as const

export type OrderFileMime = (typeof ORDER_FILE_MIME_WHITELIST)[number]

export const ORDER_FILE_MAX_FINAL_BYTES = 10 * 1024 * 1024   // 10 MB
export const ORDER_FILE_MAX_INPUT_BYTES = 50 * 1024 * 1024   // 50 MB

export type OrderFileActionResult =
  | { success: true; data?: OrderFile }
  | { success: false; message: string }

function isTableMissing(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null | undefined
  return e?.code === '42P01' || !!e?.message?.includes('does not exist')
}

// ─── listOrderFiles ──────────────────────────────────────────────────────────

export async function listOrderFiles(orderId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('order_files')
    .select('*')
    .eq('order_id', orderId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) {
    if (isTableMissing(error)) return { files: [], tableMissing: true as const }
    console.error('[order-files/list]', error)
    return { files: [], tableMissing: false as const }
  }
  return { files: (data ?? []) as OrderFile[], tableMissing: false as const }
}

// ─── addOrderFile ────────────────────────────────────────────────────────────

export async function addOrderFile(input: {
  orderId:     string
  storagePath: string
  fileName:    string
  mimeType:    string
  sizeBytes:   number
}): Promise<OrderFileActionResult> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { success: false, message: 'Não autorizado.' }

  const workspaceId = await getWorkspaceId(user.id)
  if (!workspaceId) return { success: false, message: 'Workspace não encontrado.' }

  if (!ORDER_FILE_MIME_WHITELIST.includes(input.mimeType as OrderFileMime)) {
    return { success: false, message: `Tipo de arquivo não suportado (${input.mimeType}).` }
  }
  if (input.sizeBytes <= 0 || input.sizeBytes > ORDER_FILE_MAX_FINAL_BYTES) {
    return { success: false, message: 'Tamanho de arquivo fora do limite.' }
  }
  if (!input.fileName.trim()) {
    return { success: false, message: 'Nome do arquivo é obrigatório.' }
  }
  if (!input.storagePath.startsWith(`${workspaceId}/${input.orderId}/`)) {
    return { success: false, message: 'Caminho de storage inválido.' }
  }

  // Confirma que o pedido pertence ao workspace
  const { data: order } = await supabase
    .from('orders')
    .select('id, workspace_id')
    .eq('id', input.orderId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!order) return { success: false, message: 'Pedido não encontrado.' }

  const { data, error } = await supabase
    .from('order_files')
    .insert({
      workspace_id: workspaceId,
      order_id:     input.orderId,
      uploaded_by:  user.id,
      storage_path: input.storagePath,
      file_name:    input.fileName.trim().slice(0, 200),
      mime_type:    input.mimeType,
      size_bytes:   input.sizeBytes,
    })
    .select('*')
    .single()

  if (error) {
    if (isTableMissing(error)) {
      return { success: false, message: 'Migration de pedidos pendente. Aplique 20260421040000_orders_full_schema.sql.' }
    }
    return { success: false, message: `Erro ao salvar arquivo: ${error.message}` }
  }

  revalidatePath(`/pedidos/${input.orderId}`)
  return { success: true, data: data as OrderFile }
}

// ─── deleteOrderFile ─────────────────────────────────────────────────────────

export async function deleteOrderFile(
  fileId: string
): Promise<OrderFileActionResult> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { success: false, message: 'Não autorizado.' }

  const workspaceId = await getWorkspaceId(user.id)
  if (!workspaceId) return { success: false, message: 'Workspace não encontrado.' }

  const { data: file } = await supabase
    .from('order_files')
    .select('*')
    .eq('id', fileId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!file) return { success: false, message: 'Arquivo não encontrado.' }

  await supabase.storage.from(BUCKET).remove([file.storage_path])

  const { error } = await supabase
    .from('order_files')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', fileId)

  if (error) return { success: false, message: `Erro ao remover: ${error.message}` }

  revalidatePath(`/pedidos/${file.order_id}`)
  return { success: true }
}

// ─── createOrderFileSignedUrl ────────────────────────────────────────────────

export async function createOrderFileSignedUrl(
  fileId: string
): Promise<{ success: true; url: string } | { success: false; message: string }> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { success: false, message: 'Não autorizado.' }

  const workspaceId = await getWorkspaceId(user.id)
  if (!workspaceId) return { success: false, message: 'Workspace não encontrado.' }

  const { data: file } = await supabase
    .from('order_files')
    .select('storage_path')
    .eq('id', fileId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!file) return { success: false, message: 'Arquivo não encontrado.' }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(file.storage_path, 3600)

  if (error || !data?.signedUrl) {
    return { success: false, message: `Erro ao gerar URL: ${error?.message ?? 'desconhecido'}` }
  }

  return { success: true, url: data.signedUrl }
}
