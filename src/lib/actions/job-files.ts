'use server'

/**
 * Server actions para metadata de arquivos anexos a jobs.
 *
 * Upload do binário NÃO passa por aqui: o client sobe direto no Storage via
 * supabase-js (isolamento por workspace garantido pela storage policy).
 *
 * Aqui fazemos as operações de metadata:
 *   · addJobFile — registra row em job_files após o upload do binário
 *   · deleteJobFile — remove binário do bucket + soft-delete na tabela
 *   · createJobFileSignedUrl — gera URL assinada (1h) pra visualização/download
 *
 * Todas verificam ownership do workspace via getWorkspaceId(auth.uid()).
 */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getWorkspaceId } from '@/lib/utils/workspace'
import {
  JOB_FILE_MIME_WHITELIST,
  JOB_FILE_MAX_FINAL_BYTES,
  type JobFile,
  type JobFileActionResult,
  type JobFileMime,
} from '@/types/job-file'

const BUCKET = 'job-files'

// ─── addJobFile ───────────────────────────────────────────────────────────────
//
// Chamado pelo client DEPOIS do upload direto do binário ao Storage.
// Grava a row de metadata. Se falhar, o client deve chamar um cleanup que
// remove o binário órfão do bucket.

export async function addJobFile(input: {
  jobId:        string
  storagePath:  string
  fileName:     string
  mimeType:     string
  sizeBytes:    number
}): Promise<JobFileActionResult> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { success: false, message: 'Não autorizado.' }

  const workspaceId = await getWorkspaceId(user.id)
  if (!workspaceId) return { success: false, message: 'Workspace não encontrado.' }

  // Validações defensivas (o client já valida, mas nunca confie no client)
  if (!JOB_FILE_MIME_WHITELIST.includes(input.mimeType as JobFileMime)) {
    return { success: false, message: `Tipo de arquivo não suportado (${input.mimeType}).` }
  }
  if (input.sizeBytes <= 0 || input.sizeBytes > JOB_FILE_MAX_FINAL_BYTES) {
    return { success: false, message: 'Tamanho de arquivo fora do limite.' }
  }
  if (!input.fileName.trim()) {
    return { success: false, message: 'Nome do arquivo é obrigatório.' }
  }
  // O path deve começar com o workspace_id (convenção da storage policy)
  if (!input.storagePath.startsWith(`${workspaceId}/${input.jobId}/`)) {
    return { success: false, message: 'Caminho de storage inválido.' }
  }

  // Confirma que o job pertence ao workspace (defense in depth — RLS já cobre)
  const { data: job } = await supabase
    .from('jobs')
    .select('id, workspace_id')
    .eq('id', input.jobId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!job) return { success: false, message: 'Job não encontrado.' }

  const { data, error } = await supabase
    .from('job_files')
    .insert({
      workspace_id: workspaceId,
      job_id:       input.jobId,
      uploaded_by:  user.id,
      storage_path: input.storagePath,
      file_name:    input.fileName.trim().slice(0, 200),
      mime_type:    input.mimeType,
      size_bytes:   input.sizeBytes,
    })
    .select('*')
    .single()

  if (error) {
    return { success: false, message: `Erro ao salvar arquivo: ${error.message}` }
  }

  revalidatePath(`/freelances/${input.jobId}`)
  return { success: true, data: data as JobFile }
}

// ─── deleteJobFile ────────────────────────────────────────────────────────────
//
// Remove o binário do bucket E marca deleted_at na tabela. Se o remove do
// storage falhar, ainda assim soft-deletamos a row (o binário órfão pode ser
// limpo por vacuum futuro). O importante é sumir da UI.

export async function deleteJobFile(
  fileId: string
): Promise<JobFileActionResult> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { success: false, message: 'Não autorizado.' }

  const workspaceId = await getWorkspaceId(user.id)
  if (!workspaceId) return { success: false, message: 'Workspace não encontrado.' }

  const { data: file } = await supabase
    .from('job_files')
    .select('*')
    .eq('id', fileId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!file) return { success: false, message: 'Arquivo não encontrado.' }

  // 1. Remove binário (best-effort)
  await supabase.storage.from(BUCKET).remove([file.storage_path])

  // 2. Soft-delete metadata
  const { error } = await supabase
    .from('job_files')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', fileId)

  if (error) return { success: false, message: `Erro ao remover: ${error.message}` }

  revalidatePath(`/freelances/${file.job_id}`)
  return { success: true }
}

// ─── createJobFileSignedUrl ───────────────────────────────────────────────────
//
// Gera URL assinada com TTL de 1h para visualização/download no browser.
// Chamada sob demanda (quando o usuário clica em "abrir" ou "baixar").

export async function createJobFileSignedUrl(
  fileId: string
): Promise<{ success: true; url: string } | { success: false; message: string }> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { success: false, message: 'Não autorizado.' }

  const workspaceId = await getWorkspaceId(user.id)
  if (!workspaceId) return { success: false, message: 'Workspace não encontrado.' }

  const { data: file } = await supabase
    .from('job_files')
    .select('storage_path')
    .eq('id', fileId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!file) return { success: false, message: 'Arquivo não encontrado.' }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(file.storage_path, 3600) // 1 hora

  if (error || !data?.signedUrl) {
    return { success: false, message: `Erro ao gerar URL: ${error?.message ?? 'desconhecido'}` }
  }

  return { success: true, url: data.signedUrl }
}
