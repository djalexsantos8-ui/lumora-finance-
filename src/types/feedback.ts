/**
 * Tipos do sistema de feedback de beta testers.
 *
 * Fluxo:
 *  user → submitFeedback (texto ou áudio)
 *       → upload áudio no bucket `feedback-audio`
 *       → registro em `feedback` com analysis_status='pending'
 *       → background: transcribe (Whisper) + analyze (gpt-4o-mini + json_schema)
 *       → admin vê em /admin/feedback
 */

export type FeedbackSource = 'user' | 'admin_manual'

/** Tipo declarado pelo usuário (opcional). A IA pode reclassificar em `ai_type`. */
export type FeedbackUserType =
  | 'bug'
  | 'ux'
  | 'melhoria'
  | 'duvida'
  | 'elogio'
  | 'outro'

export type FeedbackAiType =
  | 'bug'
  | 'ux'
  | 'melhoria'
  | 'duvida'
  | 'irrelevante'
  | 'outro'

export type FeedbackSeverity = 'critica' | 'alta' | 'media' | 'baixa'

export type FeedbackUrgency = 'agora' | 'essa_semana' | 'esse_mes' | 'algum_dia'

export type FeedbackStatus =
  | 'novo'
  | 'triagem'
  | 'planejado'
  | 'em_andamento'
  | 'resolvido'
  | 'descartado'

export type FeedbackBucket = 'agora' | 'depois' | 'aguardar'

export type JobStatus = 'pending' | 'completed' | 'failed' | 'skipped'

/** Resultado estruturado da análise via LLM. Espelha o json_schema em analyze.ts. */
export interface FeedbackAnalysis {
  resumo: string
  tipo: FeedbackAiType
  severidade: FeedbackSeverity
  urgencia: FeedbackUrgency
  area_afetada: string
  explicacao_humana: string
  interpretacao_tecnica: string
  sugestao_acao: string
  proximo_passo: string
  tags: string[]
  priority_score: number         // 0-100
  priority_justificativa: string
  bloqueia_uso: boolean
  bucket: FeedbackBucket
}

export interface Feedback {
  id: string
  workspace_id: string | null
  user_id: string | null
  email: string | null
  source: FeedbackSource
  source_page: string | null
  user_agent: string | null
  app_version: string | null

  /** Tipo declarado pelo usuário (opcional). */
  user_type: FeedbackUserType | null

  raw_text: string | null
  audio_path: string | null
  audio_mime: string | null
  audio_duration_sec: number | null

  transcript: string | null
  transcription_status: JobStatus
  transcription_error: string | null

  analysis: FeedbackAnalysis | null
  analysis_status: JobStatus
  analysis_error: string | null

  /** Campos derivados da análise — duplicados na tabela p/ filtros rápidos. */
  ai_type: FeedbackAiType | null
  severity: FeedbackSeverity | null
  priority_score: number | null
  summary: string | null
  tags: string[] | null

  status: FeedbackStatus
  admin_notes: string | null

  created_at: string
  updated_at: string
  deleted_at: string | null
  created_by_admin: boolean
}
