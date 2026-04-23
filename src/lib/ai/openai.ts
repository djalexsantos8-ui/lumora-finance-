/**
 * src/lib/ai/openai.ts
 *
 * Re-export do cliente OpenAI que já vive em `src/lib/feedback/openai-client.ts`.
 *
 * Por quê este arquivo existe:
 *   · Desde Deploy D (2026-04-22) o Lumora ganha IA em vários módulos
 *     (orçamentos, pedidos, futuras features). A superfície agora é `lib/ai`.
 *   · Evitamos mover o arquivo pra não quebrar as rotas de feedback, que
 *     importam `lib/feedback/openai-client` — tudo funciona igual.
 *   · Próximas features importam de `@/lib/ai/openai` (intenção = IA de produto).
 */

export {
  OpenAIDisabledError,
  isOpenAIEnabled,
  getChatModel,
  getTranscribeModel,
  openaiChat,
  openaiTranscribe,
} from '@/lib/feedback/openai-client'
