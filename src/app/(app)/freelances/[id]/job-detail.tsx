'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatCurrency, formatDate, todayISO } from '@/lib/utils/format'
import {
  updateJobStatus, updateJob, addPayment, deletePayment, deleteJob,
} from '@/lib/actions/jobs'
import { updateClient } from '@/lib/actions/clients'
import {
  addRevenueItem, updateRevenueItem, deleteRevenueItem,
  addCostItem,    updateCostItem,    deleteCostItem,
} from '@/lib/actions/job-items'
import { calcJobFinancials, getPaymentReminderStatus, JOB_COST_CATEGORY_LABELS } from '@/types/job'
import type {
  Job, JobRevenueItem, JobCostItem, JobPayment,
  JobStatus, JobCategory, JobCostCategory, PaymentCondition,
} from '@/types/job'
import { StatusStepper } from '@/components/freelances/status-stepper'
import { FreelanceDateRange } from '@/components/freelances/date-range'
import { ClientCombobox } from '@/components/clients/client-combobox'
import {
  ClientFullForm,
  EMPTY_CLIENT_FULL_FORM,
  type ClientFullFormValue,
} from '@/components/clients/client-full-form'

// ─── Helper: extrai extras do cliente embutido no job (join do page.tsx) ─────
// Regra crítica (item 7 do brief): NUNCA busca por nome — só usa os dados já
// vinculados via FK. Se `job.client_id` é null ou `job.client` não foi
// carregado, devolve vazio. Não tenta adivinhar.
function extrasFromJob(job: Job): ClientFullFormValue {
  const c = job.client
  if (!job.client_id || !c) return EMPTY_CLIENT_FULL_FORM
  return {
    phone:     c.phone     ?? '',
    instagram: c.instagram ?? '',
    email:     c.email     ?? '',
    document:  c.document  ?? '',
    notes:     c.notes     ?? '',
  }
}

// ─── Categorias de serviço (frontend apenas) ──────────────────────────────────
// Codificadas no campo `description` como prefixo: "Filmagem • Captação casamento"
// Zero mudança no banco. Legível para o humano e parseável.

const SERVICE_CATEGORIES = [
  { value: 'filmagem',   label: 'Filmagem'   },
  { value: 'fotografia', label: 'Fotografia' },
  { value: 'edicao',     label: 'Edição'     },
  { value: 'drone',      label: 'Drone'      },
  { value: 'direcao',    label: 'Direção'    },
  { value: 'motion',     label: 'Motion'     },
  { value: 'producao',   label: 'Produção'   },
  { value: 'outros',     label: ''           }, // sem prefixo
] as const

type ServiceCat = typeof SERVICE_CATEGORIES[number]['value']

function parseServiceCat(description: string): { cat: ServiceCat; text: string } {
  for (const c of SERVICE_CATEGORIES) {
    if (c.label && description.startsWith(`${c.label} • `)) {
      return { cat: c.value, text: description.slice(`${c.label} • `.length) }
    }
  }
  return { cat: 'outros', text: description }
}

function buildDesc(cat: ServiceCat, text: string): string {
  const label = SERVICE_CATEGORIES.find(c => c.value === cat)?.label
  return label ? `${label} • ${text.trim()}` : text.trim()
}

// ─── Config ───────────────────────────────────────────────────────────────────

const STATUS_MAP: Record<JobStatus, { label: string; cls: string }> = {
  in_progress:     { label: 'Em andamento',  cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20'          },
  delivered:       { label: 'Entregue',       cls: 'bg-purple-500/10 text-purple-400 border-purple-500/20'    },
  pending_payment: { label: 'Pag. pendente', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20'       },
  paid:            { label: 'Pago',           cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  cancelled:       { label: 'Cancelado',      cls: 'bg-[#262626] text-[#525252] border-[#2a2a2a]'             },
}

const CATEGORY_LABELS: Record<JobCategory, string> = {
  wedding:     'Casamento',
  corporate:   'Corporativo',
  social:      'Social',
  documentary: 'Documentário',
  other:       'Outros',
}

const PAYMENT_COND_LABELS: Record<PaymentCondition, string> = {
  upfront: 'À vista',
  '7d':  '7 dias', '15d': '15 dias', '30d': '30 dias',
  '60d': '60 dias', '90d': '90 dias',
}

// ─── Add result type ──────────────────────────────────────────────────────────

type AddResult = { success: boolean; id?: string }

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  job:                Job
  initialRevenueItems: JobRevenueItem[]
  initialCostItems:    JobCostItem[]
  initialPayments:     JobPayment[]
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function JobDetail({
  job: initialJob,
  initialRevenueItems,
  initialCostItems,
  initialPayments,
}: Props) {
  const router = useRouter()

  const [job,          setJob]          = useState<Job>(initialJob)
  const [revenueItems, setRevenueItems] = useState<JobRevenueItem[]>(initialRevenueItems)
  const [costItems,    setCostItems]    = useState<JobCostItem[]>(initialCostItems)
  const [payments,     setPayments]     = useState<JobPayment[]>(initialPayments)
  const [toast,        setToast]        = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Inline editing
  const [editingField, setEditingField] = useState<string | null>(null)
  const [titleDraft,   setTitleDraft]   = useState(job.title)
  const [clientDraft,  setClientDraft]  = useState(job.client_name)
  // Deploy 4 (F.6): dateDraft / isMultiDay / dateStartDraft / dateEndDraft
  // foram removidos — o estado de datas agora vive dentro de FreelanceDateRange.

  // ─── Modo expandido do cliente (F.4 — ficha completa) ──────────────────────
  // Quando `expandedClientEdit = true`, abaixo do combobox aparece o
  // ClientFullForm com phone/instagram/email/document/notes. Source of truth
  // do NOME continua sendo `clientDraft` (o form renderiza nome em read-only).
  const [expandedClientEdit, setExpandedClientEdit] = useState(false)
  const [clientExtras,       setClientExtras]       = useState<ClientFullFormValue>(
    extrasFromJob(initialJob)
  )

  // Reset crítico: se o usuário trocar o nome do cliente no combobox (digitou
  // outro / selecionou outro existente), os extras do cliente anterior NÃO
  // podem vazar pro novo. Regra item 8 do brief: sempre que `clientDraft`
  // diverge do nome atual do job, zera e recolhe o modo expandido.
  useEffect(() => {
    if (clientDraft !== job.client_name) {
      setClientExtras(EMPTY_CLIENT_FULL_FORM)
      setExpandedClientEdit(false)
    }
  }, [clientDraft, job.client_name])

  // Analytics fields (migration 014)
  const [leadSourceDraft, setLeadSourceDraft] = useState(job.lead_source ?? '')
  const [segmentDraft,    setSegmentDraft]    = useState(job.client_segment ?? '')

  // Payment form
  const [showPayForm,   setShowPayForm]   = useState(false)
  const [payAmount,     setPayAmount]     = useState('')
  const [payDate,       setPayDate]       = useState(today())
  const [payNotes,      setPayNotes]      = useState('')
  const [deletingPayId, setDeletingPayId] = useState<string | null>(null)

  // Delete job
  const [isDeleting, setIsDeleting] = useState(false)

  // PDF download
  const [downloadingPdf, setDownloadingPdf] = useState(false)

  const [isPending, startTransition] = useTransition()

  const fin = calcJobFinancials(job)

  // ── Toast ──────────────────────────────────────────────────────────────────

  function showToast(type: 'success' | 'error', message: string) {
    setToast({ type, message })
    setTimeout(() => setToast(null), 3000)
  }

  // ── Status ─────────────────────────────────────────────────────────────────

  function applyStatus(newStatus: JobStatus) {
    startTransition(async () => {
      const res = await updateJobStatus(job.id, newStatus)
      if (res.success && res.data) setJob(res.data)
      else if (!res.success) showToast('error', res.message)
    })
  }

  function handleStepperChange(next: JobStatus) {
    applyStatus(next)
  }

  function handleCancelFreelance() {
    if (!window.confirm('Cancelar este freelance? Você poderá reabrir depois.')) return
    applyStatus('cancelled')
  }

  function handleReopenFreelance() {
    applyStatus('in_progress')
  }

  // ── Delete job ─────────────────────────────────────────────────────────────

  async function handleDeleteJob() {
    if (!window.confirm('Excluir este freelance? Esta ação não pode ser desfeita.')) return
    setIsDeleting(true)
    const res = await deleteJob(job.id)
    if (res.success) {
      router.push('/freelances')
    } else {
      setIsDeleting(false)
      showToast('error', res.message)
    }
  }

  // ── PDF download ───────────────────────────────────────────────────────────

  async function handleDownloadPdf() {
    setDownloadingPdf(true)
    try {
      const res = await fetch(`/api/jobs/${job.id}/pdf`)
      if (!res.ok) throw new Error('Erro na geração')
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = window.document.createElement('a')
      a.href     = url

      const slug = (job.title || 'job')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 60)

      const clientSlug = (job.client_name || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40)

      a.download = clientSlug
        ? `cobranca_${clientSlug}_${slug}.pdf`
        : `cobranca_${slug}.pdf`

      window.document.body.appendChild(a)
      a.click()
      window.document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('[pdf/download]', err)
      showToast('error', 'Erro ao gerar PDF. Tente novamente.')
    } finally {
      setDownloadingPdf(false)
    }
  }

  // ── Field save ─────────────────────────────────────────────────────────────
  //
  // TECH DEBT:
  // Inconsistência entre comportamentos de edição inline:
  //   · title        → salva via onBlur (input puro, sem dropdown)
  //   · client_name  → NÃO salva via onBlur; exige Salvar/Enter/Escape
  //                    (usa ClientCombobox com dropdown — blur-save conflitaria
  //                    com o ciclo de seleção da lista de sugestões)
  //
  // Decisão atual: manter a divergência para evitar regressão de UX no dropdown.
  // Futuro: padronizar o comportamento de save (provavelmente REMOVER o
  // onBlur-save do title, exigindo ação explícita em todos os campos inline).
  //
  // Tracked: DEPLOY_TECH_DEBT #F.save-consistency

  async function saveField(field: string, value?: string) {
    const payload: Parameters<typeof updateJob>[1] = {}
    if (field === 'title')              payload.title              = titleDraft
    if (field === 'client_name')        payload.client_name        = clientDraft
    if (field === 'payment_condition')  payload.payment_condition  = value as PaymentCondition
    const res = await updateJob(job.id, payload)
    if (res.success && res.data) setJob(res.data)
    else if (!res.success) showToast('error', res.message)
    if (field !== 'payment_condition') setEditingField(null)
  }

  // ─── Salvar cliente (modo simples OU expandido) ────────────────────────────
  //
  // Fluxo encadeado (regra item 9 do brief — zero novo endpoint):
  //   1. updateJob({ client_name })   — cria/linka via getOrCreateClient no
  //                                     backend; retorna job com client_id.
  //   2. (só se expandido) updateClient(client_id, extras) — enriquece a ficha.
  //
  // Falha no passo 2 é SOFT-FAIL: o vínculo com o job já foi feito, o cliente
  // existe com pelo menos o nome — o usuário pode completar depois em /clientes.
  async function saveClientField() {
    startTransition(async () => {
      // Passo 1 — nome + vínculo
      const jobRes = await updateJob(job.id, { client_name: clientDraft })
      if (!jobRes.success) {
        showToast('error', jobRes.message)
        return
      }
      if (jobRes.data) setJob(jobRes.data)

      // Modo simples: fecha e volta.
      if (!expandedClientEdit) {
        setEditingField(null)
        return
      }

      // Passo 2 — ficha completa. Precisa de client_id (pode ser null se o
      // nome ficou vazio, aí não há o que enriquecer).
      const clientId = jobRes.data?.client_id
      if (!clientId) {
        setEditingField(null)
        setExpandedClientEdit(false)
        return
      }

      const extrasRes = await updateClient(clientId, {
        phone:     clientExtras.phone,
        instagram: clientExtras.instagram,
        email:     clientExtras.email,
        document:  clientExtras.document,
        notes:     clientExtras.notes,
      })

      if (!extrasRes.success) {
        // Regra item 10 do brief — mensagem explícita, não falhar silenciosamente.
        showToast(
          'error',
          'Cliente criado, mas não conseguimos salvar todos os dados. Você pode completar depois em Clientes.'
        )
      } else {
        showToast('success', 'Cliente atualizado.')
      }

      setEditingField(null)
      setExpandedClientEdit(false)
    })
  }

  // Cancelar modo edição do cliente: restaura drafts/extras pro snapshot do job.
  function cancelClientEdit() {
    setEditingField(null)
    setExpandedClientEdit(false)
    setClientDraft(job.client_name ?? '')
    setClientExtras(extrasFromJob(job))
  }

  // Deploy 4 (F.6): handler unificado para o FreelanceDateRange.
  // Chama updateJob com o adapter {date_start, date_end}, que sincroniza
  // os 4 campos legados no banco atomicamente (job_date, *_start, *_end, is_multi_day).
  async function handleDateRangeCommit(start: string, end: string | null) {
    if (!start) return
    const res = await updateJob(job.id, { date_start: start, date_end: end })
    if (res.success && res.data) setJob(res.data)
    else if (!res.success) showToast('error', res.message)
  }

  // ── Payments ───────────────────────────────────────────────────────────────

  async function handleAddPayment(e: React.FormEvent) {
    e.preventDefault()
    const amount = parseFloat(payAmount.replace(',', '.'))
    if (!amount || amount <= 0) { showToast('error', 'Informe um valor válido.'); return }
    startTransition(async () => {
      const res = await addPayment(job.id, { amount, received_at: payDate, notes: payNotes.trim() || undefined, currency: job.currency })
      if (res.success) {
        if (res.data) setPayments(prev => [res.data!, ...prev])
        if (res.job)  setJob(res.job)
        setPayAmount(''); setPayDate(today()); setPayNotes(''); setShowPayForm(false)
        showToast('success', 'Pagamento registrado.')
      } else {
        showToast('error', res.message)
      }
    })
  }

  async function handleDeletePayment(paymentId: string) {
    setDeletingPayId(paymentId)
    const res = await deletePayment(paymentId, job.id)
    setDeletingPayId(null)
    if (res.success) {
      setPayments(prev => prev.filter(p => p.id !== paymentId))
      if (res.job) setJob(res.job)
      showToast('success', 'Pagamento removido.')
    } else {
      showToast('error', res.message)
    }
  }

  // ── Revenue items ──────────────────────────────────────────────────────────

  async function handleAddRevenueItem(
    description: string, quantity: number, unit_value: number
  ): Promise<AddResult> {
    const res = await addRevenueItem(job.id, { description, quantity, unit_value })
    if (res.success) {
      if (res.data) setRevenueItems(prev => [...prev, res.data as JobRevenueItem])
      if (res.job)  setJob(res.job)
      showToast('success', 'Item adicionado com sucesso.')
      return { success: true, id: (res.data as JobRevenueItem | undefined)?.id }
    }
    showToast('error', res.message)
    return { success: false }
  }

  async function handleUpdateRevenueItem(
    itemId: string, fields: { description?: string; quantity?: number; unit_value?: number }
  ) {
    const res = await updateRevenueItem(itemId, job.id, fields)
    if (res.success) {
      if (res.data) setRevenueItems(prev => prev.map(i => i.id === itemId ? res.data as JobRevenueItem : i))
      if (res.job)  setJob(res.job)
    } else {
      showToast('error', res.message)
    }
  }

  async function handleDeleteRevenueItem(itemId: string) {
    const res = await deleteRevenueItem(itemId, job.id)
    if (res.success) {
      setRevenueItems(prev => prev.filter(i => i.id !== itemId))
      if (res.job) setJob(res.job)
      showToast('success', 'Item removido.')
    } else {
      showToast('error', res.message)
    }
  }

  // ── Cost items ─────────────────────────────────────────────────────────────

  async function handleAddCostItem(
    description: string, category: JobCostCategory, quantity: number, unit_value: number
  ): Promise<AddResult> {
    const res = await addCostItem(job.id, { description, category, quantity, unit_value })
    if (res.success) {
      if (res.data) setCostItems(prev => [...prev, res.data as JobCostItem])
      if (res.job)  setJob(res.job)
      showToast('success', 'Repasse adicionado com sucesso.')
      return { success: true, id: (res.data as JobCostItem | undefined)?.id }
    }
    showToast('error', res.message)
    return { success: false }
  }

  async function handleUpdateCostItem(
    itemId: string, fields: { description?: string; category?: JobCostCategory; quantity?: number; unit_value?: number }
  ) {
    const res = await updateCostItem(itemId, job.id, fields)
    if (res.success) {
      if (res.data) setCostItems(prev => prev.map(i => i.id === itemId ? res.data as JobCostItem : i))
      if (res.job)  setJob(res.job)
    } else {
      showToast('error', res.message)
    }
  }

  async function handleDeleteCostItem(itemId: string) {
    const res = await deleteCostItem(itemId, job.id)
    if (res.success) {
      setCostItems(prev => prev.filter(i => i.id !== itemId))
      if (res.job) setJob(res.job)
      showToast('success', 'Repasse removido.')
    } else {
      showToast('error', res.message)
    }
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  // base = total do job (serviços + repasses) — o que o cliente efetivamente deve
  const progressPct = fin.total > 0
    ? Math.min(100, Math.round((fin.received / fin.total) * 100))
    : 0

  // ── Due date label ─────────────────────────────────────────────────────────
  const { label: dueDaysLabel, isOverdue } = calcDueDaysLabel(job.payment_due_date, fin.due)
  const dueColor = fin.due <= 0
    ? 'text-[#525252]'
    : isOverdue ? 'text-red-400' : 'text-[#D4A853]'

  // ── Reminder status (para o banner de alerta) ──────────────────────────────
  const reminderStatus = getPaymentReminderStatus(job)

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-full p-6 md:p-8 max-w-3xl mx-auto pb-20">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6 text-sm text-[#525252]">
        <Link href="/freelances" className="hover:text-white transition-colors">Freelances</Link>
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-[#a3a3a3] truncate">{job.title}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="min-w-0 flex-1">
          {editingField === 'title' ? (
            <div className="flex flex-col gap-2">
              <input autoFocus value={titleDraft} onChange={e => setTitleDraft(e.target.value)}
                onBlur={() => saveField('title')}
                onKeyDown={e => { if (e.key === 'Enter') saveField('title'); if (e.key === 'Escape') setEditingField(null) }}
                className="text-2xl font-bold bg-transparent border-b border-[#D4A853] text-white outline-none w-full pb-0.5" />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => saveField('title')}
                  className="text-[11px] font-semibold px-3 py-1 rounded-md bg-[#D4A853] hover:bg-[#E8C47A] text-[#0a0a0a] transition-colors"
                >
                  Salvar
                </button>
                <button
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => setEditingField(null)}
                  className="text-[11px] font-medium px-3 py-1 rounded-md text-[#a3a3a3] hover:text-white border border-[#2a2a2a] hover:border-[#3a3a3a] transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <h1 className="text-2xl font-bold text-white cursor-pointer hover:text-[#D4A853] transition-colors truncate"
              onClick={() => { setTitleDraft(job.title); setEditingField('title') }} title="Clique para editar">
              {job.title || 'Freelance sem título'}
            </h1>
          )}
          {editingField === 'client_name' ? (
            <div
              className="flex flex-col gap-2 mt-1"
              onKeyDown={(e) => {
                if (e.key === 'Escape') { e.stopPropagation(); cancelClientEdit() }
              }}
            >
              <ClientCombobox
                autoFocus
                defaultValue={clientDraft}
                disabled={isPending}
                placeholder="Nome do cliente"
                onChange={(v) => setClientDraft(v)}
                onSelectExisting={(c) => setClientDraft(c.name)}
              />
              <p className="text-[10px] text-[#525252]">
                Selecione um cliente existente ou digite um nome novo — ele será criado ao salvar.
              </p>

              {/* Linha 1: ação principal */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => saveClientField()}
                  disabled={isPending}
                  className="text-[11px] font-semibold px-3 py-1 rounded-md bg-[#D4A853] hover:bg-[#E8C47A] text-[#0a0a0a] transition-colors disabled:opacity-60"
                >
                  {isPending ? 'Salvando…' : 'Salvar'}
                </button>
                <button
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={cancelClientEdit}
                  disabled={isPending}
                  className="text-[11px] font-medium px-3 py-1 rounded-md text-[#a3a3a3] hover:text-white border border-[#2a2a2a] hover:border-[#3a3a3a] transition-colors disabled:opacity-60"
                >
                  Cancelar
                </button>
              </div>

              {/* Linha 2 (ABAIXO do Salvar/Cancelar) — toggle do modo expandido.
                  Regra item 4 do brief: NÃO na mesma linha da ação principal. */}
              <div>
                <button
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => setExpandedClientEdit(v => !v)}
                  disabled={isPending || !clientDraft.trim()}
                  className="text-[11px] font-medium text-[#a3a3a3] hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {expandedClientEdit ? '− Recolher' : '+ Adicionar detalhes'}
                </button>
              </div>

              {/* Painel expandido — ficha completa reutilizando o componente
                  de /clientes. Nome fica read-only (source of truth = combobox). */}
              {expandedClientEdit && (
                <div className="mt-1 p-3 rounded-xl bg-[#101010] border border-[#1f1f1f]">
                  <p className="text-xs text-[#737373] leading-relaxed">
                    Você pode cadastrar apenas o nome para criar rapidamente o cliente.
                    Ou adicionar mais detalhes agora para manter seu cadastro organizado.
                  </p>
                  <ClientFullForm
                    name={clientDraft}
                    nameReadOnly
                    value={clientExtras}
                    onChange={setClientExtras}
                    disabled={isPending}
                  />
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-[#a3a3a3] mt-1 cursor-pointer hover:text-white transition-colors"
              onClick={() => { setClientDraft(job.client_name); setEditingField('client_name') }} title="Clique para editar">
              {job.client_name || 'Cliente não informado'}
              {job.category && (
                <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-[#1c1c1c] border border-[#2a2a2a] text-[#525252]">
                  {CATEGORY_LABELS[job.category]}
                </span>
              )}
            </p>
          )}
        </div>

        {/* Status stepper + ações (PDF, Excluir) + cancelar/reabrir lateral */}
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <div className="flex items-center gap-2">
            {job.status === 'cancelled' ? (
              <span className={`text-xs font-semibold px-3 py-1.5 rounded-lg border ${STATUS_MAP.cancelled.cls}`}>
                {STATUS_MAP.cancelled.label}
              </span>
            ) : (
              <StatusStepper
                status={job.status}
                disabled={isPending}
                onChange={handleStepperChange}
              />
            )}

            {/* Gerar PDF */}
            <button
              onClick={handleDownloadPdf}
              disabled={downloadingPdf}
              title="Baixar cobrança em PDF"
              className="flex items-center gap-1.5 text-xs font-semibold text-[#D4A853] border border-[#D4A853]/30 hover:border-[#D4A853]/60 hover:bg-[#D4A853]/5 rounded-lg px-3 py-1.5 transition-all disabled:opacity-50 disabled:cursor-wait"
            >
              {downloadingPdf ? (
                <Spinner />
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h4a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                </svg>
              )}
              {downloadingPdf ? 'Gerando...' : 'PDF'}
            </button>

            <button
              onClick={handleDeleteJob}
              disabled={isDeleting}
              title="Excluir freelance"
              className="p-1.5 rounded-lg text-[#525252] hover:text-red-400 hover:bg-red-500/10 disabled:opacity-40 transition-colors"
            >
              {isDeleting ? <Spinner /> : <TrashIcon />}
            </button>
          </div>

          {/* Ação lateral: cancelar / reabrir freelance */}
          {job.status === 'cancelled' ? (
            <button
              type="button"
              onClick={handleReopenFreelance}
              disabled={isPending}
              className="text-[10px] font-medium text-[#a3a3a3] hover:text-white transition-colors disabled:opacity-50"
            >
              Reabrir freelance
            </button>
          ) : (
            <button
              type="button"
              onClick={handleCancelFreelance}
              disabled={isPending}
              className="text-[10px] font-medium text-[#525252] hover:text-red-400 transition-colors disabled:opacity-50"
            >
              Cancelar freelance
            </button>
          )}
        </div>
      </div>

      {/* ── Alert de cobrança ────────────────────────────────────────────────── */}
      {(reminderStatus === 'overdue' || reminderStatus === 'due_today') && fin.due > 0 && (
        <div className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 mb-4 border ${
          reminderStatus === 'overdue'
            ? 'bg-red-500/5 border-red-500/20'
            : 'bg-amber-500/5 border-amber-500/20'
        }`}>
          <div className="flex items-center gap-2.5 min-w-0">
            <svg className={`w-4 h-4 shrink-0 ${reminderStatus === 'overdue' ? 'text-red-400' : 'text-amber-400'}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="min-w-0">
              <p className={`text-xs font-semibold ${reminderStatus === 'overdue' ? 'text-red-400' : 'text-amber-400'}`}>
                {reminderStatus === 'overdue'
                  ? `Pagamento atrasado${dueDaysLabel ? ` — ${dueDaysLabel}` : ''}`
                  : 'Pagamento vence hoje'}
              </p>
              <p className="text-[10px] text-[#525252] truncate">
                {formatCurrency(fin.due, job.currency)} a receber
                {job.client_name ? ` de ${job.client_name}` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={handleDownloadPdf}
            disabled={downloadingPdf}
            className={`flex items-center gap-1.5 text-[10px] font-semibold px-3 py-1.5 rounded-lg border transition-all disabled:opacity-50 shrink-0 ${
              reminderStatus === 'overdue'
                ? 'text-red-400 border-red-500/30 hover:border-red-500/50 hover:bg-red-500/5'
                : 'text-amber-400 border-amber-500/30 hover:border-amber-500/50 hover:bg-amber-500/5'
            }`}
          >
            {downloadingPdf ? <Spinner /> : (
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h4a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              </svg>
            )}
            {downloadingPdf ? 'Gerando...' : 'Cobrar via PDF'}
          </button>
        </div>
      )}

      {/* ── 5 cards financeiros ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
        <FinCard label="SERVIÇOS"
          value={fin.revenue}
          currency={job.currency}
          color="text-white"
          tooltip="Total pelos seus serviços." />
        <FinCard label="REPASSES"
          value={fin.cost}
          currency={job.currency}
          color="text-[#a3a3a3]"
          tooltip="Você paga e o cliente reembolsa. Neutro para seu ganho." />
        <FinCard label="TOTAL DO JOB"
          value={fin.total}
          currency={job.currency}
          color="text-white"
          tooltip="Total que o cliente deve pagar (serviços + repasses)."
          sub={fin.cost > 0 ? `${formatCurrency(fin.revenue, job.currency)} + repasses` : undefined} />
        <FinCard label="RECEBIDO"
          value={fin.received}
          currency={job.currency}
          color={fin.received > 0 ? 'text-emerald-400' : 'text-[#525252]'}
          sub={fin.total > 0 && fin.received > 0
            ? `${Math.round((fin.received / fin.total) * 100)}% do total`
            : undefined} />
        <FinCard label="A RECEBER"
          value={fin.due}
          currency={job.currency}
          color={dueColor}
          sub={dueDaysLabel} />
      </div>

      {/* Barra de progresso */}
      {fin.total > 0 && job.status !== 'cancelled' && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-[#525252]">
              {formatCurrency(fin.received, job.currency)} recebido de {formatCurrency(fin.total, job.currency)}
            </span>
            <span className="text-[10px] text-[#525252]">{progressPct}%</span>
          </div>
          <div className="h-1.5 w-full bg-[#1c1c1c] rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-500 ${
              progressPct === 100 ? 'bg-emerald-500' : progressPct > 0 ? 'bg-[#D4A853]' : 'bg-[#2a2a2a]'
            }`} style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      )}

      {/* ── Serviços ─────────────────────────────────────────────────────────── */}
      <ServiceTable
        total={fin.revenue}
        currency={job.currency}
        items={revenueItems}
        onAdd={(desc, qty, val) => handleAddRevenueItem(desc, qty, val)}
        onUpdate={(id, fields) => handleUpdateRevenueItem(id, fields)}
        onDelete={(id) => handleDeleteRevenueItem(id)}
      />

      {/* ── Repasses ao cliente ──────────────────────────────────────────────── */}
      <RepassTable
        total={fin.cost}
        currency={job.currency}
        items={costItems}
        onAdd={(desc, cat, qty, val) => handleAddCostItem(desc, cat, qty, val)}
        onUpdate={(id, fields) => handleUpdateCostItem(id, fields)}
        onDelete={(id) => handleDeleteCostItem(id)}
      />

      {/* ── Info ─────────────────────────────────────────────────────────────── */}
      <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-5 mb-6">
        <h2 className="text-sm font-semibold text-white mb-3">Detalhes</h2>
        <div className="space-y-2.5">
          {/* ── Deploy 4 (F.6): UI unificada de datas ─────────────────────── */}
          {/* Único ponto de verdade para período do freelance.                */}
          {/* Adapter em updateJob sincroniza job_date / *_start / *_end /    */}
          {/* is_multi_day transparentemente.                                  */}
          <InfoRow label="Período">
            <FreelanceDateRange
              startDate={job.job_date_start ?? job.job_date}
              endDate={job.is_multi_day ? (job.job_date_end ?? null) : null}
              onCommit={handleDateRangeCommit}
            />
          </InfoRow>
          <InfoRow label="Vencimento">
            <span className="text-xs text-white">{formatDate(job.payment_due_date)}</span>
          </InfoRow>
          <InfoRow label="Condição de pagamento">
            <select
              value={job.payment_condition}
              onChange={async (e) => {
                const condition = e.target.value as PaymentCondition
                const dueDate   = calcDueDate(job.job_date, condition)
                const res = await updateJob(job.id, {
                  payment_condition: condition,
                  payment_due_date:  dueDate,
                })
                if (res.success && res.data) {
                  setJob(res.data)
                  showToast('success', `Vencimento atualizado para ${formatDate(dueDate)}`)
                } else if (!res.success) showToast('error', res.message)
              }}
              className="text-xs text-white bg-[#1c1c1c] border border-[#2a2a2a] rounded px-2 py-1 cursor-pointer outline-none hover:border-[#3a3a3a] focus:border-[#D4A853]/50 transition-colors appearance-none"
            >
              {(Object.entries(PAYMENT_COND_LABELS) as [PaymentCondition, string][]).map(([v, l]) => (
                <option key={v} value={v} className="bg-[#141414] text-white">{l}</option>
              ))}
            </select>
          </InfoRow>

          {/* ── Origem do lead ────────────────────────────────────────────── */}
          <InfoRow label="Origem do lead">
            <>
              <input
                type="text"
                list="lead-source-list"
                value={leadSourceDraft}
                onChange={e => setLeadSourceDraft(e.target.value)}
                onBlur={async () => {
                  const res = await updateJob(job.id, { lead_source: leadSourceDraft || null })
                  if (res.success && res.data) setJob(res.data)
                }}
                placeholder="Como te encontraram?"
                className="text-xs bg-[#1c1c1c] border border-[#2a2a2a] rounded px-2 py-1 text-white outline-none focus:border-[#D4A853]/50 w-full transition-colors hover:border-[#3a3a3a]"
              />
              <datalist id="lead-source-list">
                {['Instagram','Indicação','WhatsApp','Prospecção ativa','Cliente recorrente','Google','Agência','Outro'].map(v => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </>
          </InfoRow>

          {/* ── Segmento do cliente ───────────────────────────────────────── */}
          <InfoRow label="Segmento">
            <>
              <input
                type="text"
                list="segment-list"
                value={segmentDraft}
                onChange={e => setSegmentDraft(e.target.value)}
                onBlur={async () => {
                  const res = await updateJob(job.id, { client_segment: segmentDraft || null })
                  if (res.success && res.data) setJob(res.data)
                }}
                placeholder="Tipo de cliente"
                className="text-xs bg-[#1c1c1c] border border-[#2a2a2a] rounded px-2 py-1 text-white outline-none focus:border-[#D4A853]/50 w-full transition-colors hover:border-[#3a3a3a]"
              />
              <datalist id="segment-list">
                {['Automotivo','Corporativo','Imobiliário','Evento','Casamento','Restaurante','Moda','Fitness','Influencer','Agência','Produto','Financeiro','Educacional','Outro'].map(v => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </>
          </InfoRow>
        </div>
      </div>

      {/* ── Pagamentos ───────────────────────────────────────────────────────── */}
      <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white">Pagamentos recebidos</h2>
          <button
            onClick={() => {
              if (!showPayForm && fin.due > 0) {
                // auto-preenche com o valor pendente
                setPayAmount(fin.due.toFixed(2).replace('.', ','))
              }
              setShowPayForm(v => !v)
            }}
            className="flex items-center gap-1.5 text-xs font-semibold text-[#D4A853] hover:text-[#E8C47A] transition-colors">
            <svg className={`w-3.5 h-3.5 transition-transform ${showPayForm ? 'rotate-45' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Registrar pagamento
          </button>
        </div>

        {showPayForm && (
          <form onSubmit={handleAddPayment} className="bg-[#1c1c1c] border border-[#2a2a2a] rounded-xl p-4 mb-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>VALOR</label>
                <input autoFocus type="text" inputMode="decimal" placeholder="0,00"
                  value={payAmount} onChange={e => setPayAmount(e.target.value)} required className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>DATA</label>
                <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} required className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>OBSERVAÇÃO (opcional)</label>
              <input type="text" placeholder="Ex: Entrada, saldo final..." value={payNotes} onChange={e => setPayNotes(e.target.value)} className={inputCls} />
            </div>
            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={isPending} className={btnGold}>
                {isPending ? <Spinner /> : null} Confirmar
              </button>
              <button type="button" onClick={() => setShowPayForm(false)} className="text-xs text-[#525252] hover:text-white transition-colors px-3 py-2">
                Cancelar
              </button>
            </div>
          </form>
        )}

        {payments.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-[#525252]">Nenhum pagamento registrado</p>
            <p className="text-xs text-[#3a3a3a] mt-1">Registre quando receber do cliente</p>
          </div>
        ) : (
          <div className="space-y-0">
            {payments.map(p => (
              <div key={p.id} className="flex items-center justify-between py-2.5 border-b border-[#1c1c1c] last:border-0">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-emerald-400">+ {formatCurrency(Number(p.amount), p.currency)}</p>
                  <p className="text-xs text-[#525252] mt-0.5">
                    {formatDate(p.received_at)}
                    {p.notes && <span className="ml-2 text-[#3a3a3a]">· {p.notes}</span>}
                  </p>
                </div>
                <button onClick={() => handleDeletePayment(p.id)} disabled={deletingPayId === p.id}
                  className="ml-3 text-[#3a3a3a] hover:text-red-400 disabled:opacity-40 transition-colors p-1 shrink-0">
                  {deletingPayId === p.id ? <Spinner /> : <TrashIcon />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-3 rounded-xl text-sm font-medium border shadow-xl z-50 whitespace-nowrap ${
          toast.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'
        }`}>
          {toast.message}
        </div>
      )}
    </div>
  )
}

// ─── FinCard — com flash animation ao atualizar ───────────────────────────────

function FinCard({ label, value, currency, color, sub, tooltip }: {
  label: string; value: number; currency: string; color: string; sub?: string; tooltip?: string
}) {
  const [flash, setFlash] = useState(false)
  const prevRef = useRef(value)

  useEffect(() => {
    if (prevRef.current !== value) {
      prevRef.current = value
      setFlash(true)
      const t = setTimeout(() => setFlash(false), 700)
      return () => clearTimeout(t)
    }
  }, [value])

  return (
    <div className={`bg-[#141414] border rounded-xl p-4 transition-all duration-300 ${
      flash ? 'border-[#D4A853]/30 shadow-[0_0_12px_rgba(212,168,83,0.08)]' : 'border-[#2a2a2a]'
    }`}>
      <div className="flex items-center gap-1 mb-1">
        <p className="text-[10px] font-semibold text-[#525252] tracking-widest">{label}</p>
        {tooltip && (
          <span title={tooltip}
            className="w-3.5 h-3.5 rounded-full bg-[#1c1c1c] border border-[#2a2a2a] text-[#525252] text-[8px] font-bold flex items-center justify-center cursor-help hover:bg-[#262626] transition-colors shrink-0 select-none">?</span>
        )}
      </div>
      <p className={`text-base font-bold transition-all duration-300 ${color} ${flash ? 'scale-105' : 'scale-100'}`}
        style={{ transformOrigin: 'left center' }}>
        {formatCurrency(value, currency)}
      </p>
      {sub && <p className="text-[10px] text-[#525252] mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── ServiceTable (serviços com categoria) ────────────────────────────────────

interface ServiceTableProps {
  total:    number
  currency: string
  items:    JobRevenueItem[]
  onAdd:    (description: string, quantity: number, unit_value: number) => Promise<AddResult>
  onUpdate: (id: string, fields: { description?: string; quantity?: number; unit_value?: number }) => void
  onDelete: (id: string) => void
}

function ServiceTable({ total, currency, items, onAdd, onUpdate, onDelete }: ServiceTableProps) {
  const [adding,        setAdding]        = useState(false)
  const [isSubmitting,  setIsSubmitting]  = useState(false)
  const [newCat,        setNewCat]        = useState<ServiceCat>('outros')
  const [newDesc,       setNewDesc]       = useState('')
  const [newQty,        setNewQty]        = useState('1')
  const [newVal,        setNewVal]        = useState('')
  const [newlyAddedId,  setNewlyAddedId]  = useState<string | null>(null)
  const [editingId,     setEditingId]     = useState<string | null>(null)
  const [editCat,       setEditCat]       = useState<ServiceCat>('outros')
  const [editDesc,      setEditDesc]      = useState('')
  const [editQty,       setEditQty]       = useState('')
  const [editVal,       setEditVal]       = useState('')

  async function submitAdd() {
    if (!newDesc.trim()) return
    const qty      = parseFloat(newQty.replace(',', '.')) || 1
    const val      = parseFloat(newVal.replace(',', '.')) || 0
    const fullDesc = buildDesc(newCat, newDesc)
    setIsSubmitting(true)
    const result = await onAdd(fullDesc, qty, val)
    setIsSubmitting(false)
    if (result.success) {
      setNewCat('outros'); setNewDesc(''); setNewQty('1'); setNewVal(''); setAdding(false)
      if (result.id) {
        setNewlyAddedId(result.id)
        setTimeout(() => setNewlyAddedId(null), 1200)
      }
    }
  }

  function startEdit(item: JobRevenueItem) {
    const { cat, text } = parseServiceCat(item.description)
    setEditingId(item.id); setEditCat(cat); setEditDesc(text)
    setEditQty(String(item.quantity)); setEditVal(String(item.unit_value))
  }

  function submitEdit(id: string) {
    const qty      = parseFloat(editQty.replace(',', '.')) || 1
    const val      = parseFloat(editVal.replace(',', '.')) || 0
    const fullDesc = buildDesc(editCat, editDesc)
    onUpdate(id, { description: fullDesc, quantity: qty, unit_value: val })
    setEditingId(null)
  }

  const catOptions = SERVICE_CATEGORIES.filter(c => c.value !== 'outros')

  return (
    <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-5 mb-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-1">
        <div>
          <h2 className="text-sm font-semibold text-white">Serviços</h2>
          <p className="text-[10px] text-[#525252] mt-0.5">
            {items.length > 0
              ? `${items.length} item${items.length !== 1 ? 's' : ''} · ${formatCurrency(total, currency)}`
              : 'o que você cobra do cliente'}
          </p>
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 text-xs font-semibold text-[#D4A853] hover:text-[#E8C47A] transition-colors px-2.5 py-1.5 rounded-lg border border-[#D4A853]/20 hover:border-[#D4A853]/40 shrink-0"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Adicionar serviço
          </button>
        )}
      </div>

      {/* Cabeçalho de colunas */}
      {(items.length > 0 || adding) && (
        <div className="grid grid-cols-[72px_1fr_56px_84px_84px_28px] gap-2 mb-1 px-1 mt-4">
          <span className={labelCls}>TIPO</span>
          <span className={labelCls}>DESCRIÇÃO</span>
          <span className={`${labelCls} text-right`}>QTD</span>
          <span className={`${labelCls} text-right`}>UNIT.</span>
          <span className={`${labelCls} text-right`}>TOTAL</span>
          <span />
        </div>
      )}

      {/* Linhas */}
      <div className="space-y-1">
        {items.map(item => {
          const { cat, text: displayText } = parseServiceCat(item.description)
          const catLabel = SERVICE_CATEGORIES.find(c => c.value === cat)?.label
          const isNew    = item.id === newlyAddedId

          return (
            <div key={item.id}>
              {editingId === item.id ? (
                <div className="grid grid-cols-[72px_1fr_56px_84px_84px_28px] gap-2 items-center bg-[#1a1a1a] rounded-lg px-1 py-1">
                  <select value={editCat} onChange={e => setEditCat(e.target.value as ServiceCat)} className={inputSm}>
                    <option value="outros" className="bg-[#141414]">—</option>
                    {catOptions.map(c => <option key={c.value} value={c.value} className="bg-[#141414]">{c.label}</option>)}
                  </select>
                  <input autoFocus value={editDesc} onChange={e => setEditDesc(e.target.value)}
                    onBlur={() => submitEdit(item.id)}
                    onKeyDown={e => { if (e.key === 'Enter') submitEdit(item.id); if (e.key === 'Escape') setEditingId(null) }}
                    className={inputSm} />
                  <input value={editQty} onChange={e => setEditQty(e.target.value)} onBlur={() => submitEdit(item.id)}
                    onKeyDown={e => { if (e.key === 'Enter') submitEdit(item.id); if (e.key === 'Escape') setEditingId(null) }}
                    className={`${inputSm} text-right`} />
                  <input value={editVal} onChange={e => setEditVal(e.target.value)} onBlur={() => submitEdit(item.id)}
                    onKeyDown={e => { if (e.key === 'Enter') submitEdit(item.id); if (e.key === 'Escape') setEditingId(null) }}
                    className={`${inputSm} text-right`} />
                  <span className="text-xs text-right text-[#525252]">
                    {formatCurrency((parseFloat(editQty) || 1) * (parseFloat(editVal) || 0), currency)}
                  </span>
                  <span />
                </div>
              ) : (
                <div
                  className={`grid grid-cols-[72px_1fr_56px_84px_84px_28px] gap-2 items-center group rounded-lg px-1 py-1 cursor-pointer transition-all duration-500 ${
                    isNew ? 'bg-[#D4A853]/10 border border-[#D4A853]/20' : 'hover:bg-[#1c1c1c] border border-transparent'
                  }`}
                  onClick={() => startEdit(item)}
                >
                  {catLabel ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1c1c1c] border border-[#2a2a2a] text-[#525252] truncate">
                      {catLabel}
                    </span>
                  ) : (
                    <span className="text-[10px] text-[#3a3a3a]">—</span>
                  )}
                  <span className="text-sm text-white truncate">{displayText}</span>
                  <span className="text-xs text-[#a3a3a3] text-right">{item.quantity}×</span>
                  <span className="text-xs text-[#a3a3a3] text-right">{formatCurrency(item.unit_value, currency)}</span>
                  <span className="text-xs font-semibold text-white text-right">{formatCurrency(item.total_value, currency)}</span>
                  <button onClick={e => { e.stopPropagation(); onDelete(item.id) }}
                    className="opacity-0 group-hover:opacity-100 text-[#525252] hover:text-red-400 transition-all p-0.5">
                    <TrashIcon />
                  </button>
                </div>
              )}
            </div>
          )
        })}

        {/* Nova linha */}
        {adding && (
          <div className="grid grid-cols-[72px_1fr_56px_84px_84px_28px] gap-2 items-center bg-[#1c1c1c] rounded-lg px-2 py-2 border border-[#D4A853]/20">
            <select
              value={newCat}
              onChange={e => setNewCat(e.target.value as ServiceCat)}
              disabled={isSubmitting}
              className={inputSm}
            >
              <option value="outros" className="bg-[#141414]">Tipo</option>
              {catOptions.map(c => <option key={c.value} value={c.value} className="bg-[#141414]">{c.label}</option>)}
            </select>
            <input
              autoFocus
              placeholder="Descrição do serviço"
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') submitAdd()
                if (e.key === 'Escape') { setAdding(false); setNewDesc(''); setNewQty('1'); setNewVal('') }
              }}
              disabled={isSubmitting}
              className={inputSm}
            />
            <input
              placeholder="1"
              value={newQty}
              onChange={e => setNewQty(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submitAdd() }}
              disabled={isSubmitting}
              className={`${inputSm} text-right`}
            />
            <input
              placeholder="0,00"
              value={newVal}
              onChange={e => setNewVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submitAdd() }}
              disabled={isSubmitting}
              className={`${inputSm} text-right`}
            />
            <span className="text-xs text-right text-[#525252]">
              {formatCurrency((parseFloat(newQty) || 1) * (parseFloat(newVal.replace(',', '.')) || 0), currency)}
            </span>
            <div className="flex flex-col gap-0.5">
              <button
                onClick={submitAdd}
                disabled={isSubmitting || !newDesc.trim()}
                title="Confirmar (Enter)"
                className="text-[#D4A853] hover:text-[#E8C47A] disabled:opacity-40 p-0.5 transition-colors"
              >
                {isSubmitting ? <Spinner /> : (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
              {!isSubmitting && (
                <button
                  onClick={() => { setAdding(false); setNewDesc(''); setNewQty('1'); setNewVal('') }}
                  className="text-[#3a3a3a] hover:text-[#525252] p-0.5 transition-colors"
                  title="Cancelar (Esc)"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Empty state */}
      {items.length === 0 && !adding && (
        <div className="text-center py-6">
          <p className="text-xs text-[#525252] mb-3">Nenhum serviço adicionado ainda.</p>
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 text-xs font-semibold text-[#D4A853] hover:text-[#E8C47A] transition-colors px-3 py-2 rounded-lg border border-[#D4A853]/20 hover:border-[#D4A853]/40 mx-auto"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Adicionar serviço
          </button>
        </div>
      )}

      {/* Total */}
      {items.length > 0 && (
        <div className="flex justify-end mt-3 pt-3 border-t border-[#1c1c1c]">
          <span className="text-sm font-bold text-white">{formatCurrency(total, currency)}</span>
        </div>
      )}
    </div>
  )
}

// ─── RepassTable (repasses ao cliente) ────────────────────────────────────────

interface RepassTableProps {
  total:    number
  currency: string
  items:    JobCostItem[]
  onAdd:    (description: string, category: JobCostCategory, quantity: number, unit_value: number) => Promise<AddResult>
  onUpdate: (id: string, fields: { description?: string; category?: JobCostCategory; quantity?: number; unit_value?: number }) => void
  onDelete: (id: string) => void
}

function RepassTable({ total, currency, items, onAdd, onUpdate, onDelete }: RepassTableProps) {
  const [adding,        setAdding]        = useState(false)
  const [isSubmitting,  setIsSubmitting]  = useState(false)
  const [newDesc,       setNewDesc]       = useState('')
  const [newCat,        setNewCat]        = useState<JobCostCategory>('other')
  const [newQty,        setNewQty]        = useState('1')
  const [newVal,        setNewVal]        = useState('')
  const [newlyAddedId,  setNewlyAddedId]  = useState<string | null>(null)
  const [editingId,     setEditingId]     = useState<string | null>(null)
  const [editDesc,      setEditDesc]      = useState('')
  const [editCat,       setEditCat]       = useState<JobCostCategory>('other')
  const [editQty,       setEditQty]       = useState('')
  const [editVal,       setEditVal]       = useState('')

  async function submitAdd() {
    if (!newDesc.trim()) return
    const qty = parseFloat(newQty.replace(',', '.')) || 1
    const val = parseFloat(newVal.replace(',', '.')) || 0
    setIsSubmitting(true)
    const result = await onAdd(newDesc.trim(), newCat, qty, val)
    setIsSubmitting(false)
    if (result.success) {
      setNewDesc(''); setNewCat('other'); setNewQty('1'); setNewVal(''); setAdding(false)
      if (result.id) {
        setNewlyAddedId(result.id)
        setTimeout(() => setNewlyAddedId(null), 1200)
      }
    }
  }

  function startEdit(item: JobCostItem) {
    setEditingId(item.id); setEditDesc(item.description)
    setEditCat(item.category); setEditQty(String(item.quantity)); setEditVal(String(item.unit_value))
  }

  function submitEdit(id: string) {
    const qty = parseFloat(editQty.replace(',', '.')) || 1
    const val = parseFloat(editVal.replace(',', '.')) || 0
    onUpdate(id, { description: editDesc, category: editCat, quantity: qty, unit_value: val })
    setEditingId(null)
  }

  const catOptions = Object.entries(JOB_COST_CATEGORY_LABELS) as [JobCostCategory, string][]

  return (
    <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-5 mb-4">
      {/* Header com tooltip */}
      <div className="flex items-start justify-between mb-1">
        <div>
          <div className="flex items-center gap-1.5">
            <h2 className="text-sm font-semibold text-white">Repasses ao cliente</h2>
            <span
              title="Itens que você paga mas repassa ao cliente. Não reduzem seu lucro real."
              className="w-4 h-4 rounded-full bg-[#1c1c1c] border border-[#2a2a2a] text-[#525252] text-[9px] font-bold flex items-center justify-center cursor-help hover:bg-[#262626] transition-colors shrink-0 select-none"
            >?</span>
          </div>
          <p className="text-[10px] text-[#525252] mt-0.5">
            {items.length > 0
              ? `${items.length} item${items.length !== 1 ? 's' : ''} · ${formatCurrency(total, currency)}`
              : 'aluguel de gear, viagem cobrada, diária de assistente...'}
          </p>
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 text-xs font-semibold text-[#D4A853] hover:text-[#E8C47A] transition-colors px-2.5 py-1.5 rounded-lg border border-[#D4A853]/20 hover:border-[#D4A853]/40 shrink-0"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Adicionar repasse
          </button>
        )}
      </div>

      {(items.length > 0 || adding) && (
        <div className="grid grid-cols-[80px_1fr_56px_84px_84px_28px] gap-2 mb-1 px-1 mt-4">
          <span className={labelCls}>CATEGORIA</span>
          <span className={labelCls}>DESCRIÇÃO</span>
          <span className={`${labelCls} text-right`}>QTD</span>
          <span className={`${labelCls} text-right`}>UNIT.</span>
          <span className={`${labelCls} text-right`}>TOTAL</span>
          <span />
        </div>
      )}

      <div className="space-y-1">
        {items.map(item => {
          const isNew = item.id === newlyAddedId
          return (
            <div key={item.id}>
              {editingId === item.id ? (
                <div className="grid grid-cols-[80px_1fr_56px_84px_84px_28px] gap-2 items-center bg-[#1a1a1a] rounded-lg px-1 py-1">
                  <select value={editCat} onChange={e => setEditCat(e.target.value as JobCostCategory)} className={inputSm}>
                    {catOptions.map(([v, l]) => <option key={v} value={v} className="bg-[#141414]">{l}</option>)}
                  </select>
                  <input autoFocus value={editDesc} onChange={e => setEditDesc(e.target.value)}
                    onBlur={() => submitEdit(item.id)}
                    onKeyDown={e => { if (e.key === 'Enter') submitEdit(item.id); if (e.key === 'Escape') setEditingId(null) }}
                    className={inputSm} />
                  <input value={editQty} onChange={e => setEditQty(e.target.value)} className={`${inputSm} text-right`}
                    onBlur={() => submitEdit(item.id)} onKeyDown={e => { if (e.key === 'Enter') submitEdit(item.id) }} />
                  <input value={editVal} onChange={e => setEditVal(e.target.value)} className={`${inputSm} text-right`}
                    onBlur={() => submitEdit(item.id)} onKeyDown={e => { if (e.key === 'Enter') submitEdit(item.id) }} />
                  <span className="text-xs text-right text-[#525252]">
                    {formatCurrency((parseFloat(editQty) || 1) * (parseFloat(editVal) || 0), currency)}
                  </span>
                  <span />
                </div>
              ) : (
                <div
                  className={`grid grid-cols-[80px_1fr_56px_84px_84px_28px] gap-2 items-center group rounded-lg px-1 py-1 cursor-pointer transition-all duration-500 ${
                    isNew ? 'bg-[#D4A853]/10 border border-[#D4A853]/20' : 'hover:bg-[#1c1c1c] border border-transparent'
                  }`}
                  onClick={() => startEdit(item)}
                >
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1c1c1c] border border-[#2a2a2a] text-[#525252] truncate">
                    {JOB_COST_CATEGORY_LABELS[item.category]}
                  </span>
                  <span className="text-sm text-white truncate">{item.description}</span>
                  <span className="text-xs text-[#a3a3a3] text-right">{item.quantity}×</span>
                  <span className="text-xs text-[#a3a3a3] text-right">{formatCurrency(item.unit_value, currency)}</span>
                  <span className="text-xs font-semibold text-white text-right">{formatCurrency(item.total_value, currency)}</span>
                  <button onClick={e => { e.stopPropagation(); onDelete(item.id) }}
                    className="opacity-0 group-hover:opacity-100 text-[#525252] hover:text-red-400 transition-all p-0.5">
                    <TrashIcon />
                  </button>
                </div>
              )}
            </div>
          )
        })}

        {adding && (
          <div className="grid grid-cols-[80px_1fr_56px_84px_84px_28px] gap-2 items-center bg-[#1c1c1c] rounded-lg px-2 py-2 border border-[#D4A853]/20">
            <select
              value={newCat}
              onChange={e => setNewCat(e.target.value as JobCostCategory)}
              disabled={isSubmitting}
              className={inputSm}
            >
              {catOptions.map(([v, l]) => <option key={v} value={v} className="bg-[#141414]">{l}</option>)}
            </select>
            <input
              autoFocus
              placeholder="Ex: Aluguel drone, viagem..."
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') submitAdd()
                if (e.key === 'Escape') { setAdding(false); setNewDesc(''); setNewQty('1'); setNewVal('') }
              }}
              disabled={isSubmitting}
              className={inputSm}
            />
            <input
              placeholder="1"
              value={newQty}
              onChange={e => setNewQty(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submitAdd() }}
              disabled={isSubmitting}
              className={`${inputSm} text-right`}
            />
            <input
              placeholder="0,00"
              value={newVal}
              onChange={e => setNewVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submitAdd() }}
              disabled={isSubmitting}
              className={`${inputSm} text-right`}
            />
            <span className="text-xs text-right text-[#525252]">
              {formatCurrency((parseFloat(newQty) || 1) * (parseFloat(newVal.replace(',', '.')) || 0), currency)}
            </span>
            <div className="flex flex-col gap-0.5">
              <button
                onClick={submitAdd}
                disabled={isSubmitting || !newDesc.trim()}
                title="Confirmar (Enter)"
                className="text-[#D4A853] hover:text-[#E8C47A] disabled:opacity-40 p-0.5 transition-colors"
              >
                {isSubmitting ? <Spinner /> : (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
              {!isSubmitting && (
                <button
                  onClick={() => { setAdding(false); setNewDesc(''); setNewQty('1'); setNewVal('') }}
                  className="text-[#3a3a3a] hover:text-[#525252] p-0.5 transition-colors"
                  title="Cancelar (Esc)"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {items.length === 0 && !adding && (
        <div className="text-center py-6">
          <p className="text-xs text-[#525252] mb-3">
            Nenhum repasse registrado. Aluguel de gear, viagem cobrada do cliente, diária de assistente...
          </p>
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 text-xs font-semibold text-[#D4A853] hover:text-[#E8C47A] transition-colors px-3 py-2 rounded-lg border border-[#D4A853]/20 hover:border-[#D4A853]/40 mx-auto"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Adicionar repasse
          </button>
        </div>
      )}

      {items.length > 0 && (
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#1c1c1c]">
          <span className="text-[10px] text-[#525252]">cobrado do cliente · não reduz seu lucro</span>
          <span className="text-sm font-bold text-[#a3a3a3]">{formatCurrency(total, currency)}</span>
        </div>
      )}
    </div>
  )
}

// ─── InfoRow ──────────────────────────────────────────────────────────────────

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-[#525252]">{label}</span>
      {children}
    </div>
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const today = todayISO

/** Calcula a data de vencimento a partir da data do job + condição de pagamento. */
function calcDueDate(jobDateIso: string, condition: PaymentCondition): string {
  const daysMap: Record<string, number> = {
    upfront: 0, '7d': 7, '15d': 15, '30d': 30, '60d': 60, '90d': 90,
  }
  const days = daysMap[condition] ?? 0
  const [y, m, d] = jobDateIso.split('-').map(Number)
  const date = new Date(y, m - 1, d + days)
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

/** Retorna label "vence em Xd" / "venceu há Xd" / "vence hoje" + flag de vencido. */
function calcDueDaysLabel(
  dueDateIso: string | null,
  due: number
): { label?: string; isOverdue: boolean } {
  if (!dueDateIso || due <= 0) return { isOverdue: false }
  const ref = new Date(); ref.setHours(0, 0, 0, 0)
  const [y, m, d] = dueDateIso.split('-').map(Number)
  const dueDate = new Date(y, m - 1, d)
  const diffDays = Math.round((dueDate.getTime() - ref.getTime()) / 86_400_000)
  if (diffDays === 0) return { label: 'vence hoje', isOverdue: false }
  if (diffDays > 0)   return { label: `vence em ${diffDays}d`, isOverdue: false }
  return { label: `venceu há ${Math.abs(diffDays)}d`, isOverdue: true }
}

const labelCls = 'block text-[10px] font-semibold text-[#525252] tracking-widest'
const inputCls = 'w-full bg-[#141414] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white placeholder-[#525252] focus:outline-none focus:border-[#D4A853]/50 focus:ring-1 focus:ring-[#D4A853]/20 transition-colors'
const inputSm  = 'w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded px-2 py-1 text-xs text-white placeholder-[#525252] focus:outline-none focus:border-[#D4A853]/50 transition-colors'
const btnGold  = 'flex items-center gap-2 bg-[#D4A853] hover:bg-[#E8C47A] disabled:opacity-60 text-[#0a0a0a] font-semibold text-xs px-4 py-2 rounded-lg transition-colors'
