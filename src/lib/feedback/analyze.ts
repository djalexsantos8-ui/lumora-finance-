import type { FeedbackAnalysis } from '@/types/feedback'
import {
  openaiChat,
  isOpenAIEnabled,
  OpenAIDisabledError,
} from './openai-client'
import {
  FEEDBACK_SYSTEM_PROMPT,
  FEEDBACK_ANALYSIS_SCHEMA,
  buildFeedbackUserPrompt,
} from './analyze-prompt'

export { isOpenAIEnabled, OpenAIDisabledError }

export type AnalyzeInput = {
  rawText: string | null
  transcript: string | null
  userDeclaredType: string | null
  sourcePage: string | null
  email: string | null
  userAgent: string | null
}

export async function analyzeFeedback(input: AnalyzeInput): Promise<FeedbackAnalysis> {
  if (!isOpenAIEnabled()) throw new OpenAIDisabledError()

  const userPrompt = buildFeedbackUserPrompt(input)

  const raw = await openaiChat({
    systemPrompt: FEEDBACK_SYSTEM_PROMPT,
    userPrompt,
    jsonSchema: FEEDBACK_ANALYSIS_SCHEMA,
    temperature: 0.2,
  })

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('Resposta do LLM não é JSON válido')
  }

  // Validação mínima
  const a = parsed as Partial<FeedbackAnalysis>
  if (!a || typeof a !== 'object') throw new Error('Análise vazia')
  if (!a.resumo || !a.tipo || !a.severidade) {
    throw new Error('Análise incompleta (campos obrigatórios)')
  }

  return a as FeedbackAnalysis
}
