'use client'

import { useState, useTransition, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ClientCombobox } from '@/components/clients/client-combobox'
import { TagCombobox } from '@/components/freelances/tag-combobox'
import { LEAD_SOURCES } from '@/lib/canonical/lead-sources'
import { CLIENT_SEGMENTS } from '@/lib/canonical/segments'
import { SUPPORTED_CURRENCIES, formatCurrency } from '@/lib/utils/format'
import { MoneyInput } from '@/components/ui/money-input'
import { MoneyInputInline } from '@/components/ui/money-input-inline'
import { AutoGrowTextarea } from '@/components/ui/auto-grow-textarea'
import {
  updateRecurringRevenue,
  deleteRecurringRevenue,
} from '@/lib/actions/recurring-revenue'
import {
  generateInvoice,
  updateInvoiceStatus,
  deleteInvoice,
} from '@/lib/actions/recurring-invoices'
import {
  addRecurringItem,
  updateRecurringItem,
  deleteRecurringItem,
  addRecurringCostItem,
  updateRecurringCostItem,
  deleteRecurringCostItem,
} from '@/lib/actions/recurring-items'
import type {
  RecurringRevenue,
  RecurringStatus,
  RecurringFrequency,
  RecurringRevenueInvoice,
  RecurringInvoiceStatus,
  RecurringItem,
  RecurringCostItem,
  RecurringItemCategory,
  RecurringCostCategory,
} from '@/types/recurring-revenue'
import { RecurringStatusBadge } from '../recurring-list'
import { toast } from 'sonner'
import { ContractEntryPoint } from '@/components/contracts/contract-entry-point'
import { SectionBoundary } from '@/components/common/section-boundary'
import type { Contract } from '@/types/contract'

interface Props {
  item: RecurringRevenue
  initialInvoices?: RecurringRevenueInvoice[]
  /** Contratos já vinculados (Deploy pente-fino 2026-04-23) */
  linkedContracts?: Contract[]
  /** Itens (serviços do contrato) — Fase 5 / 2026-04-23 */
  initialItems?: RecurringItem[]
  /** Itens de custo (repasses ao cliente) — Fase 5 / 2026-04-23 */
  initialCostItems?: RecurringCostItem[]
  itemsTableMissing?: boolean
  costsTableMissing?: boolean
}

// ─── Categorias (paridade com Pedidos) ───────────────────────────────────────

const ITEM_CATEGORIES: { value: RecurringItemCategory; label: string }[] = [
  { value: 'service',   label: 'Serviço'    },
  { value: 'product',   label: 'Produto'    },
  { value: 'team',      label: 'Equipe'     },
  { value: 'equipment', label: 'Equipamento'},
  { value: 'other',     label: 'Outro'      },
]

const COST_CATEGORIES: { value: RecurringCostCategory; label: string }[] = [
  { value: 'equipment_rental', label: 'Aluguel de equipamento' },
  { value: 'team',             label: 'Equipe'                 },
  { value: 'travel',           label: 'Deslocamento'           },
  { value: 'accommodation',    label: 'Hospedagem'             },
  { value: 'food',             label: 'Alimentação'            },
  { value: 'software',         label: 'Software'               },
  { value: 'other',            label: 'Outro'                  },
]

// ─── Helpers de estilo inline (paridade order-editor) ────────────────────────

const inputSm =
  'w-full bg-transparent border border-[#2a2a2a] focus:border-[#D4A853] ' +
  'focus:outline-none text-white text-sm rounded-md px-2 py-1 transition-colors'

const labelCls =
  'text-[9px] font-semibold uppercase tracking-wider text-[#525252]'

function TrashIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
    </svg>
  )
}

function Spinner() {
  return (
    <svg className="w-3.5 h-3.5 animate-spin text-[#D4A853]" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  )
}

const FREQUENCY_OPTIONS: { value: RecurringFrequency; label: string }[] = [
  { value: 'weekly',    label: 'Semanal' },
  { value: 'monthly',   label: 'Mensal' },
  { value: 'quarterly', label: 'Trimestral' },
  { value: 'yearly',    label: 'Anual' },
]

const STATUS_OPTIONS: { value: RecurringStatus; label: string }[] = [
  { value: 'active',    label: 'Ativo' },
  { value: 'paused',    label: 'Pausado' },
  { value: 'cancelled', label: 'Cancelado' },
]

export default function RecurringEditor({
  item,
  initialInvoices = [],
  linkedContracts = [],
  initialItems = [],
  initialCostItems = [],
  itemsTableMissing = false,
  costsTableMissing = false,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // ── Itens (serviços do contrato) + custo (repasses ao cliente) — Fase 5 / 2026-04-23
  const [items, setItems]         = useState<RecurringItem[]>(initialItems)
  const [costItems, setCostItems] = useState<RecurringCostItem[]>(initialCostItems)

  const itemsTotal     = items.reduce((s, i) => s + Number(i.total_value || 0), 0)
  const costItemsTotal = costItems.reduce((s, i) => s + Number(i.total_value || 0), 0)

  const [form, setForm] = useState({
    title:               item.title,
    client_id:           item.client_id,
    client_name:         item.client_name ?? '',
    segment:             item.segment ?? '',
    lead_source:         item.lead_source ?? '',
    project_description: item.project_description ?? '',
    scope_summary:       item.scope_summary ?? '',
    notes_internal:      item.notes_internal ?? '',
    renewal_date:        item.renewal_date ?? '',
    delivery_type:       item.delivery_type ?? '',
    has_video:           item.has_video,
    has_photo:           item.has_photo,
    has_social:          item.has_social,
    currency:            item.currency,
    amount:              item.amount,
    frequency:           item.frequency,
    billing_day:         item.billing_day,
    next_delivery_at:    item.next_delivery_at ?? '',
    next_billing_at:     item.next_billing_at ?? '',
    status:              item.status,
    notes:               item.notes ?? '',
    started_at:          item.started_at,
  })

  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Histórico de cobranças (Fase 4 / 2026-04-22)
  const [invoices, setInvoices] = useState<RecurringRevenueInvoice[]>(initialInvoices)

  function handleSave() {
    startTransition(async () => {
      setError(null)
      const res = await updateRecurringRevenue(item.id, {
        title:               form.title,
        client_name:         form.client_name,
        segment:             form.segment || null,
        lead_source:         form.lead_source || null,
        project_description: form.project_description || null,
        scope_summary:       form.scope_summary || null,
        notes_internal:      form.notes_internal || null,
        renewal_date:        form.renewal_date || null,
        delivery_type:       form.delivery_type || null,
        has_video:           form.has_video,
        has_photo:           form.has_photo,
        has_social:          form.has_social,
        currency:            form.currency,
        amount:              Number(form.amount) || 0,
        frequency:           form.frequency,
        billing_day:         form.billing_day ? Number(form.billing_day) : null,
        next_delivery_at:    form.next_delivery_at || null,
        next_billing_at:     form.next_billing_at || null,
        status:              form.status,
        notes:               form.notes || null,
        started_at:          form.started_at,
      })
      if (!res.success) {
        setError(res.message)
        return
      }
      setSavedAt(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))
      router.refresh()
    })
  }

  function handleDelete() {
    setConfirmingDelete(false)
    startTransition(async () => {
      const res = await deleteRecurringRevenue(item.id)
      if (!res.success) {
        alert(res.message ?? 'Erro ao excluir.')
        return
      }
      router.push('/receitas-recorrentes')
    })
  }

  return (
    <div className="min-h-full p-6 md:p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <Link
          href="/receitas-recorrentes"
          className="flex items-center gap-2 text-sm text-[#a3a3a3] hover:text-white transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
          </svg>
          Voltar para Receita Recorrente
        </Link>
        <RecurringStatusBadge status={form.status} />
      </div>

      <div className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-6 space-y-5">
        {/* Título */}
        <div>
          <label className="block text-xs text-[#a3a3a3] mb-1.5">Título</label>
          <input
            type="text"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="Receita sem título"
            className="w-full bg-[#0a0a0a] border border-[#2a2a2a] focus:border-[#D4A853] focus:outline-none text-white text-sm rounded-lg px-3 py-2.5 transition-colors"
          />
        </div>

        {/* Cliente */}
        <div>
          <label className="block text-xs text-[#a3a3a3] mb-1.5">Cliente</label>
          <ClientCombobox
            defaultValue={form.client_name}
            onChange={v => setForm(f => ({ ...f, client_name: v }))}
            onSelectExisting={c => setForm(f => ({ ...f, client_name: c.name, client_id: c.id }))}
            placeholder="Digite ou selecione um cliente"
          />
        </div>

        {/* Segmento / Lead Source / Tipo de entrega */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-[#a3a3a3] mb-1.5">Segmento</label>
            <TagCombobox
              value={form.segment}
              options={CLIENT_SEGMENTS}
              onCommit={v => setForm(f => ({ ...f, segment: v }))}
              placeholder="ex: Casamento, E-commerce…"
              className="w-full bg-[#0a0a0a] border border-[#2a2a2a] focus:border-[#D4A853] focus:outline-none text-white text-sm rounded-lg px-3 py-2.5 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs text-[#a3a3a3] mb-1.5">Origem do lead</label>
            <TagCombobox
              value={form.lead_source}
              options={LEAD_SOURCES}
              onCommit={v => setForm(f => ({ ...f, lead_source: v }))}
              placeholder="ex: Instagram, Indicação…"
              className="w-full bg-[#0a0a0a] border border-[#2a2a2a] focus:border-[#D4A853] focus:outline-none text-white text-sm rounded-lg px-3 py-2.5 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs text-[#a3a3a3] mb-1.5">Tipo de entrega</label>
            <input
              type="text"
              value={form.delivery_type}
              onChange={e => setForm(f => ({ ...f, delivery_type: e.target.value }))}
              placeholder="ex: reels, photo monthly, social kit"
              className="w-full bg-[#0a0a0a] border border-[#2a2a2a] focus:border-[#D4A853] focus:outline-none text-white text-sm rounded-lg px-3 py-2.5 transition-colors"
            />
          </div>
        </div>

        {/* Descrição do projeto + Resumo de escopo */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-[#a3a3a3] mb-1.5">Descrição do projeto</label>
            <AutoGrowTextarea
              value={form.project_description}
              onChange={e => setForm(f => ({ ...f, project_description: e.target.value }))}
              minRows={3}
              placeholder="Contexto, objetivo, estilo…"
              className="w-full bg-[#0a0a0a] border border-[#2a2a2a] focus:border-[#D4A853] focus:outline-none text-white text-sm rounded-lg px-3 py-2.5 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs text-[#a3a3a3] mb-1.5">Resumo do escopo</label>
            <AutoGrowTextarea
              value={form.scope_summary}
              onChange={e => setForm(f => ({ ...f, scope_summary: e.target.value }))}
              minRows={3}
              placeholder="Entregáveis fixos do contrato…"
              className="w-full bg-[#0a0a0a] border border-[#2a2a2a] focus:border-[#D4A853] focus:outline-none text-white text-sm rounded-lg px-3 py-2.5 transition-colors"
            />
          </div>
        </div>

        {/* Flags de conteúdo */}
        <div>
          <label className="block text-xs text-[#a3a3a3] mb-1.5">Conteúdo incluso</label>
          <div className="flex flex-wrap gap-2">
            {([
              { key: 'has_video',  label: 'Vídeo' },
              { key: 'has_photo',  label: 'Foto' },
              { key: 'has_social', label: 'Social' },
            ] as const).map(flag => {
              const active = form[flag.key]
              return (
                <button
                  key={flag.key}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, [flag.key]: !f[flag.key] }))}
                  className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                    active
                      ? 'bg-[#D4A853]/10 border-[#D4A853]/50 text-[#D4A853]'
                      : 'bg-[#0a0a0a] border-[#2a2a2a] text-[#a3a3a3] hover:text-white hover:border-[#3a3a3a]'
                  }`}
                >
                  {active ? '✓ ' : ''}{flag.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Financeiro */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-[#a3a3a3] mb-1.5">Moeda</label>
            <select
              value={form.currency}
              onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
              className="w-full bg-[#0a0a0a] border border-[#2a2a2a] focus:border-[#D4A853] focus:outline-none text-white text-sm rounded-lg px-3 py-2.5 transition-colors"
            >
              {SUPPORTED_CURRENCIES.map(c => (
                <option key={c.code} value={c.code}>{c.code}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-[#a3a3a3] mb-1.5">
              {form.frequency === 'monthly' ? 'Valor da mensalidade' :
               form.frequency === 'weekly'  ? 'Valor semanal' :
               form.frequency === 'quarterly' ? 'Valor trimestral' :
               form.frequency === 'yearly'  ? 'Valor anual' :
               'Valor por cobrança'}
            </label>
            {/* Pente fino Fase 2 (2026-04-22): stepper de centavos era UX
                amadora. Substituído por MoneyInput — prefixo R$, formato
                pt-BR (1.234,56), aceita "," e ".", commit via blur/Enter. */}
            <MoneyInput
              value={form.amount}
              currency={form.currency}
              onChange={v => setForm(f => ({ ...f, amount: v }))}
              ariaLabel="Valor da cobrança"
            />
          </div>
        </div>

        {/* Cadência */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-[#a3a3a3] mb-1.5">Frequência</label>
            <select
              value={form.frequency}
              onChange={e => setForm(f => ({ ...f, frequency: e.target.value as RecurringFrequency }))}
              className="w-full bg-[#0a0a0a] border border-[#2a2a2a] focus:border-[#D4A853] focus:outline-none text-white text-sm rounded-lg px-3 py-2.5 transition-colors"
            >
              {FREQUENCY_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-[#a3a3a3] mb-1.5">
              Dia da cobrança
              <span className="text-[#525252]"> (1-31)</span>
            </label>
            <select
              value={form.billing_day ?? ''}
              onChange={e => setForm(f => ({
                ...f,
                billing_day: e.target.value ? Number(e.target.value) : null,
              }))}
              className="w-full bg-[#0a0a0a] border border-[#2a2a2a] focus:border-[#D4A853] focus:outline-none text-white text-sm rounded-lg px-3 py-2.5 transition-colors"
            >
              <option value="">— Definir depois —</option>
              {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                <option key={d} value={d}>
                  Dia {d}{d === 1 ? ' (início do mês)' : d === 15 ? ' (meio do mês)' : d >= 28 ? ' (final do mês)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Próximas datas */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-[#a3a3a3] mb-1.5">Próxima entrega</label>
            <input
              type="date"
              value={form.next_delivery_at}
              onChange={e => setForm(f => ({ ...f, next_delivery_at: e.target.value }))}
              className="w-full bg-[#0a0a0a] border border-[#2a2a2a] focus:border-[#D4A853] focus:outline-none text-white text-sm rounded-lg px-3 py-2.5 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs text-[#a3a3a3] mb-1.5">
              {form.frequency === 'monthly' ? 'Próxima mensalidade' : 'Próxima cobrança'}
            </label>
            <input
              type="date"
              value={form.next_billing_at}
              onChange={e => setForm(f => ({ ...f, next_billing_at: e.target.value }))}
              className="w-full bg-[#0a0a0a] border border-[#2a2a2a] focus:border-[#D4A853] focus:outline-none text-white text-sm rounded-lg px-3 py-2.5 transition-colors"
            />
          </div>
        </div>

        {/* Status */}
        <div>
          <label className="block text-xs text-[#a3a3a3] mb-1.5">Status</label>
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setForm(f => ({ ...f, status: opt.value }))}
                className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                  form.status === opt.value
                    ? 'bg-[#D4A853]/10 border-[#D4A853]/50 text-[#D4A853]'
                    : 'bg-[#0a0a0a] border-[#2a2a2a] text-[#a3a3a3] hover:text-white hover:border-[#3a3a3a]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Data início / Renovação */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-[#a3a3a3] mb-1.5">Início do contrato</label>
            <input
              type="date"
              value={form.started_at}
              onChange={e => setForm(f => ({ ...f, started_at: e.target.value }))}
              className="w-full bg-[#0a0a0a] border border-[#2a2a2a] focus:border-[#D4A853] focus:outline-none text-white text-sm rounded-lg px-3 py-2.5 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs text-[#a3a3a3] mb-1.5">Data de renovação (opcional)</label>
            <input
              type="date"
              value={form.renewal_date}
              onChange={e => setForm(f => ({ ...f, renewal_date: e.target.value }))}
              className="w-full bg-[#0a0a0a] border border-[#2a2a2a] focus:border-[#D4A853] focus:outline-none text-white text-sm rounded-lg px-3 py-2.5 transition-colors"
            />
          </div>
        </div>

        {/* Notas públicas + Notas internas */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="flex items-center gap-2 text-xs text-[#a3a3a3] mb-1.5">
              <span>Observações</span>
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Aparece no PDF
              </span>
            </label>
            <AutoGrowTextarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              minRows={3}
              className="w-full bg-[#0a0a0a] border border-[#2a2a2a] focus:border-[#D4A853] focus:outline-none text-white text-sm rounded-lg px-3 py-2.5 transition-colors"
              placeholder="Condições especiais, escopo, etc."
            />
          </div>
          <div>
            <label className="flex items-center gap-2 text-xs text-[#a3a3a3] mb-1.5">
              <span>Notas internas</span>
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-[#1a1a1a] text-[#a3a3a3] border border-[#2a2a2a]">
                Só você vê
              </span>
            </label>
            <AutoGrowTextarea
              value={form.notes_internal}
              onChange={e => setForm(f => ({ ...f, notes_internal: e.target.value }))}
              minRows={3}
              className="w-full bg-[#0a0a0a] border border-[#2a2a2a] focus:border-[#D4A853] focus:outline-none text-white text-sm rounded-lg px-3 py-2.5 transition-colors"
              placeholder="Lembretes internos, contexto do cliente…"
            />
          </div>
        </div>

        {/* Resumo — soma viva: base + Σserviços + Σrepasses */}
        <div className="pt-4 border-t border-[#2a2a2a] space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#525252]">Mensalidade base</span>
            <span className="text-[#a3a3a3] tabular-nums">
              {formatCurrency(Number(form.amount) || 0, form.currency)}
            </span>
          </div>
          {items.length > 0 && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#525252]">
                Serviços do contrato ({items.length})
              </span>
              <span className="text-[#a3a3a3] tabular-nums">
                {formatCurrency(itemsTotal, form.currency)}
              </span>
            </div>
          )}
          {costItems.length > 0 && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#525252]">
                Repasses ao cliente ({costItems.length})
              </span>
              <span className="text-[#a3a3a3] tabular-nums">
                {formatCurrency(costItemsTotal, form.currency)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between pt-2 border-t border-[#1c1c1c]">
            <span className="text-xs text-[#525252]">Total por período</span>
            <span className="text-sm font-bold text-white tabular-nums">
              {formatCurrency(
                (Number(form.amount) || 0) + itemsTotal + costItemsTotal,
                form.currency,
              )}
            </span>
          </div>
          <div className="flex items-center justify-end gap-2 min-h-[16px]">
            {savedAt && !error && (
              <span className="text-xs text-emerald-400">Salvo às {savedAt}</span>
            )}
            {error && <span className="text-xs text-red-400">{error}</span>}
          </div>
        </div>

        {/* Ações */}
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            disabled={isPending}
            className="text-xs font-medium text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
          >
            Excluir contrato
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="flex items-center gap-2 bg-[#D4A853] hover:bg-[#E8C47A] disabled:opacity-60 text-[#0a0a0a] font-semibold text-sm px-4 py-2.5 rounded-xl transition-colors"
          >
            {isPending ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>

      {/* ═══ Serviços do contrato (Fase 5 / 2026-04-23) ═══════════════════
          Espelha ItemsSection do Pedidos. Cada serviço soma no total mensal
          em tempo real. Não rola pro invoicing — total = amount + Σitems. */}
      {itemsTableMissing ? (
        <div className="mt-6 text-xs text-amber-400 bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
          Seção de serviços depende de migration pendente
          (<span className="font-mono">20260423070000_recurring_revenue_items.sql</span>).
        </div>
      ) : (
        <RecurringItemsSection
          recurringId={item.id}
          currency={form.currency}
          items={items}
          total={itemsTotal}
          onChange={setItems}
        />
      )}

      {/* ═══ Repasses ao cliente (Fase 5 / 2026-04-23) ═════════════════════
          Itens cobrados do cliente e repassados a terceiros. Entram no total
          mensal (o cliente paga), mas não reduzem lucro real. */}
      {costsTableMissing ? (
        <div className="mt-2 text-xs text-amber-400 bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
          Seção de repasses depende de migration pendente
          (<span className="font-mono">20260423070000_recurring_revenue_items.sql</span>).
        </div>
      ) : (
        <RecurringCostItemsSection
          recurringId={item.id}
          currency={form.currency}
          items={costItems}
          total={costItemsTotal}
          onChange={setCostItems}
        />
      )}

      {/* ═══ Histórico de cobranças (Fase 4 / 2026-04-22) ══════════════════
          Cada cobrança é gerada a partir da recorrência, com snapshot do
          título+valor+cliente no momento da emissão. Idempotência pelo
          unique (recurring_id, year, month). Permite baixar PDF mensal. */}
      <InvoicesSection
        recurringId={item.id}
        currency={form.currency}
        invoices={invoices}
        onChange={setInvoices}
        disabled={form.status === 'cancelled'}
      />

      {/* Contratos vinculados — pente fino 2026-04-23
          Embutido aqui pra herdar max-w-3xl do editor. Antes vivia fora em
          page.tsx num wrapper duplicado.
          Hardening 2026-04-23: SectionBoundary evita sumiço silencioso. */}
      <SectionBoundary label="RecurringContractEntryPoint">
        <ContractEntryPoint
          key={item.id}
          originKind="recurring"
          originId={item.id}
          contracts={linkedContracts}
        />
      </SectionBoundary>

      {confirmingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setConfirmingDelete(false)}
        >
          <div
            className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-6 max-w-sm w-full"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-white font-semibold mb-2">Excluir este contrato?</h3>
            <p className="text-[#a3a3a3] text-sm mb-5">
              O contrato será removido da lista e do MRR. A ação pode ser revertida no banco.
            </p>
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => setConfirmingDelete(false)}
                className="text-sm text-[#a3a3a3] hover:text-white px-4 py-2 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={isPending}
                className="text-sm font-semibold text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Invoices Section (Fase 4 / 2026-04-22) ────────────────────────────────

const MONTH_PT = [
  'Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez',
] as const

const INV_STATUS_STYLE: Record<RecurringInvoiceStatus, { label: string; cls: string }> = {
  open:      { label: 'Aberta',    cls: 'bg-[#D4A853]/10 text-[#E8C47A] border-[#D4A853]/30' },
  paid:      { label: 'Paga',      cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  overdue:   { label: 'Atrasada',  cls: 'bg-red-500/10 text-red-400 border-red-500/30' },
  cancelled: { label: 'Cancelada', cls: 'bg-[#2a2a2a] text-[#a3a3a3] border-[#2a2a2a]' },
}

function InvoicesSection({
  recurringId,
  currency,
  invoices,
  onChange,
  disabled,
}: {
  recurringId: string
  currency:    string
  invoices:    RecurringRevenueInvoice[]
  onChange:    (next: RecurringRevenueInvoice[]) => void
  disabled:    boolean
}) {
  const [isPending, startTransition] = useTransition()

  // Padrão: mês atual do sistema. User pode pedir mês anterior via dropdown.
  const now = new Date()
  const [genYear, setGenYear] = useState(now.getFullYear())
  const [genMonth, setGenMonth] = useState(now.getMonth() + 1)

  function handleGenerate() {
    if (disabled) return
    startTransition(async () => {
      const res = await generateInvoice(recurringId, genYear, genMonth)
      if (!res.success) {
        toast.error(res.message)
        return
      }
      if (!res.data) return
      // Dedupe: se a invoice já existia, não duplicar
      const exists = invoices.some(i => i.id === res.data!.id)
      if (exists) {
        toast('Cobrança já existia — exibindo a atual.')
      } else {
        toast.success(`Cobrança de ${MONTH_PT[genMonth - 1]}/${genYear} gerada.`)
        onChange([res.data, ...invoices])
      }
    })
  }

  function handleStatus(inv: RecurringRevenueInvoice, next: RecurringInvoiceStatus) {
    startTransition(async () => {
      const res = await updateInvoiceStatus(
        inv.id,
        next,
        next === 'paid' ? Number(inv.amount) : undefined
      )
      if (!res.success) {
        toast.error(res.message)
        return
      }
      if (res.data) {
        onChange(invoices.map(i => (i.id === inv.id ? res.data! : i)))
      }
    })
  }

  function handleDelete(inv: RecurringRevenueInvoice) {
    if (!confirm(`Remover a cobrança de ${MONTH_PT[inv.period_month - 1]}/${inv.period_year}?`)) {
      return
    }
    const optimistic = invoices.filter(i => i.id !== inv.id)
    onChange(optimistic)
    startTransition(async () => {
      const res = await deleteInvoice(inv.id)
      if (!res.success) {
        onChange(invoices) // rollback
        toast.error(res.message ?? 'Erro ao excluir.')
      }
    })
  }

  const totalBilled = invoices.reduce((s, i) => s + Number(i.amount), 0)
  const totalPaid   = invoices
    .filter(i => i.status === 'paid')
    .reduce((s, i) => s + Number(i.paid_amount ?? i.amount), 0)

  return (
    <div className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-5 mt-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-white">Histórico de cobranças</h3>
          <p className="text-[10px] text-[#525252] mt-0.5">
            {invoices.length === 0
              ? 'Nenhuma cobrança gerada'
              : `${invoices.length} cobrança${invoices.length !== 1 ? 's' : ''} · Faturado ${formatCurrency(totalBilled, currency)} · Recebido ${formatCurrency(totalPaid, currency)}`}
          </p>
        </div>
      </div>

      {/* Gerar nova — mês/ano + botão */}
      <div className="flex items-center gap-2 flex-wrap bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg p-3 mb-3">
        <span className="text-xs text-[#a3a3a3]">Gerar cobrança de</span>
        <select
          value={genMonth}
          onChange={e => setGenMonth(Number(e.target.value))}
          disabled={isPending || disabled}
          className="bg-[#141414] border border-[#2a2a2a] focus:border-[#D4A853] focus:outline-none text-white text-xs rounded-md px-2 py-1.5"
        >
          {MONTH_PT.map((m, i) => (
            <option key={m} value={i + 1}>{m}</option>
          ))}
        </select>
        <select
          value={genYear}
          onChange={e => setGenYear(Number(e.target.value))}
          disabled={isPending || disabled}
          className="bg-[#141414] border border-[#2a2a2a] focus:border-[#D4A853] focus:outline-none text-white text-xs rounded-md px-2 py-1.5"
        >
          {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <button
          onClick={handleGenerate}
          disabled={isPending || disabled}
          className="ml-auto text-xs font-semibold bg-[#D4A853]/10 hover:bg-[#D4A853]/20 text-[#E8C47A] border border-[#D4A853]/20 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
        >
          {isPending ? 'Gerando…' : 'Gerar cobrança'}
        </button>
      </div>

      {disabled && (
        <p className="text-[11px] text-amber-400/90 mb-2">
          Contrato cancelado — não é possível emitir novas cobranças.
        </p>
      )}

      {invoices.length > 0 && (
        <ul className="divide-y divide-[#1f1f1f] border border-[#1f1f1f] rounded-lg overflow-hidden">
          {invoices.map(inv => {
            const style = INV_STATUS_STYLE[inv.status]
            const periodLabel = `${MONTH_PT[inv.period_month - 1]}/${inv.period_year}`
            return (
              <li key={inv.id} className="bg-[#0a0a0a] p-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-white font-medium tabular-nums">
                        {periodLabel}
                      </span>
                      <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${style.cls}`}>
                        {style.label}
                      </span>
                      {inv.due_date && (
                        <span className="text-[10px] text-[#525252]">
                          Vence {new Date(inv.due_date).toLocaleDateString('pt-BR')}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#737373] truncate mt-0.5">
                      {inv.title}
                      {inv.client_name ? ` · ${inv.client_name}` : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-white tabular-nums">
                      {formatCurrency(Number(inv.amount), inv.currency)}
                    </p>
                    {inv.paid_at && (
                      <p className="text-[10px] text-emerald-400">
                        Pago em {new Date(inv.paid_at).toLocaleDateString('pt-BR')}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap mt-2">
                  {inv.status !== 'paid' && (
                    <button
                      onClick={() => handleStatus(inv, 'paid')}
                      disabled={isPending}
                      className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 px-2.5 py-1 rounded-md transition-colors disabled:opacity-50"
                    >
                      Marcar paga
                    </button>
                  )}
                  {inv.status === 'paid' && (
                    <button
                      onClick={() => handleStatus(inv, 'open')}
                      disabled={isPending}
                      className="text-[11px] text-[#a3a3a3] hover:text-white bg-[#141414] border border-[#2a2a2a] px-2.5 py-1 rounded-md transition-colors disabled:opacity-50"
                    >
                      Reabrir
                    </button>
                  )}
                  <Link
                    href={`/api/recurring-revenues/${inv.recurring_revenue_id}/invoices/${inv.id}/pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-[#a3a3a3] hover:text-white bg-[#141414] border border-[#2a2a2a] px-2.5 py-1 rounded-md transition-colors"
                  >
                    Baixar PDF
                  </Link>
                  <button
                    onClick={() => handleDelete(inv)}
                    disabled={isPending}
                    className="ml-auto text-[11px] text-red-400 hover:text-red-300 px-2 py-1 rounded transition-colors disabled:opacity-50"
                  >
                    Excluir
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ─── RecurringItemsSection (Serviços do contrato) ─────────────────────────
// Espelha ItemsSection do order-editor. Inline rows, edição por click,
// add inline com blur/enter. Soma viva via `total` + `onChange`.

function RecurringItemsSection({
  recurringId,
  currency,
  items,
  total,
  onChange,
}: {
  recurringId: string
  currency:    string
  items:       RecurringItem[]
  total:       number
  onChange:    (next: RecurringItem[]) => void
}) {
  const [adding,       setAdding]       = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [newDesc,      setNewDesc]      = useState('')
  const [newCat,       setNewCat]       = useState<RecurringItemCategory | ''>('')
  const [newQty,       setNewQty]       = useState('1')
  const [newUnit,      setNewUnit]      = useState<number>(0)
  const [newlyAddedId, setNewlyAddedId] = useState<string | null>(null)
  const [editingId,    setEditingId]    = useState<string | null>(null)
  const [editDesc,     setEditDesc]     = useState('')
  const [editCat,      setEditCat]      = useState<RecurringItemCategory | ''>('')
  const [editQty,      setEditQty]      = useState('')
  const [editUnit,     setEditUnit]     = useState<number>(0)
  const addRowRef  = useRef<HTMLDivElement>(null)
  const addDescRef = useRef<HTMLInputElement>(null)
  const [, startTransitionDelete] = useTransition()

  function cancelAdd() {
    setAdding(false); setNewDesc(''); setNewCat(''); setNewQty('1'); setNewUnit(0)
  }

  async function submitAdd(): Promise<boolean> {
    if (isSubmitting) return false
    if (!newDesc.trim()) { cancelAdd(); return false }
    setIsSubmitting(true)
    const res = await addRecurringItem(recurringId, {
      description: newDesc.trim(),
      quantity:    newQty,
      unit_value:  newUnit,
      category:    newCat || null,
    })
    setIsSubmitting(false)
    if (!res.success) { toast.error(res.message); return false }
    if (res.data) {
      onChange([...items, res.data])
      setNewlyAddedId(res.data.id)
      setTimeout(() => setNewlyAddedId(null), 1200)
    }
    setNewDesc(''); setNewCat(''); setNewQty('1'); setNewUnit(0)
    setAdding(false)
    return true
  }

  function handleHeaderButtonClick() {
    if (adding) { addDescRef.current?.focus(); return }
    setAdding(true)
  }

  function handleAddKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter')  { e.preventDefault(); submitAdd() }
    if (e.key === 'Escape') { cancelAdd() }
  }

  function handleAddBlur(e: React.FocusEvent<HTMLDivElement>) {
    if (isSubmitting) return
    const next = e.relatedTarget as Node | null
    if (addRowRef.current && next && addRowRef.current.contains(next)) return
    submitAdd()
  }

  function startEdit(it: RecurringItem) {
    setEditingId(it.id)
    setEditDesc(it.description)
    setEditCat((it.category ?? '') as RecurringItemCategory | '')
    setEditQty(String(it.quantity))
    setEditUnit(Number(it.unit_value) || 0)
  }

  async function submitEdit(id: string) {
    const current = items.find(i => i.id === id)
    if (!current) { setEditingId(null); return }
    const res = await updateRecurringItem(id, recurringId, {
      description: editDesc,
      quantity:    editQty,
      unit_value:  editUnit,
      category:    editCat ? (editCat as RecurringItemCategory) : null,
    })
    if (!res.success) { toast.error(res.message); setEditingId(null); return }
    if (res.data) {
      onChange(items.map(i => i.id === id ? res.data! : i))
    }
    setEditingId(null)
  }

  function handleDelete(it: RecurringItem) {
    const optimistic = items.filter(i => i.id !== it.id)
    onChange(optimistic)
    startTransitionDelete(async () => {
      const res = await deleteRecurringItem(it.id, recurringId)
      if (!res.success) { onChange(items); toast.error(res.message) }
    })
  }

  return (
    <div className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-5 mt-6">
      <div className="flex items-start justify-between mb-1">
        <div>
          <h3 className="text-sm font-semibold text-white">Serviços do contrato</h3>
          <p className="text-[10px] text-[#525252] mt-0.5">
            {items.length > 0
              ? `${items.length} ${items.length === 1 ? 'item' : 'itens'} · ${formatCurrency(total, currency)}`
              : 'o que compõe a mensalidade (edição, reels, fotos, reuniões…)'}
          </p>
        </div>
        <button
          type="button"
          onMouseDown={e => e.preventDefault()}
          onClick={handleHeaderButtonClick}
          className="flex items-center gap-1.5 text-xs font-semibold text-[#D4A853] hover:text-[#E8C47A] transition-colors px-2.5 py-1.5 rounded-lg border border-[#D4A853]/20 hover:border-[#D4A853]/40 shrink-0"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Adicionar serviço
        </button>
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
        {items.map(it => {
          const isNew = it.id === newlyAddedId
          const catLabel = it.category ? ITEM_CATEGORIES.find(c => c.value === it.category)?.label : null
          return (
            <div key={it.id}>
              {editingId === it.id ? (
                <div className="grid grid-cols-[80px_1fr_56px_84px_84px_28px] gap-2 items-center bg-[#1a1a1a] rounded-lg px-1 py-1">
                  <select
                    value={editCat}
                    onChange={e => setEditCat(e.target.value as RecurringItemCategory | '')}
                    className={inputSm}
                  >
                    <option value="" className="bg-[#141414]">—</option>
                    {ITEM_CATEGORIES.map(c => <option key={c.value} value={c.value} className="bg-[#141414]">{c.label}</option>)}
                  </select>
                  <input autoFocus value={editDesc} onChange={e => setEditDesc(e.target.value)}
                    onBlur={() => submitEdit(it.id)}
                    onKeyDown={e => { if (e.key === 'Enter') submitEdit(it.id); if (e.key === 'Escape') setEditingId(null) }}
                    className={inputSm} />
                  <input value={editQty} onChange={e => setEditQty(e.target.value)}
                    onBlur={() => submitEdit(it.id)}
                    onKeyDown={e => { if (e.key === 'Enter') submitEdit(it.id); if (e.key === 'Escape') setEditingId(null) }}
                    className={`${inputSm} text-right`} />
                  <MoneyInputInline
                    value={editUnit}
                    currency={currency}
                    onChange={setEditUnit}
                    onBlur={() => submitEdit(it.id)}
                    onKeyDown={e => { if (e.key === 'Enter') submitEdit(it.id); if (e.key === 'Escape') setEditingId(null) }}
                    ariaLabel="Valor unitário"
                    className={`${inputSm} text-right`}
                  />
                  <span className="text-xs text-right text-[#525252]">
                    {formatCurrency((parseFloat(editQty) || 1) * editUnit, currency)}
                  </span>
                  <span />
                </div>
              ) : (
                <div
                  className={`grid grid-cols-[80px_1fr_56px_84px_84px_28px] gap-2 items-center group rounded-lg px-1 py-1 cursor-pointer transition-all duration-500 ${
                    isNew ? 'bg-[#D4A853]/10 border border-[#D4A853]/20' : 'hover:bg-[#1c1c1c] border border-transparent'
                  }`}
                  onClick={() => startEdit(it)}
                >
                  {catLabel ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1c1c1c] border border-[#2a2a2a] text-[#525252] truncate">{catLabel}</span>
                  ) : (
                    <span className="text-[10px] text-[#3a3a3a]">—</span>
                  )}
                  <span className="text-sm text-white truncate">{it.description}</span>
                  <span className="text-xs text-[#a3a3a3] text-right">{Number(it.quantity)}×</span>
                  <span className="text-xs text-[#a3a3a3] text-right">{formatCurrency(Number(it.unit_value), currency)}</span>
                  <span className="text-xs font-semibold text-white text-right">{formatCurrency(Number(it.total_value), currency)}</span>
                  <button onClick={e => { e.stopPropagation(); handleDelete(it) }}
                    className="opacity-0 group-hover:opacity-100 text-[#525252] hover:text-red-400 transition-all p-0.5">
                    <TrashIcon />
                  </button>
                </div>
              )}
            </div>
          )
        })}

        {adding && (
          <div
            ref={addRowRef}
            tabIndex={-1}
            onBlur={handleAddBlur}
            className="bg-[#1c1c1c] rounded-lg px-2 py-2 border border-[#D4A853]/20 outline-none"
          >
            <div className="grid grid-cols-[80px_1fr_56px_84px_84px_28px] gap-2 items-center">
              <select
                value={newCat}
                onChange={e => setNewCat(e.target.value as RecurringItemCategory | '')}
                onKeyDown={handleAddKeyDown}
                disabled={isSubmitting}
                className={inputSm}
              >
                <option value="" className="bg-[#141414]">—</option>
                {ITEM_CATEGORIES.map(c => <option key={c.value} value={c.value} className="bg-[#141414]">{c.label}</option>)}
              </select>
              <input
                ref={addDescRef}
                autoFocus
                placeholder="Descrição do serviço"
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                onKeyDown={handleAddKeyDown}
                disabled={isSubmitting}
                className={inputSm}
              />
              <input
                placeholder="1"
                value={newQty}
                onChange={e => setNewQty(e.target.value)}
                onKeyDown={handleAddKeyDown}
                disabled={isSubmitting}
                className={`${inputSm} text-right`}
              />
              <MoneyInputInline
                value={newUnit}
                currency={currency}
                onChange={setNewUnit}
                onKeyDown={handleAddKeyDown}
                disabled={isSubmitting}
                ariaLabel="Valor unitário"
                className={`${inputSm} text-right`}
              />
              <span className="text-xs text-right text-[#525252]">
                {formatCurrency((parseFloat(newQty) || 1) * newUnit, currency)}
              </span>
              <span />
            </div>
            <div className="flex items-center justify-end gap-1.5 mt-2 pt-2 border-t border-[#262626]">
              {isSubmitting && <Spinner />}
              <button
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => submitAdd()}
                disabled={isSubmitting || !newDesc.trim()}
                className="inline-flex items-center gap-1.5 text-xs font-semibold bg-[#D4A853] hover:bg-[#E8C47A] disabled:opacity-50 disabled:cursor-not-allowed text-[#0a0a0a] px-3 py-1.5 rounded-lg transition-colors"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
                Adicionar
              </button>
              <button
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={cancelAdd}
                disabled={isSubmitting}
                aria-label="Descartar linha"
                title="Descartar"
                className="text-[#737373] hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-[#1f1f1f] disabled:opacity-40"
              >
                <TrashIcon />
              </button>
            </div>
          </div>
        )}
      </div>

      {items.length === 0 && !adding && (
        <p className="text-xs text-[#525252] text-center py-6">Nenhum serviço adicionado ainda.</p>
      )}

      {items.length > 0 && (
        <div className="flex justify-end mt-3 pt-3 border-t border-[#1c1c1c]">
          <span className="text-sm font-bold text-white">{formatCurrency(total, currency)}</span>
        </div>
      )}
    </div>
  )
}

// ─── RecurringCostItemsSection (Repasses ao cliente) ──────────────────────

function RecurringCostItemsSection({
  recurringId,
  currency,
  items,
  total,
  onChange,
}: {
  recurringId: string
  currency:    string
  items:       RecurringCostItem[]
  total:       number
  onChange:    (next: RecurringCostItem[]) => void
}) {
  const [adding,       setAdding]       = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [newDesc,      setNewDesc]      = useState('')
  const [newCat,       setNewCat]       = useState<RecurringCostCategory>('other')
  const [newQty,       setNewQty]       = useState('1')
  const [newUnit,      setNewUnit]      = useState<number>(0)
  const [newlyAddedId, setNewlyAddedId] = useState<string | null>(null)
  const [editingId,    setEditingId]    = useState<string | null>(null)
  const [editDesc,     setEditDesc]     = useState('')
  const [editCat,      setEditCat]      = useState<RecurringCostCategory>('other')
  const [editQty,      setEditQty]      = useState('')
  const [editUnit,     setEditUnit]     = useState<number>(0)
  const addRowRef  = useRef<HTMLDivElement>(null)
  const addDescRef = useRef<HTMLInputElement>(null)
  const [, startTransitionDelete] = useTransition()

  function cancelAdd() {
    setAdding(false); setNewDesc(''); setNewCat('other'); setNewQty('1'); setNewUnit(0)
  }

  async function submitAdd(): Promise<boolean> {
    if (isSubmitting) return false
    if (!newDesc.trim()) { cancelAdd(); return false }
    setIsSubmitting(true)
    const res = await addRecurringCostItem(recurringId, {
      description: newDesc.trim(),
      category:    newCat,
      quantity:    newQty,
      unit_value:  newUnit,
    })
    setIsSubmitting(false)
    if (!res.success) { toast.error(res.message); return false }
    if (res.data) {
      onChange([...items, res.data])
      setNewlyAddedId(res.data.id)
      setTimeout(() => setNewlyAddedId(null), 1200)
    }
    setNewDesc(''); setNewCat('other'); setNewQty('1'); setNewUnit(0)
    setAdding(false)
    return true
  }

  function handleHeaderButtonClick() {
    if (adding) { addDescRef.current?.focus(); return }
    setAdding(true)
  }

  function handleAddKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter')  { e.preventDefault(); submitAdd() }
    if (e.key === 'Escape') { cancelAdd() }
  }

  function handleAddBlur(e: React.FocusEvent<HTMLDivElement>) {
    if (isSubmitting) return
    const next = e.relatedTarget as Node | null
    if (addRowRef.current && next && addRowRef.current.contains(next)) return
    submitAdd()
  }

  function startEdit(it: RecurringCostItem) {
    setEditingId(it.id)
    setEditDesc(it.description)
    setEditCat((it.category ?? 'other') as RecurringCostCategory)
    setEditQty(String(it.quantity))
    setEditUnit(Number(it.unit_value) || 0)
  }

  async function submitEdit(id: string) {
    const current = items.find(i => i.id === id)
    if (!current) { setEditingId(null); return }
    const res = await updateRecurringCostItem(id, recurringId, {
      description: editDesc,
      category:    editCat,
      quantity:    editQty,
      unit_value:  editUnit,
    })
    if (!res.success) { toast.error(res.message); setEditingId(null); return }
    if (res.data) {
      onChange(items.map(i => i.id === id ? res.data! : i))
    }
    setEditingId(null)
  }

  function handleDelete(it: RecurringCostItem) {
    const optimistic = items.filter(i => i.id !== it.id)
    onChange(optimistic)
    startTransitionDelete(async () => {
      const res = await deleteRecurringCostItem(it.id, recurringId)
      if (!res.success) { onChange(items); toast.error(res.message) }
    })
  }

  return (
    <div className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-5 mt-4">
      <div className="flex items-start justify-between mb-1">
        <div>
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-semibold text-white">Repasses ao cliente</h3>
            <span
              title="Itens que você paga mas repassa ao cliente. Entram no total mensal, mas não reduzem seu lucro."
              className="w-4 h-4 rounded-full bg-[#1c1c1c] border border-[#2a2a2a] text-[#525252] text-[9px] font-bold flex items-center justify-center cursor-help hover:bg-[#262626] transition-colors shrink-0 select-none"
            >?</span>
          </div>
          <p className="text-[10px] text-[#525252] mt-0.5">
            {items.length > 0
              ? `${items.length} ${items.length === 1 ? 'repasse' : 'repasses'} · ${formatCurrency(total, currency)}`
              : 'aluguel de equipamento, software mensal, diária de assistente…'}
          </p>
        </div>
        <button
          type="button"
          onMouseDown={e => e.preventDefault()}
          onClick={handleHeaderButtonClick}
          className="flex items-center gap-1.5 text-xs font-semibold text-[#D4A853] hover:text-[#E8C47A] transition-colors px-2.5 py-1.5 rounded-lg border border-[#D4A853]/20 hover:border-[#D4A853]/40 shrink-0"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Adicionar repasse
        </button>
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
        {items.map(it => {
          const isNew = it.id === newlyAddedId
          const catLabel = COST_CATEGORIES.find(c => c.value === it.category)?.label ?? it.category ?? '—'
          return (
            <div key={it.id}>
              {editingId === it.id ? (
                <div className="grid grid-cols-[80px_1fr_56px_84px_84px_28px] gap-2 items-center bg-[#1a1a1a] rounded-lg px-1 py-1">
                  <select value={editCat} onChange={e => setEditCat(e.target.value as RecurringCostCategory)} className={inputSm}>
                    {COST_CATEGORIES.map(c => <option key={c.value} value={c.value} className="bg-[#141414]">{c.label}</option>)}
                  </select>
                  <input autoFocus value={editDesc} onChange={e => setEditDesc(e.target.value)}
                    onBlur={() => submitEdit(it.id)}
                    onKeyDown={e => { if (e.key === 'Enter') submitEdit(it.id); if (e.key === 'Escape') setEditingId(null) }}
                    className={inputSm} />
                  <input value={editQty} onChange={e => setEditQty(e.target.value)}
                    onBlur={() => submitEdit(it.id)} onKeyDown={e => { if (e.key === 'Enter') submitEdit(it.id) }}
                    className={`${inputSm} text-right`} />
                  <MoneyInputInline
                    value={editUnit}
                    currency={currency}
                    onChange={setEditUnit}
                    onBlur={() => submitEdit(it.id)}
                    onKeyDown={e => { if (e.key === 'Enter') submitEdit(it.id) }}
                    ariaLabel="Valor unitário do repasse"
                    className={`${inputSm} text-right`}
                  />
                  <span className="text-xs text-right text-[#525252]">
                    {formatCurrency((parseFloat(editQty) || 1) * editUnit, currency)}
                  </span>
                  <span />
                </div>
              ) : (
                <div
                  className={`rounded-lg px-1 py-1 transition-all duration-500 ${
                    isNew ? 'bg-[#D4A853]/10 border border-[#D4A853]/20' : 'hover:bg-[#1c1c1c] border border-transparent'
                  }`}
                >
                  <div
                    className="grid grid-cols-[80px_1fr_56px_84px_84px_28px] gap-2 items-center group cursor-pointer"
                    onClick={() => startEdit(it)}
                  >
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1c1c1c] border border-[#2a2a2a] text-[#525252] truncate">{catLabel}</span>
                    <span className="text-sm text-white truncate">{it.description}</span>
                    <span className="text-xs text-[#a3a3a3] text-right">{Number(it.quantity)}×</span>
                    <span className="text-xs text-[#a3a3a3] text-right">{formatCurrency(Number(it.unit_value), currency)}</span>
                    <span className="text-xs font-semibold text-white text-right">{formatCurrency(Number(it.total_value), currency)}</span>
                    <button onClick={e => { e.stopPropagation(); handleDelete(it) }}
                      className="opacity-0 group-hover:opacity-100 text-[#525252] hover:text-red-400 transition-all p-0.5">
                      <TrashIcon />
                    </button>
                  </div>
                  <RepasseMetaRow
                    item={it}
                    recurringId={recurringId}
                    onUpdated={(updated) => onChange(items.map(i => i.id === updated.id ? updated : i))}
                  />
                </div>
              )}
            </div>
          )
        })}

        {adding && (
          <div
            ref={addRowRef}
            tabIndex={-1}
            onBlur={handleAddBlur}
            className="bg-[#1c1c1c] rounded-lg px-2 py-2 border border-[#D4A853]/20 outline-none"
          >
            <div className="grid grid-cols-[80px_1fr_56px_84px_84px_28px] gap-2 items-center">
              <select
                value={newCat}
                onChange={e => setNewCat(e.target.value as RecurringCostCategory)}
                onKeyDown={handleAddKeyDown}
                disabled={isSubmitting}
                className={inputSm}
              >
                {COST_CATEGORIES.map(c => <option key={c.value} value={c.value} className="bg-[#141414]">{c.label}</option>)}
              </select>
              <input
                ref={addDescRef}
                autoFocus
                placeholder="Ex: Software mensal, diária de assistente…"
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                onKeyDown={handleAddKeyDown}
                disabled={isSubmitting}
                className={inputSm}
              />
              <input
                placeholder="1"
                value={newQty}
                onChange={e => setNewQty(e.target.value)}
                onKeyDown={handleAddKeyDown}
                disabled={isSubmitting}
                className={`${inputSm} text-right`}
              />
              <MoneyInputInline
                value={newUnit}
                currency={currency}
                onChange={setNewUnit}
                onKeyDown={handleAddKeyDown}
                disabled={isSubmitting}
                ariaLabel="Valor unitário do repasse"
                className={`${inputSm} text-right`}
              />
              <span className="text-xs text-right text-[#525252]">
                {formatCurrency((parseFloat(newQty) || 1) * newUnit, currency)}
              </span>
              <span />
            </div>
            <div className="flex items-center justify-end gap-1.5 mt-2 pt-2 border-t border-[#262626]">
              {isSubmitting && <Spinner />}
              <button
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => submitAdd()}
                disabled={isSubmitting || !newDesc.trim()}
                className="inline-flex items-center gap-1.5 text-xs font-semibold bg-[#D4A853] hover:bg-[#E8C47A] disabled:opacity-50 disabled:cursor-not-allowed text-[#0a0a0a] px-3 py-1.5 rounded-lg transition-colors"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
                Adicionar
              </button>
              <button
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={cancelAdd}
                disabled={isSubmitting}
                aria-label="Descartar linha"
                title="Descartar"
                className="text-[#737373] hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-[#1f1f1f] disabled:opacity-40"
              >
                <TrashIcon />
              </button>
            </div>
          </div>
        )}
      </div>

      {items.length === 0 && !adding && (
        <p className="text-xs text-[#525252] text-center py-6">
          Nenhum repasse registrado. Software mensal, aluguel de equipamento, diária de assistente…
        </p>
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

// ─── RepasseMetaRow: status + datas por repasse ──────────────────────────────

function RepasseMetaRow({
  item,
  recurringId,
  onUpdated,
}: {
  item:        RecurringCostItem
  recurringId: string
  onUpdated:   (next: RecurringCostItem) => void
}) {
  const [isPending, startTransition] = useTransition()
  const isPaid = item.status === 'paid'

  function toggleStatus(e: React.MouseEvent) {
    e.stopPropagation()
    startTransition(async () => {
      const res = await updateRecurringCostItem(item.id, recurringId, {
        status: isPaid ? 'pending' : 'paid',
      })
      if (!res.success) { toast.error(res.message); return }
      if (res.data) onUpdated(res.data)
    })
  }

  function updateDate(field: 'repasse_date' | 'paid_at', value: string) {
    startTransition(async () => {
      const res = await updateRecurringCostItem(item.id, recurringId, {
        [field]: value || null,
      })
      if (!res.success) { toast.error(res.message); return }
      if (res.data) onUpdated(res.data)
    })
  }

  return (
    <div
      className="flex items-center gap-2 flex-wrap pl-[88px] pt-1 pb-0.5"
      onClick={e => e.stopPropagation()}
    >
      {/* Status chip */}
      <button
        type="button"
        onClick={toggleStatus}
        disabled={isPending}
        title={isPaid ? 'Clique para marcar como pendente' : 'Clique para marcar como pago'}
        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-colors disabled:opacity-50 ${
          isPaid
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
            : 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20'
        }`}
      >
        {isPaid ? '✓ Pago' : '● Pendente'}
      </button>

      {/* Data de repasse (vencimento) */}
      <label className="flex items-center gap-1 text-[10px] text-[#525252]">
        vence
        <input
          type="date"
          value={item.repasse_date ?? ''}
          onChange={e => updateDate('repasse_date', e.target.value)}
          disabled={isPending}
          className="bg-[#1c1c1c] border border-[#2a2a2a] rounded px-1.5 py-0.5 text-[10px] text-[#a3a3a3] focus:outline-none focus:border-[#D4A853]/40 [color-scheme:dark]"
        />
      </label>

      {/* Data de pagamento (se pago) */}
      {isPaid && (
        <label className="flex items-center gap-1 text-[10px] text-[#525252]">
          pago em
          <input
            type="date"
            value={item.paid_at ?? ''}
            onChange={e => updateDate('paid_at', e.target.value)}
            disabled={isPending}
            className="bg-[#1c1c1c] border border-[#2a2a2a] rounded px-1.5 py-0.5 text-[10px] text-emerald-400 focus:outline-none focus:border-emerald-500/40 [color-scheme:dark]"
          />
        </label>
      )}
    </div>
  )
}
