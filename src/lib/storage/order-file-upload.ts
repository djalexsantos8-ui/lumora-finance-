/**
 * Orquestra upload de 1 comprovante/arquivo para um Pedido.
 * Espelho de `job-file-upload.ts` para o domínio Pedidos.
 *
 * Fluxo:
 *   1. prepareJobFile(raw)    — valida/converte/comprime no browser (reaproveitado)
 *   2. supabase.storage.upload(path, blob) — direto ao bucket `order-files`
 *   3. addOrderFile({ storagePath, ... }) — server action insere order_files
 *   4. rollback: se a action falhar, removemos o binário órfão do bucket
 *
 * Path: {workspace_id}/{order_id}/{timestamp}-{rand}-{safe_name}
 */

import { createClient as createBrowserSupabase } from '@/lib/supabase/client'
import { addOrderFile } from '@/lib/actions/order-files'
import { prepareJobFile, sanitizeFileName } from '@/lib/storage/job-file-compress'
import type { OrderFile } from '@/types/order'

const BUCKET = 'order-files'

function randomToken(): string {
  // 8 chars base36 (~10 bits * 8 = 80 bits) — colisão virtualmente zero
  // dentro de um mesmo milissegundo.
  return Math.random().toString(36).slice(2, 10)
}

export async function uploadOrderFile(params: {
  workspaceId: string
  orderId:     string
  file:        File
}): Promise<
  | { success: true;  data: OrderFile }
  | { success: false; message: string }
> {
  // 1. Prepara (compressão genérica reaproveita o pipeline do job-file)
  let prepared
  try {
    prepared = await prepareJobFile(params.file)
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : 'Falha ao processar arquivo.' }
  }

  // 2. Define path e sobe no bucket
  const safeName    = sanitizeFileName(prepared.displayName)
  const timestamp   = Date.now()
  const token       = randomToken()
  const storagePath = `${params.workspaceId}/${params.orderId}/${timestamp}-${token}-${safeName}`

  const supabase = createBrowserSupabase()
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, prepared.file, {
      contentType: prepared.mimeType,
      upsert:      false,
      cacheControl: '3600',
    })

  if (upErr) {
    return { success: false, message: `Falha no upload: ${upErr.message}` }
  }

  // 3. Registra metadata
  const res = await addOrderFile({
    orderId:     params.orderId,
    storagePath,
    fileName:    prepared.displayName,
    mimeType:    prepared.mimeType,
    sizeBytes:   prepared.file.size,
  })

  if (!res.success) {
    // 4. Rollback — remove binário órfão
    await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {})
    return { success: false, message: res.message }
  }

  if (!res.data) {
    await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {})
    return { success: false, message: 'Falha ao registrar arquivo.' }
  }

  return { success: true, data: res.data }
}
