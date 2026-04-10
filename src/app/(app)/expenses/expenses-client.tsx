'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { formatCurrency, todayISO } from '@/lib/utils/format'
import { createExpense, deleteExpense, markExpensePaid, getInstallmentsRemaining, settleSelectedInstallments } from '@/lib/actions/expenses'
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

// ─── Settle item (parcela em aberto) ─────────────────────────────────────────

interface SettleItem {
  id:                string
  amount:            number
  amount_brl:        number | null
  currency:          string
  expense_date:      string
  installment_index: number | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────


function formatExpenseDate(iso: string) {
  if (!iso) return '—'
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

function toMonthLabel(yyyyMM: string): string {
  const [y, m] = yyyyMM.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

// Formata valor em moeda original — lida com 'OTHER' (sem símbolo Intl)
function formatAmount(amount: number, currency: string): string {
  if (currency === 'OTHER') return amount.toFixed(2)
  try { return formatCurrency(amount, currency) }
  catch { return `${amount.toFixed(2)} ${currency}` }
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

  // Form — campos base
  const [fCat,         setFCat]         = useState<ExpenseCategory>('other')
  const [fDesc,        setFDesc]        = useState('')
  const [fAmt,         setFAmt]         = useState('')
  const [fDate,        setFDate]        = useState(todayISO)
  const [fDed,         setFDed]         = useState(false)
  const [fNotes,       setFNotes]       = useState('')
  const [fInstallment, setFInstallment] = useState(false)
  const [fQty,         setFQty]         = useState('2')
  const [fAmtMode,     setFAmtMode]     = useState<'total' | 'per'>('total')

  // Form — multimoeda
  const [fCurrency,     setFCurrency]     = useState('BRL')
  const [fExchangeRate, setFExchangeRate] = useState<number | null>(null)
  const [fManualRate,   setFManualRate]   = useState('')
  const [fIof,          setFIof]          = useState(false)
  const [loadingRate,   setLoadingRate]   = useState(false)
  const [rateError,     setRateError]     = useState(false)

  // Pagamento
  const [expandedId,   setExpandedId]   = useState<string | null>(null)
  const [payingId,     setPayingId]     = useState<string | null>(null)
  const [payModal,     setPayModal]     = useState<{ id: string; original: number; isMulti: boolean } | null>(null)
  const [payCustomAmt, setPayCustomAmt] = useState('')
  const [payingModal,  setPayingModal]  = useState(false)

  // Quitação de parcelas restantes
  const [settleModal,   setSettleModal]   = useState<{ parentId: string; items: SettleItem[]; selected: string[] } | null>(null)
  const [settlePaidAmt, setSettlePaidAmt] = useState('')
  const [settling,      setSettling]      = useState(false)
  const [loadingSettle, setLoadingSettle] = useState(false)

  // ── Busca cotação automática ─────────────────────────────────────────────────

  useEffect(() => {
    if (fCurrency === 'BRL' || fCurrency === 'OTHER') {
      setFExchangeRate(null)
      setFIof(false)
      setRateError(false)
      return
    }
    let cancelled = false
    setLoadingRate(true)
    setRateError(false)
    fetch(`/api/exchange-rate?currency=${fCurrency}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        if (d.rate) { setFExchangeRate(d.rate); setRateError(false) }
        else        { setFExchangeRate(null); setRateError(true) }
      })
      .catch(() => { if (!cancelled) { setFExchangeRate(null); setRateError(true) } })
      .finally(() => { if (!cancelled) setLoadingRate(false) })
    return () => { cancelled = true }
  }, [fCurrency])

  // ── Derivados ────────────────────────────────────────────────────────────────

  // Taxa efetiva: auto-buscada para USD/EUR, manual para OTHER
  const effectiveRate = fCurrency === 'OTHER'
    ? (parseFloat(fManualRate.replace(',', '.')) || null)
    : fExchangeRate

  // Totais sempre em BRL (usa amount_brl quando disponível)
  const totalMonth  = expenses.reduce((s, e) => s + Number(e.amount_brl ?? e.amount), 0)
  const totalPaid   = expenses.filter(e => e.is_paid).reduce((s, e) => {
    const base = e.amount_brl ?? e.amount
    return s + Number(e.paid_amount ?? base)
  }, 0)
  const totalUnpaid = expenses.filter(e => !e.is_paid).reduce((s, e) => s + Number(e.amount_brl ?? e.amount), 0)

  // Preview parcelamento
  const previewInstallment = (() => {
    const raw = parseFloat(fAmt.replace(',', '.'))
    const qty = parseInt(fQty, 10)
    if (isNaN(raw) || raw <= 0 || isNaN(qty) || qty < 2) return null
    const per   = fAmtMode === 'total' ? raw / qty : raw
    const total = fAmtMode === 'per'   ? raw * qty : raw
    return { per, total, qty }
  })()

  // Preview conversão BRL
  const previewBRL = (() => {
    if (fCurrency === 'BRL' || !effectiveRate) return null
    const raw = parseFloat(fAmt.replace(',', '.'))
    if (isNaN(raw) || raw <= 0) return null
    const qty = parseInt(fQty, 10)
    const amt = fInstallment && fAmtMode === 'per' && !isNaN(qty) ? raw * qty : raw
    const brl = amt * effectiveRate
    const iof = fIof ? brl * 0.0638 : 0
    const total = brl + iof
    const perInstallment = fInstallment && !isNaN(qty) && qty >= 2 ? total / qty : null
    return { brl, iof, total, perInstallment }
  })()

  const canSubmit = Boolean(fDesc.trim() && fAmt && !isPending &&
    (fCurrency === 'BRL' || effectiveRate != null))

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
    setFCurrency('BRL'); setFExchangeRate(null); setFManualRate(''); setFIof(false)
    setRateError(false)
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
        description:        fDesc,
        category:           fCat,
        amount,
        currency:           fCurrency,
        expense_date:       fDate,
        is_deductible:      fDed,
        notes:              fNotes || undefined,
        is_installment:     fInstallment,
        installments_total: fInstallment ? qty : undefined,
        exchange_rate:      effectiveRate ?? undefined,
        iof_applied:        fCurrency !== 'BRL' ? fIof : undefined,
      })

      if (!res.success) { setErrorMsg(res.message); return }

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

      // Reset form
      setFCat('other'); setFDesc(''); setFAmt(''); setFDate(todayISO())
      setFDed(false); setFNotes(''); setFInstallment(false); setFQty('2'); setFAmtMode('total')
      setFCurrency('BRL'); setFExchangeRate(null); setFManualRate(''); setFIof(false)
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

  // ── Pagamento rápido ─────────────────────────────────────────────────────────

  async function handleQuickPay(expense: Expense) {
    setPayingId(expense.id)
    // Para despesas em moeda estrangeira, pagar o valor em BRL
    const paidAmt = expense.currency !== 'BRL' && expense.amount_brl != null
      ? Number(expense.amount_brl)
      : undefined
    const res = await markExpensePaid(expense.id, paidAmt)
    setPayingId(null)
    if (res.success) {
      const stored = paidAmt ?? Number(expense.amount_brl ?? expense.amount)
      setExpenses(prev => prev.map(e =>
        e.id === expense.id
          ? { ...e, is_paid: true, paid_amount: stored, paid_at: new Date().toISOString() }
          : e
      ))
      setSuccessMsg({ text: 'Despesa marcada como paga ✓' })
      setTimeout(() => setSuccessMsg(null), 4000)
    } else {
      setErrorMsg(res.message)
    }
  }

  // ── Pagamento pelo modal ──────────────────────────────────────────────────────

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
      setErrorMsg(res.message)
    }
  }

  // ── Quitar parcelas restantes ────────────────────────────────────────────────

  // Total BRL das parcelas selecionadas no modal
  const settleTotal = settleModal
    ? settleModal.items
        .filter(i => settleModal.selected.includes(i.id))
        .reduce((s, i) => s + Number(i.amount_brl ?? i.amount), 0)
    : 0

  const allSettleSelected = settleModal
    ? settleModal.selected.length === settleModal.items.length
    : false

  async function handleOpenSettle(expense: Expense) {
    setLoadingSettle(true)
    const res = await getInstallmentsRemaining(expense.id)
    setLoadingSettle(false)
    if (!res.success || !res.installments) {
      setErrorMsg(res.message ?? 'Erro ao buscar parcelas.')
      return
    }
    setSettleModal({
      parentId: res.parentId!,
      items:    res.installments,
      selected: res.installments.map(i => i.id), // all pre-selected
    })
    setSettlePaidAmt('')
  }

  function toggleSettleItem(id: string) {
    if (!settleModal) return
    const has = settleModal.selected.includes(id)
    setSettleModal({
      ...settleModal,
      selected: has
        ? settleModal.selected.filter(s => s !== id)
        : [...settleModal.selected, id],
    })
  }

  function toggleAllSettle() {
    if (!settleModal) return
    setSettleModal({
      ...settleModal,
      selected: allSettleSelected ? [] : settleModal.items.map(i => i.id),
    })
  }

  async function handleSettle() {
    if (!settleModal || settleModal.selected.length === 0) return
    const customRaw = settlePaidAmt ? parseFloat(settlePaidAmt.replace(',', '.')) : null
    const paidAmt   = customRaw && customRaw > 0 && customRaw < settleTotal ? customRaw : undefined

    setSettling(true)
    const res = await settleSelectedInstallments(settleModal.selected, paidAmt)
    setSettling(false)

    if (!res.success) { setErrorMsg(res.message ?? 'Erro ao quitar parcelas.'); return }

    // Atualiza otimisticamente as parcelas quitadas na lista atual
    const now       = new Date().toISOString()
    const settledSet = new Set(settleModal.selected)
    setExpenses(prev => prev.map(e => {
      if (settledSet.has(e.id) && !e.is_paid) {
        return { ...e, is_paid: true, paid_at: now, paid_amount: Number(e.amount_brl ?? e.amount) }
      }
      return e
    }))

    setSettleModal(null); setSettlePaidAmt('')
    setSuccessMsg({ text: `${res.count} parcela${(res.count ?? 0) !== 1 ? 's' : ''} quitada${(res.count ?? 0) !== 1 ? 's' : ''} ✓` })
    setTimeout(() => setSuccessMsg(null), 5000)
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
          <p className="text-xl font-bold text-white">{formatCurrency(totalMonth, 'BRL')}</p>
          {totalPaid > 0 && (
            <p className="text-[10px] text-emerald-400 mt-1">
              {formatCurrency(totalPaid, 'BRL')} pago
              {totalUnpaid > 0 && <span className="text-[#525252]"> · {formatCurrency(totalUnpaid, 'BRL')} em aberto</span>}
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
              <label className={labelCls}>Data {fInstallment ? 'da 1ª parcela' : ''}</label>
              <input type="date" value={fDate} onChange={e => setFDate(e.target.value)}
                disabled={isPending} className={inputCls} />
            </div>

            {/* Descrição */}
            <div className="sm:col-span-2">
              <label className={labelCls}>Descrição</label>
              <input autoFocus type="text" placeholder="Ex: Adobe Creative Cloud, almoço cliente..."
                value={fDesc} onChange={e => setFDesc(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') resetForm() }}
                disabled={isPending} className={inputCls} />
            </div>

            {/* Toggle parcelado */}
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

            {/* Qtd parcelas + modo de valor */}
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

            {/* Moeda */}
            <div>
              <label className={labelCls}>Moeda</label>
              <select
                value={fCurrency}
                onChange={e => { setFCurrency(e.target.value); setFManualRate(''); setFIof(false) }}
                disabled={isPending}
                className={inputCls}
              >
                <option value="BRL" className="bg-[#141414]">BRL — Real</option>
                <option value="USD" className="bg-[#141414]">USD — Dólar</option>
                <option value="EUR" className="bg-[#141414]">EUR — Euro</option>
                <option value="OTHER" className="bg-[#141414]">Outra moeda</option>
              </select>
            </div>

            {/* Valor */}
            <div>
              <label className={labelCls}>
                {fInstallment
                  ? (fAmtMode === 'total' ? `Valor total (${fCurrency})` : `Valor por parcela (${fCurrency})`)
                  : `Valor (${fCurrency})`}
              </label>
              <input type="text" placeholder="0,00" value={fAmt} onChange={e => setFAmt(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
                disabled={isPending} className={`${inputCls} text-right`} />
            </div>

            {/* Cotação automática (USD/EUR) */}
            {(fCurrency === 'USD' || fCurrency === 'EUR') && (
              <div className="sm:col-span-2 flex items-center gap-2 min-h-[24px]">
                {loadingRate ? (
                  <><Spinner /><span className="text-xs text-[#525252]">Buscando cotação...</span></>
                ) : rateError ? (
                  <span className="text-xs text-red-400">Não foi possível obter cotação automática.</span>
                ) : fExchangeRate ? (
                  <span className="text-xs text-[#a3a3a3]">
                    Cotação: <span className="font-semibold text-white">1 {fCurrency} = {formatCurrency(fExchangeRate, 'BRL')}</span>
                    <span className="text-[#525252] ml-2 text-[10px]">· ao vivo</span>
                  </span>
                ) : null}
              </div>
            )}

            {/* Cotação manual (OTHER) */}
            {fCurrency === 'OTHER' && (
              <div className="sm:col-span-2">
                <label className={labelCls}>Cotação manual (1 unidade = R$)</label>
                <input type="text" placeholder="0,0000" value={fManualRate}
                  onChange={e => setFManualRate(e.target.value)}
                  disabled={isPending} className={`${inputCls} text-right`} />
              </div>
            )}

            {/* Toggle IOF */}
            {fCurrency !== 'BRL' && effectiveRate && (
              <div className="sm:col-span-2">
                <button type="button" onClick={() => setFIof(v => !v)} disabled={isPending}
                  className="flex items-center gap-2 text-xs text-[#a3a3a3] hover:text-white transition-colors">
                  <span className="relative inline-flex h-4 w-7 items-center rounded-full transition-colors"
                    style={{ backgroundColor: fIof ? '#D4A853' : '#2a2a2a' }}>
                    <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${fIof ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                  </span>
                  Incluir IOF (6,38%) — cartão internacional
                </button>
              </div>
            )}

            {/* Preview conversão BRL */}
            {previewBRL && (
              <div className="sm:col-span-2 bg-blue-500/8 border border-blue-500/20 rounded-lg px-3 py-2">
                <p className="text-[11px] text-blue-400">
                  ≈ <span className="font-bold">{formatCurrency(previewBRL.total, 'BRL')}</span> em BRL
                  {previewBRL.iof > 0 && (
                    <span className="text-[#525252] ml-1.5">
                      (câmbio {formatCurrency(previewBRL.brl, 'BRL')} + IOF {formatCurrency(previewBRL.iof, 'BRL')})
                    </span>
                  )}
                </p>
                {fInstallment && previewBRL.perInstallment && (
                  <p className="text-[10px] text-[#525252] mt-0.5">
                    ≈ {formatCurrency(previewBRL.perInstallment, 'BRL')} por parcela
                  </p>
                )}
              </div>
            )}

            {/* Preview parcelamento */}
            {fInstallment && previewInstallment && !previewBRL && (
              <div className="sm:col-span-2 bg-[#D4A853]/8 border border-[#D4A853]/20 rounded-lg px-3 py-2">
                <p className="text-[11px] text-[#D4A853]">
                  {previewInstallment.qty}× de <span className="font-bold">{formatAmount(previewInstallment.per, fCurrency)}</span>
                  {' '}= total de <span className="font-bold">{formatAmount(previewInstallment.total, fCurrency)}</span>
                </p>
                <p className="text-[10px] text-[#525252] mt-0.5">
                  As próximas parcelas serão lançadas automaticamente nos meses seguintes
                </p>
              </div>
            )}

            {/* Checkbox dedutível */}
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

            {/* Notas */}
            <div className="sm:col-span-2">
              <label className={labelCls}>Notas <span className="text-[#3a3a3a] normal-case font-normal">(opcional)</span></label>
              <input type="text" placeholder="Observações..." value={fNotes}
                onChange={e => setFNotes(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
                disabled={isPending} className={inputCls} />
            </div>
          </div>

          {/* Erro inline */}
          {errorMsg && (
            <div className="flex items-center gap-2 mb-3 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              <svg className="w-3.5 h-3.5 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-xs text-red-400">{errorMsg}</p>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={handleSubmit} disabled={!canSubmit}
              className="flex items-center gap-2 bg-[#D4A853] hover:bg-[#E8C47A] disabled:opacity-50 text-[#0a0a0a] font-semibold text-xs px-4 py-2 rounded-lg transition-colors">
              {isPending ? <Spinner /> : null}
              {isPending
                ? 'Salvando...'
                : fInstallment && previewInstallment
                  ? `Lançar ${previewInstallment.qty} parcelas`
                  : 'Confirmar'}
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
            const isExpanded   = expandedId === expense.id
            const isPaying     = payingId === expense.id
            const isMulti      = expense.currency !== 'BRL'
            const displayAmt   = isMulti && expense.amount_brl != null
              ? Number(expense.amount_brl)
              : Number(expense.amount)
            const discount     = expense.is_paid && expense.paid_amount != null
              ? displayAmt - Number(expense.paid_amount)
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

                  {/* Valor — moeda original + BRL quando multimoeda */}
                  <div className="text-right shrink-0">
                    <span className={`text-sm font-bold tabular-nums ${expense.is_paid ? 'text-[#525252] line-through' : 'text-white'}`}>
                      {isMulti
                        ? formatAmount(Number(expense.amount), expense.currency)
                        : formatCurrency(Number(expense.amount), 'BRL')}
                    </span>
                    {isMulti && expense.amount_brl != null && (
                      <p className="text-[10px] text-[#525252] tabular-nums">
                        ≈ {formatCurrency(Number(expense.amount_brl), 'BRL')}
                      </p>
                    )}
                  </div>

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

                    {/* Info de câmbio */}
                    {isMulti && expense.exchange_rate != null && (
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-[10px] text-[#525252]">
                          Cotação fixada: 1 {expense.currency} = {formatCurrency(Number(expense.exchange_rate), 'BRL')}
                          {expense.iof_applied && (
                            <span className="text-amber-400 ml-2">· IOF {formatCurrency(Number(expense.iof_amount ?? 0), 'BRL')}</span>
                          )}
                        </span>
                      </div>
                    )}

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
                          Valor pago: <span className="font-bold text-white">{formatCurrency(Number(expense.paid_amount ?? displayAmt), 'BRL')}</span>
                        </p>
                        {discount > 0.005 && (
                          <p className="text-xs text-amber-400 ml-5">
                            Desconto: {formatCurrency(discount, 'BRL')}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-[#525252] mb-3">
                        Em aberto · {formatCurrency(displayAmt, 'BRL')}
                      </p>
                    )}

                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => {
                          setPayModal({ id: expense.id, original: displayAmt, isMulti })
                          setPayCustomAmt('')
                        }}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-[#3a3a3a] text-[#a3a3a3] hover:border-emerald-500/50 hover:text-emerald-400 hover:bg-emerald-500/8 transition-all"
                      >
                        {expense.is_paid
                          ? 'Editar pagamento'
                          : expense.is_installment ? 'Quitar esta parcela' : 'Quitar despesa'}
                      </button>

                      {/* Quitar todas restantes — só para parcelados em aberto */}
                      {expense.is_installment && !expense.is_paid && (
                        <button
                          onClick={() => handleOpenSettle(expense)}
                          disabled={loadingSettle}
                          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-[#D4A853]/30 text-[#D4A853] hover:bg-[#D4A853]/10 disabled:opacity-50 transition-all"
                        >
                          {loadingSettle ? <Spinner /> : (
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                          )}
                          Quitar todas restantes
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Modal de quitação de parcelas ──────────────────────────────────────── */}
      {settleModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[#141414] border border-[#2a2a2a] rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl flex flex-col max-h-[90vh]">

            {/* Header */}
            <div className="flex items-start justify-between p-5 pb-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <svg className="w-4 h-4 text-[#D4A853]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <p className="text-sm font-bold text-white">Quitar parcelas</p>
                </div>
                <p className="text-xs text-[#525252]">
                  {settleModal.items.length} parcela{settleModal.items.length !== 1 ? 's' : ''} em aberto
                </p>
              </div>
              <button onClick={() => { setSettleModal(null); setSettlePaidAmt('') }}
                className="text-[#525252] hover:text-white transition-colors p-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Toggle selecionar todas */}
            <div className="flex items-center justify-between px-5 py-2 border-b border-[#1c1c1c]">
              <button onClick={toggleAllSettle}
                className="flex items-center gap-2 text-xs text-[#a3a3a3] hover:text-white transition-colors">
                <span className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${allSettleSelected ? 'bg-[#D4A853] border-[#D4A853]' : 'border-[#3a3a3a]'}`}>
                  {allSettleSelected && (
                    <svg className="w-2.5 h-2.5 text-[#0a0a0a]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                {allSettleSelected ? 'Desmarcar todas' : 'Selecionar todas'}
              </button>
              <span className="text-[10px] text-[#525252]">
                {settleModal.selected.length} de {settleModal.items.length} selecionada{settleModal.selected.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Lista de parcelas (scrollável) */}
            <div className="overflow-y-auto flex-1">
              {settleModal.items.map((item, idx) => {
                const isSelected = settleModal.selected.includes(item.id)
                const displayAmt = item.amount_brl ?? item.amount
                return (
                  <div
                    key={item.id}
                    onClick={() => toggleSettleItem(item.id)}
                    className={`flex items-center gap-3 px-5 py-3 cursor-pointer transition-colors
                      ${idx !== settleModal.items.length - 1 ? 'border-b border-[#1c1c1c]' : ''}
                      ${isSelected ? 'bg-[#D4A853]/5' : 'hover:bg-[#1a1a1a]'}`}
                  >
                    {/* Checkbox */}
                    <span className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-colors ${isSelected ? 'bg-[#D4A853] border-[#D4A853]' : 'border-[#3a3a3a]'}`}>
                      {isSelected && (
                        <svg className="w-2.5 h-2.5 text-[#0a0a0a]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </span>
                    {/* Data */}
                    <span className="text-xs text-[#525252] w-10 shrink-0 tabular-nums">
                      {formatExpenseDate(item.expense_date)}
                    </span>
                    {/* Índice */}
                    {item.installment_index && (
                      <span className="text-[10px] text-[#525252] shrink-0">
                        Parcela {item.installment_index}ª
                      </span>
                    )}
                    {/* Valor */}
                    <span className={`ml-auto text-xs font-semibold tabular-nums ${isSelected ? 'text-white' : 'text-[#525252]'}`}>
                      {formatCurrency(displayAmt, 'BRL')}
                      {item.currency !== 'BRL' && (
                        <span className="text-[#3a3a3a] font-normal ml-1">({item.currency})</span>
                      )}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Footer */}
            <div className="p-5 pt-4 border-t border-[#1c1c1c]">
              {/* Total selecionado */}
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs text-[#525252]">Total selecionado</span>
                <span className="text-sm font-bold text-white">{formatCurrency(settleTotal, 'BRL')}</span>
              </div>

              {/* Valor pago (opcional) */}
              <div className="mb-4">
                <label className={labelCls}>
                  Valor pago (R$) <span className="text-[#3a3a3a] normal-case font-normal">— vazio = valor original</span>
                </label>
                <input
                  autoFocus
                  type="text"
                  placeholder={settleTotal > 0 ? String(settleTotal.toFixed(2)).replace('.', ',') : '0,00'}
                  value={settlePaidAmt}
                  onChange={e => setSettlePaidAmt(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleSettle()
                    if (e.key === 'Escape') { setSettleModal(null); setSettlePaidAmt('') }
                  }}
                  className={`${inputCls} text-right`}
                />
                {(() => {
                  const raw = parseFloat(settlePaidAmt.replace(',', '.'))
                  if (!isNaN(raw) && raw > 0 && raw < settleTotal) {
                    return (
                      <p className="text-[10px] text-amber-400 mt-1.5">
                        Desconto de {formatCurrency(settleTotal - raw, 'BRL')} aplicado na última parcela
                      </p>
                    )
                  }
                  return null
                })()}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleSettle}
                  disabled={settling || settleModal.selected.length === 0}
                  className="flex items-center gap-2 bg-[#D4A853] hover:bg-[#E8C47A] disabled:opacity-50 text-[#0a0a0a] font-semibold text-xs px-4 py-2 rounded-lg transition-colors flex-1 justify-center"
                >
                  {settling ? <Spinner /> : null}
                  {settling
                    ? 'Quitando...'
                    : settleModal.selected.length === 0
                      ? 'Selecione parcelas'
                      : `Quitar ${settleModal.selected.length} parcela${settleModal.selected.length !== 1 ? 's' : ''}`}
                </button>
                <button
                  type="button"
                  onClick={() => { setSettleModal(null); setSettlePaidAmt('') }}
                  disabled={settling}
                  className="text-xs text-[#525252] hover:text-white transition-colors px-3 py-2"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de quitação ─────────────────────────────────────────────────── */}
      {payModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <p className="text-sm font-bold text-white mb-1">Quitar despesa</p>
            <p className="text-xs text-[#525252] mb-5">
              Valor em BRL: <span className="text-white font-semibold">{formatCurrency(payModal.original, 'BRL')}</span>
              {payModal.isMulti && <span className="text-[#525252] ml-1">(convertido)</span>}
            </p>

            <div className="mb-4">
              <label className={labelCls}>
                Valor pago (R$) <span className="text-[#3a3a3a] normal-case font-normal">— deixe vazio para usar o valor original</span>
              </label>
              <input
                autoFocus
                type="text"
                placeholder={String(payModal.original.toFixed(2)).replace('.', ',')}
                value={payCustomAmt}
                onChange={e => setPayCustomAmt(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleModalPay()
                  if (e.key === 'Escape') { setPayModal(null); setPayCustomAmt('') }
                }}
                className={`${inputCls} text-right`}
              />
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
