import { createClient } from '@/lib/supabase/client'

/**
 * Upload direto do browser para o bucket `feedback-attachments`.
 * RLS exige que o path comece com `{user_id}/`.
 *
 * Limites aplicados client-side (servidor re-valida via action):
 *  - Size: 5 MB
 *  - MIME: image/* (png, jpg, webp, gif, heic, heif), application/pdf
 *
 * Retorna o path salvo + metadados para persistir no registro do feedback.
 */

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024 // 5 MB

export const ALLOWED_ATTACHMENT_MIMES = new Set<string>([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'application/pdf',
])

export function isAttachmentMimeAllowed(mime: string | null | undefined): boolean {
  if (!mime) return false
  return ALLOWED_ATTACHMENT_MIMES.has(mime.toLowerCase())
}

export type UploadedAttachment = {
  path:     string
  filename: string
  mime:     string
  size:     number
}

export async function uploadFeedbackAttachment(
  file: File,
  userId: string,
): Promise<UploadedAttachment | { error: string }> {
  if (!file) return { error: 'Arquivo inválido' }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { error: `Arquivo muito grande (máx. 5 MB). O seu tem ${(file.size / 1024 / 1024).toFixed(1)} MB.` }
  }
  const mime = (file.type || 'application/octet-stream').toLowerCase()
  if (!isAttachmentMimeAllowed(mime)) {
    return { error: 'Tipo não suportado. Use imagem (PNG/JPG/WEBP/GIF/HEIC) ou PDF.' }
  }

  const supabase = createClient()

  const ext =
    mime === 'image/png'    ? 'png'  :
    mime === 'image/jpeg' ||
    mime === 'image/jpg'    ? 'jpg'  :
    mime === 'image/webp'   ? 'webp' :
    mime === 'image/gif'    ? 'gif'  :
    mime === 'image/heic'   ? 'heic' :
    mime === 'image/heif'   ? 'heif' :
    mime === 'application/pdf' ? 'pdf' :
    'bin'

  const stamp = Date.now()
  const rand  = Math.random().toString(36).slice(2, 8)
  const path  = `${userId}/${stamp}-${rand}.${ext}`

  const { error } = await supabase.storage
    .from('feedback-attachments')
    .upload(path, file, {
      contentType: mime,
      upsert:      false,
    })

  if (error) return { error: error.message }

  return {
    path,
    filename: safeFilename(file.name) || `anexo.${ext}`,
    mime,
    size:     file.size,
  }
}

function safeFilename(name: string): string {
  return name
    .replace(/[^\w\-. áéíóúãõâêîôûç]/gi, '')
    .slice(0, 120)
    .trim()
}
