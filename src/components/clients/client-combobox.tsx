// ─── ClientCombobox · Autocomplete de cliente (zero-fricção) ────────────────
//
// Input com debounce (180ms) + dropdown de sugestões.
//
// Comportamento:
//   · enquanto digita → searchClients() server action
//   · lista clientes existentes (match ilike)
//   · se o texto digitado não bate EXATAMENTE com nenhum → opção
//     "Criar novo cliente: <X>" no topo
//   · Enter / click selecionam
//   · Arrow Up/Down navega
//
// IMPORTANTE:
//   A criação REAL do cliente acontece no servidor (getOrCreateClient) quando
//   o job é salvo. Este componente só coleta o nome. Zero fricção — sem modal,
//   sem confirmação extra.
//
// Props:
//   · name              — name do input submetido (default: "client_name")
//   · defaultValue      — valor inicial (texto bruto)
//   · disabled
//   · onSelectExisting  — opcional, callback quando o usuário escolhe um
//                         cliente existente do dropdown (passa id + name)

'use client'

import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
  type ChangeEvent,
} from 'react'
import { searchClients } from '@/lib/actions/clients'
import { normalizeName } from '@/lib/utils/normalize-name'
import type { ClientSearchItem } from '@/types/client'

interface Props {
  name?:              string
  defaultValue?:      string
  disabled?:          boolean
  placeholder?:       string
  autoFocus?:         boolean
  onSelectExisting?: (client: ClientSearchItem) => void
  onChange?:         (value: string) => void
}

export function ClientCombobox({
  name = 'client_name',
  defaultValue = '',
  disabled,
  placeholder = 'Nome do cliente',
  autoFocus,
  onSelectExisting,
  onChange,
}: Props) {
  const [value, setValue]       = useState(defaultValue)
  const [open, setOpen]         = useState(false)
  const [items, setItems]       = useState<ClientSearchItem[]>([])
  const [highlight, setHighlight] = useState(0)
  const [isPending, startTransition] = useTransition()

  const wrapperRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const listId = useId()

  // Busca com debounce
  useEffect(() => {
    if (disabled) return
    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(() => {
      startTransition(async () => {
        const res = await searchClients(value)
        if (res.success) {
          setItems(res.data)
          setHighlight(0)
        } else {
          setItems([])
        }
      })
    }, 180)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [value, disabled])

  // Fecha ao clicar fora
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapperRef.current) return
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const trimmed = value.trim()
  const normalizedInput = normalizeName(trimmed)
  const hasExactMatch = items.some(i => i.name_normalized === normalizedInput)
  const showCreateOption = trimmed.length > 0 && !hasExactMatch

  // Lista unificada (renderização)
  type Option =
    | { type: 'existing'; client: ClientSearchItem }
    | { type: 'create';   label: string }

  const options: Option[] = [
    ...(showCreateOption ? [{ type: 'create' as const, label: trimmed }] : []),
    ...items.map(c => ({ type: 'existing' as const, client: c })),
  ]

  function handleInput(e: ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    setValue(v)
    setOpen(true)
    onChange?.(v)
  }

  function selectOption(opt: Option) {
    if (opt.type === 'existing') {
      setValue(opt.client.name)
      onChange?.(opt.client.name)
      onSelectExisting?.(opt.client)
    } else {
      // Criar: mantém o texto — auto-criação acontece no servidor ao salvar
      setValue(opt.label)
      onChange?.(opt.label)
    }
    setOpen(false)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open || options.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight(h => (h + 1) % options.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight(h => (h - 1 + options.length) % options.length)
    } else if (e.key === 'Enter') {
      // Só captura Enter se há opção destacada — senão deixa o form submeter
      if (options[highlight]) {
        e.preventDefault()
        selectOption(options[highlight])
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="text"
        name={name}
        value={value}
        onChange={handleInput}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        autoFocus={autoFocus}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        className="w-full bg-[#1c1c1c] border border-[#2a2a2a] rounded-xl px-4 py-3 text-sm text-white placeholder-[#525252] focus:outline-none focus:border-[#D4A853]/50 focus:ring-1 focus:ring-[#D4A853]/20 transition-colors disabled:opacity-60"
      />

      {open && options.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto bg-[#141414] border border-[#2a2a2a] rounded-xl shadow-lg py-1"
        >
          {options.map((opt, idx) => {
            const active = idx === highlight
            if (opt.type === 'create') {
              return (
                <li
                  key={`create-${opt.label}`}
                  role="option"
                  aria-selected={active}
                  onMouseDown={(e) => { e.preventDefault(); selectOption(opt) }}
                  onMouseEnter={() => setHighlight(idx)}
                  className={`px-3 py-2 text-sm cursor-pointer flex items-center gap-2 ${
                    active ? 'bg-[#D4A853]/10 text-[#D4A853]' : 'text-[#D4A853]'
                  }`}
                >
                  <span className="text-[#D4A853]">+</span>
                  <span className="truncate">
                    Criar novo cliente: <span className="font-semibold">{opt.label}</span>
                  </span>
                </li>
              )
            }
            return (
              <li
                key={opt.client.id}
                role="option"
                aria-selected={active}
                onMouseDown={(e) => { e.preventDefault(); selectOption(opt) }}
                onMouseEnter={() => setHighlight(idx)}
                className={`px-3 py-2 text-sm cursor-pointer truncate ${
                  active ? 'bg-[#D4A853]/10 text-white' : 'text-[#e5e5e5] hover:bg-[#1c1c1c]'
                }`}
              >
                {opt.client.name}
              </li>
            )
          })}

          {isPending && options.length === 0 && (
            <li className="px-3 py-2 text-xs text-[#525252]">Buscando…</li>
          )}
        </ul>
      )}
    </div>
  )
}
