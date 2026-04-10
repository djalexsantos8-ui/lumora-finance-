'use client'

import { toast } from 'sonner'
import { useCallback } from 'react'

interface ActionLike {
  success: boolean
  message?: string
}

export function useActionToast() {
  const handleResult = useCallback(
    (result: ActionLike | null | undefined, fallbackSuccess?: string) => {
      if (!result) return

      if (result.success) {
        const msg = result.message ?? fallbackSuccess
        if (msg) toast.success(msg)
      } else {
        toast.error(result.message ?? 'Erro inesperado.')
      }
    },
    []
  )

  return { handleResult }
}
