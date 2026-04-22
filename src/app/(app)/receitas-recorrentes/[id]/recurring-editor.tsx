'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ClientCombobox } from '@/components/clients/client-combobox'
import { TagCombobox } from '@/components/freelances/tag-combobox'
import { LEAD_SOURCES } from '@/lib/canonical/lead-sources'
import { CLIENT_SEGMENTS } from '@/lib/canonical/segments'
import { SUPPORTED_CURRENCIES, formatCurrency } from '@/lib/utils/format'
import {
  updateRecurringRevenue,
  deleteRecurringRevenue,
} from '@/lib/actions/recurring-revenue'
import type {
  RecurringRevenue,
  RecurringStatus,
  RecurringFrequency,
} from '@/types/recurring-revenue'
import { RecurringStatusBadge } from '../recurring-list'

interface Props {
  item: RecurringRevenue
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

export default function RecurringEditor({ item }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirmingDelete, setConfirmingDelete] = useState(false)

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
            <textarea
              value={form.project_description}
              onChange={e => setForm(f => ({ ...f, project_description: e.target.value }))}
              rows={3}
              placeholder="Contexto, objetivo, estilo…"
              className="w-full bg-[#0a0a0a] border border-[#2a2a2a] focus:border-[#D4A853] focus:outline-none text-white text-sm rounded-lg px-3 py-2.5 transition-colors resize-none"
            />
          </div>
          <div>
            <label className="block text-xs text-[#a3a3a3] mb-1.5">Resumo do escopo</label>
            <textarea
              value={form.scope_summary}
              onChange={e => setForm(f => ({ ...f, scope_summary: e.target.value }))}
              rows={3}
              placeholder="Entregáveis fixos do contrato…"
              className="w-full bg-[#0a0a0a] border border-[#2a2a2a] focus:border-[#D4A853] focus:outline-none text-white text-sm rounded-lg px-3 py-2.5 transition-colors resize-none"
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
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: Number(e.target.value) }))}
              className="w-full bg-[#0a0a0a] border border-[#2a2a2a] focus:border-[#D4A853] focus:outline-none text-white text-sm rounded-lg px-3 py-2.5 transition-colors"
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
            <label className="block text-xs text-[#a3a3a3] mb-1.5">Observações</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={3}
              className="w-full bg-[#0a0a0a] border border-[#2a2a2a] focus:border-[#D4A853] focus:outline-none text-white text-sm rounded-lg px-3 py-2.5 transition-colors resize-none"
              placeholder="Condições especiais, escopo, etc."
            />
          </div>
          <div>
            <label className="block text-xs text-[#a3a3a3] mb-1.5">Notas internas</label>
            <textarea
              value={form.notes_internal}
              onChange={e => setForm(f => ({ ...f, notes_internal: e.target.value }))}
              rows={3}
              className="w-full bg-[#0a0a0a] border border-[#2a2a2a] focus:border-[#D4A853] focus:outline-none text-white text-sm rounded-lg px-3 py-2.5 transition-colors resize-none"
              placeholder="Só você vê."
            />
          </div>
        </div>

        {/* Resumo */}
        <div className="flex items-center justify-between pt-4 border-t border-[#2a2a2a]">
          <div className="text-xs text-[#525252]">
            Valor por período:{' '}
            <span className="text-white font-semibold">
              {formatCurrency(Number(form.amount), form.currency)}
            </span>
          </div>
          {savedAt && !error && (
            <span className="text-xs text-emerald-400">Salvo às {savedAt}</span>
          )}
          {error && <span className="text-xs text-red-400">{error}</span>}
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
