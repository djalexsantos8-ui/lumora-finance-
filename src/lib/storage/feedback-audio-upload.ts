import { createClient } from '@/lib/supabase/client'

/**
 * Upload direto do browser para o bucket `feedback-audio`.
 * RLS exige que o path comece com `{user_id}/`.
 *
 * Retorna o path salvo (para salvar no registro do feedback via submitFeedback).
 */
export async function uploadFeedbackAudio(
  blob: Blob,
  userId: string,
  mime: string = 'audio/webm',
): Promise<{ path: string } | { error: string }> {
  const supabase = createClient()

  const ext = mime.includes('mp4')   ? 'mp4'
            : mime.includes('mpeg')  ? 'mp3'
            : mime.includes('ogg')   ? 'ogg'
            : mime.includes('wav')   ? 'wav'
            : 'webm'

  const stamp = Date.now()
  const rand = Math.random().toString(36).slice(2, 8)
  const path = `${userId}/${stamp}-${rand}.${ext}`

  const { error } = await supabase.storage
    .from('feedback-audio')
    .upload(path, blob, {
      contentType: mime,
      upsert:      false,
    })

  if (error) return { error: error.message }
  return { path }
}
