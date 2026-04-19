'use client'

/**
 * PaymentDueField — Vencimento do freelance com dois modos:
 *
 *   · Modo "Prazo rápido" (padrão): select com upfront / 7d / 15d / 30d / 60d / 90d
 *     → grava payment_condition + payment_due_date calculado a partir de job_date.
 *
 *   · Modo "Data exata": campo de calendário
 *     → grava apenas payment_due_date (payment_condition permanece no banco como
 *       referência informativa — nunca extendemos o tipo pra 'custom' porque isso
 *       cascataria em schema, actions, narrativa, dashboard).
 *
 * Detecção automática do modo inicial:
 *   · Se payment_due_date == calcDueDate(job_date, payment_condition) → shortcut
 *   · Caso contrário → modo custom (usuário já escolheu uma data manual antes).
 *
 * Contrato:
 *   · onApplyShortcut(condition): caller grava {payment_condition, payment_due_date}
 *   · onApplyCustom(dueDate):     caller grava apenas {payment_due_date}
 *
 * Invariantes:
 *   · Só uma UI visível por vez (sem competição entre modos)
 *   · Toggle custom→shortcut re-aplica o shortcut atual (recalcula a partir de hoje)
 *   · Toggle shortcut→custom só revela o calendário (sem commit — nada mudou ainda)
 *   · Custom commit só dispara em blur/Enter e só se a data for diferente da atual
 */

import { useEffect, useState } from 'react'
import type { PaymentCondition } from '@/types/job'
import { formatDate } from '@/lib/utils/format'

const PAYMENT_COND_LABELS: Record<PaymentCondition, string> = {
  upfront: 'À vista',
  '7d':    '7 dias',
  '15d':   '15 dias',
  '30d':   '30 dias',
  '60d':   '60 dias',
  '90d':   '90 dias',
}

/** Calcula a data de vencimento a partir da data do job + condição de pagamento. */
function calcDueDate(jobDateIso: string, condition: PaymentCondition): string {
  const daysMap: Record<PaymentCondition, number> = {
    upfront: 0, '7d': 7, '15d': 15, '30d': 30, '60d': 60, '90d': 90,
  }
  const days = daysMap[condition] ?? 0
  const [y, m, d] = jobDateIso.split('-').map(Number)
  const date = new Date(y, m - 1, d + days)
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

interface PaymentDueFieldProps {
  jobDate:          string
  paymentDueDate:   string
  paymentCondition: PaymentCondition
  disabled?:        boolean
  /** Aplica atalho: caller grava payment_condition + payment_due_date calculado. */
  onApplyShortcut:  (condition: PaymentCondition) => void | Promise<void>
  /** Aplica data manual: caller grava apenas payment_due_date. */
  onApplyCustom:    (dueDate: string) => void | Promise<void>
}

export function PaymentDueField({
  jobDate,
  paymentDueDate,
  paymentCondition,
  disabled = false,
  onApplyShortcut,
  onApplyCustom,
}: PaymentDueFieldProps) {
  // Modo inicial: "custom" quando o vencimento gravado diverge do que o shortcut
  // calcularia. Caso clássico: usuário escolheu data exata antes.
  const expected = calcDueDate(jobDate, paymentCondition)
  const [isCustom, setIsCustom]   = useState<boolean>(paymentDueDate !== expected)
  const [dateDraft, setDateDraft] = useState<string>(paymentDueDate)

  // Sincroniza quando o job é recarregado (save em outro campo devolve dados novos).
  useEffect(() => { setDateDraft(paymentDueDate) }, [paymentDueDate])

  // Se o servidor passou a ter due_date divergente do shortcut, força modo custom
  // (mesmo padrão do date-range: só força TRUE, nunca força FALSE — respeita
  // toggle em andamento do usuário).
  useEffect(() => {
    if (paymentDueDate && paymentDueDate !== calcDueDate(jobDate, paymentCondition)) {
      setIsCustom(true)
    }
  }, [paymentDueDate, paymentCondition, jobDate])

  function toggleCustom() {
    if (disabled) return
    if (isCustom) {
      // Custom → Shortcut: re-aplica o shortcut atual (recalcula a partir do job_date).
      setIsCustom(false)
      onApplyShortcut(paymentCondition)
    } else {
      // Shortcut → Custom: apenas revela o calendário. Sem commit (nada mudou).
      setIsCustom(true)
    }
  }

  function commitCustomDate(next: string) {
    if (!next) return
    if (next === paymentDueDate) return
    onApplyCustom(next)
  }

  const inputCls =
    'text-xs bg-[#1c1c1c] border border-[#2a2a2a] rounded px-2 py-1 text-white outline-none focus:border-[#D4A853]/50 disabled:opacity-60 transition-colors'

  return (
    <div className="flex flex-col items-end gap-1">
      {isCustom ? (
        <input
          type="date"
          value={dateDraft}
          disabled={disabled}
          onChange={e => setDateDraft(e.target.value)}
          onBlur={() => commitCustomDate(dateDraft)}
          onKeyDown={e => {
            if (e.key === 'Enter')  commitCustomDate(dateDraft)
            if (e.key === 'Escape') setDateDraft(paymentDueDate)
          }}
          className={`${inputCls} w-36`}
          aria-label="Data exata de vencimento"
        />
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[#737373]" aria-hidden>
            vence {formatDate(paymentDueDate)}
          </span>
          <select
            value={paymentCondition}
            disabled={disabled}
            onChange={e => onApplyShortcut(e.target.value as PaymentCondition)}
            className={`${inputCls} appearance-none cursor-pointer hover:border-[#3a3a3a]`}
            aria-label="Prazo de vencimento"
          >
            {(Object.entries(PAYMENT_COND_LABELS) as [PaymentCondition, string][]).map(([v, l]) => (
              <option key={v} value={v} className="bg-[#141414] text-white">{l}</option>
            ))}
          </select>
        </div>
      )}

      {/* Toggle moderno "Definir data exata de vencimento" — mesmo padrão visual
          do switch de múltiplas datas (role=switch + aria-checked, gold quando ativo). */}
      <button
        type="button"
        role="switch"
        aria-checked={isCustom}
        onClick={toggleCustom}
        disabled={disabled}
        title={isCustom
          ? 'Voltar para prazos rápidos'
          : 'Escolher uma data no calendário'}
        className="group inline-flex items-center gap-2 select-none outline-none disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <span
          aria-hidden
          className={`inline-flex h-5 w-9 items-center rounded-full p-0.5 transition-colors shrink-0 group-focus-visible:ring-2 group-focus-visible:ring-[#D4A853]/40 ${
            isCustom ? 'bg-[#D4A853]' : 'bg-[#2a2a2a] group-hover:bg-[#3a3a3a]'
          }`}
        >
          <span
            className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-150 ease-out ${
              isCustom ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </span>
        <span
          className={`text-xs transition-colors ${
            isCustom ? 'text-white' : 'text-[#737373] group-hover:text-[#a3a3a3]'
          }`}
        >
          Definir data exata de vencimento
        </span>
      </button>
    </div>
  )
}
