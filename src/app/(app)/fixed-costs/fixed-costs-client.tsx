'use client'

import { useState, useTransition } from 'react'
import { formatCurrency } from '@/lib/utils/format'
import { createFixedCost, toggleFixedCost, deleteFixedCost } from '@/lib/actions/fixed-costs'
import {
  FIXED_COST_CATEGORIES,
  FIXED_COST_CATEGORY_LABELS,
} from '@/types/expense'
import type { FixedCost, FixedCostCategory } from '@/types/expense'

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  initialItems: FixedCost[]
}

// ─── Component ────────────────────────────────────────────────────────────────

export function FixedCostsClient({ initialItems }: Props) {
  const [items,       setItems]       = useState<FixedCost[]>(initialItems)
  const [showForm,    setShowForm]    = useState(false)
  const [isPending,   startTransition] = useTransition()
  const [deletingId,  setDeletingId]  = useState<string | null>(null)
  const [togglingId,  setTogglingId]  = useState<string | null>(null)

  // Form state
  const [fCat,     setFCat]     = useState<FixedCostCategory>('software')
  const [fDesc,    setFDesc]    = useState('')
  const [fAmt,     setFAmt]     = useState('')
  const [fDay,     setFDay]     = useState('1')
  const [fDed,     setFDed]     = useState(false)
  const [fNotes,   setFNotes]   = useState('')

  // Totals — only active items
  const activeItems  = items.filter(i => i.is_active)
  const totalMonthly = activeItems.reduce((s, i) => s + Number(i.amount), 0)
  const currency     = items[0]?.currency ?? 'BRL'

  // ── Add ──────────────────────────────────────────────────────────────────────

  function resetForm() {
    setFCat('software'); setFDesc(''); setFAmt(''); setFDay('1'); setFDed(false); setFNotes('')
    setShowForm(false)
  }

  function handleSubmit() {
    const amount  = parseFloat(fAmt.replace(',', '.'))
    const day     = parseInt(fDay, 10)
    if (!fDesc.trim() || isNaN(amount) || amount <= 0 || isNaN(day) || day < 1 || day > 31) return

    startTransition(async () => {
      const res = await createFixedCost({
        description:   fDesc,
        category:      fCat,
        amount,
        billing_day:   day,
        is_deductible: fDed,
        notes:         fNotes || undefined,
      })
      if (res.success && res.data) {
        setItems(prev => [...prev, res.data!])
        resetForm()
      }
    })
  }

  // ── Toggle ───────────────────────────────────────────────────────────────────

  async function handleToggle(id: string, current: boolean) {
    setTogglingId(id)
    const res = await toggleFixedCost(id, !current)
    setTogglingId(null)
    if (res.success && res.data) {
      setItems(prev => prev.map(i => i.id === id ? { ...i, is_active: !current } : i))
    }
  }

  // ── Delete ───────────────────────────────────────────────────────────────────

  async function handleDelete(id: string) {
    if (!window.confirm('Excluir este custo fixo?')) return
    setDeletingId(id)
    const res = await deleteFixedCost(id)
    setDeletingId(null)
    if (res.success) {
      setItems(prev => prev.filter(i => i.id !== id))
    }
  }

  // ── Sort: active first, then inactive ────────────────────────────────────────
  const sorted = [...items].sort((a, b) => {
    if (a.is_active === b.is_active) return 0
    return a.is_active ? -1 : 1
  })

  const isEmpty = items.length === 0 && !showForm

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Cards de resumo ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-4">
          <p className="text-[10px] font-semibold text-[#525252] tracking-widest mb-1">TOTAL MENSAL FIXO</p>
          <p className="text-xl font-bold text-white">{formatCurrency(totalMonthly, currency)}</p>
          {items.length > activeItems.length && (
            <p className="text-[10px] text-[#525252] mt-1">
              {items.length - activeItems.length} custo{items.length - activeItems.length !== 1 ? 's' : ''} inativo{items.length - activeItems.length !== 1 ? 's' : ''} não contabilizado{items.length - activeItems.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-4 flex items-center justify-end">
          <button
            onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-2 bg-[#D4A853] hover:bg-[#E8C47A] text-[#0a0a0a] font-semibold text-xs px-4 py-2 rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Novo custo fixo
          </button>
        </div>
      </div>

      {/* ── Formulário inline ────────────────────────────────────────────────── */}
      {showForm && (
        <div className="bg-[#141414] border border-[#D4A853]/30 rounded-xl p-4 mb-4">
          <p className="text-xs font-semibold text-[#D4A853] mb-3 tracking-wide">NOVO CUSTO FIXO</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            {/* Categoria */}
            <div>
              <label className={labelCls}>Categoria</label>
              <select value={fCat} onChange={e => setFCat(e.target.value as FixedCostCategory)}
                disabled={isPending} className={inputCls}>
                {FIXED_COST_CATEGORIES.map(([v, l]) => (
                  <option key={v} value={v} className="bg-[#141414]">{l}</option>
                ))}
              </select>
            </div>

            {/* Dia de vencimento */}
            <div>
              <label className={labelCls}>Dia de cobrança</label>
              <input
                type="number"
                min={1}
                max={31}
                placeholder="Ex: 15"
                value={fDay}
                onChange={e => setFDay(e.target.value)}
                disabled={isPending}
                className={inputCls}
              />
            </div>

            {/* Descrição */}
            <div className="sm:col-span-2">
              <label className={labelCls}>Descrição</label>
              <input
                autoFocus
                type="text"
                placeholder="Ex: Adobe Creative Cloud, aluguel de estúdio..."
                value={fDesc}
                onChange={e => setFDesc(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') resetForm() }}
                disabled={isPending}
                className={inputCls}
              />
            </div>

            {/* Valor */}
            <div>
              <label className={labelCls}>Valor mensal (R$)</label>
              <input
                type="text"
                placeholder="0,00"
                value={fAmt}
                onChange={e => setFAmt(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
                disabled={isPending}
                className={`${inputCls} text-right`}
              />
            </div>

            {/* Dedutível */}
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={fDed}
                  onChange={e => setFDed(e.target.checked)}
                  disabled={isPending}
                  className="w-4 h-4 rounded border-[#3a3a3a] bg-[#0a0a0a] accent-[#D4A853]"
                />
                <span className="text-xs text-[#a3a3a3]">Dedutível</span>
              </label>
            </div>

            {/* Notas */}
            <div className="sm:col-span-2">
              <label className={labelCls}>Notas <span className="text-[#3a3a3a]">(opcional)</span></label>
              <input
                type="text"
                placeholder="Observações..."
                value={fNotes}
                onChange={e => setFNotes(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
                disabled={isPending}
                className={inputCls}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={isPending || !fDesc.trim() || !fAmt}
              className="flex items-center gap-2 bg-[#D4A853] hover:bg-[#E8C47A] disabled:opacity-50 text-[#0a0a0a] font-semibold text-xs px-4 py-2 rounded-lg transition-colors"
            >
              {isPending ? <Spinner /> : null}
              {isPending ? 'Salvando...' : 'Confirmar'}
            </button>
            <button
              type="button"
              onClick={resetForm}
              disabled={isPending}
              className="text-xs text-[#525252] hover:text-white transition-colors px-3 py-2"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ── Lista ────────────────────────────────────────────────────────────── */}
      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#141414] border border-[#2a2a2a] flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-[#D4A853]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <p className="text-white font-semibold mb-1">Nenhum custo fixo cadastrado</p>
          <p className="text-[#525252] text-sm max-w-xs mb-6">
            Registre assinaturas, planos e mensalidades para saber seu custo base mensal.
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-[#D4A853] hover:bg-[#E8C47A] text-[#0a0a0a] font-semibold text-xs px-4 py-2 rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Cadastrar primeiro custo fixo
          </button>
        </div>
      ) : (
        <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl overflow-hidden">
          {sorted.map((item, idx) => (
            <div
              key={item.id}
              className={`flex items-center gap-3 px-4 py-3 transition-opacity ${
                item.is_active ? '' : 'opacity-40'
              } ${idx !== sorted.length - 1 ? 'border-b border-[#1c1c1c]' : ''}`}
            >
              {/* Toggle switch */}
              <button
                onClick={() => handleToggle(item.id, item.is_active)}
                disabled={togglingId === item.id}
                aria-label={item.is_active ? 'Desativar' : 'Ativar'}
                className="shrink-0 relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50"
                style={{ backgroundColor: item.is_active ? '#D4A853' : '#2a2a2a' }}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    item.is_active ? 'translate-x-[18px]' : 'translate-x-[3px]'
                  }`}
                />
              </button>

              {/* Categoria badge */}
              <FixedCostCategoryBadge category={item.category} />

              {/* Descrição + notas */}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{item.description}</p>
                <p className="text-[10px] text-[#525252] mt-0.5">
                  todo dia {item.billing_day}
                  {item.notes ? ` · ${item.notes}` : ''}
                </p>
              </div>

              {/* Dedutível */}
              {item.is_deductible && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                  Ded.
                </span>
              )}

              {/* Valor */}
              <span className="text-sm font-bold text-white shrink-0 tabular-nums">
                {formatCurrency(Number(item.amount), item.currency)}
              </span>

              {/* Delete */}
              <button
                onClick={() => handleDelete(item.id)}
                disabled={deletingId === item.id}
                className="p-1 rounded text-[#3a3a3a] hover:text-red-400 disabled:opacity-40 transition-colors shrink-0"
              >
                {deletingId === item.id ? <Spinner /> : <TrashIcon />}
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// ─── Category Badge ───────────────────────────────────────────────────────────

const FIXED_CATEGORY_COLORS: Record<FixedCostCategory, string> = {
  software:  'bg-cyan-500/10 text-cyan-400',
  internet:  'bg-blue-500/10 text-blue-400',
  equipment: 'bg-purple-500/10 text-purple-400',
  workspace: 'bg-amber-500/10 text-amber-400',
  other:     'bg-[#1c1c1c] text-[#525252]',
}

function FixedCostCategoryBadge({ category }: { category: FixedCostCategory }) {
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${FIXED_CATEGORY_COLORS[category]}`}>
      {FIXED_COST_CATEGORY_LABELS[category]}
    </span>
  )
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function TrashIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const labelCls = 'block text-[10px] font-semibold text-[#525252] tracking-widest mb-1'
const inputCls = 'w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white placeholder-[#525252] focus:outline-none focus:border-[#D4A853]/50 focus:ring-1 focus:ring-[#D4A853]/20 transition-colors'
