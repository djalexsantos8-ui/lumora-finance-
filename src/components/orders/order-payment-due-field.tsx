'use client'

/**
 * OrderPaymentDueField — versão do PaymentDueField (Freelances) adaptada para Pedidos.
 *
 * Diferenças em relação ao original:
 *   · orders.payment_condition é text livre no banco (não enum), então aceitamos
 *     string e fazemos fallback para 'upfront' quando o valor não bate com nenhum
 *     shortcut conhecido (backward-compat com pedidos antigos que tinham texto
 *     livre tipo "50% entrada + 50% na entrega").
 *   · orders não tem payment_due_date — a data de vencimento é computada on-the-fly
 *     a partir de order_date + shortcut. Sem modo "data exata" (pendente migration).
 *   · Mantém o padrão visual: "vence DD/MM/YYYY" + dropdown de shortcut.
 *
 * Contrato:
 *   · onApplyShortcut(condition): caller grava payment_condition.
 */

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

const KNOWN_CONDITIONS = Object.keys(PAYMENT_COND_LABELS) as PaymentCondition[]

/** Calcula a data de vencimento a partir da data do pedido + condição de pagamento. */
export function calcOrderDueDate(orderDateIso: string, condition: PaymentCondition): string {
  const daysMap: Record<PaymentCondition, number> = {
    upfront: 0, '7d': 7, '15d': 15, '30d': 30, '60d': 60, '90d': 90,
  }
  const days = daysMap[condition] ?? 0
  const [y, m, d] = orderDateIso.split('-').map(Number)
  const date = new Date(y, m - 1, d + days)
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

/** Normaliza payment_condition livre do banco para um shortcut válido. */
export function normalizePaymentCondition(raw: string | null): PaymentCondition {
  if (!raw) return 'upfront'
  return (KNOWN_CONDITIONS as string[]).includes(raw) ? (raw as PaymentCondition) : 'upfront'
}

interface OrderPaymentDueFieldProps {
  orderDate:        string              // ISO YYYY-MM-DD
  paymentCondition: string | null       // free-text do banco
  disabled?:        boolean
  onApplyShortcut:  (condition: PaymentCondition) => void | Promise<void>
}

export function OrderPaymentDueField({
  orderDate,
  paymentCondition,
  disabled = false,
  onApplyShortcut,
}: OrderPaymentDueFieldProps) {
  const condition = normalizePaymentCondition(paymentCondition)
  const dueDate   = calcOrderDueDate(orderDate, condition)

  const inputCls =
    'text-xs bg-[#1c1c1c] border border-[#2a2a2a] rounded px-2 py-1 text-white outline-none ' +
    'focus:border-[#D4A853]/50 disabled:opacity-60 transition-colors'

  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-[#737373] shrink-0" aria-hidden>
        vence {formatDate(dueDate)}
      </span>
      <select
        value={condition}
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
  )
}
