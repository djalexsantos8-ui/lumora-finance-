import {
  openaiTranscribe,
  isOpenAIEnabled,
  OpenAIDisabledError,
} from './openai-client'

export { isOpenAIEnabled, OpenAIDisabledError }

/**
 * Baixa o arquivo de áudio do bucket (via admin client) e transcreve com Whisper.
 *
 * @param audioBuffer  Buffer (Node) do arquivo baixado
 * @param mime         ex: 'audio/webm'
 * @param filename     ex: 'feedback.webm' (ajuda o Whisper a inferir formato)
 */
export async function transcribeAudioBuffer(
  audioBuffer: ArrayBuffer,
  mime: string,
  filename: string,
): Promise<string> {
  if (!isOpenAIEnabled()) throw new OpenAIDisabledError()

  // Node 20+: Blob/FormData nativos
  const blob = new Blob([audioBuffer], { type: mime || 'audio/webm' })
  const text = await openaiTranscribe({
    audio:    blob,
    filename: filename || 'feedback.webm',
    language: 'pt', // defaults filmmaker br — Whisper aceita override
  })
  return text
}
