'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { calcBudgetTotals, calcItemTotals, fmtBRL, rentMetaFromPct, type BudgetItemV2 } from '@/lib/v2/budget-calc'
import { AVAILABLE_VARS } from '@/lib/budgets/letter-vars'
import {
  addItem, addShootingDate, removeItem, removeShootingDate,
  restoreVersionAsCurrent, saveBudget, saveBudgetVersion,
  saveLetter, saveLetterTemplate, updateItem, updateShootingDate,
} from './actions'

/**
 * Editor de Orçamento V2 — coração da Phase 2.
 *
 * 4 KPIs em tempo real (Custo / Valor / Margem / Markup), tabela de itens
 * editáveis com debounce 600ms, painel de configurações (margin/tax/discount).
 *
 * Cálculo client-side espelha a trigger SQL — depois do save, o server
 * component refaz o load e os totais ficam canônicos.
 */

interface BudgetRow {
  id:                  string
  workspace_id:        string
  number:              string
  name:                string
  client_id:           string | null
  status:              string
  project_type:        string | null
  project_type_other:  string | null
  start_date:          string | null
  end_date:            string | null
  location:            string | null
  margin_percent:      number | string
  tax_percent:         number | string
  discount_amount:     number | string
  payment_terms:       string | null
  validity_days:       number | null
  delivery_days:       number | null
  revisions_included:  number | null
  notes_internal:      string | null
  notes_client:        string | null
  letter_text_md:      string | null
  subtotal:            number | string
  total_cost:          number | string
  margin_amount:       number | string
  tax_amount:          number | string
  total:               number | string
}

interface ProjectTypeOption {
  code:        string
  label:       string
  description: string
  icon:        string
  sort_order:  number
  active:      boolean
}

interface LetterTemplate {
  id:         string
  name:       string
  text_md:    string
  is_default: boolean
}

interface BudgetVersion {
  id:                string
  version_number:    number
  label:             string | null
  total_value_cents: number
  created_at:        string
}

interface ShootingDate {
  id:               string
  date_start:       string
  date_end:         string | null
  time_start:       string | null
  time_end:         string | null
  label:            string | null
  local_descricao:  string | null
  local_endereco:   string | null
  notes:            string | null
  order_idx:        number
}

interface ItemRow extends BudgetItemV2 {
  id:                  string
  budget_id:           string
  workspace_id:        string
  description:         string
  description_visible: string | null
  is_encargo:          boolean
  category:            string
  unit:                string
  days:         number
  people:       number
  quantity:     number
  sort_order:   number
}

interface ClientOption { id: string; name: string }

interface Props {
  budget:           BudgetRow
  initialItems:     ItemRow[]
  clients:          ClientOption[]
  letterTemplates:  LetterTemplate[]
  versions:         BudgetVersion[]
  projectTypes:     ProjectTypeOption[]
  shootingDates:    ShootingDate[]
}

const num = (v: unknown): number => {
  if (v === null || v === undefined || v === '') return 0
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

export default function BudgetEditorClient({
  budget: initialBudget, initialItems, clients, letterTemplates,
  versions: initialVersions, projectTypes, shootingDates: initialDates,
}: Props) {
  const [budget, setBudget]   = useState<BudgetRow>(initialBudget)
  const [items, setItems]     = useState<ItemRow[]>(initialItems)
  const [tab, setTab]         = useState<'items' | 'carta' | 'datas'>('items')
  const [letterMd, setLetterMd] = useState<string>(initialBudget.letter_text_md ?? '')
  const [templates, setTemplates] = useState<LetterTemplate[]>(letterTemplates)
  const [versions, setVersions] = useState<BudgetVersion[]>(initialVersions)
  const [dates, setDates]     = useState<ShootingDate[]>(initialDates)
  const [pending, startTx]    = useTransition()
  const [savedFlash, setFlash] = useState<string | null>(null)

  const totals = useMemo(() => calcBudgetTotals(items, budget), [items, budget])

  // ── Save com debounce do header/settings ──────────────────────────────────
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function scheduleHeaderSave(next: BudgetRow) {
    setBudget(next)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      startTx(async () => {
        const r = await saveBudget({
          id:                  next.id,
          name:                next.name,
          client_id:           next.client_id,
          project_type:        next.project_type,
          project_type_other:  next.project_type_other,
          start_date:          next.start_date,
          end_date:            next.end_date,
          location:            next.location,
          status:              next.status,
          margin_percent:      num(next.margin_percent),
          tax_percent:         num(next.tax_percent),
          discount_amount:     num(next.discount_amount),
          payment_terms:       next.payment_terms,
          validity_days:       next.validity_days,
          delivery_days:       next.delivery_days,
          revisions_included:  next.revisions_included,
          notes_internal:      next.notes_internal,
          notes_client:        next.notes_client,
        })
        if (r.ok) flash('Salvo')
      })
    }, 600)
  }

  // ── Save com debounce dos items ───────────────────────────────────────────
  const itemTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  function scheduleItemSave(itemId: string, patch: Partial<ItemRow>) {
    setItems((prev) => {
      const next = prev.map((i) => {
        if (i.id !== itemId) return i
        const merged = { ...i, ...patch }
        const { total, total_cost } = calcItemTotals(merged)
        return { ...merged, total, total_cost }
      })
      return next
    })

    if (itemTimers.current[itemId]) clearTimeout(itemTimers.current[itemId])
    itemTimers.current[itemId] = setTimeout(() => {
      startTx(async () => {
        const r = await updateItem(itemId, {
          description:         patch.description         as string | undefined,
          description_visible: patch.description_visible as string | null | undefined,
          is_encargo:          patch.is_encargo          as boolean | undefined,
          category:             patch.category    as string | undefined,
          unit:                 patch.unit        as string | undefined,
          days:                 patch.days        != null ? Number(patch.days)        : undefined,
          people:               patch.people      != null ? Number(patch.people)      : undefined,
          quantity:             patch.quantity    != null ? Number(patch.quantity)    : undefined,
          unit_price:           patch.unit_price  != null ? Number(patch.unit_price)  : undefined,
          unit_cost:            patch.unit_cost   != null ? Number(patch.unit_cost)   : undefined,
        })
        if (r.ok) flash('Item salvo')
      })
    }, 600)
  }

  function flash(msg: string) {
    setFlash(msg)
    setTimeout(() => setFlash(null), 1500)
  }

  // ── EPIC-17: save da carta com debounce ─────────────────────────────────
  const letterTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function handleLetterChange(next: string) {
    setLetterMd(next)
    if (letterTimer.current) clearTimeout(letterTimer.current)
    letterTimer.current = setTimeout(() => {
      startTx(async () => {
        const r = await saveLetter(budget.id, next)
        if (r.ok) flash('Carta salva')
      })
    }, 800)
  }

  function insertVarAtCursor(varCode: string) {
    setLetterMd((prev) => {
      const next = prev + (prev.endsWith(' ') || prev === '' ? '' : ' ') + varCode
      // dispara save
      if (letterTimer.current) clearTimeout(letterTimer.current)
      letterTimer.current = setTimeout(() => {
        startTx(async () => {
          await saveLetter(budget.id, next)
          flash('Carta salva')
        })
      }, 800)
      return next
    })
  }

  async function handleLoadTemplate(tpl: LetterTemplate) {
    if (!confirm(`Carregar template "${tpl.name}"? O texto atual será substituído.`)) return
    setLetterMd(tpl.text_md)
    startTx(async () => {
      await saveLetter(budget.id, tpl.text_md)
      flash(`Template "${tpl.name}" carregado`)
    })
  }

  async function handleSaveAsTemplate() {
    const name = prompt('Nome do template:', 'Padrão')
    if (!name?.trim()) return
    const isDefault = confirm('Tornar este template o padrão (carrega automaticamente em novos orçamentos)?')
    startTx(async () => {
      const r = await saveLetterTemplate({ name: name.trim(), text_md: letterMd, is_default: isDefault })
      if (r.ok) {
        setTemplates((prev) => [
          { id: r.id ?? `tmp-${Date.now()}`, name: name.trim(), text_md: letterMd, is_default: isDefault },
          ...(isDefault ? prev.map((p) => ({ ...p, is_default: false })) : prev),
        ])
        flash('Template salvo')
      } else {
        alert(`Falha: ${r.error}`)
      }
    })
  }

  // ── EPIC-18: handlers de versão ───────────────────────────────────────────
  async function handleSaveVersion() {
    const label = prompt(
      'O que mudou nessa versão? (opcional)',
      `Versão ${(versions[0]?.version_number ?? 0) + 1}`
    )
    if (label === null) return // cancel

    startTx(async () => {
      const r = await saveBudgetVersion(budget.id, label)
      if (r.ok) {
        setVersions((prev) => [
          {
            id:                r.id ?? `tmp-${Date.now()}`,
            version_number:    r.versionNumber ?? (prev[0]?.version_number ?? 0) + 1,
            label:             label || null,
            total_value_cents: Math.round(num(budget.total) * 100),
            created_at:        new Date().toISOString(),
          },
          ...prev,
        ])
        flash(`Versão ${r.versionNumber} salva`)
      } else {
        alert(`Falha ao salvar versão: ${r.error}`)
      }
    })
  }

  async function handleRestoreVersion(v: BudgetVersion) {
    if (!confirm(`Restaurar versão ${v.version_number}? O estado atual será sobrescrito.\n\nA versão atual NÃO é salva automaticamente — clique em "Salvar versão" antes se quiser preservá-la.`)) {
      return
    }
    startTx(async () => {
      const r = await restoreVersionAsCurrent(v.id)
      if (r.ok) {
        flash(`Versão ${v.version_number} restaurada — recarregando…`)
        // Refresh hard pra recarregar items + budget atualizados do server
        setTimeout(() => window.location.reload(), 600)
      } else {
        alert(`Falha ao restaurar: ${r.error}`)
      }
    })
  }

  // ── EPIC-23: handlers de datas de filmagem ────────────────────────────────
  async function handleAddDate() {
    // Default: hoje + 7 dias
    const today = new Date()
    today.setDate(today.getDate() + 7)
    const iso = today.toISOString().slice(0, 10)
    startTx(async () => {
      const r = await addShootingDate({ budgetId: budget.id, date_start: iso })
      if (!r.ok) {
        alert(`Falha: ${r.error}`)
        return
      }
      const newId = r.id ?? `tmp-${Date.now()}`
      setDates((prev) => [
        ...prev,
        {
          id:               newId,
          date_start:       iso,
          date_end:         null,
          time_start:       null,
          time_end:         null,
          label:            null,
          local_descricao:  null,
          local_endereco:   null,
          notes:            null,
          order_idx:        prev.length,
        },
      ])
      flash('Data adicionada')
    })
  }

  function scheduleDateUpdate(dateId: string, patch: Partial<ShootingDate>) {
    setDates((prev) => prev.map((d) => (d.id === dateId ? { ...d, ...patch } : d)))
    // Reusa o saveTimer simplificado por id
    const key = `date-${dateId}`
    const t = (itemTimers.current as Record<string, ReturnType<typeof setTimeout>>)[key]
    if (t) clearTimeout(t)
    ;(itemTimers.current as Record<string, ReturnType<typeof setTimeout>>)[key] = setTimeout(() => {
      startTx(async () => {
        const r = await updateShootingDate(dateId, patch)
        if (r.ok) flash('Data salva')
      })
    }, 600)
  }

  async function handleRemoveDate(dateId: string) {
    if (!confirm('Remover essa data?')) return
    startTx(async () => {
      const r = await removeShootingDate(dateId, budget.id)
      if (r.ok) {
        setDates((prev) => prev.filter((d) => d.id !== dateId))
        flash('Data removida')
      } else {
        alert(`Falha: ${r.error}`)
      }
    })
  }

  // Cleanup timers no unmount
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      if (letterTimer.current) clearTimeout(letterTimer.current)
      Object.values(itemTimers.current).forEach((t) => clearTimeout(t))
    }
  }, [])

  async function handleAddItem() {
    startTx(async () => {
      const r = await addItem(budget.id)
      if (r.ok) {
        // Refresh local list — busca o item recém-criado direto da action
        setItems((prev) => [
          ...prev,
          {
            id:                  r.id ?? `tmp-${Date.now()}`,
            budget_id:           budget.id,
            workspace_id:        budget.workspace_id,
            description:         'Novo item',
            description_visible: null,
            is_encargo:          false,
            category:             'Geral',
            unit:                 'unidade',
            days:                 1,
            people:               1,
            quantity:             1,
            unit_price:           0,
            unit_cost:            0,
            total:                0,
            total_cost:           0,
            sort_order:           prev.length,
          },
        ])
        flash('Item adicionado')
      }
    })
  }

  async function handleRemoveItem(itemId: string) {
    startTx(async () => {
      const r = await removeItem(itemId, budget.id)
      if (r.ok) {
        setItems((prev) => prev.filter((i) => i.id !== itemId))
        flash('Item removido')
      }
    })
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 text-white">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-4">
        <Link href="/v2/budgets" className="text-sm text-[#a3a3a3] hover:text-white">
          ← Voltar
        </Link>
        <div className="flex items-center gap-3 text-xs text-[#737373]">
          <span className="font-mono">{budget.number}</span>
          {savedFlash && <span className="text-emerald-400">✓ {savedFlash}</span>}
          {pending && !savedFlash && <span>Salvando…</span>}
          <a
            href={`/api/v2/budgets/${budget.id}/pdf?download=1`}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-2 inline-flex items-center gap-1.5 rounded-md border border-[#D4A853]/30 bg-[#D4A853]/5 px-3 py-1.5 text-xs font-semibold text-[#D4A853] hover:bg-[#D4A853]/10"
          >
            📄 PDF cliente
          </a>
        </div>
      </div>

      {/* Nome do projeto + cliente + tipo */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="md:col-span-2">
          <label className="mb-1 block text-[10px] uppercase tracking-wider text-[#737373]">
            Nome do projeto
          </label>
          <input
            type="text"
            value={budget.name ?? ''}
            onChange={(e) => scheduleHeaderSave({ ...budget, name: e.target.value })}
            placeholder="Casamento João & Maria — 15/06"
            className="w-full rounded-md border border-[#2a2a2a] bg-[#0d0d0d] px-3 py-2 text-lg font-semibold text-white focus:border-[#D4A853] focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] uppercase tracking-wider text-[#737373]">
            Cliente
          </label>
          <select
            value={budget.client_id ?? ''}
            onChange={(e) => scheduleHeaderSave({ ...budget, client_id: e.target.value || null })}
            className="w-full rounded-md border border-[#2a2a2a] bg-[#0d0d0d] px-3 py-2 text-sm text-white focus:border-[#D4A853] focus:outline-none"
          >
            <option value="">— sem cliente —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[10px] uppercase tracking-wider text-[#737373]">
            Tipo
          </label>
          <select
            value={budget.project_type ?? ''}
            onChange={(e) => scheduleHeaderSave({
              ...budget,
              project_type: e.target.value || null,
              project_type_other: e.target.value === 'outro' ? budget.project_type_other : null,
            })}
            className="w-full rounded-md border border-[#2a2a2a] bg-[#0d0d0d] px-3 py-2 text-sm text-white focus:border-[#D4A853] focus:outline-none"
          >
            <option value="">— sem tipo —</option>
            {projectTypes.map((t) => (
              <option key={t.code} value={t.code}>
                {t.icon} {t.label}
              </option>
            ))}
          </select>
          {budget.project_type === 'outro' && (
            <input
              type="text"
              value={budget.project_type_other ?? ''}
              onChange={(e) => scheduleHeaderSave({ ...budget, project_type_other: e.target.value })}
              placeholder="Descreva o tipo"
              className="mt-2 w-full rounded-md border border-[#2a2a2a] bg-[#0d0d0d] px-3 py-1.5 text-xs text-[#a3a3a3] placeholder-[#525252] focus:border-[#D4A853] focus:outline-none"
            />
          )}
        </div>
      </div>

      {/* KPIs em tempo real */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi
          label="Custo Base"
          value={fmtBRL(totals.totalCost)}
          hint="O que VOCÊ paga pelos itens"
          color="text-amber-400"
        />
        <Kpi
          label="Valor ao Cliente"
          value={fmtBRL(totals.total)}
          hint="Subtotal + margem + impostos − desconto"
          color="text-blue-400"
        />
        <Kpi
          label="Margem Bruta"
          value={fmtBRL(totals.grossProfit)}
          hint={`${totals.grossMarginPct.toFixed(1)}% do valor cliente`}
          color={totals.grossProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}
        />
        <Kpi
          label="Markup"
          value={`${totals.markupPct.toFixed(1)}%`}
          hint="Lucro vs custo"
          color="text-violet-400"
        />
      </div>

      {/* Tabs Itens / Carta / Datas */}
      <div className="mb-3 flex items-center gap-2 border-b border-[#1f1f1f]">
        <TabButton active={tab === 'items'} onClick={() => setTab('items')}>
          📋 Itens
        </TabButton>
        <TabButton active={tab === 'carta'} onClick={() => setTab('carta')}>
          ✉️ Carta
        </TabButton>
        <TabButton active={tab === 'datas'} onClick={() => setTab('datas')}>
          📅 Datas{dates.length > 0 ? ` (${dates.length})` : ''}
        </TabButton>
      </div>

      {/* Layout 2 colunas: conteúdo principal + sidebar settings */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Coluna principal */}
        <div className="lg:col-span-2">
        {tab === 'datas' ? (
          <div className="rounded-xl border border-[#1f1f1f] bg-[#0d0d0d] p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-[#a3a3a3]">
                Datas de filmagem
              </h3>
              <button
                type="button"
                onClick={handleAddDate}
                disabled={pending}
                className="rounded-md border border-[#D4A853]/30 bg-[#D4A853]/5 px-3 py-1.5 text-xs font-semibold text-[#D4A853] hover:bg-[#D4A853]/10 disabled:opacity-50"
              >
                + Adicionar data
              </button>
            </div>

            {dates.length === 0 ? (
              <p className="text-xs text-[#525252]">
                Nenhuma data ainda. Adicione as datas reais de captação — multi-dia
                (do dia X ao Y), com horário e local. Tudo aparece organizado no
                PDF cliente.
              </p>
            ) : (
              <ul className="space-y-3">
                {dates.map((d, idx) => (
                  <li
                    key={d.id}
                    className="rounded-lg border border-[#1f1f1f] bg-[#111] p-3"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-[#737373]">
                        Data #{idx + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveDate(d.id)}
                        title="Remover data"
                        className="text-[10px] text-[#525252] hover:text-red-400"
                      >
                        ✕ remover
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                      <DateField
                        label="Início"
                        value={d.date_start}
                        onChange={(v) => scheduleDateUpdate(d.id, { date_start: v })}
                      />
                      <DateField
                        label="Fim (opcional)"
                        value={d.date_end ?? ''}
                        onChange={(v) => scheduleDateUpdate(d.id, { date_end: v || null })}
                      />
                      <TimeField
                        label="Hora início"
                        value={d.time_start ?? ''}
                        onChange={(v) => scheduleDateUpdate(d.id, { time_start: v || null })}
                      />
                      <TimeField
                        label="Hora fim"
                        value={d.time_end ?? ''}
                        onChange={(v) => scheduleDateUpdate(d.id, { time_end: v || null })}
                      />
                    </div>

                    <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                      <TextField
                        label="Etapa / Label"
                        placeholder="Cerimônia, almoço, after…"
                        value={d.label ?? ''}
                        onChange={(v) => scheduleDateUpdate(d.id, { label: v || null })}
                      />
                      <TextField
                        label="Local"
                        placeholder="Hotel Fasano · Sala Veneza"
                        value={d.local_descricao ?? ''}
                        onChange={(v) => scheduleDateUpdate(d.id, { local_descricao: v || null })}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : tab === 'carta' ? (
          <div className="rounded-xl border border-[#1f1f1f] bg-[#0d0d0d] p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-[#a3a3a3]">
                Carta de apresentação
              </h3>
              <div className="flex items-center gap-2">
                {templates.length > 0 && (
                  <select
                    onChange={(e) => {
                      const t = templates.find((x) => x.id === e.target.value)
                      if (t) handleLoadTemplate(t)
                      e.currentTarget.value = ''
                    }}
                    defaultValue=""
                    className="rounded-md border border-[#2a2a2a] bg-[#111] px-2 py-1 text-xs text-white focus:border-[#D4A853] focus:outline-none"
                  >
                    <option value="" disabled>Carregar template…</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}{t.is_default ? ' (padrão)' : ''}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  onClick={handleSaveAsTemplate}
                  disabled={pending}
                  className="rounded-md border border-[#D4A853]/30 bg-[#D4A853]/5 px-3 py-1 text-xs font-semibold text-[#D4A853] hover:bg-[#D4A853]/10 disabled:opacity-50"
                >
                  Salvar como template
                </button>
              </div>
            </div>

            <textarea
              value={letterMd}
              onChange={(e) => handleLetterChange(e.target.value)}
              rows={18}
              placeholder="## Apresentação&#10;Olá {{cliente_nome}}! Que prazer ver seu projeto..."
              className="w-full rounded-md border border-[#2a2a2a] bg-[#111] p-3 font-mono text-sm leading-relaxed text-white focus:border-[#D4A853] focus:outline-none"
            />

            <div className="mt-3 border-t border-[#1f1f1f] pt-3">
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#737373]">
                Inserir variável
              </div>
              <div className="flex flex-wrap gap-1.5">
                {AVAILABLE_VARS.map((v) => (
                  <button
                    key={v.code}
                    type="button"
                    onClick={() => insertVarAtCursor(v.code)}
                    title={v.label}
                    className="rounded border border-[#2a2a2a] bg-[#111] px-1.5 py-0.5 text-[10px] font-mono text-[#D4A853] hover:bg-[#D4A853]/5"
                  >
                    {v.code}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-[#525252]">
                Markdown suportado (## títulos, **negrito**, *itálico*).
                Variáveis são substituídas no PDF cliente.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[#1f1f1f] bg-[#0d0d0d]">
            <table className="w-full text-sm">
              <thead className="border-b border-[#1f1f1f] bg-[#111] text-xs uppercase tracking-wider text-[#737373]">
                <tr>
                  <th className="px-2 py-2 text-left">Item</th>
                  <th className="px-2 py-2 text-right w-16">Dias</th>
                  <th className="px-2 py-2 text-right w-16">Pess.</th>
                  <th className="px-2 py-2 text-right w-28">Custo unit.</th>
                  <th className="px-2 py-2 text-right w-28">Valor unit.</th>
                  <th className="px-2 py-2 text-right w-24">Total</th>
                  <th className="px-2 py-2 text-right w-24">Sobra</th>
                  <th className="px-2 py-2 text-right w-20">Rent.</th>
                  <th className="px-2 py-2 text-right w-8"></th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-sm text-[#525252]">
                      Nenhum item ainda. Clica em &quot;+ Adicionar item&quot; abaixo.
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <ItemRowEditor
                      key={item.id}
                      item={item}
                      onChange={(patch) => scheduleItemSave(item.id, patch)}
                      onRemove={() => handleRemoveItem(item.id)}
                    />
                  ))
                )}
              </tbody>
            </table>
            <div className="border-t border-[#1f1f1f] p-3">
              <button
                type="button"
                onClick={handleAddItem}
                disabled={pending}
                className="text-sm text-[#D4A853] hover:text-[#e0b95f] disabled:opacity-50"
              >
                + Adicionar item
              </button>
            </div>
          </div>
        )}
        </div>

        {/* Sidebar — settings + totals */}
        <div className="space-y-4">
          <div className="rounded-xl border border-[#1f1f1f] bg-[#0d0d0d] p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#a3a3a3]">
              Configurações
            </h3>

            <div className="space-y-3">
              <NumberField
                label="Margem (%)"
                value={num(budget.margin_percent)}
                onChange={(v) => scheduleHeaderSave({ ...budget, margin_percent: v })}
                step="0.1"
              />
              <NumberField
                label="Imposto (%)"
                value={num(budget.tax_percent)}
                onChange={(v) => scheduleHeaderSave({ ...budget, tax_percent: v })}
                step="0.1"
              />
              <NumberField
                label="Desconto (R$)"
                value={num(budget.discount_amount)}
                onChange={(v) => scheduleHeaderSave({ ...budget, discount_amount: v })}
                step="1"
              />
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-[#737373]">
                  Status
                </label>
                <select
                  value={budget.status}
                  onChange={(e) => scheduleHeaderSave({ ...budget, status: e.target.value })}
                  className="w-full rounded-md border border-[#2a2a2a] bg-[#111] px-2 py-1.5 text-sm text-white focus:border-[#D4A853] focus:outline-none"
                >
                  <option value="draft">Rascunho</option>
                  <option value="sent">Enviado</option>
                  <option value="approved">Aprovado</option>
                  <option value="rejected">Recusado</option>
                  <option value="converted">Virou job</option>
                  <option value="expired">Vencido</option>
                  <option value="archived">Arquivado</option>
                </select>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[#1f1f1f] bg-[#0d0d0d] p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#a3a3a3]">
              Resumo
            </h3>
            <dl className="space-y-2 text-sm">
              <Row k="Subtotal" v={fmtBRL(totals.subtotal)} />
              <Row k={`Margem (${num(budget.margin_percent).toFixed(1)}%)`} v={fmtBRL(totals.marginAmount)} />
              <Row k={`Imposto (${num(budget.tax_percent).toFixed(1)}%)`} v={fmtBRL(totals.taxAmount)} />
              {totals.discountAmount > 0 && (
                <Row k="Desconto" v={`− ${fmtBRL(totals.discountAmount)}`} />
              )}
              <div className="my-2 border-t border-[#1f1f1f]" />
              <Row k="Total" v={fmtBRL(totals.total)} bold />
            </dl>
          </div>

          <RentabilidadeBlock
            custoBase={totals.totalCost}
            valorCobrado={totals.total}
            lucroBruto={totals.grossProfit}
            margemPct={totals.grossMarginPct}
            markupPct={totals.markupPct}
          />

          <VersionsBlock
            versions={versions}
            disabled={pending}
            onSave={handleSaveVersion}
            onRestore={handleRestoreVersion}
          />
        </div>
      </div>
    </div>
  )
}

// ── Helpers UI ──────────────────────────────────────────────────────────────

function TabButton({
  active, onClick, children,
}: {
  active:   boolean
  onClick:  () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-t-md px-3 py-2 text-sm transition-colors ${
        active
          ? 'border-b-2 border-[#D4A853] text-white'
          : 'text-[#737373] hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}

function Kpi({ label, value, hint, color }: { label: string; value: string; hint: string; color: string }) {
  return (
    <div className="rounded-xl border border-[#1f1f1f] bg-[#0d0d0d] p-4">
      <div className="mb-1 text-[10px] uppercase tracking-wider text-[#737373]">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="mt-1 text-[10px] text-[#525252]">{hint}</div>
    </div>
  )
}

function DateField({
  label, value, onChange,
}: {
  label:    string
  value:    string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <label className="mb-1 block text-[10px] uppercase tracking-wider text-[#737373]">
        {label}
      </label>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-[#2a2a2a] bg-[#0d0d0d] px-2 py-1.5 text-xs text-white focus:border-[#D4A853] focus:outline-none"
      />
    </div>
  )
}

function TimeField({
  label, value, onChange,
}: {
  label:    string
  value:    string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <label className="mb-1 block text-[10px] uppercase tracking-wider text-[#737373]">
        {label}
      </label>
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-[#2a2a2a] bg-[#0d0d0d] px-2 py-1.5 text-xs text-white focus:border-[#D4A853] focus:outline-none"
      />
    </div>
  )
}

function TextField({
  label, value, onChange, placeholder,
}: {
  label:        string
  value:        string
  onChange:     (v: string) => void
  placeholder?: string
}) {
  return (
    <div>
      <label className="mb-1 block text-[10px] uppercase tracking-wider text-[#737373]">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-[#2a2a2a] bg-[#0d0d0d] px-2 py-1.5 text-xs text-white placeholder-[#525252] focus:border-[#D4A853] focus:outline-none"
      />
    </div>
  )
}

function NumberField({
  label, value, onChange, step,
}: {
  label:    string
  value:    number
  onChange: (n: number) => void
  step?:    string
}) {
  return (
    <div>
      <label className="mb-1 block text-[10px] uppercase tracking-wider text-[#737373]">
        {label}
      </label>
      <input
        type="number"
        step={step ?? '0.01'}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-md border border-[#2a2a2a] bg-[#111] px-2 py-1.5 text-sm text-white focus:border-[#D4A853] focus:outline-none"
      />
    </div>
  )
}

function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className={`${bold ? 'font-semibold text-white' : 'text-[#a3a3a3]'}`}>{k}</dt>
      <dd className={`${bold ? 'text-lg font-bold text-[#D4A853]' : 'text-white'}`}>{v}</dd>
    </div>
  )
}

function ItemRowEditor({
  item, onChange, onRemove,
}: {
  item:     ItemRow
  onChange: (patch: Partial<ItemRow>) => void
  onRemove: () => void
}) {
  return (
    <tr className={`border-b border-[#1f1f1f] last:border-0 hover:bg-[#111] ${item.is_encargo ? 'bg-[#0d0d0d]/60' : ''}`}>
      <td className="px-2 py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onChange({ is_encargo: !item.is_encargo } as Partial<ItemRow>)}
            title={
              item.is_encargo
                ? 'Item invisível no PDF cliente — soma como encargo. Clique para reverter.'
                : 'Tratar como encargo (não aparece detalhado no PDF cliente).'
            }
            className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold ${
              item.is_encargo
                ? 'border-violet-500/40 bg-violet-500/10 text-violet-300'
                : 'border-[#2a2a2a] bg-transparent text-[#525252] hover:border-violet-500/30 hover:text-violet-400'
            }`}
          >
            {item.is_encargo ? '💎 enc.' : 'enc.'}
          </button>
          <input
            type="text"
            value={item.description}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="Direção, câmera, edição…"
            className="w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-sm text-white hover:border-[#2a2a2a] focus:border-[#D4A853] focus:outline-none"
          />
        </div>
      </td>
      <td className="px-2 py-2 text-right">
        <input
          type="number"
          min={1}
          value={item.days}
          onChange={(e) => onChange({ days: Number(e.target.value) || 1 })}
          className="w-14 rounded-md border border-transparent bg-transparent px-1 py-1 text-right text-sm text-white hover:border-[#2a2a2a] focus:border-[#D4A853] focus:outline-none"
        />
      </td>
      <td className="px-2 py-2 text-right">
        <input
          type="number"
          min={1}
          value={item.people}
          onChange={(e) => onChange({ people: Number(e.target.value) || 1 })}
          className="w-14 rounded-md border border-transparent bg-transparent px-1 py-1 text-right text-sm text-white hover:border-[#2a2a2a] focus:border-[#D4A853] focus:outline-none"
        />
      </td>
      <td className="px-2 py-2 text-right">
        <input
          type="number"
          step="0.01"
          value={Number(item.unit_cost ?? 0)}
          onChange={(e) => onChange({ unit_cost: Number(e.target.value) })}
          className="w-24 rounded-md border border-transparent bg-transparent px-1 py-1 text-right text-sm text-amber-400 hover:border-[#2a2a2a] focus:border-[#D4A853] focus:outline-none"
        />
      </td>
      <td className="px-2 py-2 text-right">
        <input
          type="number"
          step="0.01"
          value={Number(item.unit_price ?? 0)}
          onChange={(e) => onChange({ unit_price: Number(e.target.value) })}
          className="w-24 rounded-md border border-transparent bg-transparent px-1 py-1 text-right text-sm text-blue-400 hover:border-[#2a2a2a] focus:border-[#D4A853] focus:outline-none"
        />
      </td>
      <td className="px-2 py-2 text-right text-sm text-white">
        {fmtBRL(Number(item.total ?? 0))}
      </td>
      <td className="px-2 py-2 text-right">
        {(() => {
          const total      = Number(item.total ?? 0)
          const totalCost  = Number(item.total_cost ?? 0)
          const sobra      = total - totalCost
          return (
            <span className={sobra >= 0 ? 'text-emerald-400 text-sm font-mono' : 'text-red-400 text-sm font-mono'}>
              {fmtBRL(sobra)}
            </span>
          )
        })()}
      </td>
      <td className="px-2 py-2 text-right">
        {(() => {
          const total = Number(item.total ?? 0)
          const sobra = total - Number(item.total_cost ?? 0)
          const pct   = total > 0 ? (sobra / total) * 100 : 0
          const meta  = rentMetaFromPct(pct)
          return (
            <span
              title={`${meta.emoji} ${meta.label}`}
              className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-bold ${meta.badgeClass}`}
            >
              {pct.toFixed(0)}%
            </span>
          )
        })()}
      </td>
      <td className="px-2 py-2 text-right">
        <button
          type="button"
          onClick={onRemove}
          title="Remover item"
          className="text-[#525252] hover:text-red-400"
        >
          ✕
        </button>
      </td>
    </tr>
  )
}

function VersionsBlock({
  versions, disabled, onSave, onRestore,
}: {
  versions:  BudgetVersion[]
  disabled:  boolean
  onSave:    () => void
  onRestore: (v: BudgetVersion) => void
}) {
  return (
    <div className="rounded-xl border border-[#1f1f1f] bg-[#0d0d0d] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#a3a3a3]">
          Versões
        </h3>
        <button
          type="button"
          onClick={onSave}
          disabled={disabled}
          className="rounded-md border border-[#D4A853]/30 bg-[#D4A853]/5 px-2.5 py-1 text-[10px] font-semibold text-[#D4A853] hover:bg-[#D4A853]/10 disabled:opacity-50"
        >
          + Salvar versão
        </button>
      </div>

      {versions.length === 0 ? (
        <p className="text-xs text-[#525252]">
          Nenhuma versão salva ainda. Salve uma versão antes de enviar pro cliente
          — fica congelada como prova do que foi combinado.
        </p>
      ) : (
        <ul className="space-y-2">
          {versions.map((v) => (
            <li
              key={v.id}
              className="rounded-lg border border-[#1f1f1f] bg-[#111] p-2.5 hover:bg-[#161616]"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-white">
                  v{v.version_number}
                </span>
                <span className="text-[10px] text-[#525252]">
                  {fmtVerDate(v.created_at)}
                </span>
              </div>
              {v.label ? (
                <div className="mt-1 truncate text-[11px] text-[#a3a3a3]" title={v.label}>
                  {v.label}
                </div>
              ) : null}
              <div className="mt-1 font-mono text-[11px] text-[#D4A853]">
                {fmtBRL(v.total_value_cents / 100)}
              </div>
              <button
                type="button"
                onClick={() => onRestore(v)}
                disabled={disabled}
                className="mt-2 text-[10px] text-[#737373] underline-offset-2 hover:text-[#D4A853] hover:underline disabled:opacity-50"
              >
                Restaurar como atual
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function fmtVerDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch { return iso }
}

function RentabilidadeBlock({
  custoBase, valorCobrado, lucroBruto, margemPct, markupPct,
}: {
  custoBase:    number
  valorCobrado: number
  lucroBruto:   number
  margemPct:    number
  markupPct:    number
}) {
  const meta = rentMetaFromPct(margemPct)
  const barWidth = Math.min(Math.max(margemPct, 0), 100)

  return (
    <div className={`rounded-xl border-2 p-5 ${meta.borderClass} ${meta.bgClass}`}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wider text-white">Rentabilidade</h3>
        <span className={`text-xs font-semibold ${meta.textClass}`}>
          {meta.emoji} {meta.label}
        </span>
      </div>

      <dl className="space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-[#737373]">Custo base</dt>
          <dd className="font-mono text-amber-400">{fmtBRL(custoBase)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-[#a3a3a3]">Valor cobrado</dt>
          <dd className="font-mono text-blue-400">{fmtBRL(valorCobrado)}</dd>
        </div>
        <div className="my-1 border-t border-[#2a2a2a]" />
        <div className="flex justify-between">
          <dt className="text-[#a3a3a3]">Lucro bruto</dt>
          <dd className={`font-mono font-bold ${meta.textClass}`}>{fmtBRL(lucroBruto)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-[#a3a3a3]">Margem líquida</dt>
          <dd className={`font-mono font-bold ${meta.textClass}`}>{margemPct.toFixed(1)}%</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-[#737373]">Markup</dt>
          <dd className="font-mono text-violet-400">{markupPct.toFixed(1)}%</dd>
        </div>
      </dl>

      <div className="mt-4">
        <div className="h-2 overflow-hidden rounded-full bg-[#1a1a1a]">
          <div
            className={`h-full transition-all ${meta.barClass}`}
            style={{ width: `${barWidth}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-[#737373]">
          <span>0%</span>
          <span className={`font-bold ${meta.textClass}`}>{margemPct.toFixed(1)}%</span>
          <span>100%</span>
        </div>
      </div>

      {margemPct < 30 && (
        <div className="mt-4 rounded border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-300">
          💡 Margem apertada. Considere aumentar o valor ou reduzir o custo dos itens
          marcados em vermelho — você ainda dá tempo de ajustar antes de enviar.
        </div>
      )}
      {margemPct >= 50 && (
        <div className="mt-4 rounded border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-300">
          ✓ Margem saudável. Você está ganhando bem neste orçamento.
        </div>
      )}
    </div>
  )
}
