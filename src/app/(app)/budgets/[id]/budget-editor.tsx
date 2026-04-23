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
import { convertBudgetTo, approveAndConvertBudget } from '@/lib/actions/budget-conversion'
import { toast } from 'sonner'
import {
  formatCurrency,
  BUDGET_STATUS_LABELS,
  BUDGET_STATUS_NEXT_ACTIONS,
  BUDGET_ITEM_CATEGORY_LABELS,
  SUPPORTED_CURRENCIES,
  toNumberSafe,
} from '@/lib/utils/format'
import AddItemModal from './add-item-modal'
import { ClientPicker } from '@/components/clients/client-picker'
import {
  EMPTY_CLIENT_FULL_FORM,
  type ClientFullFormValue,
} from '@/components/clients/client-full-form'
import { TagCombobox } from '@/components/freelances/tag-combobox'
import { CLIENT_SEGMENTS } from '@/lib/canonical/segments'
import { LEAD_SOURCES } from '@/lib/canonical/lead-sources'
import { AIFieldsCard } from '@/components/ai/ai-fields-card'
import { generateBudgetFields } from '@/lib/ai/generate-budget-fields'
import type { AIQuota } from '@/lib/ai/quota'
import { ContractEntryPoint } from '@/components/contracts/contract-entry-point'
import type { Contract } from '@/types/contract'
import type {
  Budget,
  BudgetItem,
  BudgetIntendedDestination,
  BudgetMarginType,
  BudgetStatus,
} from '@/types/budget'
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
  // Deploy E (2026-04-22): quota de IA do workspace. Opcional — se não
  // passado, o card busca com a primeira geração. SSR passa pra evitar
  // flash "–/–".
  initialAIQuota?: AIQuota | null
  // Pente fino 2026-04-23: contratos já vinculados. Embutidos DENTRO do
  // editor (eram um bloco solto no page.tsx com largura diferente, criava
  // visual torto). Opcional — quando ausente, o bloco de Contratos some.
  linkedContracts?: Contract[]
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

// ─── componente ───────────────────────────────────────────────────────────────

export default function BudgetEditor({
  budget: initialBudget,
  items:  initialItems,
  freelancers,
  isNew = false,
  initialAIQuota = null,
  linkedContracts = [],
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
  const [itemModal, setItemModal] = useState<{ open: boolean; item: BudgetItem | null }>({
    open: false,
    item: null,
  })
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null)
  const [isPending, startTransition]        = useTransition()
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Feedback enquanto clicamos "Adicionar item" em modo isNew — precisamos
  // criar o budget antes de abrir o modal. Mantém o botão clicável (sem o
  // cursor-proibido) e dá visual de loading curto.
  const [creatingForItem, setCreatingForItem] = useState(false)

  // ─── campos do formulário (controlled) ──────────────────────────────────────
  const [title,    setTitle]    = useState(budget.title)
  const [client,   setClient]   = useState(budget.client_name)
  const [desc,     setDesc]     = useState(budget.project_description ?? '')
  const [delivers, setDelivers] = useState(budget.deliverables ?? '')
  const [evtDate,  setEvtDate]  = useState(budget.event_date ?? '')
  const [validUntil, setValidUntil] = useState(budget.valid_until ?? '')
  const [currency, setCurrency] = useState(budget.currency)
  const [notesInt, setNotesInt] = useState(budget.notes_internal ?? '')
  // ── Pente fino 2026-04-21: prazo + destino pretendido ─────────────────────
  const [paymentTerm, setPaymentTerm] = useState(budget.payment_term ?? '')
  const [intendedDest, setIntendedDest] = useState<BudgetIntendedDestination | ''>(
    budget.intended_destination ?? ''
  )
  // ── Deploy B (2026-04-22): segmento + origem do lead alinhados ao canon ───
  // Alimenta os mesmos canonicals usados em pedidos/freelances/recurring e
  // propaga no payload do createBudget/updateBudgetInfo. Também vira hint
  // pro ContractEntryPoint na página pai.
  const [segment, setSegment]       = useState(budget.segment ?? '')
  const [leadSource, setLeadSource] = useState(budget.lead_source ?? '')

  // ─── margem ─────────────────────────────────────────────────────────────────
  const [marginType,  setMarginType]  = useState<BudgetMarginType>(budget.margin_type)
  const [marginInput, setMarginInput] = useState(() => {
    // budget.margin_input chega como string do PostgREST ("0.00", "40000.00").
    // Coerce antes de comparar/formatar pra evitar surpresas.
    const n = toNumberSafe(budget.margin_input)
    return n > 0 ? String(n) : ''
  })

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
    paymentTerm, intendedDest, segment, leadSource,
  })
  latestFields.current = {
    title, client, desc, delivers, evtDate, validUntil, currency, notesInt,
    paymentTerm, intendedDest, segment, leadSource,
  }

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
          title:                f.title,
          client_name:          f.client,
          project_description:  f.desc,
          deliverables:         f.delivers,
          event_date:           f.evtDate,
          valid_until:          f.validUntil,
          currency:             f.currency,
          notes_internal:       f.notesInt,
          payment_term:         f.paymentTerm,
          intended_destination: f.intendedDest === '' ? null : f.intendedDest,
          segment:              f.segment.trim() || null,
          lead_source:          f.leadSource.trim() || null,
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
        title:                f.title,
        client_name:          f.client,
        project_description:  f.desc,
        deliverables:         f.delivers,
        event_date:           f.evtDate,
        valid_until:          f.validUntil,
        currency:             f.currency,
        notes_internal:       f.notesInt,
        payment_term:         f.paymentTerm,
        intended_destination: f.intendedDest === '' ? null : f.intendedDest,
        segment:              f.segment.trim() || null,
        lead_source:          f.leadSource.trim() || null,
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
    if (!budget.id) return // isNew sem save ainda — ignora
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
    // Em modo isNew sem id: não existe nada no DB pra deletar, só volta.
    if (!budget.id) {
      router.push('/budgets')
      return
    }
    setConfirmDelete(false)
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
  //
  // Abrir "Adicionar item" em modo isNew (URL = /budgets/new, id ainda vazio):
  // antes, o botão ficava `disabled` até o primeiro auto-save completar —
  // usuário via cursor-proibido sem feedback claro ("entrei no orçamento e
  // o + não clica", bug reportado 2026-04-22). Agora o botão está sempre
  // clicável; se o budget ainda não existe, fazemos o INSERT aqui (flush do
  // debounce) e só depois abrimos o modal. Zero fricção.
  async function openAddItem() {
    if (budgetIdRef.current) {
      setItemModal({ open: true, item: null })
      return
    }
    // Flush do auto-save pendente — evita corrida com o setTimeout do debounce.
    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current)
      autoSaveTimer.current = null
    }
    if (creatingRef.current) {
      // Já tem um INSERT em andamento (debounce disparou antes). Espera ele
      // terminar checando o ref a cada 100ms. Max 5s pra não travar.
      setCreatingForItem(true)
      const start = Date.now()
      while (creatingRef.current && Date.now() - start < 5000) {
        await new Promise(r => setTimeout(r, 100))
      }
      setCreatingForItem(false)
      if (budgetIdRef.current) {
        setItemModal({ open: true, item: null })
      } else {
        toast.error('Não conseguimos criar o orçamento. Tente novamente.')
      }
      return
    }
    // Caminho normal: cria o budget sob demanda com os valores atuais.
    setCreatingForItem(true)
    creatingRef.current = true
    setSaveState('saving')
    const f = latestFields.current
    const createRes = await createBudget({
      title:                f.title,
      client_name:          f.client,
      project_description:  f.desc,
      deliverables:         f.delivers,
      event_date:           f.evtDate,
      valid_until:          f.validUntil,
      currency:             f.currency,
      notes_internal:       f.notesInt,
      payment_term:         f.paymentTerm,
      intended_destination: f.intendedDest === '' ? null : f.intendedDest,
    })
    creatingRef.current = false
    setCreatingForItem(false)

    if (!createRes.success || !createRes.data) {
      setSaveState('error')
      toast.error(
        !createRes.success ? createRes.message : 'Erro ao criar orçamento.'
      )
      return
    }

    budgetIdRef.current = createRes.data.id
    setBudget(createRes.data)
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `/budgets/${createRes.data.id}`)
    }
    setSaveState('saved')
    setTimeout(() => setSaveState('idle'), 2500)
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

      {/* ── Header ───────────────────────────────────────────────────────────
          Todas as ações críticas ficam VISÍVEIS como botões. Nada escondido
          em menu "…" de três pontinhos. Hierarquia:
            1) Linha 1: back + título editável + badge de status + save indicator
            2) Linha 2: botões de ação — status actions (primário/secundário),
               separador, ferramentas (Preview, PDF), separador, Excluir (discreto)
      */}
      <div className="sticky top-0 z-20 bg-[#0a0a0a]/90 backdrop-blur-sm border-b border-[#1a1a1a] px-6 md:px-8 py-3 space-y-2">

        {/* Linha 1: breadcrumb + título + status badge + save state */}
        <div className="flex items-center justify-between gap-3">
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
            <div className="min-w-0 flex-1 flex items-center gap-2">
              <h1 className="text-base font-semibold text-white truncate">
                {title || <span className="text-[#525252]">Orçamento sem título</span>}
              </h1>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${statusCfg.cls}`}>
                {statusCfg.label}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-xs min-w-[80px] text-right">
              {saveState === 'saving' && <span className="text-[#525252]">Salvando…</span>}
              {saveState === 'saved'  && <span className="text-emerald-500">✓ Salvo</span>}
              {saveState === 'error'  && <span className="text-red-400">Erro ao salvar</span>}
            </div>
            {/* Botão Salvar explícito — força save imediato, dá feedback claro.
                Auto-save continua rodando em background. Aqui só pulamos o debounce. */}
            <button
              onClick={() => {
                if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
                autoSaveTimer.current = setTimeout(() => {}, 0)
                // Dispara uma janela imediata de save reutilizando o scheduler
                scheduleAutoSave()
                // e força imediato limpando o timer pra rodar no próximo tick
                if (autoSaveTimer.current) {
                  clearTimeout(autoSaveTimer.current)
                  // Re-chama com timer zero
                  autoSaveTimer.current = setTimeout(async () => {
                    const f = latestFields.current
                    const currentId = budgetIdRef.current
                    if (!currentId) {
                      // Fica no fluxo normal — modo isNew cuida disso
                      scheduleAutoSave()
                      return
                    }
                    setSaveState('saving')
                    const result = await updateBudgetInfo(currentId, {
                      title:                f.title,
                      client_name:          f.client,
                      project_description:  f.desc,
                      deliverables:         f.delivers,
                      event_date:           f.evtDate,
                      valid_until:          f.validUntil,
                      currency:             f.currency,
                      notes_internal:       f.notesInt,
                      payment_term:         f.paymentTerm,
                      intended_destination: f.intendedDest === '' ? null : f.intendedDest,
                      segment:              f.segment.trim() || null,
                      lead_source:          f.leadSource.trim() || null,
                    })
                    if (result.success && result.data) {
                      setBudget(result.data)
                      setSaveState('saved')
                      toast.success('Orçamento salvo.')
                      setTimeout(() => setSaveState('idle'), 2500)
                    } else {
                      setSaveState('error')
                    }
                  }, 0)
                }
              }}
              className="text-xs font-semibold text-white bg-[#1c1c1c] hover:bg-[#262626] border border-[#2a2a2a] px-3 py-1.5 rounded-lg transition-colors"
              title="Salvar agora (auto-save está ativo)"
            >
              Salvar
            </button>
          </div>
        </div>

        {/* Linha 2: botões de ação — TUDO visível, nada em menu "…" */}
        {budget.id && (
          <div className="flex items-center flex-wrap gap-2">
            {/* Status actions — ação principal primeiro */}
            {nextActions.map(({ label, next, variant }) => (
              <button
                key={next}
                onClick={() => handleStatusChange(next)}
                disabled={isPending}
                className={
                  variant === 'primary'
                    ? 'text-xs font-semibold text-[#0a0a0a] bg-[#D4A853] hover:bg-[#E8C47A] disabled:opacity-60 px-3 py-1.5 rounded-lg transition-colors'
                    : 'text-xs font-medium text-[#a3a3a3] hover:text-white bg-[#1c1c1c] hover:bg-[#262626] border border-[#2a2a2a] disabled:opacity-60 px-3 py-1.5 rounded-lg transition-colors'
                }
              >
                {label}
              </button>
            ))}

            {nextActions.length > 0 && (
              <div className="h-5 w-px bg-[#2a2a2a] mx-1" aria-hidden />
            )}

            {/* Ferramentas sempre visíveis */}
            <Link
              href={`/budgets/${budget.id}/preview`}
              target="_blank"
              className="flex items-center gap-1.5 text-xs font-medium text-[#a3a3a3] hover:text-white bg-[#1c1c1c] hover:bg-[#262626] border border-[#2a2a2a] px-3 py-1.5 rounded-lg transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              Preview
            </Link>

            <button
              onClick={handleDownloadPdf}
              disabled={downloadingPdf || isPending}
              className="flex items-center gap-1.5 text-xs font-medium text-[#a3a3a3] hover:text-white bg-[#1c1c1c] hover:bg-[#262626] border border-[#2a2a2a] disabled:opacity-60 px-3 py-1.5 rounded-lg transition-colors"
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
                  Baixar PDF
                </>
              )}
            </button>

            {/* Spacer que empurra Excluir pra direita */}
            <div className="flex-1" />

            {/* Excluir — visível mas discreto (vermelho sem fundo) */}
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={isPending}
              className="flex items-center gap-1.5 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 disabled:opacity-60 px-3 py-1.5 rounded-lg transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Excluir
            </button>
          </div>
        )}
      </div>

      {/* ── Modal de confirmação de exclusão ────────────────────────────── */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setConfirmDelete(false)}
        >
          <div
            className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-6 max-w-sm w-full"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-white font-semibold mb-2">Excluir orçamento?</h3>
            <p className="text-[#a3a3a3] text-sm mb-5">
              Essa ação pode ser revertida no banco em caso de engano, mas não é prática. Confirma?
            </p>
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-sm text-[#a3a3a3] hover:text-white px-4 py-2 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteBudget}
                disabled={isPending}
                className="text-sm font-semibold text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                {isPending ? 'Excluindo…' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Body ─────────────────────────────────────────────────────────────
          Pente fino 2026-04-23: ordem visual agora reflete o fluxo mental:
            1) ✨ Gerar com IA (atalho pra pré-preencher o form)
            2) Dados do Projeto + Resumo Financeiro (grid)
            3) Itens do Orçamento
            4) Aprovar & Transformar (só faz sentido DEPOIS do orçamento montado)
            5) Contratos (passo posterior à aprovação)
          max-w-5xl garante alinhamento uniforme de todos os cards — antes
          o body não tinha max-w e o bloco de contratos (no page.tsx, com
          max-w-5xl) ficava visivelmente desalinhado dos cards de cima. */}
      <div className="flex-1 p-6 md:p-8 space-y-6 max-w-5xl w-full mx-auto">

        {/* Deploy E (2026-04-22) — "✨ Gerar com IA" aparece só em draft pra
            evitar que usuário sobrescreva um orçamento já aprovado/enviado
            por acidente. Collapsable — fica fechado por default, não rouba
            espaço visual. */}
        {budget.status === 'draft' && (
          <AIFieldsCard
            initialQuota={initialAIQuota}
            onGenerate={async brief => {
              const res = await generateBudgetFields(brief)
              if (!res.success) {
                return {
                  success: false,
                  message: res.message,
                  reason:  res.reason,
                  quota:   res.quota ?? null,
                }
              }
              return {
                success:   true,
                fields:    res.fields,
                quota:     res.quota,
                rationale: res.fields.rationale,
              }
            }}
            onApply={fields => {
              // Aplica nos setters. O scheduleAutoSave encadeado via `field()`
              // persiste no próximo tick. Não sobrescreve se o usuário já
              // tinha preenchido (só preenche se o campo local tá vazio) —
              // mas pra revisão pós-IA, o UX mais claro é substituir tudo.
              if (fields.title)               field(setTitle)(fields.title)
              if (fields.client_name)         field(setClient)(fields.client_name)
              if (fields.project_description) field(setDesc)(fields.project_description)
              if (fields.deliverables)        field(setDelivers)(fields.deliverables)
              if (fields.segment)             field(setSegment)(fields.segment)
              if (fields.lead_source)         field(setLeadSource)(fields.lead_source)
              if (fields.payment_term)        field(setPaymentTerm)(fields.payment_term)
              if (fields.event_date_hint)     field(setEvtDate)(fields.event_date_hint)
              if (fields.intended_destination) {
                field(setIntendedDest)(fields.intended_destination as BudgetIntendedDestination)
              }
            }}
            placeholder="Ex: casamento Joao e Maria em 10/05, 6h de cobertura, 1 teaser + filme longo, entrega em 45d"
          />
        )}

        {/* Grid: dados do projeto + resumo financeiro */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Dados do projeto */}
          <div className="lg:col-span-2 bg-[#141414] border border-[#2a2a2a] rounded-2xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-white">Dados do Projeto</h2>

            {/* Título do orçamento — movido pra dentro do bloco (pente fino 2026-04-21) */}
            <div>
              <label className="block text-xs font-medium text-[#a3a3a3] mb-1.5">
                Título do orçamento <span className="text-[#D4A853]">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={e => field(setTitle)(e.target.value)}
                placeholder="Ex: Casamento João & Maria · Institucional Tech Corp"
                className={inputCls}
              />
            </div>

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

            {/* Segmento + Origem do lead — Deploy B (2026-04-22).
                Alinhado ao canon usado em pedidos/freelances/recurring.
                Propagado na conversão e como hint pro contrato gerado. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#a3a3a3] mb-1.5">
                  Segmento
                  <span className="text-[#525252] font-normal ml-1">(opcional)</span>
                </label>
                <TagCombobox
                  value={segment}
                  options={CLIENT_SEGMENTS}
                  onCommit={v => field(setSegment)(v)}
                  placeholder="ex: Casamento, E-commerce…"
                  className={inputCls}
                  ariaLabel="Segmento do cliente"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#a3a3a3] mb-1.5">
                  Origem do lead
                  <span className="text-[#525252] font-normal ml-1">(opcional)</span>
                </label>
                <TagCombobox
                  value={leadSource}
                  options={LEAD_SOURCES}
                  onCommit={v => field(setLeadSource)(v)}
                  placeholder="ex: Instagram, Indicação…"
                  className={inputCls}
                  ariaLabel="Origem do lead"
                />
              </div>
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

            {/* Prazo de pagamento — aparece no PDF e orienta o cliente.
                Pente fino Fase C (2026-04-22): presets rápidos espelhando
                Freelances (upfront / 7d / 15d / 30d / 60d / 90d) + free
                text mantido para condições compostas ("50% + 50%"). */}
            <div>
              <label className="block text-xs font-medium text-[#a3a3a3] mb-1.5">
                Prazo / condição de pagamento
                <span className="text-[#525252] font-normal ml-1">(aparece no PDF)</span>
              </label>
              <div className="flex gap-1.5 flex-wrap mb-2">
                {([
                  { label: 'À vista',       value: 'À vista'                           },
                  { label: '7 dias',        value: '7 dias'                            },
                  { label: '15 dias',       value: '15 dias'                           },
                  { label: '30 dias',       value: '30 dias'                           },
                  { label: '60 dias',       value: '60 dias'                           },
                  { label: '90 dias',       value: '90 dias'                           },
                  { label: '50% + 50%',     value: '50% na assinatura + 50% na entrega'},
                ] as const).map((opt) => {
                  const active = paymentTerm.trim() === opt.value
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => field(setPaymentTerm)(opt.value)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] border transition-colors ${
                        active
                          ? 'bg-[#D4A853]/10 border-[#D4A853]/50 text-[#E8C47A]'
                          : 'bg-[#1c1c1c] border-[#2a2a2a] text-[#a3a3a3] hover:border-[#3a3a3a]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
              <input
                type="text"
                value={paymentTerm}
                onChange={e => field(setPaymentTerm)(e.target.value)}
                placeholder="Ou escreva uma condição personalizada…"
                className={inputCls}
              />
            </div>

            {/* Destino pretendido — hint de qual fluxo vira depois de aprovado.
                NÃO trava nada — usuário ainda pode converter livremente pelo painel
                de conversão. Só pré-seleciona o botão primário. */}
            <div>
              <label className="block text-xs font-medium text-[#a3a3a3] mb-1.5">
                Destino quando aprovado
                <span className="text-[#525252] font-normal ml-1">(opcional)</span>
              </label>
              <div className="flex gap-2 flex-wrap">
                {([
                  { v: '',          label: 'Definir depois', hint: 'Escolho depois que aprovar' },
                  { v: 'freelance', label: 'Freelance',      hint: 'Job único com diárias/custos' },
                  { v: 'order',     label: 'Pedido',         hint: 'Entrega pontual (pacote/produto)' },
                  { v: 'recurring', label: 'Receita recorrente', hint: 'Mensalidade contínua' },
                ] as const).map((opt) => {
                  const active = intendedDest === opt.v
                  return (
                    <button
                      key={opt.v || 'none'}
                      type="button"
                      onClick={() => field(setIntendedDest)(opt.v)}
                      title={opt.hint}
                      className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                        active
                          ? 'bg-[#D4A853]/10 border-[#D4A853]/50 text-[#E8C47A]'
                          : 'bg-[#1c1c1c] border-[#2a2a2a] text-[#a3a3a3] hover:border-[#3a3a3a]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  )
                })}
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

            {/* Margem — dual display: mostra SEMPRE % e R$ ao mesmo tempo.
                Usuário digita no tipo escolhido; o outro é derivado automaticamente. */}
            <div className="py-3 border-b border-[#1a1a1a]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-[#a3a3a3]">Margem</span>
                <div className="flex bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg p-0.5">
                  {(['percentage', 'fixed'] as const).map(type => (
                    <button
                      key={type}
                      onClick={() => handleMarginChange(type, marginInput)}
                      title={type === 'percentage' ? 'Digitar em porcentagem' : 'Digitar em reais'}
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
              <div className="relative">
                <input
                  type="text"
                  inputMode="decimal"
                  value={marginInput}
                  onChange={e => handleMarginChange(marginType, e.target.value)}
                  placeholder={marginType === 'percentage' ? '0' : '0,00'}
                  className={`${inputCls} text-right pr-10`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#525252] font-semibold pointer-events-none">
                  {marginType === 'percentage' ? '%' : 'R$'}
                </span>
              </div>
              {/* Dual display: % ↔ R$ derivados do subtotal */}
              {toNumberSafe(budget.subtotal) > 0 && (() => {
                const subtotalNum = toNumberSafe(budget.subtotal)
                const inputNum = parseFloat(marginInput.replace(',', '.')) || 0
                const marginPct = marginType === 'percentage'
                  ? inputNum
                  : (inputNum / subtotalNum) * 100
                const marginBrl = marginType === 'fixed'
                  ? inputNum
                  : (subtotalNum * inputNum) / 100
                return (
                  <div className="flex items-center justify-between mt-2 text-xs">
                    <span className="text-[#525252]">
                      ≈ {marginPct.toFixed(1).replace('.', ',')}% do subtotal
                    </span>
                    <span className="text-[#a3a3a3] font-medium">
                      {formatCurrency(marginBrl, budget.currency)}
                    </span>
                  </div>
                )
              })()}
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
              disabled={creatingForItem}
              className="flex items-center gap-1.5 bg-[#1c1c1c] hover:bg-[#262626] border border-[#2a2a2a] text-[#a3a3a3] hover:text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors disabled:opacity-60 disabled:cursor-wait"
            >
              {creatingForItem ? (
                <>
                  <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Criando…
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Adicionar item
                </>
              )}
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

        {/* ── Aprovar & Transformar ───────────────────────────────────────────
            Pente fino 2026-04-23: desceu de cima pra baixo pro fluxo ficar
            natural (monta → vê itens → aprova → contrato). Deploy C mantém
            o comportamento: draft/sent → approveAndConvert em 1 clique;
            approved → só converter. Escondido em rejected/expired. */}
        {budget.id &&
          budget.status !== 'rejected' &&
          budget.status !== 'expired' && (
            <ConversionPanel
              budgetId={budget.id}
              status={budget.status}
              intendedDest={intendedDest === '' ? null : intendedDest}
            />
          )}

        {/* ── Contratos ───────────────────────────────────────────────────────
            Embutido DENTRO do body (antes vivia solto no page.tsx com largura
            diferente, ficava desalinhado). Só aparece quando o budget existe
            no banco (id != '') — evita piscar em rota /new antes do 1º save. */}
        {budget.id && (
          <ContractEntryPoint
            originKind="budget"
            originId={budget.id}
            contracts={linkedContracts}
            hints={{
              segment:  segment || null,
              category: null,
            }}
          />
        )}
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

// ─── ConversionPanel — Deploy C (2026-04-22) ─────────────────────────────────
//
// "Aprovar & Transformar" em 1 clique. Painel contextual:
//   · status=draft/sent  → botões "Aprovar & Transformar em X"
//     (usa approveAndConvertBudget — aprova + converte + redireciona)
//   · status=approved    → botões "Transformar em X"
//     (usa convertBudgetTo — só converte)
//
// Quando `intendedDest` está setado, o botão correspondente vira PRIMARY
// (dourado, em destaque) e os outros ficam secundários. Isso materializa
// a intenção que o usuário já declarou ao preencher o formulário —
// elimina a fricção de "clicar de novo pra escolher o mesmo destino".

type ConvTarget = 'order' | 'freelance' | 'recurring'

const CONV_LABELS: Record<ConvTarget, string> = {
  order:     'Pedido',
  freelance: 'Freelance',
  recurring: 'Receita Recorrente',
}

const CONV_ROUTES: Record<ConvTarget, string> = {
  order:     '/pedidos',
  freelance: '/freelances',
  recurring: '/receitas-recorrentes',
}

function ConversionPanel({
  budgetId,
  status,
  intendedDest,
}: {
  budgetId:     string
  status:       BudgetStatus
  intendedDest: BudgetIntendedDestination | null
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [converting, setConverting] = useState<ConvTarget | null>(null)

  const preApproval = status !== 'approved'
  const actionPrefix = preApproval ? 'Aprovar & Transformar em' : 'Transformar em'

  function run(target: ConvTarget) {
    // Copy do confirm consciente: pre-approval explicita que vai aprovar também.
    const confirmMsg = preApproval
      ? `Aprovar este orçamento e transformar em ${CONV_LABELS[target]}? Isso vai criar um novo registro e redirecionar.`
      : `Transformar este orçamento em ${CONV_LABELS[target]}?`
    if (!confirm(confirmMsg)) return

    setConverting(target)
    startTransition(async () => {
      const res = preApproval
        ? await approveAndConvertBudget(budgetId, target)
        : await convertBudgetTo(budgetId, target)
      setConverting(null)

      if (!res.success) {
        toast.error(res.message)
        return
      }

      toast.success(
        preApproval
          ? `Aprovado e transformado em ${CONV_LABELS[target]}.`
          : `Transformado em ${CONV_LABELS[target]}.`
      )
      router.push(`${CONV_ROUTES[target]}/${res.id}`)
    })
  }

  const targets: ConvTarget[] = ['freelance', 'order', 'recurring']

  // Se intendedDest está setado, coloca-o na frente pra ficar visualmente em 1º.
  const ordered = intendedDest
    ? [intendedDest as ConvTarget, ...targets.filter(t => t !== intendedDest)]
    : targets

  const containerCls = preApproval
    ? 'bg-[#D4A853]/5 border border-[#D4A853]/30 rounded-2xl p-5'
    : 'bg-emerald-500/5 border border-emerald-500/30 rounded-2xl p-5'

  const titleCls = preApproval ? 'text-[#E8C47A]' : 'text-emerald-400'
  const titleText = preApproval
    ? (intendedDest
        ? '→ Pronto pra virar ' + CONV_LABELS[intendedDest as ConvTarget]
        : '→ Aprovar e transformar')
    : '✓ Orçamento aprovado'

  const hintText = preApproval
    ? (intendedDest
        ? `Você marcou "${CONV_LABELS[intendedDest as ConvTarget]}" como destino. Um clique aprova o orçamento e cria o registro.`
        : 'Escolha o destino: vamos aprovar o orçamento e criar o registro em um único clique.')
    : 'Transforme em outro tipo de receita para continuar o fluxo.'

  return (
    <div className={containerCls}>
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <div className={`text-sm font-semibold mb-1 ${titleCls}`}>
            {titleText}
          </div>
          <div className="text-xs text-[#a3a3a3]">
            {hintText}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {ordered.map((target, idx) => {
            const isPrimary = intendedDest
              ? target === intendedDest
              : preApproval && idx === 0  // sem intent: nenhum primário explícito em approved
            const loading = converting === target
            const base = 'text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60'
            const style = isPrimary
              ? 'text-[#0a0a0a] bg-[#D4A853] hover:bg-[#E8C47A]'
              : 'text-white bg-[#1c1c1c] hover:bg-[#262626] border border-[#2a2a2a] hover:border-[#3a3a3a]'
            return (
              <button
                key={target}
                onClick={() => run(target)}
                disabled={isPending}
                className={`${base} ${style}`}
                title={`${actionPrefix} ${CONV_LABELS[target]}`}
              >
                {loading
                  ? (preApproval ? 'Aprovando…' : 'Transformando…')
                  : `${actionPrefix} ${CONV_LABELS[target]}`}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
