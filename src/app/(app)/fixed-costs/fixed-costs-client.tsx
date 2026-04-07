'use client'

import { useState, useTransition } from 'react'
import { formatCurrency } from '@/lib/utils/format'
import {
  createRecurringCost,
  createInstallmentCost,
  toggleFixedCost,
  endRecurringCost,
  deleteFixedCost,
  deleteInstallmentGroup,
  getFixedCostInstallments,
  settleSelectedFixedCosts,
} from '@/lib/actions/fixed-costs'
import {
  FIXED_COST_CATEGORIES,
  FIXED_COST_CATEGORY_LABELS,
} from '@/types/expense'
import type { FixedCost, FixedCostCategory } from '@/types/expense'

// ─── Types ────────────────────────────────────────────────────────────────────

type TabId = 'all' | 'recurring' | 'installment'

interface SettleItem {
  id:               string
  description:      string
  installment_index: number
  installments_total: number
  amount:           number
  currency:         string
  start_date:       string | null
  is_paid:          boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [, m, d] = iso.split('-')
  const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${d}/${months[parseInt(m, 10) - 1]}`
}

function today(): string {
  return new Date().toLocaleDateString('en-CA')
}

/** Gera preview de datas para parcelamento */
function previewDates(startDate: string, n: number): string[] {
  const [y, m, d] = startDate.split('-').map(Number)
  return Array.from({ length: n }, (_, i) => {
    const dt = new Date(y, m - 1 + i, d)
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  })
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  initialItems: FixedCost[]
}

// ─── Component ────────────────────────────────────────────────────────────────

export function FixedCostsClient({ initialItems }: Props) {
  const [items,      setItems]      = useState<FixedCost[]>(initialItems)
  const [tab,        setTab]        = useState<TabId>('all')
  const [showForm,   setShowForm]   = useState(false)
  const [toast,      setToast]      = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [isPending,  startTransition] = useTransition()

  // Settle modal
  const [settleModal, setSettleModal] = useState<{
    parentId: string
    items: SettleItem[]
    selected: string[]
  } | null>(null)
  const [settlePaid,    setSettlePaid]    = useState('')
  const [settling,      setSettling]      = useState(false)
  const [loadingSettle, setLoadingSettle] = useState(false)

  // Form — tipo
  const [formType, setFormType] = useState<'recurring' | 'installment'>('recurring')

  // Form — campos comuns
  const [fCat,   setFCat]   = useState<FixedCostCategory>('software')
  const [fDesc,  setFDesc]  = useState('')
  const [fAmt,   setFAmt]   = useState('')
  const [fDate,  setFDate]  = useState(today())
  const [fDed,   setFDed]   = useState(false)
  const [fNotes, setFNotes] = useState('')

  // Form — parcelado
  const [fInstallments, setFInstallments] = useState('12')
  const [fAmtMode,      setFAmtMode]      = useState<'per' | 'total'>('per')

  // ── Toast ──────────────────────────────────────────────────────────────────

  function showToast(type: 'success' | 'error', msg: string) {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 3500)
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  // Agrupa parcelados por parent_fixed_cost_id
  const installmentGroups = (() => {
    const groups = new Map<string, FixedCost[]>()
    for (const item of items) {
      if (!item.is_installment) continue
      const key = item.parent_fixed_cost_id ?? item.id
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(item)
    }
    // Sort each group by installment_index
    for (const [, g] of groups) g.sort((a, b) => (a.installment_index ?? 0) - (b.installment_index ?? 0))
    return groups
  })()

  const recurringItems = items.filter(i => !i.is_installment)

  // Tab filtering
  const showRecurring    = tab === 'all' || tab === 'recurring'
  const showInstallments = tab === 'all' || tab === 'installment'

  // Summary totals
  const totalRecurring    = recurringItems
    .filter(i => i.is_active)
    .reduce((s, i) => s + Number(i.amount_brl ?? i.amount), 0)

  const totalInstallment = [...installmentGroups.values()]
    .flatMap(g => g)
    .filter(i => !i.is_paid)
    .reduce((s, i) => s + Number(i.amount_brl ?? i.amount), 0)

  // ── Form helpers ──────────────────────────────────────────────────────────

  const parsedAmt = parseFloat(fAmt.replace(',', '.')) || 0
  const parsedN   = parseInt(fInstallments, 10) || 1

  const amtPer   = fAmtMode === 'per'   ? parsedAmt : parsedAmt / parsedN
  const amtTotal = fAmtMode === 'total' ? parsedAmt : parsedAmt * parsedN

  function resetForm() {
    setFCat('software'); setFDesc(''); setFAmt(''); setFDate(today())
    setFDed(false); setFNotes(''); setFInstallments('12'); setFAmtMode('per')
    setShowForm(false)
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  function handleSubmit() {
    if (!fDesc.trim() || parsedAmt <= 0) return

    startTransition(async () => {
      if (formType === 'recurring') {
        const res = await createRecurringCost({
          description:   fDesc,
          category:      fCat,
          amount:        parsedAmt,
          start_date:    fDate,
          is_deductible: fDed,
          notes:         fNotes || undefined,
        })
        if (res.success && res.data) {
          setItems(prev => [...prev, res.data!])
          showToast('success', 'Custo recorrente criado!')
          resetForm()
        } else if (!res.success) {
          showToast('error', res.error)
        }
      } else {
        if (parsedN < 2) { showToast('error', 'Mínimo 2 parcelas.'); return }
        const res = await createInstallmentCost({
          description:   fDesc,
          category:      fCat,
          amount_per:    Math.round(amtPer * 100) / 100,
          installments:  parsedN,
          currency:      'BRL',
          start_date:    fDate,
          is_deductible: fDed,
          notes:         fNotes || undefined,
        })
        if (res.success) {
          // Reload via router isn't needed — action does revalidatePath
          // Optimistically add a placeholder — next navigation will fetch fresh
          showToast('success', `${parsedN} parcelas lançadas com sucesso!`)
          resetForm()
          // Refresh list by re-fetching (simple: reload)
          window.location.reload()
        } else {
          showToast('error', res.error ?? 'Erro ao criar parcelas.')
        }
      }
    })
  }

  // ── Toggle ────────────────────────────────────────────────────────────────

  async function handleToggle(id: string, current: boolean) {
    const res = await toggleFixedCost(id, !current)
    if (res.success && res.data) {
      setItems(prev => prev.map(i => i.id === id ? { ...i, is_active: !current } : i))
    }
  }

  // ── End recurring ─────────────────────────────────────────────────────────

  async function handleEndRecurring(id: string, desc: string) {
    if (!window.confirm(`Encerrar "${desc}"? O custo será desativado com data de hoje.`)) return
    const res = await endRecurringCost(id)
    if (res.success && res.data) {
      setItems(prev => prev.map(i => i.id === id ? { ...i, is_active: false, end_date: res.data!.end_date } : i))
      showToast('success', 'Custo encerrado.')
    } else if (!res.success) {
      showToast('error', res.error)
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function handleDelete(id: string) {
    if (!window.confirm('Excluir este custo fixo?')) return
    const res = await deleteFixedCost(id)
    if (res.success) setItems(prev => prev.filter(i => i.id !== id))
  }

  async function handleDeleteGroup(parentId: string, desc: string) {
    if (!window.confirm(`Excluir todas as parcelas de "${desc}"?`)) return
    const res = await deleteInstallmentGroup(parentId)
    if (res.success) {
      setItems(prev => prev.filter(i => (i.parent_fixed_cost_id ?? i.id) !== parentId))
    }
  }

  // ── Settle modal ──────────────────────────────────────────────────────────

  async function openSettleModal(parentId: string) {
    setLoadingSettle(true)
    const res = await getFixedCostInstallments(parentId)
    setLoadingSettle(false)
    if (!res.success || !res.items) return

    const unpaid = res.items.filter(i => !i.is_paid)
    if (!unpaid.length) { showToast('success', 'Todas as parcelas já estão pagas!'); return }

    const settleItems: SettleItem[] = unpaid.map(i => ({
      id:                i.id,
      description:       i.description,
      installment_index: i.installment_index ?? 0,
      installments_total: i.installments_total ?? 0,
      amount:            Number(i.amount),
      currency:          i.currency,
      start_date:        i.start_date,
      is_paid:           i.is_paid,
    }))

    setSettleModal({ parentId, items: settleItems, selected: settleItems.map(i => i.id) })
    setSettlePaid('')
  }

  function closeSettleModal() {
    setSettleModal(null); setSettlePaid(''); setSettling(false)
  }

  function toggleSettleItem(id: string) {
    setSettleModal(prev => {
      if (!prev) return prev
      const has = prev.selected.includes(id)
      return { ...prev, selected: has ? prev.selected.filter(x => x !== id) : [...prev.selected, id] }
    })
  }

  function toggleSelectAll() {
    setSettleModal(prev => {
      if (!prev) return prev
      const allSelected = prev.selected.length === prev.items.length
      return { ...prev, selected: allSelected ? [] : prev.items.map(i => i.id) }
    })
  }

  async function handleSettle() {
    if (!settleModal || !settleModal.selected.length) return
    setSettling(true)

    const paidTotal  = parseFloat(settlePaid.replace(',', '.'))
    const selectedItems = settleModal.items.filter(i => settleModal.selected.includes(i.id))
    const totalSelected = selectedItems.reduce((s, i) => s + i.amount, 0)

    const res = await settleSelectedFixedCosts(
      settleModal.selected,
      !isNaN(paidTotal) && paidTotal > 0 ? paidTotal : undefined
    )

    setSettling(false)
    if (res.success) {
      const paidAmt = !isNaN(paidTotal) && paidTotal > 0 ? paidTotal : totalSelected
      // Update local state
      setItems(prev => prev.map(i =>
        settleModal.selected.includes(i.id)
          ? { ...i, is_paid: true, paid_at: new Date().toISOString(), paid_amount: paidAmt / settleModal.selected.length }
          : i
      ))
      showToast('success', `${res.count} parcela${res.count !== 1 ? 's' : ''} quitada${res.count !== 1 ? 's' : ''}!`)
      closeSettleModal()
    } else {
      showToast('error', res.error ?? 'Erro ao quitar parcelas.')
      setSettling(false)
    }
  }

  // ── Settle totals ─────────────────────────────────────────────────────────

  const settleSelectedItems = settleModal?.items.filter(i => settleModal.selected.includes(i.id)) ?? []
  const settleTotalOriginal = settleSelectedItems.reduce((s, i) => s + i.amount, 0)
  const settlePaidNum       = parseFloat(settlePaid.replace(',', '.'))
  const settleDiscount      = !isNaN(settlePaidNum) && settlePaidNum > 0 && settlePaidNum < settleTotalOriginal
    ? settleTotalOriginal - settlePaidNum : 0

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Toast ──────────────────────────────────────────────────────────── */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-sm font-semibold border backdrop-blur-sm transition-all
          ${toast.type === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
          {toast.type === 'success' ? '✓' : '✕'} {toast.msg}
        </div>
      )}

      {/* ── Resumo ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-4">
          <p className="text-[10px] font-semibold text-[#525252] tracking-widest mb-1">RECORRENTES/MÊS</p>
          <p className="text-xl font-bold text-white">
            {formatCurrency(totalRecurring, 'BRL')}
          </p>
          <p className="text-[10px] text-[#525252] mt-1">
            {recurringItems.filter(i => i.is_active).length} ativo{recurringItems.filter(i => i.is_active).length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-4">
          <p className="text-[10px] font-semibold text-[#525252] tracking-widest mb-1">PARCELAS PENDENTES</p>
          <p className="text-xl font-bold text-white">
            {formatCurrency(totalInstallment, 'BRL')}
          </p>
          <p className="text-[10px] text-[#525252] mt-1">
            {[...installmentGroups.values()].flatMap(g => g).filter(i => !i.is_paid).length} parcel{([...installmentGroups.values()].flatMap(g => g).filter(i => !i.is_paid).length !== 1 ? 'as' : 'a')} em aberto
          </p>
        </div>
      </div>

      {/* ── Header com botão ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        {/* Tabs */}
        <div className="flex gap-1 bg-[#141414] border border-[#2a2a2a] rounded-lg p-1">
          {([['all', 'Todos'], ['recurring', 'Recorrentes'], ['installment', 'Parcelados']] as const).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`text-xs font-semibold px-3 py-1.5 rounded transition-colors ${
                tab === id ? 'bg-[#D4A853] text-[#0a0a0a]' : 'text-[#525252] hover:text-white'
              }`}>{label}</button>
          ))}
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 bg-[#D4A853] hover:bg-[#E8C47A] text-[#0a0a0a] font-semibold text-xs px-4 py-2 rounded-lg transition-colors"
        >
          <svg className={`w-3.5 h-3.5 transition-transform ${showForm ? 'rotate-45' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Novo custo fixo
        </button>
      </div>

      {/* ── Formulário ─────────────────────────────────────────────────────── */}
      {showForm && (
        <div className="bg-[#141414] border border-[#D4A853]/30 rounded-xl p-4 mb-4">
          <p className="text-xs font-semibold text-[#D4A853] mb-3 tracking-wide">NOVO CUSTO FIXO</p>

          {/* Tipo */}
          <div className="flex gap-2 mb-4">
            {(['recurring', 'installment'] as const).map(t => (
              <button key={t} onClick={() => setFormType(t)}
                className={`flex-1 text-xs font-semibold py-2 rounded-lg border transition-colors ${
                  formType === t
                    ? 'bg-[#D4A853]/10 border-[#D4A853]/40 text-[#D4A853]'
                    : 'bg-[#0a0a0a] border-[#2a2a2a] text-[#525252] hover:text-white hover:border-[#3a3a3a]'
                }`}>
                {t === 'recurring' ? '🔁 Recorrente (todo mês)' : '📅 Parcelado (tem fim)'}
              </button>
            ))}
          </div>

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

            {/* Data de início */}
            <div>
              <label className={labelCls}>
                {formType === 'recurring' ? 'Início da cobrança' : 'Mês da 1ª parcela'}
              </label>
              <input type="date" value={fDate} onChange={e => setFDate(e.target.value)}
                disabled={isPending} className={inputCls} />
            </div>

            {/* Descrição */}
            <div className="sm:col-span-2">
              <label className={labelCls}>Descrição</label>
              <input autoFocus type="text"
                placeholder={formType === 'recurring'
                  ? 'Ex: Adobe Creative Cloud, aluguel de estúdio...'
                  : 'Ex: MacBook Pro 16" — 12x, Câmera — 24x...'}
                value={fDesc} onChange={e => setFDesc(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') resetForm() }}
                disabled={isPending} className={inputCls} />
            </div>

            {formType === 'recurring' ? (
              /* ── Recorrente: valor simples ──────────────────────────────── */
              <div>
                <label className={labelCls}>Valor mensal</label>
                <input type="text" inputMode="decimal" placeholder="0,00"
                  value={fAmt} onChange={e => setFAmt(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
                  disabled={isPending} className={`${inputCls} text-right`} />
              </div>
            ) : (
              /* ── Parcelado: valor + N + preview ─────────────────────────── */
              <>
                <div>
                  <label className={labelCls}>Nº de parcelas</label>
                  <input type="number" min={2} max={360} placeholder="12"
                    value={fInstallments} onChange={e => setFInstallments(e.target.value)}
                    disabled={isPending} className={inputCls} />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className={labelCls.replace('mb-1','')}>
                      {fAmtMode === 'per' ? 'Valor por parcela' : 'Valor total'}
                    </label>
                    <button onClick={() => setFAmtMode(v => v === 'per' ? 'total' : 'per')}
                      className="text-[10px] text-[#D4A853] hover:text-[#E8C47A] transition-colors">
                      Usar {fAmtMode === 'per' ? 'total' : 'por parcela'}
                    </button>
                  </div>
                  <input type="text" inputMode="decimal" placeholder="0,00"
                    value={fAmt} onChange={e => setFAmt(e.target.value)}
                    disabled={isPending} className={`${inputCls} text-right`} />
                </div>

                {/* Preview */}
                {parsedAmt > 0 && parsedN >= 2 && fDate && (
                  <div className="sm:col-span-2 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg p-3">
                    <p className="text-[10px] font-semibold text-[#525252] tracking-widest mb-2">PREVIEW — {parsedN}x de {formatCurrency(amtPer, 'BRL')} = {formatCurrency(amtTotal, 'BRL')}</p>
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                      {previewDates(fDate, parsedN).map((d, i) => (
                        <span key={i} className="text-[10px] px-2 py-0.5 bg-[#141414] border border-[#2a2a2a] rounded text-[#a3a3a3]">
                          {i + 1}/{parsedN} · {formatDateShort(d)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Dedutível */}
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={fDed} onChange={e => setFDed(e.target.checked)}
                  disabled={isPending}
                  className="w-4 h-4 rounded border-[#3a3a3a] bg-[#0a0a0a] accent-[#D4A853]" />
                <span className="text-xs text-[#a3a3a3]">Pode abater no imposto</span>
              </label>
            </div>

            {/* Notas */}
            <div className="sm:col-span-2">
              <label className={labelCls}>Notas <span className="text-[#3a3a3a]">(opcional)</span></label>
              <input type="text" placeholder="Observações..."
                value={fNotes} onChange={e => setFNotes(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
                disabled={isPending} className={inputCls} />
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={handleSubmit}
              disabled={isPending || !fDesc.trim() || parsedAmt <= 0}
              className="flex items-center gap-2 bg-[#D4A853] hover:bg-[#E8C47A] disabled:opacity-50 text-[#0a0a0a] font-semibold text-xs px-4 py-2 rounded-lg transition-colors">
              {isPending ? <Spinner /> : null}
              {isPending ? 'Salvando...' : formType === 'recurring' ? 'Criar recorrente' : `Criar ${parsedN} parcelas`}
            </button>
            <button type="button" onClick={resetForm} disabled={isPending}
              className="text-xs text-[#525252] hover:text-white transition-colors px-3 py-2">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ── Lista ──────────────────────────────────────────────────────────── */}
      {items.length === 0 && !showForm ? (
        <EmptyState onAdd={() => setShowForm(true)} />
      ) : (
        <div className="space-y-3">

          {/* ── Recorrentes ────────────────────────────────────────────────── */}
          {showRecurring && recurringItems.length > 0 && (
            <div>
              {tab === 'all' && (
                <p className="text-[10px] font-semibold text-[#525252] tracking-widest mb-2">RECORRENTES</p>
              )}
              <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl overflow-hidden">
                {[...recurringItems].sort((a, b) => (a.is_active === b.is_active ? 0 : a.is_active ? -1 : 1))
                  .map((item, idx, arr) => (
                  <div key={item.id}
                    className={`flex items-center gap-3 px-4 py-3 transition-opacity ${
                      item.is_active ? '' : 'opacity-45'
                    } ${idx !== arr.length - 1 ? 'border-b border-[#1c1c1c]' : ''}`}>

                    {/* Toggle */}
                    <button onClick={() => handleToggle(item.id, item.is_active)}
                      aria-label={item.is_active ? 'Desativar' : 'Ativar'}
                      className="shrink-0 relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
                      style={{ backgroundColor: item.is_active ? '#D4A853' : '#2a2a2a' }}>
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                        item.is_active ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
                    </button>

                    {/* Badge categoria */}
                    <CategoryBadge category={item.category} />

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{item.description}</p>
                      <p className="text-[10px] text-[#525252] mt-0.5">
                        desde {formatDate(item.start_date)}
                        {item.end_date ? ` · encerrado em ${formatDate(item.end_date)}` : ''}
                        {item.notes ? ` · ${item.notes}` : ''}
                      </p>
                    </div>

                    {/* Dedutível */}
                    {item.is_deductible && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">Ded.</span>
                    )}

                    {/* Valor */}
                    <span className="text-sm font-bold text-white shrink-0 tabular-nums">
                      {formatCurrency(Number(item.amount_brl ?? item.amount), item.currency)}/mês
                    </span>

                    {/* Encerrar */}
                    {item.is_active && (
                      <button onClick={() => handleEndRecurring(item.id, item.description)}
                        className="text-[10px] font-semibold px-2 py-1 rounded border border-[#3a3a3a] text-[#525252] hover:border-red-500/40 hover:text-red-400 transition-colors shrink-0">
                        Encerrar
                      </button>
                    )}

                    {/* Delete */}
                    <button onClick={() => handleDelete(item.id)}
                      className="p-1 rounded text-[#3a3a3a] hover:text-red-400 transition-colors shrink-0">
                      <TrashIcon />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Parcelados ─────────────────────────────────────────────────── */}
          {showInstallments && installmentGroups.size > 0 && (
            <div>
              {tab === 'all' && recurringItems.length > 0 && (
                <p className="text-[10px] font-semibold text-[#525252] tracking-widest mb-2 mt-4">PARCELADOS</p>
              )}
              {tab === 'installment' && (
                <p className="text-[10px] font-semibold text-[#525252] tracking-widest mb-2">PARCELADOS</p>
              )}
              <div className="space-y-2">
                {[...installmentGroups.entries()].map(([parentId, group]) => {
                  const first   = group[0]
                  const total   = group.length
                  const paid    = group.filter(i => i.is_paid).length
                  const unpaid  = total - paid
                  const allPaid = paid === total
                  const totalAmt = group.reduce((s, i) => s + Number(i.amount_brl ?? i.amount), 0)
                  const paidAmt  = group.filter(i => i.is_paid).reduce((s, i) => s + Number(i.paid_amount ?? i.amount_brl ?? i.amount), 0)
                  const remainAmt = group.filter(i => !i.is_paid).reduce((s, i) => s + Number(i.amount_brl ?? i.amount), 0)

                  return (
                    <div key={parentId}
                      className={`bg-[#141414] border rounded-xl overflow-hidden ${
                        allPaid ? 'border-emerald-500/20 opacity-60' : 'border-[#2a2a2a]'
                      }`}>
                      {/* Cabeçalho do grupo */}
                      <div className="flex items-center gap-3 px-4 py-3">
                        {/* Status badge */}
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                          allPaid
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}>
                          {allPaid ? 'Quitado' : `${paid}/${total}`}
                        </span>

                        {/* Badge categoria */}
                        <CategoryBadge category={first.category} />

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate">{first.description}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-[10px] text-[#525252]">
                              {total}x · {formatDate(group[0].start_date)} a {formatDate(group[total - 1].start_date)}
                            </p>
                            {!allPaid && (
                              <p className="text-[10px] text-[#D4A853]">
                                {unpaid} parcela{unpaid !== 1 ? 's' : ''} restante{unpaid !== 1 ? 's' : ''}
                              </p>
                            )}
                          </div>
                          {/* Progress bar */}
                          <div className="mt-1.5 h-1 bg-[#2a2a2a] rounded-full w-full max-w-32">
                            <div className="h-1 bg-emerald-500 rounded-full transition-all"
                              style={{ width: `${(paid / total) * 100}%` }} />
                          </div>
                        </div>

                        {/* Dedutível */}
                        {first.is_deductible && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">Ded.</span>
                        )}

                        {/* Valor restante */}
                        <div className="text-right shrink-0">
                          {!allPaid && (
                            <span className="text-sm font-bold text-white tabular-nums">
                              {formatCurrency(remainAmt, first.currency)}
                            </span>
                          )}
                          {allPaid && (
                            <span className="text-xs text-emerald-400 font-semibold">
                              {formatCurrency(paidAmt, first.currency)}
                            </span>
                          )}
                          <p className="text-[10px] text-[#525252]">{formatCurrency(Number(first.amount), first.currency)}/parc</p>
                        </div>

                        {/* Quitar */}
                        {!allPaid && (
                          <button
                            onClick={() => openSettleModal(parentId)}
                            disabled={loadingSettle}
                            className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg bg-[#D4A853]/10 border border-[#D4A853]/30 text-[#D4A853] hover:bg-[#D4A853]/20 disabled:opacity-50 transition-colors shrink-0">
                            {loadingSettle ? <Spinner /> : null}
                            Quitar
                          </button>
                        )}

                        {/* Delete group */}
                        <button onClick={() => handleDeleteGroup(parentId, first.description)}
                          className="p-1 rounded text-[#3a3a3a] hover:text-red-400 transition-colors shrink-0">
                          <TrashIcon />
                        </button>
                      </div>

                      {/* Linhas de parcelas */}
                      <div className="border-t border-[#1c1c1c]">
                        {group.map((item, idx) => (
                          <div key={item.id}
                            className={`flex items-center gap-3 px-4 py-2 text-[11px] ${
                              idx !== group.length - 1 ? 'border-b border-[#1c1c1c]' : ''
                            } ${item.is_paid ? 'opacity-50' : ''}`}>
                            <span className="text-[#525252] w-8 shrink-0">{item.installment_index}/{item.installments_total}</span>
                            <span className="text-[#525252] shrink-0">{formatDate(item.start_date)}</span>
                            <div className="flex-1" />
                            {item.is_paid && (
                              <span className="text-emerald-400 shrink-0">✓ Pago</span>
                            )}
                            {item.discount_amount && item.discount_amount > 0 && (
                              <span className="text-amber-400 shrink-0">-{formatCurrency(item.discount_amount, item.currency)}</span>
                            )}
                            <span className={`font-semibold shrink-0 tabular-nums ${item.is_paid ? 'text-[#525252]' : 'text-white'}`}>
                              {formatCurrency(Number(item.paid_amount ?? item.amount), item.currency)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Empty tab state */}
          {tab !== 'all' && (
            (tab === 'recurring' && recurringItems.length === 0) ||
            (tab === 'installment' && installmentGroups.size === 0)
          ) && (
            <div className="flex flex-col items-center py-14 text-center">
              <p className="text-[#525252] text-sm">
                Nenhum custo {tab === 'recurring' ? 'recorrente' : 'parcelado'} cadastrado.
              </p>
              <button onClick={() => { setFormType(tab === 'recurring' ? 'recurring' : 'installment'); setShowForm(true) }}
                className="mt-3 text-xs text-[#D4A853] hover:text-[#E8C47A] transition-colors">
                + Adicionar
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Settle Modal ───────────────────────────────────────────────────── */}
      {settleModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#141414] border border-[#2a2a2a] rounded-2xl w-full max-w-sm sm:max-w-md max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <div>
                <p className="text-sm font-bold text-white">Quitar parcelas</p>
                <p className="text-[10px] text-[#525252] mt-0.5">
                  {settleModal.items[0]?.description}
                </p>
              </div>
              <button onClick={closeSettleModal}
                className="text-[#525252] hover:text-white p-1 rounded transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Select all */}
            <div className="px-5 pb-2 border-b border-[#1c1c1c]">
              <button onClick={toggleSelectAll}
                className="text-xs text-[#D4A853] hover:text-[#E8C47A] transition-colors">
                {settleModal.selected.length === settleModal.items.length ? 'Desmarcar todas' : 'Selecionar todas'}
              </button>
            </div>

            {/* Installment list */}
            <div className="flex-1 overflow-y-auto px-5 py-2 space-y-1">
              {settleModal.items.map(item => {
                const checked = settleModal.selected.includes(item.id)
                return (
                  <label key={item.id}
                    className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                      checked ? 'bg-[#D4A853]/5 border-[#D4A853]/20' : 'bg-[#0a0a0a] border-transparent hover:border-[#2a2a2a]'
                    }`}>
                    <input type="checkbox" checked={checked}
                      onChange={() => toggleSettleItem(item.id)}
                      className="w-4 h-4 rounded border-[#3a3a3a] bg-[#0a0a0a] accent-[#D4A853] shrink-0" />
                    <span className="text-xs text-[#525252] w-8 shrink-0">
                      {item.installment_index}/{item.installments_total}
                    </span>
                    <span className="text-xs text-[#a3a3a3] shrink-0">{formatDate(item.start_date)}</span>
                    <div className="flex-1" />
                    <span className="text-sm font-bold text-white tabular-nums">
                      {formatCurrency(item.amount, item.currency)}
                    </span>
                  </label>
                )
              })}
            </div>

            {/* Totals + paid input */}
            <div className="px-5 pt-3 pb-4 border-t border-[#1c1c1c] space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#525252]">{settleModal.selected.length} parcela{settleModal.selected.length !== 1 ? 's' : ''} selecionada{settleModal.selected.length !== 1 ? 's' : ''}</span>
                <span className="font-bold text-white">{formatCurrency(settleTotalOriginal, 'BRL')}</span>
              </div>

              <div>
                <label className={labelCls}>Valor pago total <span className="text-[#3a3a3a] normal-case">(deixe em branco para valor cheio)</span></label>
                <input type="text" inputMode="decimal" placeholder={settleTotalOriginal.toFixed(2).replace('.', ',')}
                  value={settlePaid} onChange={e => setSettlePaid(e.target.value)}
                  className={inputCls} />
              </div>

              {settleDiscount > 0.005 && (
                <div className="flex items-center justify-between text-xs bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2">
                  <span className="text-amber-400">Desconto na última parcela</span>
                  <span className="font-bold text-amber-400">-{formatCurrency(settleDiscount, 'BRL')}</span>
                </div>
              )}

              <button onClick={handleSettle}
                disabled={settling || !settleModal.selected.length}
                className="w-full flex items-center justify-center gap-2 bg-[#D4A853] hover:bg-[#E8C47A] disabled:opacity-50 text-[#0a0a0a] font-bold text-sm py-3 rounded-xl transition-colors">
                {settling ? <Spinner /> : null}
                {settling ? 'Quitando...' : `Quitar ${settleModal.selected.length} parcela${settleModal.selected.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 rounded-2xl bg-[#141414] border border-[#2a2a2a] flex items-center justify-center mb-4">
        <svg className="w-7 h-7 text-[#D4A853]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      </div>
      <p className="text-white font-semibold mb-1">Nenhum custo fixo cadastrado</p>
      <p className="text-[#525252] text-sm max-w-xs mb-6">
        Registre assinaturas, planos, mensalidades e equipamentos parcelados.
      </p>
      <button onClick={onAdd}
        className="flex items-center gap-2 bg-[#D4A853] hover:bg-[#E8C47A] text-[#0a0a0a] font-semibold text-xs px-4 py-2 rounded-lg transition-colors">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Cadastrar primeiro custo fixo
      </button>
    </div>
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

function CategoryBadge({ category }: { category: FixedCostCategory }) {
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${FIXED_CATEGORY_COLORS[category] ?? 'bg-[#1c1c1c] text-[#525252]'}`}>
      {FIXED_COST_CATEGORY_LABELS[category] ?? category}
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
