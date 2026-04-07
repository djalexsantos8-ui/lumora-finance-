'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatCurrency } from '@/lib/utils/format'
import { createExpense, deleteExpense, markExpensePaid } from '@/lib/actions/expenses'
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
} from '@/types/expense'
import type { Expense, ExpenseCategory } from '@/types/expense'

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  initialExpenses: Expense[]
  monthParam:      string
  monthLabel:      string
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

function toMonthLabel(yyyyMM: string): string {
  const [y, m] = yyyyMM.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ExpensesClient({ initialExpenses, monthParam, monthLabel }: Props) {
  const router = useRouter()

  const [expenses,    setExpenses]     = useState<Expense[]>(initialExpenses)
  const [showForm,    setShowForm]     = useState(false)
  const [isPending,   startTransition] = useTransition()
  const [deletingId,  setDeletingId]   = useState<string | null>(null)

  // Feedback
  const [successMsg, setSuccessMsg] = useState<{ text: string; targetMonth?: string } | null>(null)
  const [errorMsg,   setErrorMsg]   = useState<string | null>(null)

  // Form state
  const [fCat,         setFCat]         = useState<ExpenseCategory>('other')
  const [fDesc,        setFDesc]        = useState('')
  const [fAmt,         setFAmt]         = useState('')
  const [fDate,        setFDate]        = useState(todayISO)
  const [fDed,         setFDed]         = useState(false)
  const [fNotes,       setFNotes]       = useState('')
  const [fInstallment, setFInstallment] = useState(false)
  const [fQty,         setFQty]         = useState('2')
  const [fAmtMode,     setFAmtMode]     = useState<'total' | 'per'>('total')

  // Pagamento
  const [expandedId,   setExpandedId]   = useState<string | null>(null)
  const [payingId,     setPayingId]     = useState<string | null>(null)
  const [payModal,     setPayModal]     = useState<{ id: string; original: number; currentPaid: number | null } | null>(null)
  const [payCustomAmt, setPayCustomAmt] = useState('')
  const [payingModal,  setPayingModal]  = useState(false)

  // Totals
  const totalMonth  = expenses.reduce((s, e) => s + Number(e.amount), 0)
  const totalPaid   = expenses.filter(e => e.is_paid).reduce((s, e) => s + Number(e.paid_amount ?? e.amount), 0)
  const totalUnpaid = totalMonth - expenses.filter(e => e.is_paid).reduce((s, e) => s + Number(e.amount), 0)
  const currency    = expenses[0]?.currency ?? 'BRL'

  // Preview parcelamento
  const previewInstallment = (() => {
    const raw = parseFloat(fAmt.replace(',', '.'))
    const qty = parseInt(fQty, 10)
    if (isNaN(raw) || raw <= 0 || isNaN(qty) || qty < 2) return null
    const per   = fAmtMode === 'total' ? raw / qty : raw
    const total = fAmtMode === 'per'   ? raw * qty : raw
    return { per, total, qty }
  })()

  // ── Month navigation ─────────────────────────────────────────────────────────

  function navigate(delta: number) {
    const [y, m] = monthParam.split('-').map(Number)
    const date   = new Date(y, m - 1 + delta, 1)
    const newParam = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    router.push(`/expenses?month=${newParam}`)
  }

  // ── Form ─────────────────────────────────────────────────────────────────────

  function resetForm() {
    setFCat('other'); setFDesc(''); setFAmt(''); setFDate(todayISO())
    setFDed(false); setFNotes(''); setFInstallment(false); setFQty('2'); setFAmtMode('total')
    setShowForm(false); setErrorMsg(null)
  }

  function handleSubmit() {
    const rawAmt = parseFloat(fAmt.replace(',', '.'))
    if (!fDesc.trim() || isNaN(rawAmt) || rawAmt <= 0) return
    const qty    = parseInt(fQty, 10)
    const amount = fInstallment && fAmtMode === 'per' ? rawAmt * qty : rawAmt

    startTransition(async () => {
      setErrorMsg(null); setSuccessMsg(null)
      const res = await createExpense({
        description: fDesc, category: fCat, amount,
        expense_date: fDate, is_deductible: fDed,
        notes: fNotes || undefined,
        is_installment: fInstallment,
        installments_total: fInstallment ? qty : undefined,
      })

      if (!res.success) { setErrorMsg(res.error); return }

      const [py, pm] = monthParam.split('-')
      if ('installments' in res && res.installments) {
        const n = res.installments.length
        const inMonth = res.installments.filter(e => {
          const [ey, em] = e.expense_date.split('-')
          return ey === py && em === pm
        })
        if (inMonth.length > 0) setExpenses(prev => [...inMonth, ...prev])
        const firstMonth   = fDate.slice(0, 7)
        const isSameMonth  = firstMonth === monthParam
        setSuccessMsg({ text: `${n} parcela${n !== 1 ? 's' : ''} lançada${n !== 1 ? 's' : ''} com sucesso`, targetMonth: isSameMonth ? undefined : firstMonth })
      } else if (res.data) {
        const expMonth    = fDate.slice(0, 7)
        const isSameMonth = expMonth === monthParam
        if (isSameMonth) setExpenses(prev => [res.data!, ...prev])
        setSuccessMsg({ text: 'Despesa salva com sucesso', targetMonth: isSameMonth ? undefined : expMonth })
      }

      setFCat('other'); setFDesc(''); setFAmt(''); setFDate(todayISO())
      setFDed(false); setFNotes(''); setFInstallment(false); setFQty('2'); setFAmtMode('total')
      setShowForm(false)
      setTimeout(() => setSuccessMsg(null), 6000)
    })
  }

  // ── Delete ───────────────────────────────────────────────────────────────────

  async function handleDelete(id: string) {
    if (!window.confirm('Excluir esta despesa?')) return
    setDeletingId(id)
    const res = await deleteExpense(id)
    setDeletingId(null)
    if (res.success) setExpenses(prev => prev.filter(e => e.id !== id))
  }

  // ── Pagamento rápido (sem modal) ─────────────────────────────────────────────

  async function handleQuickPay(expense: Expense) {
    setPayingId(expense.id)
    const res = await markExpensePaid(expense.id)
    setPayingId(null)
    if (res.success) {
      setExpenses(prev => prev.map(e =>
        e.id === expense.id
          ? { ...e, is_paid: true, paid_amount: Number(expense.amount), paid_at: new Date().toISOString() }
          : e
      ))
      setSuccessMsg({ text: 'Despesa marcada como paga ✓' })
      setTimeout(() => setSuccessMsg(null), 4000)
    } else {
      setErrorMsg(res.error)
    }
  }

  // ── Pagamento pelo modal (com valor customizado) ──────────────────────────────

  async function handleModalPay() {
    if (!payModal) return
    const customRaw = payCustomAmt ? parseFloat(payCustomAmt.replace(',', '.')) : null
    const paidAmt   = customRaw && customRaw > 0 ? customRaw : payModal.original

    setPayingModal(true)
    const res = await markExpensePaid(payModal.id, paidAmt)
    setPayingModal(false)

    if (res.success) {
      const discount = payModal.original - paidAmt
      setExpenses(prev => prev.map(e =>
        e.id === payModal.id
          ? { ...e, is_paid: true, paid_amount: paidAmt, paid_at: new Date().toISOString() }
          : e
      ))
      setPayModal(null); setPayCustomAmt('')
      setSuccessMsg({
        text: discount > 0.005
          ? `Despesa quitada com desconto de ${formatCurrency(discount, 'BRL')}`
          : 'Despesa quitada ✓'
      })
      setTimeout(() => setSuccessMsg(null), 5000)
    } else {
      setErrorMsg(res.error)
    }
  }

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

      {/* ── Banner de sucesso ────────────────────────────────────────────────── */}
      {successMsg && (
        <div className="flex items-center justify-between gap-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3 mb-4">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <div>
              <p className="text-sm font-semibold text-emerald-400">{successMsg.text}</p>
              {successMsg.targetMonth && (
                <p className="text-xs text-emerald-400/70 mt-0.5">Lançado em {toMonthLabel(successMsg.targetMonth)}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {successMsg.targetMonth && (
              <button onClick={() => { setSuccessMsg(null); router.push(`/expenses?month=${successMsg.targetMonth}`) }}
                className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 border border-emerald-500/40 px-2.5 py-1 rounded-lg transition-colors">
                Ver em {toMonthLabel(successMsg.targetMonth).split(' ')[0]}
              </button>
            )}
            <button onClick={() => setSuccessMsg(null)} className="text-emerald-400/50 hover:text-emerald-400 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* ── Banner de erro ────────────────────────────────────────────────────── */}
      {errorMsg && (
        <div className="flex items-center justify-between gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 mb-4">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm font-semibold text-red-400">{errorMsg}</p>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-red-400/50 hover:text-red-400 transition-colors shrink-0">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* ── Cards de resumo ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-4">
          <p className="text-[10px] font-semibold text-[#525252] tracking-widest mb-1">TOTAL DO MÊS</p>
          <p className="text-xl font-bold text-white">{formatCurrency(totalMonth, currency)}</p>
          {totalPaid > 0 && (
            <p className="text-[10px] text-emerald-400 mt-1">
              {formatCurrency(totalPaid, currency)} pago
              {totalUnpaid > 0 && <span className="text-[#525252]"> · {formatCurrency(totalUnpaid, currency)} em aberto</span>}
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
            Nova despesa
          </button>
        </div>
      </div>

      {/* ── Formulário inline ────────────────────────────────────────────────── */}
      {showForm && (
        <div className="bg-[#141414] border border-[#D4A853]/30 rounded-xl p-4 mb-4">
          <p className="text-xs font-semibold text-[#D4A853] mb-3 tracking-wide">NOVA DESPESA</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label className={labelCls}>Categoria</label>
              <select value={fCat} onChange={e => setFCat(e.target.value as ExpenseCategory)}
                disabled={isPending} className={inputCls}>
                {EXPENSE_CATEGORIES.map(([v, l]) => (
                  <option key={v} value={v} className="bg-[#141414]">{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Data {fInstallment ? 'da 1ª parcela' : ''}</label>
              <input type="date" value={fDate} onChange={e => setFDate(e.target.value)}
                disabled={isPending} className={inputCls} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Descrição</label>
              <input autoFocus type="text" placeholder="Ex: Adobe Creative Cloud, almoço cliente..."
                value={fDesc} onChange={e => setFDesc(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') resetForm() }}
                disabled={isPending} className={inputCls} />
            </div>
            <div className="sm:col-span-2">
              <button type="button" onClick={() => setFInstallment(v => !v)} disabled={isPending}
                className="flex items-center gap-2 text-xs text-[#a3a3a3] hover:text-white transition-colors">
                <span className="relative inline-flex h-4 w-7 items-center rounded-full transition-colors"
                  style={{ backgroundColor: fInstallment ? '#D4A853' : '#2a2a2a' }}>
                  <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${fInstallment ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                </span>
                Compra parcelada
              </button>
            </div>
            {fInstallment && (
              <>
                <div>
                  <label className={labelCls}>Número de parcelas</label>
                  <input type="number" min={2} max={60} placeholder="Ex: 10" value={fQty}
                    onChange={e => setFQty(e.target.value)} disabled={isPending} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Informar</label>
                  <select value={fAmtMode} onChange={e => setFAmtMode(e.target.value as 'total' | 'per')}
                    disabled={isPending} className={inputCls}>
                    <option value="total" className="bg-[#141414]">Valor total da compra</option>
                    <option value="per"   className="bg-[#141414]">Valor de cada parcela</option>
                  </select>
                </div>
              </>
            )}
            <div>
              <label className={labelCls}>
                {fInstallment ? (fAmtMode === 'total' ? 'Valor total (R$)' : 'Valor por parcela (R$)') : 'Valor (R$)'}
              </label>
              <input type="text" placeholder="0,00" value={fAmt} onChange={e => setFAmt(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
                disabled={isPending} className={`${inputCls} text-right`} />
            </div>
            {fInstallment && previewInstallment && (
              <div className="sm:col-span-2 bg-[#D4A853]/8 border border-[#D4A853]/20 rounded-lg px-3 py-2">
                <p className="text-[11px] text-[#D4A853]">
                  {previewInstallment.qty}× de <span className="font-bold">{formatCurrency(previewInstallment.per, 'BRL')}</span>
                  {' '}= total de <span className="font-bold">{formatCurrency(previewInstallment.total, 'BRL')}</span>
                </p>
                <p className="text-[10px] text-[#525252] mt-0.5">
                  As próximas parcelas serão lançadas automaticamente nos meses seguintes
                </p>
              </div>
            )}
            <div className="flex items-end pb-2">
              <div>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={fDed} onChange={e => setFDed(e.target.checked)}
                    disabled={isPending}
                    className="w-4 h-4 rounded border-[#3a3a3a] bg-[#0a0a0a] accent-[#D4A853]" />
                  <span className="text-xs text-[#a3a3a3]">Pode abater no imposto</span>
                </label>
                {fDed && (
                  <p className="text-[10px] text-[#525252] mt-1 ml-6">Ex: softwares, equipamentos e despesas profissionais</p>
                )}
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Notas <span className="text-[#3a3a3a]">(opcional)</span></label>
              <input type="text" placeholder="Observações..." value={fNotes}
                onChange={e => setFNotes(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
                disabled={isPending} className={inputCls} />
            </div>
          </div>

          {errorMsg && (
            <div className="flex items-center gap-2 mb-3 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              <svg className="w-3.5 h-3.5 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-xs text-red-400">{errorMsg}</p>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={handleSubmit} disabled={isPending || !fDesc.trim() || !fAmt}
              className="flex items-center gap-2 bg-[#D4A853] hover:bg-[#E8C47A] disabled:opacity-50 text-[#0a0a0a] font-semibold text-xs px-4 py-2 rounded-lg transition-colors">
              {isPending ? <Spinner /> : null}
              {isPending ? 'Salvando...' : fInstallment && previewInstallment ? `Lançar ${previewInstallment.qty} parcelas` : 'Confirmar'}
            </button>
            <button type="button" onClick={resetForm} disabled={isPending}
              className="text-xs text-[#525252] hover:text-white transition-colors px-3 py-2">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ── Lista ─────────────────────────────────────────────────────────────── */}
      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#141414] border border-[#2a2a2a] flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-[#D4A853]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <p className="text-white font-semibold mb-1">Nenhuma despesa em {monthLabel}</p>
          <p className="text-[#525252] text-sm max-w-xs mb-6">Registre seus gastos mensais para calcular o lucro real.</p>
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-[#D4A853] hover:bg-[#E8C47A] text-[#0a0a0a] font-semibold text-xs px-4 py-2 rounded-lg transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Registrar primeira despesa
          </button>
        </div>
      ) : (
        <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl overflow-hidden">
          {expenses.map((expense, idx) => {
            const isExpanded = expandedId === expense.id
            const isPaying   = payingId === expense.id
            const discount   = expense.is_paid && expense.paid_amount != null
              ? Number(expense.amount) - Number(expense.paid_amount)
              : 0

            return (
              <div key={expense.id} className={idx !== expenses.length - 1 ? 'border-b border-[#1c1c1c]' : ''}>
                {/* ── Linha principal ─────────────────────────────────────── */}
                <div className={`flex items-center gap-3 px-4 py-3 transition-opacity ${expense.is_paid ? 'opacity-60' : ''}`}>

                  {/* Data */}
                  <span className="text-xs text-[#525252] w-10 shrink-0 tabular-nums">
                    {formatExpenseDate(expense.expense_date)}
                  </span>

                  {/* Categoria badge */}
                  <ExpenseCategoryBadge category={expense.category} />

                  {/* Descrição — clicável para expandir */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : expense.id)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <p className="text-sm text-white truncate">{expense.description}</p>
                    {expense.notes && (
                      <p className="text-[10px] text-[#525252] truncate mt-0.5">{expense.notes}</p>
                    )}
                  </button>

                  {/* Badge parcela */}
                  {expense.is_installment && expense.installment_index && expense.installments_total && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20 shrink-0 tabular-nums">
                      {expense.installment_index}/{expense.installments_total}
                    </span>
                  )}

                  {/* Badge dedutível */}
                  {expense.is_deductible && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                      Abate imp.
                    </span>
                  )}

                  {/* Valor */}
                  <span className={`text-sm font-bold shrink-0 tabular-nums ${expense.is_paid ? 'text-[#525252] line-through' : 'text-white'}`}>
                    {formatCurrency(Number(expense.amount), expense.currency)}
                  </span>

                  {/* Botão pagar / badge pago */}
                  {expense.is_paid ? (
                    <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 shrink-0">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      Pago
                    </span>
                  ) : (
                    <button
                      onClick={() => handleQuickPay(expense)}
                      disabled={isPaying}
                      title="Marcar como pago"
                      className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full border border-[#3a3a3a] text-[#525252] hover:border-emerald-500/50 hover:text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-40 transition-all shrink-0"
                    >
                      {isPaying ? <Spinner /> : (
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                      {isPaying ? '' : 'Pagar'}
                    </button>
                  )}

                  {/* Delete */}
                  <button onClick={() => handleDelete(expense.id)} disabled={deletingId === expense.id}
                    className="p-1 rounded text-[#3a3a3a] hover:text-red-400 disabled:opacity-40 transition-colors shrink-0">
                    {deletingId === expense.id ? <Spinner /> : <TrashIcon />}
                  </button>
                </div>

                {/* ── Painel de detalhe expandido ─────────────────────────── */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-1 bg-[#0f0f0f] border-t border-[#1c1c1c]">
                    <p className="text-[10px] font-semibold text-[#525252] tracking-widest mb-3">PAGAMENTO</p>

                    {expense.is_paid ? (
                      <div className="space-y-1 mb-3">
                        <div className="flex items-center gap-2">
                          <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <span className="text-xs font-semibold text-emerald-400">
                            Pago em {expense.paid_at ? formatExpenseDate(expense.paid_at.slice(0, 10)) : '—'}
                          </span>
                        </div>
                        <p className="text-xs text-[#a3a3a3] ml-5">
                          Valor pago: <span className="font-bold text-white">{formatCurrency(Number(expense.paid_amount ?? expense.amount), expense.currency)}</span>
                        </p>
                        {discount > 0.005 && (
                          <p className="text-xs text-amber-400 ml-5">
                            Desconto: {formatCurrency(discount, expense.currency)}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-[#525252] mb-3">Em aberto · {formatCurrency(Number(expense.amount), expense.currency)}</p>
                    )}

                    <button
                      onClick={() => {
                        setPayModal({ id: expense.id, original: Number(expense.amount), currentPaid: expense.paid_amount != null ? Number(expense.paid_amount) : null })
                        setPayCustomAmt('')
                      }}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-[#3a3a3a] text-[#a3a3a3] hover:border-emerald-500/50 hover:text-emerald-400 hover:bg-emerald-500/8 transition-all"
                    >
                      {expense.is_paid ? 'Editar pagamento' : 'Quitar despesa'}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Modal de quitação ─────────────────────────────────────────────────── */}
      {payModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <p className="text-sm font-bold text-white mb-1">Quitar despesa</p>
            <p className="text-xs text-[#525252] mb-5">
              Valor original: <span className="text-white font-semibold">{formatCurrency(payModal.original, 'BRL')}</span>
            </p>

            <div className="mb-4">
              <label className={labelCls}>Valor pago (R$) <span className="text-[#3a3a3a] normal-case font-normal">— deixe vazio para usar o valor original</span></label>
              <input
                autoFocus
                type="text"
                placeholder={String(payModal.original.toFixed(2)).replace('.', ',')}
                value={payCustomAmt}
                onChange={e => setPayCustomAmt(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleModalPay(); if (e.key === 'Escape') { setPayModal(null); setPayCustomAmt('') } }}
                className={`${inputCls} text-right`}
              />
              {/* Preview do desconto */}
              {(() => {
                const raw = parseFloat(payCustomAmt.replace(',', '.'))
                if (!isNaN(raw) && raw > 0 && raw < payModal.original) {
                  return (
                    <p className="text-[10px] text-amber-400 mt-1.5">
                      Desconto de {formatCurrency(payModal.original - raw, 'BRL')} será registrado
                    </p>
                  )
                }
                return null
              })()}
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleModalPay}
                disabled={payingModal}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-xs px-4 py-2 rounded-lg transition-colors flex-1 justify-center"
              >
                {payingModal ? <Spinner /> : null}
                {payingModal ? 'Salvando...' : 'Confirmar quitação'}
              </button>
              <button
                type="button"
                onClick={() => { setPayModal(null); setPayCustomAmt('') }}
                disabled={payingModal}
                className="text-xs text-[#525252] hover:text-white transition-colors px-3 py-2"
              >
                Cancelar
              </button>
            </div>
          </div>
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
