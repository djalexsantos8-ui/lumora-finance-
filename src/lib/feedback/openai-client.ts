/**
 * Cliente OpenAI mínimo (sem SDK) — usa fetch direto.
 *
 * Por quê sem SDK:
 *  - Evita adicionar peso ao bundle
 *  - Next 16 + edge runtime: fetch funciona em tudo
 *  - Menos superfície de dependência p/ auditar
 *
 * Env vars:
 *   OPENAI_API_KEY          → obrigatória
 *   OPENAI_CHAT_MODEL       → opcional, default 'gpt-4o-mini'
 *   OPENAI_TRANSCRIBE_MODEL → opcional, default 'whisper-1'
 */

export class OpenAIDisabledError extends Error {
  constructor() {
    super('OPENAI_API_KEY não configurada — IA desabilitada.')
    this.name = 'OpenAIDisabledError'
  }
}

export function isOpenAIEnabled(): boolean {
  return Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.length > 10)
}

function getKey(): string {
  const k = process.env.OPENAI_API_KEY
  if (!k || k.length < 10) throw new OpenAIDisabledError()
  return k
}

export function getChatModel(): string {
  return process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini'
}

export function getTranscribeModel(): string {
  return process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1'
}

type ChatParams = {
  model?: string
  systemPrompt: string
  userPrompt: string
  jsonSchema?: unknown   // response_format json_schema
  temperature?: number
  maxRetries?: number
}

/**
 * Chat completion com suporte a structured output (json_schema strict).
 * Retorna o conteúdo bruto (string) — o caller faz JSON.parse.
 */
export async function openaiChat(params: ChatParams): Promise<string> {
  const key = getKey()
  const model = params.model || getChatModel()

  const body: Record<string, unknown> = {
    model,
    temperature: params.temperature ?? 0.2,
    messages: [
      { role: 'system', content: params.systemPrompt },
      { role: 'user',   content: params.userPrompt   },
    ],
  }

  if (params.jsonSchema) {
    body.response_format = {
      type: 'json_schema',
      json_schema: params.jsonSchema,
    }
  }

  const maxRetries = params.maxRetries ?? 2
  let lastErr: unknown = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        // 429/5xx: tenta de novo. 4xx cliente: falha imediato.
        if (res.status === 429 || res.status >= 500) {
          lastErr = new Error(`OpenAI ${res.status}: ${text.slice(0, 200)}`)
          await sleep(500 * (attempt + 1))
          continue
        }
        throw new Error(`OpenAI ${res.status}: ${text.slice(0, 200)}`)
      }

      const json = await res.json() as {
        choices?: Array<{ message?: { content?: string } }>
      }
      const content = json.choices?.[0]?.message?.content
      if (!content) throw new Error('OpenAI retornou sem content')
      return content
    } catch (err) {
      lastErr = err
      if (attempt === maxRetries) throw err
      await sleep(400 * (attempt + 1))
    }
  }
  throw lastErr ?? new Error('OpenAI falhou após retries')
}

/**
 * Transcreve um áudio via Whisper.
 * Recebe um Blob/Buffer (Node) — a rota monta o FormData aqui.
 */
export async function openaiTranscribe(params: {
  audio: Blob
  filename: string
  language?: string
  model?: string
}): Promise<string> {
  const key = getKey()
  const model = params.model || getTranscribeModel()

  const form = new FormData()
  form.append('file', params.audio, params.filename)
  form.append('model', model)
  if (params.language) form.append('language', params.language)
  form.append('response_format', 'json')

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}` },
    body: form,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`OpenAI transcribe ${res.status}: ${text.slice(0, 200)}`)
  }

  const json = await res.json() as { text?: string }
  if (!json.text) throw new Error('Whisper retornou sem texto')
  return json.text
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}
