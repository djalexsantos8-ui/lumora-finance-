/**
 * Constantes públicas de order-files.
 *
 * Ficam aqui (módulo normal) porque arquivos `'use server'` só podem exportar
 * funções async — não `const`. Tanto o client (upload direto via Supabase SDK)
 * quanto o server (validação de metadata) importam daqui.
 */

export const ORDER_FILE_MIME_WHITELIST = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/webp',
] as const

export type OrderFileMime = (typeof ORDER_FILE_MIME_WHITELIST)[number]

export const ORDER_FILE_MAX_FINAL_BYTES = 10 * 1024 * 1024   // 10 MB
export const ORDER_FILE_MAX_INPUT_BYTES = 50 * 1024 * 1024   // 50 MB
