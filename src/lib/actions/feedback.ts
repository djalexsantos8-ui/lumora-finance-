'use server'

/**
 * Server actions do sistema de feedback de beta testers.
 *
 * Fluxo de submit:
 *  1. Client grava áudio local (MediaRecorder) ou digita texto
 *  2. Se houver áudio: upload direto ao bucket `feedback-audio` (RLS permite
 *     apenas na pasta {user_id}/) via SDK do browser.
 *  3. Client chama `submitFeedback` com o path (ou só texto).
 *  4. Server registra em `feedback` (RLS: user_id = auth.uid()).
 *  5. Em background (fire-and-forget), processFeedback faz transcrição +
 *     análise via OpenAI. Falha de IA não quebra o submit.
 *
 * Admin actions (updateStatus, createManualFeedback, trigger reprocess, delete)
 * exigem admin_grants ativo — checado aqui E pelas RLS do DB (defense in depth).
 */

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { checkAdmin } from '@/lib/auth/is-admin'
import { getWorkspaceId } from '@/lib/utils/workspace'
import { revalidatePath } from 'next/cache'
import { APP_VERSION } from '@/lib/app-version'
import { analyzeFeedback, isOpenAIEnabled } from '@/lib/feedback/analyze'
import { transcribeAudioBuffer } from '@/lib/feedback/transcribe'
import type {
  Feedback,
  FeedbackStatus,
  FeedbackUserType,
} from '@/types/feedback'

type Result<T = undefined> =
  | { ok: true;  id?: string; data?: T; message?: string }
  | { ok: false; error: string }

const MAX_TEXT_LEN  = 8000
const MAX_AUDIO_SEC = 300      // 5 min
const MAX_PER_DAY   = 50       // rate-limit por user/dia

// ─── submitFeedback (usuário autenticado) ────────────────────────────────────

export async function submitFeedback(input: {
  rawText?:          string | null
  audioPath?:        string | null
  audioMime?:        string | null
  audioDurationSec?: number | null
  attachmentPath?:   string | null
  attachmentFilename?: string | null
  attachmentMime?:   string | null
  attachmentSize?:   number | null
  userType?:         FeedbackUserType | null
  sourcePage?:       string | null
  userAgent?:        string | null
}): Promise<Result<{ feedbackId: string }>> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Não autenticado' }

    const rawText = (input.rawText ?? '').trim() || null

    // Validações
    if (!rawText && !input.audioPath) {
      return { ok: false, error: 'Envie texto ou áudio.' }
    }
    if (rawText && rawText.length > MAX_TEXT_LEN) {
      return { ok: false, error: `Texto muito longo (máx. ${MAX_TEXT_LEN} caracteres).` }
    }
    if (input.audioDurationSec && input.audioDurationSec > MAX_AUDIO_SEC) {
      return { ok: false, error: `Áudio muito longo (máx. ${MAX_AUDIO_SEC}s).` }
    }

    // Rate limit simples — usa admin client para contar mesmo com RLS
    const admin = createAdminClient()
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count } = await admin
      .from('feedback')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', since)

    if ((count ?? 0) >= MAX_PER_DAY) {
      return { ok: false, error: 'Limite diário atingido. Tenta amanhã.' }
    }

    // Se o áudio existe, valida que está na pasta do usuário (defense em profundidade)
    if (input.audioPath) {
      if (!input.audioPath.startsWith(`${user.id}/`)) {
        return { ok: false, error: 'Caminho de áudio inválido.' }
      }
    }

    // Mesma validação para attachment: o browser já uploadou via RLS; aqui é
    // defense in depth (cliente poderia forjar outro user_id no body).
    if (input.attachmentPath) {
      if (!input.attachmentPath.startsWith(`${user.id}/`)) {
        return { ok: false, error: 'Caminho de anexo inválido.' }
      }
      // Size sanity (5 MB). Cliente já valida, mas re-checamos pra não confiar.
      if (input.attachmentSize && input.attachmentSize > 5 * 1024 * 1024) {
        return { ok: false, error: 'Anexo muito grande (máx. 5 MB).' }
      }
    }

    const workspaceId = await getWorkspaceId(user.id)

    const { data: inserted, error } = await supabase
      .from('feedback')
      .insert({
        workspace_id:         workspaceId,
        user_id:              user.id,
        email:                user.email ?? null,
        source:               'user',
        source_page:          input.sourcePage?.slice(0, 500) ?? null,
        user_agent:           input.userAgent?.slice(0, 500) ?? null,
        app_version:          APP_VERSION,
        user_type:            input.userType ?? null,
        raw_text:             rawText,
        audio_path:           input.audioPath ?? null,
        audio_mime:           input.audioMime ?? null,
        audio_duration_sec:   input.audioDurationSec ?? null,
        attachment_path:      input.attachmentPath ?? null,
        attachment_filename:  input.attachmentFilename?.slice(0, 200) ?? null,
        attachment_mime:      input.attachmentMime?.slice(0, 80) ?? null,
        attachment_size_bytes: input.attachmentSize ?? null,
        // Se não houver OpenAI key, já marca como 'skipped' — transparente.
        transcription_status: input.audioPath
          ? (isOpenAIEnabled() ? 'pending' : 'skipped')
          : 'skipped',
        analysis_status:      isOpenAIEnabled() ? 'pending' : 'skipped',
      })
      .select('id')
      .single()

    if (error || !inserted) {
      console.error('[feedback/submit] insert error:', error)
      return { ok: false, error: 'Falha ao salvar feedback.' }
    }

    const feedbackId = inserted.id

    // Fire-and-forget: processamento async (transcribe + analyze)
    // Não usa await — retorna ack pro user imediato. Erros vão pra coluna.
    if (isOpenAIEnabled()) {
      void processFeedbackInternal(feedbackId).catch((e) => {
        console.warn('[feedback/process] background error:', e)
      })
    }

    revalidatePath('/admin/feedback')
    return { ok: true, id: feedbackId, data: { feedbackId } }
  } catch (err) {
    console.error('[feedback/submit] fatal:', err)
    return { ok: false, error: 'Erro inesperado ao enviar feedback.' }
  }
}

// ─── processFeedback (interno, chamado em background) ────────────────────────

async function processFeedbackInternal(feedbackId: string): Promise<void> {
  const admin = createAdminClient()

  const { data: fb, error } = await admin
    .from('feedback')
    .select('*')
    .eq('id', feedbackId)
    .single()

  if (error || !fb) {
    console.warn('[feedback/process] não encontrado:', feedbackId)
    return
  }

  let transcript: string | null = fb.transcript ?? null

  // 1. Transcrição (se tiver áudio e estiver pending)
  if (fb.audio_path && fb.transcription_status === 'pending') {
    try {
      const { data: blob, error: dlErr } = await admin.storage
        .from('feedback-audio')
        .download(fb.audio_path)

      if (dlErr || !blob) {
        await admin.from('feedback').update({
          transcription_status: 'failed',
          transcription_error:  dlErr?.message ?? 'download falhou',
        }).eq('id', feedbackId)
      } else {
        const ab = await blob.arrayBuffer()
        const text = await transcribeAudioBuffer(
          ab,
          fb.audio_mime || 'audio/webm',
          'feedback.webm',
        )
        transcript = text
        await admin.from('feedback').update({
          transcript:           text,
          transcription_status: 'completed',
          transcription_error:  null,
        }).eq('id', feedbackId)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'erro desconhecido'
      await admin.from('feedback').update({
        transcription_status: 'failed',
        transcription_error:  msg.slice(0, 500),
      }).eq('id', feedbackId)
    }
  }

  // 2. Análise (se analysis pending e tiver conteúdo)
  if (fb.analysis_status === 'pending' && (fb.raw_text || transcript)) {
    try {
      const analysis = await analyzeFeedback({
        rawText:            fb.raw_text,
        transcript:         transcript,
        userDeclaredType:   fb.user_type,
        sourcePage:         fb.source_page,
        email:              fb.email,
        userAgent:          fb.user_agent,
        attachmentFilename: fb.attachment_filename,
        attachmentMime:     fb.attachment_mime,
      })

      await admin.from('feedback').update({
        analysis:           analysis,
        analysis_status:    'completed',
        analysis_error:     null,
        ai_type:            analysis.tipo,
        severity:           analysis.severidade,
        priority_score:     analysis.priority_score,
        summary:            analysis.resumo,
        tags:               analysis.tags,
        prompt_cloud_code:  analysis.prompt_cloud_code,
      }).eq('id', feedbackId)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'erro desconhecido'
      await admin.from('feedback').update({
        analysis_status: 'failed',
        analysis_error:  msg.slice(0, 500),
      }).eq('id', feedbackId)
    }
  }
}

/** Admin-only: reprocessa um feedback (usa OpenAI de novo). */
export async function reprocessFeedback(id: string): Promise<Result> {
  const a = await checkAdmin()
  if (!a.isAdmin) return { ok: false, error: 'Acesso negado' }
  if (!isOpenAIEnabled()) return { ok: false, error: 'OpenAI não configurada.' }
  if (!id) return { ok: false, error: 'ID inválido' }

  const admin = createAdminClient()
  await admin.from('feedback').update({
    transcription_status: 'pending',
    analysis_status:      'pending',
    transcription_error:  null,
    analysis_error:       null,
  }).eq('id', id)

  await processFeedbackInternal(id)

  revalidatePath('/admin/feedback')
  revalidatePath(`/admin/feedback/${id}`)
  return { ok: true, message: 'Reprocessado' }
}

// ─── Admin actions ───────────────────────────────────────────────────────────

export async function updateFeedbackStatus(
  id: string,
  status: FeedbackStatus,
  adminNotes?: string | null,
): Promise<Result> {
  const a = await checkAdmin()
  if (!a.isAdmin) return { ok: false, error: 'Acesso negado' }
  if (!id) return { ok: false, error: 'ID inválido' }

  const allowed: FeedbackStatus[] = [
    'novo', 'triagem', 'planejado', 'em_andamento', 'resolvido', 'descartado',
  ]
  if (!allowed.includes(status)) return { ok: false, error: 'Status inválido' }

  const admin = createAdminClient()
  const patch: Record<string, unknown> = { status }
  if (typeof adminNotes === 'string') patch.admin_notes = adminNotes.slice(0, 5000)

  const { error } = await admin.from('feedback').update(patch).eq('id', id)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/feedback')
  revalidatePath(`/admin/feedback/${id}`)
  return { ok: true }
}

export async function deleteFeedback(id: string): Promise<Result> {
  const a = await checkAdmin()
  if (!a.isAdmin) return { ok: false, error: 'Acesso negado' }
  if (!id) return { ok: false, error: 'ID inválido' }

  // Soft delete
  const admin = createAdminClient()
  const { error } = await admin
    .from('feedback')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/feedback')
  return { ok: true, message: 'Feedback arquivado' }
}

export async function createManualFeedback(input: {
  rawText:   string
  userType?: FeedbackUserType | null
  email?:    string | null
  sourcePage?: string | null
}): Promise<Result<{ feedbackId: string }>> {
  const a = await checkAdmin()
  if (!a.isAdmin) return { ok: false, error: 'Acesso negado' }

  const raw = (input.rawText || '').trim()
  if (!raw) return { ok: false, error: 'Texto obrigatório' }
  if (raw.length > MAX_TEXT_LEN) return { ok: false, error: 'Texto muito longo' }

  const admin = createAdminClient()
  const { data: inserted, error } = await admin
    .from('feedback')
    .insert({
      source:           'admin_manual',
      email:            input.email ?? null,
      raw_text:         raw,
      user_type:        input.userType ?? null,
      source_page:      input.sourcePage ?? null,
      app_version:      APP_VERSION,
      created_by_admin: true,
      transcription_status: 'skipped',
      analysis_status:  isOpenAIEnabled() ? 'pending' : 'skipped',
    })
    .select('id')
    .single()

  if (error || !inserted) return { ok: false, error: error?.message ?? 'Falha ao criar' }

  if (isOpenAIEnabled()) {
    void processFeedbackInternal(inserted.id).catch((e) =>
      console.warn('[feedback/manual] background error:', e),
    )
  }

  revalidatePath('/admin/feedback')
  return { ok: true, id: inserted.id, data: { feedbackId: inserted.id } }
}

/** Admin: gera URL assinada temporária pra abrir o attachment. */
export async function getFeedbackAttachmentSignedUrl(id: string): Promise<Result<{ url: string; mime: string | null; filename: string | null }>> {
  const a = await checkAdmin()
  if (!a.isAdmin) return { ok: false, error: 'Acesso negado' }
  if (!id) return { ok: false, error: 'ID inválido' }

  const admin = createAdminClient()
  const { data: fb, error } = await admin
    .from('feedback')
    .select('attachment_path, attachment_mime, attachment_filename')
    .eq('id', id)
    .single()

  if (error || !fb?.attachment_path) return { ok: false, error: 'Sem anexo' }

  const { data: signed, error: signErr } = await admin.storage
    .from('feedback-attachments')
    .createSignedUrl(fb.attachment_path, 60 * 15) // 15 min

  if (signErr || !signed?.signedUrl) return { ok: false, error: 'Falha ao assinar URL' }

  return {
    ok: true,
    data: {
      url:      signed.signedUrl,
      mime:     fb.attachment_mime,
      filename: fb.attachment_filename,
    },
  }
}

/** Admin: gera URL assinada temporária pra tocar o áudio. */
export async function getFeedbackAudioSignedUrl(id: string): Promise<Result<{ url: string }>> {
  const a = await checkAdmin()
  if (!a.isAdmin) return { ok: false, error: 'Acesso negado' }
  if (!id) return { ok: false, error: 'ID inválido' }

  const admin = createAdminClient()
  const { data: fb, error } = await admin
    .from('feedback')
    .select('audio_path')
    .eq('id', id)
    .single()

  if (error || !fb?.audio_path) return { ok: false, error: 'Sem áudio' }

  const { data: signed, error: signErr } = await admin.storage
    .from('feedback-audio')
    .createSignedUrl(fb.audio_path, 60 * 10) // 10 min

  if (signErr || !signed?.signedUrl) return { ok: false, error: 'Falha ao assinar URL' }

  return { ok: true, data: { url: signed.signedUrl } }
}

/** Lista de feedback para admin (com filtros). Usa admin client pq RLS já permitiria, mas garante isolamento de erros. */
export async function listFeedbackAdmin(filter?: {
  status?:      FeedbackStatus
  severity?:    string
  search?:      string
  limit?:       number
}): Promise<Result<{ items: Feedback[] }>> {
  const a = await checkAdmin()
  if (!a.isAdmin) return { ok: false, error: 'Acesso negado' }

  const admin = createAdminClient()
  let q = admin
    .from('feedback')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(filter?.limit ?? 200)

  if (filter?.status)   q = q.eq('status',   filter.status)
  if (filter?.severity) q = q.eq('severity', filter.severity)
  if (filter?.search) {
    const s = filter.search.replace(/[%_]/g, '')
    q = q.or(`raw_text.ilike.%${s}%,transcript.ilike.%${s}%,summary.ilike.%${s}%`)
  }

  const { data, error } = await q
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: { items: (data ?? []) as Feedback[] } }
}
