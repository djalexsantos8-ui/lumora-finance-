'use client'

import type { ClassicoFilters, ClassicoOptions } from '@/lib/dashboard-classico/fetch'

interface Props {
  value:    ClassicoFilters
  options:  ClassicoOptions
  onChange: (next: ClassicoFilters) => void
  onReset:  () => void
  loading?: boolean
}

export function FiltersBar({ value, options, onChange, onReset, loading }: Props) {
  function set<K extends keyof ClassicoFilters>(key: K, v: ClassicoFilters[K]) {
    onChange({ ...value, [key]: v })
  }

  const hasAnyFilter =
    !!value.dateFrom ||
    !!value.dateTo   ||
    !!value.clientId ||
    !!value.segment  ||
    !!value.leadSource

  return (
    <div className="rounded-2xl border border-[#2a2a2a] bg-[#141414] p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-white">Filtros</h3>
        <div className="flex items-center gap-2">
          {loading && (
            <span className="text-[11px] text-[#a3a3a3]">Atualizando…</span>
          )}
          {hasAnyFilter && (
            <button
              type="button"
              onClick={onReset}
              className="text-[11px] text-[#D4A853] hover:text-[#E8C47A] transition-colors"
            >
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Field label="De">
          <input
            type="date"
            value={value.dateFrom ?? ''}
            onChange={e => set('dateFrom', e.target.value || undefined)}
            className={inputCls + ' [color-scheme:dark]'}
          />
        </Field>
        <Field label="Até">
          <input
            type="date"
            value={value.dateTo ?? ''}
            onChange={e => set('dateTo', e.target.value || undefined)}
            className={inputCls + ' [color-scheme:dark]'}
          />
        </Field>
        <Field label="Cliente">
          <select
            value={value.clientId ?? ''}
            onChange={e => set('clientId', e.target.value || null)}
            className={inputCls + ' cursor-pointer'}
          >
            <option value="">Todos</option>
            {options.clientes.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Segmento">
          <select
            value={value.segment ?? ''}
            onChange={e => set('segment', e.target.value || null)}
            className={inputCls + ' cursor-pointer'}
          >
            <option value="">Todos</option>
            {options.segmentos.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Fonte">
          <select
            value={value.leadSource ?? ''}
            onChange={e => set('leadSource', e.target.value || null)}
            className={inputCls + ' cursor-pointer'}
          >
            <option value="">Todas</option>
            {options.leadSources.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wide text-[#525252] block mb-1">
        {label}
      </span>
      {children}
    </label>
  )
}

const inputCls =
  'w-full bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs text-white ' +
  'focus:outline-none focus:border-[#D4A853]/50 transition-colors'
