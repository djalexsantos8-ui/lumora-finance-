'use client'

// ─── StatusStepper ──────────────────────────────────────────────────────────
//
// Stepper visual linear para status do freelance.
//
// 3 steps visíveis: in_progress → delivered → paid
//
// `pending_payment` (status legado do DB) é tratado como sinônimo visual
// de `delivered` (step 2) — já que "aguardando pagamento" é semanticamente
// pós-entrega. O label na pill muda para "Aguard. pagamento" nesse caso.
//
// `cancelled` é deliberadamente fora do stepper — deve ser oferecido como
// ação lateral (link/button) pelo consumidor.
//
// Clique em step:
//   · avança/retrocede linearmente chamando onChange
//   · idempotente (clicar no step ativo não faz nada)
//
// Props:
//   status   — status atual do freelance (todos os JobStatus aceitos)
//   onChange — callback quando usuário clica em outro step
//   disabled — desabilita cliques (usado durante transição)

import type { JobStatus } from '@/types/job'

type VisibleStep = 'in_progress' | 'delivered' | 'paid'

const STEPS: { value: VisibleStep; label: string }[] = [
  { value: 'in_progress', label: 'Em andamento' },
  { value: 'delivered',   label: 'Entregue'     },
  { value: 'paid',        label: 'Pago'         },
]

// Mapeia qualquer JobStatus para o step visível correspondente.
// `pending_payment` colapsa em `delivered` visualmente.
function toVisibleStep(status: JobStatus): VisibleStep | null {
  switch (status) {
    case 'in_progress':     return 'in_progress'
    case 'delivered':       return 'delivered'
    case 'pending_payment': return 'delivered'
    case 'paid':            return 'paid'
    case 'cancelled':       return null
    default:                return null
  }
}

interface Props {
  status:   JobStatus
  onChange: (next: JobStatus) => void
  disabled?: boolean
}

export function StatusStepper({ status, onChange, disabled = false }: Props) {
  const activeStep = toVisibleStep(status)
  const activeIdx  = activeStep ? STEPS.findIndex(s => s.value === activeStep) : -1

  // Se o status for `cancelled`, o stepper não é renderizado —
  // o consumidor deve mostrar um estado alternativo.
  if (status === 'cancelled') return null

  function handleClick(next: VisibleStep) {
    if (disabled) return
    if (next === activeStep) return
    // Idempotente: clicar em delivered quando está em pending_payment não faz nada
    if (next === 'delivered' && status === 'pending_payment') return
    onChange(next)
  }

  return (
    <div className="flex items-center gap-1.5" role="group" aria-label="Status do freelance">
      {STEPS.map((step, idx) => {
        const isActive   = idx === activeIdx
        const isPast     = idx <  activeIdx
        const isFuture   = idx >  activeIdx

        // Label mostrado na pill ativa. Se pending_payment, mostra rótulo específico.
        const label =
          isActive && status === 'pending_payment' && step.value === 'delivered'
            ? 'Aguard. pagamento'
            : step.label

        return (
          <div key={step.value} className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleClick(step.value)}
              disabled={disabled}
              aria-current={isActive ? 'step' : undefined}
              aria-label={`Marcar como ${step.label}`}
              className={[
                'text-[11px] font-semibold px-2.5 py-1 rounded-md border transition-colors',
                'disabled:opacity-60 disabled:cursor-not-allowed',
                isActive
                  ? status === 'paid'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : status === 'pending_payment'
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                      : status === 'delivered'
                        ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                        : 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                  : isPast
                    ? 'bg-[#1a1a1a] text-[#a3a3a3] border-[#2a2a2a] hover:text-white hover:border-[#3a3a3a]'
                    : 'bg-transparent text-[#525252] border-[#2a2a2a] hover:text-[#a3a3a3] hover:border-[#3a3a3a]',
              ].join(' ')}
            >
              {label}
            </button>
            {idx < STEPS.length - 1 && (
              <span
                aria-hidden
                className={`w-3 h-px ${isPast || isActive ? 'bg-[#3a3a3a]' : 'bg-[#2a2a2a]'}`}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
