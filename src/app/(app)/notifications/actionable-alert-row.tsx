'use client'

/**
 * ActionableAlertRow — linha de alerta com ação inline "Marcar pago".
 *
 * Fase 7 (Blueprint 2026-04-21): notificações acionáveis.
 * Evita que o usuário tenha que navegar até a página e procurar o botão —
 * uma clique no alerta resolve o item e some da lista.
 *
 * Suporta dois targets:
 *   · fixed_cost → payMonthlyRecurring
 *   · job        → updateJobStatus('paid')
 *
 * Sem confirm modal. Toast + router.refresh() cuida do feedback.
 * Click na área principal (título/sub) continua levando ao link.
 */

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { payMonthlyRecurring } from '@/lib/actions/fixed-costs'
import { updateJobStatus } from '@/lib/actions/jobs'

type BadgeColor = 'red' | 'amber' | 'gray'

type Action =
  | { target: 'fixed_cost'; id: string }
  | { target: 'job'; id: string }
  | null

interface Props {
  title:      string
  sub:        string
  amount:     string
  badge:      string
  badgeColor: BadgeColor
  href:       string
  action?:    Action
}

export function ActionableAlertRow({
  title,
  sub,
  amount,
  badge,
  badgeColor,
  href,
  action,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const badgeCls = {
    red:   'bg-red-500/10 text-red-400 border-red-500/20',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    gray:  'bg-[#1c1c1c] text-[#525252] border-[#2a2a2a]',
  }[badgeColor]

  function handleMarkPaid(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!action) return
    startTransition(async () => {
      try {
        if (action.target === 'fixed_cost') {
          const res = await payMonthlyRecurring(action.id)
          if (!res.success) {
            toast.error(res.message ?? 'Erro ao marcar como pago.')
            return
          }
        } else if (action.target === 'job') {
          const res = await updateJobStatus(action.id, 'paid')
          if (!res.success) {
            toast.error(res.message ?? 'Erro ao marcar como pago.')
            return
          }
        }
        toast.success('Marcado como pago.')
        router.refresh()
      } catch (err) {
        toast.error((err as Error).message ?? 'Erro desconhecido.')
      }
    })
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-[#1a1a1a] transition-colors group">
      <a href={href} className="flex-1 min-w-0 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white truncate group-hover:text-[#D4A853] transition-colors">{title}</p>
          <p className="text-[10px] text-[#525252] mt-0.5 truncate">{sub}</p>
        </div>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${badgeCls}`}>
          {badge}
        </span>
        <span className="text-sm font-bold text-white tabular-nums shrink-0">{amount}</span>
      </a>
      {action && (
        <button
          onClick={handleMarkPaid}
          disabled={isPending}
          className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 px-2.5 py-1 rounded-md transition-colors disabled:opacity-50 shrink-0"
          title="Marcar como pago"
        >
          {isPending ? '…' : '✓ Pago'}
        </button>
      )}
    </div>
  )
}
