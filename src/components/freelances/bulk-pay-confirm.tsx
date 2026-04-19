'use client'

/**
 * BulkPayConfirm — modal de confirmação de pagamento em lote.
 *
 * Exibido ANTES de chamar o server. Mostra claramente:
 *   · quantidade de freelances que serão pagos
 *   · lista resumida (title + valor), com truncamento visual após 6 itens
 *   · valor total somado
 *   · avisos para itens que serão ignorados (já pagos / sem cliente)
 *
 * Botão Confirmar é desabilitado enquanto `isProcessing` (protege contra
 * duplo-clique e re-disparo durante a ação).
 *
 * Portal para #modal-root ou document.body — mesmo padrão de outros modais
 * do app (bypassa overflow do layout).
 *
 * Nenhuma lógica de persistência aqui. É puramente apresentacional.
 */

import { createPortal } from 'react-dom'
import { formatCurrency } from '@/lib/utils/format'

export interface BulkPayPreviewItem {
  id:       string
  title:    string
  /** Valor que será pago neste job (remaining = total - amount_paid). */
  amount:   number
  /** Motivo pelo qual será IGNORADO (se aplicável). */
  skip?:    'already_paid' | 'no_client'
}

interface Props {
  open:          boolean
  items:         BulkPayPreviewItem[]
  currency?:     string
  isProcessing:  boolean
  onClose:       () => void
  onConfirm:     () => void
}

export function BulkPayConfirm({
  open, items, currency = 'BRL', isProcessing, onClose, onConfirm,
}: Props) {
  if (!open || typeof document === 'undefined') return null

  const payable  = items.filter(i => !i.skip)
  const skipped  = items.filter(i =>  i.skip)
  const totalSum = payable.reduce((s, i) => s + i.amount, 0)

  const visibleList = payable.slice(0, 6)
  const hiddenCount = Math.max(0, payable.length - visibleList.length)

  const content = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={isProcessing ? undefined : onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-pay-title"
    >
      <div
        className="w-full max-w-md bg-[#141414] border border-[#2a2a2a] rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3 border-b border-[#1f1f1f]">
          <div className="min-w-0">
            <h2 id="bulk-pay-title" className="text-base font-semibold text-white">
              Confirmar pagamento em lote
            </h2>
            <p className="text-xs text-[#a3a3a3] mt-0.5">
              {payable.length} freelance{payable.length !== 1 ? 's' : ''} serão marcado{payable.length !== 1 ? 's' : ''} como pago{payable.length !== 1 ? 's' : ''}.
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            aria-label="Fechar"
            className="text-[#525252] hover:text-white transition-colors p-1 rounded-lg disabled:opacity-30"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Conteúdo ──────────────────────────────────────────────────── */}
        <div className="px-5 py-4">
          {payable.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-sm text-[#a3a3a3]">
                Nenhum freelance válido para pagar.
              </p>
              {skipped.length > 0 && (
                <p className="text-xs text-[#525252] mt-1">
                  Os selecionados já estão pagos ou precisam de cliente vinculado.
                </p>
              )}
            </div>
          ) : (
            <>
              <ul className="divide-y divide-[#1f1f1f] mb-4">
                {visibleList.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="text-xs text-white truncate flex-1 min-w-0">
                      {item.title || 'Freelance sem título'}
                    </span>
                    <span className="text-xs font-semibold text-[#D4A853] shrink-0">
                      {formatCurrency(item.amount, currency)}
                    </span>
                  </li>
                ))}
                {hiddenCount > 0 && (
                  <li className="py-2 text-[11px] text-[#525252] text-center">
                    + {hiddenCount} freelance{hiddenCount !== 1 ? 's' : ''} …
                  </li>
                )}
              </ul>

              {/* Total */}
              <div className="flex items-center justify-between pt-3 border-t border-[#1f1f1f]">
                <span className="text-xs font-semibold text-[#a3a3a3] uppercase tracking-wider">
                  Total a receber
                </span>
                <span className="text-lg font-bold text-[#D4A853]">
                  {formatCurrency(totalSum, currency)}
                </span>
              </div>
            </>
          )}

          {/* Avisos de skipped */}
          {skipped.length > 0 && (
            <div className="mt-4 flex items-start gap-2 bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2">
              <svg className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-[11px] text-amber-300 leading-relaxed">
                {skipped.filter(s => s.skip === 'already_paid').length > 0 && (
                  <>
                    {skipped.filter(s => s.skip === 'already_paid').length} já {skipped.filter(s => s.skip === 'already_paid').length === 1 ? 'está pago' : 'estão pagos'} (serão ignorados).
                  </>
                )}
                {skipped.filter(s => s.skip === 'no_client').length > 0 && (
                  <>
                    {' '}{skipped.filter(s => s.skip === 'no_client').length} {skipped.filter(s => s.skip === 'no_client').length === 1 ? 'precisa' : 'precisam'} de cliente vinculado antes de pagar.
                  </>
                )}
              </p>
            </div>
          )}
        </div>

        {/* ── Actions ───────────────────────────────────────────────────── */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 bg-[#0f0f0f] border-t border-[#1f1f1f]">
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="text-xs font-medium px-4 py-2 rounded-lg text-[#a3a3a3] hover:text-white border border-[#2a2a2a] hover:border-[#3a3a3a] transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={isProcessing || payable.length === 0}
            className="flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-lg bg-[#D4A853] hover:bg-[#E8C47A] text-[#0a0a0a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing ? (
              <>
                <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Processando…
              </>
            ) : (
              <>Confirmar pagamento</>
            )}
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(content, document.body)
}
