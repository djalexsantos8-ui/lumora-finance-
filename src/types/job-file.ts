// ─── Job File — arquivo anexo a um freelance ─────────────────────────────────
//
// Persiste metadata (source of truth pra listagem). O binário vive em
// Supabase Storage no bucket `job-files` em {workspace_id}/{job_id}/{name}.

export const JOB_FILE_MIME_WHITELIST = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
] as const

export type JobFileMime = (typeof JOB_FILE_MIME_WHITELIST)[number]

/** Limite do arquivo FINAL (após compressão/conversão). */
export const JOB_FILE_MAX_FINAL_BYTES = 10 * 1024 * 1024 // 10MB

/** Limite do arquivo de ENTRADA (antes de conversão — protege memória do browser). */
export const JOB_FILE_MAX_INPUT_BYTES = 50 * 1024 * 1024 // 50MB

export interface JobFile {
  id:            string
  workspace_id:  string
  job_id:        string
  uploaded_by:   string
  storage_path:  string   // path completo no bucket
  file_name:     string   // nome legível (display)
  mime_type:     JobFileMime
  size_bytes:    number
  created_at:    string
  deleted_at:    string | null
}

export type JobFileActionResult =
  | { success: true;  data?: JobFile }
  | { success: false; message: string }
