'use client'

import { useState, useRef, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  createBudget,
  updateBudgetInfo,
  updateBudgetMargin,
  updateBudgetStatus,
  deleteBudget,
} from '@/lib/actions/budgets'
import { updateClient } from '@/lib/actions/clients'
import { deleteBudgetItem } from '@/lib/actions/budget-items'
import { convertBudgetTo } from '@/lib/actions/budget-conversion'
import { toast } from 'sonner'
import {
  formatCurrency,
  BUDGET_STATUS_LABELS,
  BUDGET_STATUS_NEXT_ACTIONS,
  BUDGET_ITEM_CATEGORY_LABELS,
  SUPPORTED_CURRENCIES,
} from '@/lib/utils/format'
import AddItemModal from './add-item-modal'
import { ClientPicker } from '@/components/clients/client-picker'
import {
  EMPTY_CLIENT_FULL_FORM,
  type ClientFullFormValue,
} from '@/components/clients/client-full-form'
import type { Budget, BudgetItem, BudgetMarginType, BudgetStatus } from '@/types/budget'
import type { Freelancer } from '@/types/freelancer'

// ─── tipos ────────────────────────────────────────────────────────────────────

interface Props {
  budget:      Budget
  items:       BudgetItem[]
  freelancers: Freelancer[]
  // Quando `true`, o budget ainda NÃO existe no banco (rota /budgets/new).
  // O primeiro auto-save chama createBudget() em vez de updateBudgetInfo(),
  // recebe o id real e faz history.replaceState pra trocar a URL sem navegar.
  isNew?:      boolean
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

// ─── componente ───────────────────────────────────────────────────────────────

export default function BudgetEditor({
  budget: initialBudget,
  items:  initialItems,
  freelancers,
  isNew = false,
}: Props) {
  const router = useRouter()

  // Estado central
  const [budget, setBudget]     = useState(initialBudget)
  // Ref espelhando o id. Precisa ser ref (e não só state) porque o auto-save
  // roda em setTimeout e o closure não enxerga atualizações de state. Depois
  // do primeiro INSERT (modo isNew), o id passa a existir e saves subsequentes
  // vão direto pro updateBudgetInfo.
  const budgetIdRef = useRef(initialBudget.id)
  // Evita corrida quando o usuário digita rápido e o timer dispara duas vezes
  // antes do primeiro INSERT terminar. Enquanto `creatingRef.current` for true,
  // o próximo auto-save é ignorado (os valores mais recentes estão no
  // latestFields ref e serão persistidos no save seguinte).
  const creatingRef = useRef(false)
  const [items,  setItems]      = useState(initialItems)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [menuOpen, setMenuOpen]   = useState(false)
  const [itemModal, setItemModal] = useState<{ open: boolean; item: BudgetItem | null }>({
    open: false,
    item: null,
  })
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null)
  const [isPending, startTransition]        = useTransition()
  const [downloadingPdf, setDownloadingPdf] = useState(false)

  // ─── campos do formulário (controlled) ──────────────────────────────────────
  const [title,    setTitle]    = useState(budget.title)
  const [client,   setClient]   = useState(budget.client_name)
  const [desc,     setDesc]     = useState(budget.project_description ?? '')
  const [delivers, setDelivers] = useState(budget.deliverables ?? '')
  const [evtDate,  setEvtDate]  = useState(budget.event_date ?? '')
  const [validUntil, setValidUntil] = useState(budget.valid_until ?? '')
  const [currency, setCurrency] = useState(budget.currency)
  const [notesInt, setNotesInt] = useState(budget.notes_internal ?? '')

  // ─── margem ─────────────────────────────────────────────────────────────────
  const [marginType,  setMarginType]  = useState<BudgetMarginType>(budget.margin_type)
  const [marginInput, setMarginInput] = useState(
    budget.margin_input > 0 ? String(budget.margin_input) : ''
  )

  // ─── cliente (modo expandido — ClientPicker) ─────────────────────────────────
  // Budgets NÃO têm client_id no schema, então os extras SEMPRE começam vazios.
  // Usuário só preenche quando clica "+ Adicionar detalhes" e digita. O save
  // encadeado persiste em `clients` via updateClient (cliente foi resolvido
  // pelo updateBudgetInfo via getOrCreateClient e retornado no response).
  const [expandedClientEdit, setExpandedClientEdit] = useState(false)
  const [clientExtras, setClientExtras] = useState<ClientFullFormValue>(EMPTY_CLIENT_FULL_FORM)
  const [clientSaveError, setClientSaveError] = useState<string | null>(null)

  // ─── auto-save (latest-ref pattern) ─────────────────────────────────────────
  // Ref sempre sincronizado com o estado mais recente dos campos
  const latestFields = useRef({
    title, client, desc, delivers, evtDate, validUntil, currency, notesInt,
  })
  latestFields.current = { title, client, desc, delivers, evtDate, validUntil, currency, notesInt }

  // Refs paralelos pro modo expandido de cliente (usado pela auto-save).
  const latestClientExtras = useRef(clientExtras)
  latestClientExtras.current = clientExtras
  const expandedClientEditRef = useRef(expandedClientEdit)
  expandedClientEditRef.current = expandedClientEdit

  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function scheduleAutoSave() {
    setSaveState('saving')
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(async () => {
      // Se um INSERT do modo isNew já está em andamento, desiste deste tick —
      // os valores ficam no latestFields ref e o próximo save persiste tudo.
      if (creatingRef.current) return

      const f = latestFields.current
      const currentId = budgetIdRef.current

      // ── Primeiro save em modo isNew: INSERT via createBudget ──────────────
      if (!currentId) {
        creatingRef.current = true
        const createRes = await createBudget({
          title:               f.title,
          client_name:         f.client,
          project_description: f.desc,
          deliverables:        f.delivers,
          event_date:          f.evtDate,
          valid_until:         f.validUntil,
          currency:            f.currency,
          notes_internal:      f.notesInt,
        })
        creatingRef.current = false

        if (!createRes.success || !createRes.data) {
          setSaveState('error')
          return
        }

        // Atualiza state + ref com o id real e troca a URL sem navegar
        // (history.replaceState mantém o editor montado, preserva scroll,
        // não dispara RSC refetch — é o que o usuário quer: zero flicker).
        budgetIdRef.current = createRes.data.id
        setBudget(createRes.data)
        if (typeof window !== 'undefined') {
          window.history.replaceState(null, '', `/budgets/${createRes.data.id}`)
        }

        // Save encadeado de cliente — mesma lógica do update path.
        if (expandedClientEditRef.current && createRes.client?.id) {
          const e = latestClientExtras.current
          const clientRes = await updateClient(createRes.client.id, {
            phone:     e.phone,
            instagram: e.instagram,
            email:     e.email,
            document:  e.document,
            notes:     e.notes,
          })
          if (!clientRes.success) {
            setClientSaveError(
              'Cliente criado, mas não conseguimos salvar todos os dados. Você pode completar depois em Clientes.'
            )
          } else {
            setClientSaveError(null)
          }
        }

        setSaveState('saved')
        setTimeout(() => setSaveState('idle'), 2500)
        return
      }

      // ── Saves subsequentes: UPDATE via updateBudgetInfo ────────────────────
      const result = await updateBudgetInfo(currentId, {
        title:               f.title,
        client_name:         f.client,
        project_description: f.desc,
        deliverables:        f.delivers,
        event_date:          f.evtDate,
        valid_until:         f.validUntil,
        currency:            f.currency,
        notes_internal:      f.notesInt,
      })
      if (result.success && result.data) {
        setBudget(result.data)

        // Save encadeado (soft-fail): se o modo expandido está ativo e o
        // cliente foi resolvido, persiste os extras em `clients`. Falha aqui
        // NÃO desfaz o save do orçamento — apenas mostra um aviso discreto.
        if (expandedClientEditRef.current && result.client?.id) {
          const e = latestClientExtras.current
          const clientRes = await updateClient(result.client.id, {
            phone:     e.phone,
            instagram: e.instagram,
            email:     e.email,
            document:  e.document,
            notes:     e.notes,
          })
          if (!clientRes.success) {
            setClientSaveError(
              'Cliente criado, mas não conseguimos salvar todos os dados. Você pode completar depois em Clientes.'
            )
          } else {
            setClientSaveError(null)
          }
        }

        setSaveState('saved')
        setTimeout(() => setSaveState('idle'), 2500)
      } else {
        setSaveState('error')
      }
    }, 1500)
  }

  // Handler pros extras — controlled pelo pai (padrão ClientPicker). Muda
  // local e dispara auto-save pra persistir na próxima janela de debounce.
  function handleExtrasChange(v: ClientFullFormValue) {
    setClientExtras(v)
    scheduleAutoSave()
  }

  // ─── helpers de campo ────────────────────────────────────────────────────────
  function field<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v)
      scheduleAutoSave()
    }
  }

  // ─── margem ──────────────────────────────────────────────────────────────────
  async function handleMarginChange(type: BudgetMarginType, raw: string) {
    setMarginType(type)
    setMarginInput(raw)
    // Em modo isNew sem id: só atualiza state local. O INSERT do budget carrega
    // margin_type/margin_input defaults; o usuário pode ajustar depois.
    // (Alternativa futura: incluir margem no primeiro createBudget.)
    const currentId = budgetIdRef.current
    if (!currentId) return
    const parsed = parseFloat(raw.replace(',', '.')) || 0
    const result = await updateBudgetMargin(currentId, type, parsed)
    if (result.success && result.data) setBudget(result.data)
  }

  // ─── status ──────────────────────────────────────────────────────────────────
  function handleStatusChange(next: string) {
    setMenuOpen(false)
    if (!budget.id) return // isNew sem save ainda — ignora (menu já não mostra opções relevantes)
    startTransition(async () => {
      const result = await updateBudgetStatus(budget.id, next as BudgetStatus)
      if (result.success && result.data) setBudget(result.data)
    })
  }

  // ─── download PDF ────────────────────────────────────────────────────────────
  async function handleDownloadPdf() {
    setDownloadingPdf(true)
    try {
      const res = await fetch(`/api/budgets/${budget.id}/pdf`)
      if (!res.ok) throw new Error('Erro na geração')
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      const slug = budget.title
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 60) || 'orcamento'
      a.download = `${slug}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('[pdf/download]', err)
      alert('Erro ao gerar PDF. Tente novamente.')
    } finally {
      setDownloadingPdf(false)
    }
  }

  // ─── delete orçamento ────────────────────────────────────────────────────────
  function handleDeleteBudget() {
    setMenuOpen(false)
    // Em modo isNew sem id: não existe nada no DB pra deletar, só volta.
    if (!budget.id) {
      router.push('/budgets')
      return
    }
    if (!confirm('Excluir este orçamento? Esta ação não pode ser desfeita.')) return
    startTransition(async () => {
      await deleteBudget(budget.id)
      router.push('/budgets')
    })
  }

  // ─── delete item ─────────────────────────────────────────────────────────────
  function handleDeleteItem(itemId: string) {
    if (!confirm('Remover este item do orçamento?')) return
    setDeletingItemId(itemId)
    startTransition(async () => {
      const result = await deleteBudgetItem(itemId, budget.id)
      if (result.success) {
        setItems(prev => prev.filter(i => i.id !== itemId))
        if (result.budget) setBudget(result.budget)
      }
      setDeletingItemId(null)
    })
  }

  // ─── item modal callbacks ────────────────────────────────────────────────────
  function openAddItem() {
    setItemModal({ open: true, item: null })
  }
  function openEditItem(item: BudgetItem) {
    setItemModal({ open: true, item })
  }
  function closeItemModal() {
    setItemModal({ open: false, item: null })
  }
  function handleItemSaved(savedItem: BudgetItem, updatedBudget?: Budget) {
    setItems(prev => {
      const idx = prev.findIndex(i => i.id === savedItem.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = savedItem
        return next
      }
      return [...prev, savedItem]
    })
    if (updatedBudget) setBudget(updatedBudget)
    closeItemModal()
  }

  // ─── status badge ─────────────────────────────────────────────────────────────
  const statusMap: Record<BudgetStatus, { label: string; cls: string }> = {
    draft:    { label: 'Rascunho', cls: 'bg-[#262626] text-[#a3a3a3]' },
    sent:     { label: 'Enviado',  cls: 'bg-blue-500/10 text-blue-400' },
    approved: { label: 'Aprovado', cls: 'bg-emerald-500/10 text-emerald-400' },
    rejected: { label: 'Rejeitado', cls: 'bg-red-500/10 text-red-400' },
    expired:  { label: 'Expirado',  cls: 'bg-[#262626] text-[#525252]' },
  }
  const statusCfg = statusMap[budget.status] ?? statusMap.draft
  const nextActions = BUDGET_STATUS_NEXT_ACTIONS[budget.status] ?? []

  // ─── render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-full flex flex-col">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-[#0a0a0a]/90 backdrop-blur-sm border-b border-[#1a1a1a] px-6 md:px-8 py-3">
        <div className="flex items-center justify-between gap-3">

          {/* Breadcrumb + título */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <Link
              href="/budgets"
              className="text-[#525252] hover:text-white transition-colors shrink-0"
              title="Voltar para Orçamentos"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <input
              type="text"
              value={title}
              onChange={e => field(setTitle)(e.target.value)}
              placeholder="Orçamento sem título"
              className="bg-transparent text-base font-semibold text-white placeholder-[#525252] outline-none border-b border-transparent focus:border-[#D4A853]/40 transition-colors min-w-0 w-full max-w-xs"
            />
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${statusCfg.cls}`}>
              {statusCfg.label}
            </span>
          </div>

          {/* Save indicator + actions */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Save indicator */}
            {saveState === 'saving' && (
              <span className="text-xs text-[#525252] hidden sm:inline">Salvando…</span>
            )}
            {saveState === 'saved' && (
              <span className="text-xs text-emerald-500 hidden sm:inline">✓ Salvo</span>
            )}
            {saveState === 'error' && (
              <span className="text-xs text-red-400 hidden sm:inline">Erro ao salvar</span>
            )}

            {/* Preview — oculto até o primeiro save criar o registro */}
            {budget.id && (
            <Link
              href={`/budgets/${budget.id}/preview`}
              target="_blank"
              className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-[#a3a3a3] hover:text-white bg-[#1c1c1c] hover:bg-[#262626] border border-[#2a2a2a] px-3 py-1.5 rounded-lg transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              Preview
            </Link>
            )}

            {/* Gerar PDF — só depois do primeiro save */}
            {budget.id && (
            <button
              onClick={handleDownloadPdf}
              disabled={downloadingPdf || isPending}
              className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-[#0a0a0a] bg-[#D4A853] hover:bg-[#E8C47A] disabled:opacity-60 disabled:cursor-not-allowed px-3 py-1.5 rounded-lg transition-colors"
            >
              {downloadingPdf ? (
                <>
                  <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Gerando…
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  PDF
                </>
              )}
            </button>
            )}

            {/* Menu de ações */}
            <div className="relative">
              <button
                onClick={() => setMenuOpen(v => !v)}
                className="p-2 text-[#525252] hover:text-white hover:bg-[#1c1c1c] rounded-lg transition-colors"
                title="Ações"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                </svg>
              </button>

              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-1 z-20 bg-[#1c1c1c] border border-[#2a2a2a] rounded-xl shadow-xl py-1 min-w-[180px]">
                    {nextActions.map(({ label, next }) => (
                      <button
                        key={next}
                        onClick={() => handleStatusChange(next)}
                        disabled={isPending}
                        className="w-full text-left px-4 py-2.5 text-sm text-[#a3a3a3] hover:text-white hover:bg-[#262626] transition-colors disabled:opacity-50"
                      >
                        {label}
                      </button>
                    ))}
                    {nextActions.length > 0 && (
                      <div className="border-t border-[#2a2a2a] my-1" />
                    )}
                    <button
                      onClick={handleDeleteBudget}
                      disabled={isPending}
                      className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                    >
                      Excluir orçamento
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 p-6 md:p-8 space-y-6">

        {/* Painel de conversão — visível só quando aprovado */}
        {budget.status === 'approved' && (
          <ConversionPanel budgetId={budget.id} />
        )}

        {/* Grid: dados do projeto + resumo financeiro */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Dados do projeto */}
          <div className="lg:col-span-2 bg-[#141414] border border-[#2a2a2a] rounded-2xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-white">Dados do Projeto</h2>

            {/* Cliente — padrão ÚNICO do sistema (ClientPicker) */}
            <div>
              <label className="block text-xs font-medium text-[#a3a3a3] mb-1.5">
                Cliente <span className="text-[#D4A853]">*</span>
              </label>
              <ClientPicker
                name={client}
                onNameChange={(v) => field(setClient)(v)}
                extras={clientExtras}
                onExtrasChange={handleExtrasChange}
                expanded={expandedClientEdit}
                onExpandedChange={setExpandedClientEdit}
                resetAnchor={budget.client_name}
                placeholder="Nome do cliente ou empresa"
                disabled={isPending}
              />
              {clientSaveError && (
                <p className="mt-2 text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                  {clientSaveError}
                </p>
              )}
            </div>

            {/* Descrição */}
            <div>
              <label className="block text-xs font-medium text-[#a3a3a3] mb-1.5">
                Descrição do projeto
              </label>
              <textarea
                rows={2}
                value={desc}
                onChange={e => field(setDesc)(e.target.value)}
                placeholder="Casamento, cobertura de evento, vídeo institucional…"
                className={`${inputCls} resize-none`}
              />
            </div>

            {/* Entregas */}
            <div>
              <label className="block text-xs font-medium text-[#a3a3a3] mb-1.5">
                Entregas / Escopo
              </label>
              <textarea
                rows={2}
                value={delivers}
                onChange={e => field(setDelivers)(e.target.value)}
                placeholder="Ex: 1 vídeo de 5min, 200 fotos editadas, teaser de 60s…"
                className={`${inputCls} resize-none`}
              />
            </div>

            {/* Datas + Moeda */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#a3a3a3] mb-1.5">
                  Data do evento
                </label>
                <input
                  type="date"
                  value={evtDate}
                  onChange={e => field(setEvtDate)(e.target.value)}
                  className={`${inputCls} [color-scheme:dark]`}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#a3a3a3] mb-1.5">
                  Válido até
                </label>
                <input
                  type="date"
                  value={validUntil}
                  onChange={e => field(setValidUntil)(e.target.value)}
                  className={`${inputCls} [color-scheme:dark]`}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#a3a3a3] mb-1.5">
                  Moeda
                </label>
                <select
                  value={currency}
                  onChange={e => field(setCurrency)(e.target.value)}
                  className={`${inputCls} appearance-none cursor-pointer`}
                >
                  {SUPPORTED_CURRENCIES.map(c => (
                    <option key={c.code} value={c.code}>{c.code}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Notas internas */}
            <div>
              <label className="block text-xs font-medium text-[#a3a3a3] mb-1.5">
                Notas internas
                <span className="text-[#525252] font-normal ml-1">(não aparece no PDF)</span>
              </label>
              <textarea
                rows={2}
                value={notesInt}
                onChange={e => field(setNotesInt)(e.target.value)}
                placeholder="Observações privadas, condições acordadas, contato do cliente…"
                className={`${inputCls} resize-none`}
              />
            </div>
          </div>

          {/* Resumo financeiro */}
          <div className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-white mb-4">Resumo Financeiro</h2>

            {/* Subtotal */}
            <div className="flex items-center justify-between py-2 border-b border-[#1a1a1a]">
              <span className="text-xs text-[#a3a3a3]">Subtotal</span>
              <span className="text-sm font-medium text-white">
                {formatCurrency(budget.subtotal, budget.currency)}
              </span>
            </div>

            {/* Margem */}
            <div className="py-3 border-b border-[#1a1a1a]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-[#a3a3a3]">Margem</span>
                {/* Toggle %/R$ */}
                <div className="flex bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg p-0.5">
                  {(['percentage', 'fixed'] as const).map(type => (
                    <button
                      key={type}
                      onClick={() => handleMarginChange(type, marginInput)}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                        marginType === type
                          ? 'bg-[#D4A853] text-[#0a0a0a]'
                          : 'text-[#525252] hover:text-white'
                      }`}
                    >
                      {type === 'percentage' ? '%' : 'R$'}
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="text"
                inputMode="decimal"
                value={marginInput}
                onChange={e => handleMarginChange(marginType, e.target.value)}
                placeholder={marginType === 'percentage' ? '0' : '0,00'}
                className={`${inputCls} text-right`}
              />
              {budget.margin_amount > 0 && (
                <p className="text-xs text-[#525252] mt-1.5 text-right">
                  = {formatCurrency(budget.margin_amount, budget.currency)}
                </p>
              )}
            </div>

            {/* Total */}
            <div className="flex items-center justify-between pt-3">
              <span className="text-sm font-semibold text-white">Total</span>
              <span className="text-lg font-bold text-[#D4A853]">
                {formatCurrency(budget.total, budget.currency)}
              </span>
            </div>

            {/* Info: itens no PDF */}
            {items.length > 0 && (
              <p className="text-[10px] text-[#525252] mt-3 leading-relaxed">
                {items.filter(i => i.show_in_pdf).length} de {items.length} ite{items.length !== 1 ? 'ns' : 'm'}{' '}
                marcado{items.filter(i => i.show_in_pdf).length !== 1 ? 's' : ''} para aparecer no PDF.
              </p>
            )}
          </div>
        </div>

        {/* ── Itens ──────────────────────────────────────────────────────────── */}
        <div className="bg-[#141414] border border-[#2a2a2a] rounded-2xl overflow-hidden">
          {/* Header dos itens */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#1a1a1a]">
            <div>
              <h2 className="text-sm font-semibold text-white">Itens do Orçamento</h2>
              {items.length > 0 && (
                <p className="text-xs text-[#525252] mt-0.5">
                  {items.length} item{items.length !== 1 ? 'ns' : ''}
                </p>
              )}
            </div>
            <button
              onClick={openAddItem}
              disabled={!budget.id}
              title={!budget.id ? 'Digite um título pra começar — o orçamento é criado automaticamente' : undefined}
              className="flex items-center gap-1.5 bg-[#1c1c1c] hover:bg-[#262626] border border-[#2a2a2a] text-[#a3a3a3] hover:text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#1c1c1c] disabled:hover:text-[#a3a3a3]"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Adicionar item
            </button>
          </div>

          {/* Lista vazia */}
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-5">
              <p className="text-[#525252] text-sm mb-1">Nenhum item adicionado</p>
              <p className="text-[#3a3a3a] text-xs max-w-xs">
                Adicione equipe, equipamentos, transporte e outros custos do projeto.
              </p>
            </div>
          ) : (
            <>
              {/* Cabeçalho da tabela — apenas desktop */}
              <div className="hidden md:grid grid-cols-[1fr_3fr_56px_56px_120px_120px_40px_40px] gap-2 px-5 py-2 text-[10px] font-semibold text-[#525252] uppercase tracking-wider border-b border-[#1a1a1a]">
                <span>Categoria</span>
                <span>Descrição</span>
                <span className="text-right">Qtd</span>
                <span className="text-right">Dias</span>
                <span className="text-right">Valor unit.</span>
                <span className="text-right">Total</span>
                <span className="text-center">PDF</span>
                <span />
              </div>

              {/* Linhas */}
              <div className="divide-y divide-[#1a1a1a]">
                {items.map(item => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    currency={budget.currency}
                    isDeleting={deletingItemId === item.id}
                    onEdit={() => openEditItem(item)}
                    onDelete={() => handleDeleteItem(item.id)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Modal de item ──────────────────────────────────────────────────── */}
      <AddItemModal
        open={itemModal.open}
        item={itemModal.item}
        budgetId={budget.id}
        currency={budget.currency}
        freelancers={freelancers}
        onClose={closeItemModal}
        onSaved={handleItemSaved}
      />
    </div>
  )
}

// ─── Item row ─────────────────────────────────────────────────────────────────

function ItemRow({
  item,
  currency,
  isDeleting,
  onEdit,
  onDelete,
}: {
  item:       BudgetItem
  currency:   string
  isDeleting: boolean
  onEdit:     () => void
  onDelete:   () => void
}) {
  const catLabel = item.category
    ? (BUDGET_ITEM_CATEGORY_LABELS[item.category] ?? item.category)
    : (item.custom_category ?? 'Outros')

  return (
    <div
      className={`transition-opacity ${isDeleting ? 'opacity-30 pointer-events-none' : ''}`}
    >
      {/* Desktop row */}
      <div className="hidden md:grid grid-cols-[1fr_3fr_56px_56px_120px_120px_40px_40px] gap-2 items-center px-5 py-3 hover:bg-[#1c1c1c]/40 transition-colors">
        <span className="text-xs text-[#D4A853] font-medium truncate">{catLabel}</span>
        <span className="text-sm text-white truncate">{item.label}</span>
        <span className="text-sm text-[#a3a3a3] text-right">{item.quantity}</span>
        <span className="text-sm text-[#a3a3a3] text-right">{item.days}</span>
        <span className="text-sm text-[#a3a3a3] text-right">
          {formatCurrency(item.unit_value, currency)}
        </span>
        <span className="text-sm font-semibold text-white text-right">
          {formatCurrency(item.total_value, currency)}
        </span>
        <div className="flex justify-center">
          {item.show_in_pdf ? (
            <span className="text-emerald-500" title="Aparece no PDF">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </span>
          ) : (
            <span className="text-[#3a3a3a]" title="Oculto no PDF">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5 justify-end">
          <button
            onClick={onEdit}
            className="p-1 text-[#525252] hover:text-white hover:bg-[#1c1c1c] rounded-lg transition-colors"
            title="Editar"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={onDelete}
            className="p-1 text-[#525252] hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
            title="Remover"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile card */}
      <div className="md:hidden px-5 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm text-white font-medium truncate">{item.label}</p>
            <p className="text-xs text-[#D4A853] mt-0.5">{catLabel}</p>
            <p className="text-xs text-[#525252] mt-1">
              {item.quantity} × {item.days} dia{item.days !== 1 ? 's' : ''} ×{' '}
              {formatCurrency(item.unit_value, currency)}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-sm font-semibold text-white">
              {formatCurrency(item.total_value, currency)}
            </span>
            <button
              onClick={onEdit}
              className="p-1.5 text-[#525252] hover:text-white rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 text-[#525252] hover:text-red-400 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── CSS helper ──────────────────────────────────────────────────────────────

const inputCls =
  'w-full bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-sm text-white ' +
  'placeholder-[#525252] focus:outline-none focus:border-[#D4A853]/50 ' +
  'focus:ring-1 focus:ring-[#D4A853]/20 transition-colors'

// ─── ConversionPanel — Fase 6 ────────────────────────────────────────────────

function ConversionPanel({ budgetId }: { budgetId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [converting, setConverting] = useState<'order' | 'freelance' | 'recurring' | null>(null)

  function convert(target: 'order' | 'freelance' | 'recurring') {
    const labels = { order: 'Pedido', freelance: 'Freelance', recurring: 'Receita Recorrente' }
    if (!confirm(`Converter este orçamento em ${labels[target]}?`)) return
    setConverting(target)
    startTransition(async () => {
      const res = await convertBudgetTo(budgetId, target)
      setConverting(null)
      if (!res.success) {
        toast.error(res.message)
        return
      }
      toast.success(`Convertido em ${labels[target]}.`)
      const routes = {
        order:     `/pedidos/${res.id}`,
        freelance: `/freelances/${res.id}`,
        recurring: `/receitas-recorrentes/${res.id}`,
      }
      router.push(routes[target])
    })
  }

  return (
    <div className="bg-emerald-500/5 border border-emerald-500/30 rounded-2xl p-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="text-sm font-semibold text-emerald-400 mb-1">
            ✓ Orçamento aprovado
          </div>
          <div className="text-xs text-[#a3a3a3]">
            Converta em outro tipo de receita para continuar o fluxo.
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => convert('order')}
            disabled={isPending}
            className="text-xs font-medium bg-[#1c1c1c] hover:bg-[#262626] border border-[#2a2a2a] hover:border-[#3a3a3a] text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60"
          >
            {converting === 'order' ? 'Convertendo…' : '→ Pedido'}
          </button>
          <button
            onClick={() => convert('freelance')}
            disabled={isPending}
            className="text-xs font-medium bg-[#1c1c1c] hover:bg-[#262626] border border-[#2a2a2a] hover:border-[#3a3a3a] text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60"
          >
            {converting === 'freelance' ? 'Convertendo…' : '→ Freelance'}
          </button>
          <button
            onClick={() => convert('recurring')}
            disabled={isPending}
            className="text-xs font-medium bg-[#1c1c1c] hover:bg-[#262626] border border-[#2a2a2a] hover:border-[#3a3a3a] text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60"
          >
            {converting === 'recurring' ? 'Convertendo…' : '→ Receita Recorrente'}
          </button>
        </div>
      </div>
    </div>
  )
}
