'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatCurrency } from '@/lib/utils/format'
import { createExpense, deleteExpense } from '@/lib/actions/expenses'
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
} from '@/types/expense'
import type { Expense, ExpenseCategory } from '@/types/expense'

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  initialExpenses: Expense[]
  monthParam:      string   // YYYY-MM
  monthLabel:      string   // "abril de 2026"
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatExpenseDate(iso: string) {
  if (!iso) return '—'
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ExpensesClient({ initialExpenses, monthParam, monthLabel }: Props) {
  const router = useRouter()

  const [expenses,    setExpenses]    = useState<Expense[]>(initialExpenses)
  const [showForm,    setShowForm]    = useState(false)
  const [isPending,   startTransition] = useTransition()
  const [deletingId,  setDeletingId]  = useState<string | null>(null)

  // Form state
  const [fCat,   setFCat]   = useState<ExpenseCategory>('other')
  const [fDesc,  setFDesc]  = useState('')
  const [fAmt,   setFAmt]   = useState('')
  const [fDate,  setFDate]  = useState(todayISO)
  const [fDed,   setFDed]   = useState(false)
  const [fNotes, setFNotes] = useState('')

  // Totals
  const totalMonth = expenses.reduce((s, e) => s + Number(e.amount), 0)
  const currency   = expenses[0]?.currency ?? 'BRL'

  // ── Month navigation ─────────────────────────────────────────────────────────

  function navigate(delta: number) {
    const [y, m] = monthParam.split('-').map(Number)
    const date   = new Date(y, m - 1 + delta, 1)
    const newParam = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    router.push(`/expenses?month=${newParam}`)
  }

  // ── Add expense ──────────────────────────────────────────────────────────────

  function resetForm() {
    setFCat('other'); setFDesc(''); setFAmt(''); setFDate(todayISO()); setFDed(false); setFNotes('')
    setShowForm(false)
  }

  function handleSubmit() {
    const amount = parseFloat(fAmt.replace(',', '.'))
    if (!fDesc.trim() || isNaN(amount) || amount <= 0) return

    startTransition(async () => {
      const res = await createExpense({
        description:   fDesc,
        category:      fCat,
        amount,
        expense_date:  fDate,
        is_deductible: fDed,
        notes:         fNotes || undefined,
      })
      if (res.success && res.data) {
        // Só adiciona ao estado local se a data está no mês atual exibido
        const [py, pm] = monthParam.split('-')
        const [ey, em] = fDate.split('-')
        if (ey === py && em === pm) {
          setExpenses(prev => [res.data!, ...prev])
        }
        resetForm()
      }
    })
  }

  // ── Delete ───────────────────────────────────────────────────────────────────

  async function handleDelete(id: string) {
    if (!window.confirm('Excluir esta despesa?')) return
    setDeletingId(id)
    const res = await deleteExpense(id)
    setDeletingId(null)
    if (res.success) {
      setExpenses(prev => prev.filter(e => e.id !== id))
    }
  }

  // ── Empty state ──────────────────────────────────────────────────────────────

  const isEmpty = expenses.length === 0 && !showForm

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Navegação de mês ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => navigate(-1)}
          className="p-1.5 rounded-lg text-[#525252] hover:text-white hover:bg-[#1a1a1a] transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-sm text-[#a3a3a3] capitalize min-w-[140px] text-center">{monthLabel}</span>
        <button onClick={() => navigate(+1)}
          className="p-1.5 rounded-lg text-[#525252] hover:text-white hover:bg-[#1a1a1a] transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <span className="text-xs text-[#525252] ml-2">
          {expenses.length} despesa{expenses.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Card de total ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-4">
          <p className="text-[10px] font-semibold text-[#525252] tracking-widest mb-1">TOTAL DO MÊS</p>
          <p className="text-xl font-bold text-white">{formatCurrency(totalMonth, currency)}</p>
        </div>
        <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-4 flex items-center justify-end">
          <button
            onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-2 bg-[#D4A853] hover:bg-[#E8C47A] text-[#0a0a0a] font-semibold text-xs px-4 py-2 rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nova despesa
          </button>
        </div>
      </div>

      {/* ── Formulário inline ────────────────────────────────────────────────── */}
      {showForm && (
        <div className="bg-[#141414] border border-[#D4A853]/30 rounded-xl p-4 mb-4">
          <p className="text-xs font-semibold text-[#D4A853] mb-3 tracking-wide">NOVA DESPESA</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            {/* Categoria */}
            <div>
              <label className={labelCls}>Categoria</label>
              <select value={fCat} onChange={e => setFCat(e.target.value as ExpenseCategory)}
                disabled={isPending} className={inputCls}>
                {EXPENSE_CATEGORIES.map(([v, l]) => (
                  <option key={v} value={v} className="bg-[#141414]">{l}</option>
                ))}
              </select>
            </div>

            {/* Data */}
            <div>
              <label className={labelCls}>Data</label>
              <input type="date" value={fDate} onChange={e => setFDate(e.target.value)}
                disabled={isPending} className={inputCls} />
            </div>

            {/* Descrição */}
            <div className="sm:col-span-2">
              <label className={labelCls}>Descrição</label>
              <input
                autoFocus
                type="text"
                placeholder="Ex: Adobe Creative Cloud, almoço cliente..."
                value={fDesc}
                onChange={e => setFDesc(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') resetForm() }}
                disabled={isPending}
                className={inputCls}
              />
            </div>

            {/* Valor */}
            <div>
              <label className={labelCls}>Valor (R$)</label>
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

            {/* Notas (opcional) */}
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

      {/* ── Lista de despesas ────────────────────────────────────────────────── */}
      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#141414] border border-[#2a2a2a] flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-[#D4A853]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <p className="text-white font-semibold mb-1">Nenhuma despesa em {monthLabel}</p>
          <p className="text-[#525252] text-sm max-w-xs mb-6">
            Registre seus gastos mensais para calcular o lucro real.
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-[#D4A853] hover:bg-[#E8C47A] text-[#0a0a0a] font-semibold text-xs px-4 py-2 rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Registrar primeira despesa
          </button>
        </div>
      ) : (
        <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl overflow-hidden">
          {expenses.map((expense, idx) => (
            <div
              key={expense.id}
              className={`flex items-center gap-3 px-4 py-3 ${
                idx !== expenses.length - 1 ? 'border-b border-[#1c1c1c]' : ''
              }`}
            >
              {/* Data */}
              <span className="text-xs text-[#525252] w-10 shrink-0 tabular-nums">
                {formatExpenseDate(expense.expense_date)}
              </span>

              {/* Categoria badge */}
              <ExpenseCategoryBadge category={expense.category} />

              {/* Descrição + notas */}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{expense.description}</p>
                {expense.notes && (
                  <p className="text-[10px] text-[#525252] truncate mt-0.5">{expense.notes}</p>
                )}
              </div>

              {/* Dedutível */}
              {expense.is_deductible && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                  Ded.
                </span>
              )}

              {/* Valor */}
              <span className="text-sm font-bold text-white shrink-0 tabular-nums">
                {formatCurrency(Number(expense.amount), expense.currency)}
              </span>

              {/* Delete */}
              <button
                onClick={() => handleDelete(expense.id)}
                disabled={deletingId === expense.id}
                className="p-1 rounded text-[#3a3a3a] hover:text-red-400 disabled:opacity-40 transition-colors shrink-0"
              >
                {deletingId === expense.id ? <Spinner /> : <TrashIcon />}
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// ─── Category Badge ───────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  food:      'bg-orange-500/10 text-orange-400',
  transport: 'bg-blue-500/10 text-blue-400',
  equipment: 'bg-purple-500/10 text-purple-400',
  software:  'bg-cyan-500/10 text-cyan-400',
  marketing: 'bg-pink-500/10 text-pink-400',
  other:     'bg-[#1c1c1c] text-[#525252]',
}

function ExpenseCategoryBadge({ category }: { category: ExpenseCategory }) {
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${CATEGORY_COLORS[category]}`}>
      {EXPENSE_CATEGORY_LABELS[category]}
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
