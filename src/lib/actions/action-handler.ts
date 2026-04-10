import { AppError } from '@/lib/errors/app-error'
import { getErrorMessage } from '@/lib/errors/get-error-message'

type ActionSuccess<T> = { success: true; data: T; message?: string }
type ActionFailure   = { success: false; message: string }
export type ActionResult<T> = ActionSuccess<T> | ActionFailure

export async function handleAction<T>(
  fn: () => Promise<T>,
  successMessage?: string
): Promise<ActionResult<T>> {
  try {
    const data = await fn()
    return { success: true, data, message: successMessage }
  } catch (err) {
    if (err instanceof AppError) {
      return { success: false, message: getErrorMessage(err.code) }
    }
    console.error('[action/unhandled]', err)
    return { success: false, message: getErrorMessage('UNKNOWN_ERROR') }
  }
}
