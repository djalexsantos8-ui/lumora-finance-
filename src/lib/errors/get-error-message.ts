import { ERROR_MESSAGES } from './error-messages'

export function getErrorMessage(code: string): string {
  return (ERROR_MESSAGES as Record<string, string>)[code] ?? ERROR_MESSAGES.UNKNOWN_ERROR
}
