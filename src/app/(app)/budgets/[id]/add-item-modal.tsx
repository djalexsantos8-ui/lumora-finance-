'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { createBudgetItem, updateBudgetItem } from '@/lib/actions/budget-items'
import { BUDGET_ITEM_CATEGORIES, formatCurrency, FREELANCER_ROLE_LABELS } from '@/lib/utils/format'
import type { Budget, BudgetItem } from '@/types/budget'
import type { Freelancer } from '@/types/freelancer'

interface Props {
  open:        boolean
  item:        BudgetItem | null   // null = modo criação
  budgetId:    string
  currency:    string
  freelancers: Freelancer[]
  onClose:     () => void
  onSaved:     (item: BudgetItem, budget?: Budget) => void
}

export default function AddItemModal({
  open,
  item,
  budgetId,
  currency,
  freelancers,
  onClose,
  onSaved,
}: Props) {
  const formRef = useRef<HTMLFormElement>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError]            = useState<string | null>(null)

  const isEdit = Boolean(item)

  // Campos controlados
  const [qty,       setQty]       = useState('1')
  const [days,      setDays]      = useState('1')
  const [unitValue, setUnitValue] = useState('')
  const [label,     setLabel]     = useState('')
  const [category,  setCategory]  = useState('')
  const [selectedFreelancer, setSelectedFreelancer] = useState<Freelancer | null>(null)

  // Calcula total em tempo real
  const parsedQty  = Math.max(1, parseInt(qty)  || 1)
  const parsedDays = Math.max(0, parseFloat(days.replace(',', '.')) || 0)
  const parsedUnit = parseFloat(unitValue.replace(',', '.')) || 0
  const previewTotal = parsedQty * parsedDays * parsedUnit

  // Reset ao abrir/fechar
  useEffect(() => {
    setError(null)
    if (open) {
      if (item) {
        setQty(String(item.quantity))
        setDays(String(item.days))
        setUnitValue(item.unit_value > 0 ? String(item.unit_value) : '')
        setLabel(item.label)
        setCategory(item.category ?? '')
        setSelectedFreelancer(
          item.freelancer_id
            ? (freelancers.find(f => f.id === item.freelancer_id) ?? null)
            : null
        )
      } else {
        setQty('1')
        setDays('1')
        setUnitValue('')
        setLabel('')
        setCategory('')
        setSelectedFreelancer(null)
      }
    }
  }, [open, item, freelancers])

  // Fechar com Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && open) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  // Quando um freelancer é selecionado, auto-preenche campos
  function handleFreelancerChange(freelancerId: string) {
    const found = freelancers.find(f => f.id === freelancerId) ?? null
    setSelectedFreelancer(found)
    if (found) {
      if (!label) setLabel(found.name)
      setCategory('team')
      if (found.daily_rate) setUnitValue(String(found.daily_rate))
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)

    startTransition(async () => {
      const result = isEdit && item
        ? await updateBudgetItem(item.id, budgetId, formData)
        : await createBudgetItem(budgetId, formData)

      if (!result.success) {
        setError(result.message)
        return
      }
      if (result.data) {
        onSaved(result.data, result.budget)
      }
    })
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="bg-[#141414] border border-[#2a2a2a] rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-[#1a1a1a] sticky top-0 bg-[#141414] z-10">
            <h2 className="text-base font-semibold text-white">
              {isEdit ? 'Editar Item' : 'Adicionar Item'}
            </h2>
            <button
              onClick={onClose}
              className="text-[#525252] hover:text-white transition-colors"
              aria-label="Fechar"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Form */}
          <form ref={formRef} onSubmit={handleSubmit} className="p-6 space-y-4">

            {/* Profissional do catálogo (opcional) */}
            {freelancers.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-[#a3a3a3] mb-1.5">
                  Profissional do catálogo
                  <span className="text-[#525252] font-normal ml-1">(opcional)</span>
                </label>
                <select
                  name="freelancer_id"
                  defaultValue={item?.freelancer_id ?? ''}
                  onChange={e => handleFreelancerChange(e.target.value)}
                  className={`${inputCls} appearance-none cursor-pointer`}
                >
                  <option value="">— Item livre (sem profissional) —</option>
                  {freelancers.map(f => (
                    <option key={f.id} value={f.id}>
                      {f.name} — {FREELANCER_ROLE_LABELS[f.role]}
                      {f.daily_rate ? ` (${formatCurrency(f.daily_rate, f.currency)}/dia)` : ''}
                    </option>
                  ))}
                </select>
                {selectedFreelancer && (
                  <p className="text-xs text-[#525252] mt-1">
                    Categoria definida como <span className="text-[#D4A853]">Equipe</span> automaticamente.
                  </p>
                )}
              </div>
            )}

            {/* Categoria */}
            <div>
              <label className="block text-xs font-medium text-[#a3a3a3] mb-1.5">
                Categoria
              </label>
              <select
                name="category"
                value={category}
                onChange={e => setCategory(e.target.value)}
                className={`${inputCls} appearance-none cursor-pointer`}
              >
                <option value="">Sem categoria</option>
                {BUDGET_ITEM_CATEGORIES.map(([value, catLabel]) => (
                  <option key={value} value={value}>{catLabel}</option>
                ))}
              </select>
            </div>

            {/* Descrição */}
            <div>
              <label className="block text-xs font-medium text-[#a3a3a3] mb-1.5">
                Descrição <span className="text-[#D4A853]">*</span>
              </label>
              <input
                name="label"
                type="text"
                required
                maxLength={200}
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="Ex: Direção de Fotografia, Aluguel de câmera, Combustível…"
                className={inputCls}
              />
            </div>

            {/* Qtd + Dias + Valor unit. */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#a3a3a3] mb-1.5">
                  Qtd.
                </label>
                <input
                  name="quantity"
                  type="number"
                  min={1}
                  step={1}
                  value={qty}
                  onChange={e => setQty(e.target.value)}
                  className={`${inputCls} text-right`}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#a3a3a3] mb-1.5">
                  Dias
                </label>
                <input
                  name="days"
                  type="text"
                  inputMode="decimal"
                  value={days}
                  onChange={e => setDays(e.target.value)}
                  placeholder="1"
                  className={`${inputCls} text-right`}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#a3a3a3] mb-1.5">
                  Valor unit.
                </label>
                <input
                  name="unit_value"
                  type="text"
                  inputMode="decimal"
                  value={unitValue}
                  onChange={e => setUnitValue(e.target.value)}
                  placeholder="0,00"
                  className={`${inputCls} text-right`}
                />
              </div>
            </div>

            {/* Total preview */}
            <div className="bg-[#1c1c1c] border border-[#2a2a2a] rounded-xl px-4 py-3 flex items-center justify-between">
              <span className="text-xs text-[#525252]">
                {parsedQty} × {parsedDays} dia{parsedDays !== 1 ? 's' : ''} × {formatCurrency(parsedUnit, currency)}
              </span>
              <span className="text-base font-bold text-white">
                {formatCurrency(previewTotal, currency)}
              </span>
            </div>

            {/* Show in PDF toggle */}
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <ShowInPdfToggle
                defaultChecked={item?.show_in_pdf ?? false}
                name="show_in_pdf"
              />
              <span className="text-sm text-[#a3a3a3]">
                Incluir no PDF do cliente
              </span>
            </label>

            {/* Erro */}
            {error && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                disabled={isPending}
                className="flex-1 bg-[#1c1c1c] hover:bg-[#262626] disabled:opacity-50 border border-[#2a2a2a] text-[#a3a3a3] hover:text-white rounded-xl py-2.5 text-sm font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="flex-1 bg-[#D4A853] hover:bg-[#E8C47A] disabled:opacity-60 disabled:cursor-not-allowed text-[#0a0a0a] rounded-xl py-2.5 text-sm font-semibold transition-colors flex items-center justify-center gap-2"
              >
                {isPending ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Salvando…
                  </>
                ) : isEdit ? 'Salvar alterações' : 'Adicionar item'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}

// ─── Toggle switch para "show in PDF" ─────────────────────────────────────────

function ShowInPdfToggle({
  defaultChecked,
  name,
}: {
  defaultChecked: boolean
  name: string
}) {
  const [checked, setChecked] = useState(defaultChecked)

  return (
    <>
      <input type="hidden" name={name} value={checked ? 'true' : 'false'} />
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => setChecked(v => !v)}
        className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-[#D4A853]' : 'bg-[#2a2a2a]'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 mt-0.5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>
    </>
  )
}

// ─── CSS helper ──────────────────────────────────────────────────────────────

const inputCls =
  'w-full bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-sm text-white ' +
  'placeholder-[#525252] focus:outline-none focus:border-[#D4A853]/50 ' +
  'focus:ring-1 focus:ring-[#D4A853]/20 transition-colors'
