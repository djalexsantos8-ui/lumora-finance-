import { toast } from 'sonner'

export function toastSuccess(message: string) {
  toast.success(message)
}

export function toastError(message: string) {
  toast.error(message)
}

export function toastLoading(message: string) {
  toast.loading(message)
}
