'use client'

/**
 * TagCombobox — combobox free-text com sugestões, portal e anchoring robusto.
 *
 * Por que existir:
 *   Substitui `<input list={datalistId}>` nativo. O `<datalist>` do HTML tem
 *   posicionamento controlado pelo browser (imprevisível por engine),
 *   não aceita estilo, conflita com autofill e quebra em mobile. Para
 *   campos de taxonomia (origem do lead, segmento do cliente) precisamos
 *   de um popup próprio, temático e ancorado.
 *
 * Arquitetura:
 *   · Portal para document.body → imune a overflow-hidden / stacking context
 *   · Anchoring via getBoundingClientRect() + position: fixed
 *   · Re-medição em scroll / resize (capture phase pra pegar scroll de containers)
 *   · Flip automático: se não cabe abaixo, abre acima
 *   · Filtragem case + accent-insensitive
 *   · Free text (não força seleção) — mantém compat com string livre no banco
 *
 * Persistência (responsabilidade do caller):
 *   · onCommit(next) dispara em blur / Enter / seleção
 *   · next é string livre — a lista de options é só sugestão
 *   · permite valor vazio ('') → caller decide gravar null ou ''
 *
 * A11y:
 *   · role="combobox" + aria-expanded + aria-controls + aria-autocomplete
 *   · role="listbox" + role="option" + aria-selected + aria-activedescendant
 *   · Esc fecha sem commitar; Tab/blur commita
 */

import {
  useEffect, useId, useLayoutEffect, useMemo, useRef, useState,
} from 'react'
import { createPortal } from 'react-dom'

// ─── Normalização para filtro ─────────────────────────────────────────────────
// lowercase + strip de diacríticos (Unicode NFD). "Agência" → "agencia".
function normalize(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

interface TagComboboxProps {
  value:       string
  options:     readonly string[]
  onCommit:    (next: string) => void | Promise<void>
  placeholder?: string
  disabled?:    boolean
  ariaLabel?:   string
  className?:   string
}

export function TagCombobox({
  value,
  options,
  onCommit,
  placeholder,
  disabled = false,
  ariaLabel,
  className,
}: TagComboboxProps) {
  const [draft,      setDraft]     = useState<string>(value)
  const [open,       setOpen]      = useState<boolean>(false)
  const [highlight,  setHighlight] = useState<number>(-1)
  const [mounted,    setMounted]   = useState<boolean>(false)

  // Posição do popup no viewport (fixed)
  const [pos, setPos] = useState<{ top: number; left: number; width: number; openUp: boolean }>({
    top: 0, left: 0, width: 0, openUp: false,
  })

  const inputRef = useRef<HTMLInputElement>(null)
  const listRef  = useRef<HTMLUListElement>(null)
  const listboxId = useId()

  // Sincroniza draft quando a prop value muda (ex.: recarregou do servidor)
  useEffect(() => { setDraft(value) }, [value])

  // Monta só no client pra portal não quebrar em SSR
  useEffect(() => { setMounted(true) }, [])

  // ─── Filtragem ──────────────────────────────────────────────────────────────
  // Quando o draft está vazio, mostra tudo. Quando digita, filtra por substring
  // normalizada. Mantém a ordem original das options (que é curada pelo produto).
  const filtered = useMemo(() => {
    const q = normalize(draft)
    if (!q) return options
    return options.filter(o => normalize(o).includes(q))
  }, [draft, options])

  // Ajusta highlight quando a lista muda (ex.: usuário digitou e filtrou)
  useEffect(() => {
    if (!open) return
    if (filtered.length === 0) { setHighlight(-1); return }
    // Se o highlight atual está fora do range, reseta pro primeiro
    setHighlight(h => (h >= 0 && h < filtered.length ? h : 0))
  }, [filtered, open])

  // ─── Posicionamento via getBoundingClientRect + fixed ───────────────────────
  // Re-mede sempre que abre, e em scroll/resize enquanto aberto.
  const measure = () => {
    const el = inputRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const vh = window.innerHeight
    const spaceBelow = vh - r.bottom
    const spaceAbove = r.top
    const desiredH = Math.min(320, 48 + filtered.length * 32) // estimativa p/ decidir flip
    const openUp = spaceBelow < desiredH && spaceAbove > spaceBelow
    setPos({
      top:    openUp ? r.top - 4 : r.bottom + 4,
      left:   r.left,
      width:  r.width,
      openUp,
    })
  }

  useLayoutEffect(() => {
    if (!open) return
    measure()
    // Capture=true pega scroll de containers ancestrais (card, seção, main).
    const onScroll = () => measure()
    const onResize = () => measure()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, filtered.length])

  // ─── Click outside ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (inputRef.current?.contains(t)) return
      if (listRef.current?.contains(t))  return
      // Clique fora: fecha, committa draft atual (espelha onBlur).
      setOpen(false)
      if (draft !== value) onCommit(draft)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open, draft, value, onCommit])

  // ─── Scroll do item ativo pra dentro da view ────────────────────────────────
  useEffect(() => {
    if (!open || highlight < 0) return
    const el = listRef.current?.querySelector<HTMLLIElement>(
      `[data-idx="${highlight}"]`
    )
    el?.scrollIntoView({ block: 'nearest' })
  }, [highlight, open])

  function selectOption(opt: string) {
    setDraft(opt)
    setOpen(false)
    if (opt !== value) onCommit(opt)
  }

  function commitDraft() {
    setOpen(false)
    if (draft !== value) onCommit(draft)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (disabled) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) { setOpen(true); return }
      if (filtered.length === 0) return
      setHighlight(h => (h + 1) % filtered.length)
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) { setOpen(true); return }
      if (filtered.length === 0) return
      setHighlight(h => (h <= 0 ? filtered.length - 1 : h - 1))
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (open && highlight >= 0 && highlight < filtered.length) {
        selectOption(filtered[highlight])
      } else {
        commitDraft()
      }
      return
    }
    if (e.key === 'Escape') {
      if (open) { e.preventDefault(); setOpen(false); setDraft(value); return }
    }
    if (e.key === 'Tab') {
      // Tab é blur natural — deixa o onBlur cuidar do commit; só fecha o popup
      setOpen(false)
    }
  }

  const activeDescendant =
    open && highlight >= 0 && highlight < filtered.length
      ? `${listboxId}-opt-${highlight}`
      : undefined

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={activeDescendant}
        aria-label={ariaLabel}
        autoComplete="off"
        value={draft}
        disabled={disabled}
        placeholder={placeholder}
        onChange={e => { setDraft(e.target.value); if (!open) setOpen(true) }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => {
          // Pequeno delay pra click no item ter chance de disparar primeiro.
          // Se o usuário clicou num option, selectOption já cuidou; aqui só
          // commitamos texto livre quando o blur foi pra outro campo.
          setTimeout(() => {
            if (document.activeElement === inputRef.current) return
            if (listRef.current?.contains(document.activeElement)) return
            setOpen(false)
            if (draft !== value) onCommit(draft)
          }, 0)
        }}
        onKeyDown={onKeyDown}
        className={
          className ??
          'text-xs bg-[#1c1c1c] border border-[#2a2a2a] rounded px-2 py-1 text-white outline-none focus:border-[#D4A853]/50 w-full transition-colors hover:border-[#3a3a3a] disabled:opacity-60'
        }
      />

      {/* Popup em portal — imune a overflow/stacking do container pai */}
      {mounted && open && filtered.length > 0 && createPortal(
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          style={{
            position:  'fixed',
            top:       pos.openUp ? undefined : pos.top,
            bottom:    pos.openUp ? window.innerHeight - pos.top : undefined,
            left:      pos.left,
            width:     pos.width,
            maxHeight: 320,
          }}
          className="z-[9999] overflow-y-auto bg-[#141414] border border-[#2a2a2a] rounded-lg shadow-xl py-1"
        >
          {filtered.map((opt, idx) => {
            const isActive = idx === highlight
            return (
              <li
                key={opt}
                id={`${listboxId}-opt-${idx}`}
                data-idx={idx}
                role="option"
                aria-selected={isActive}
                onMouseEnter={() => setHighlight(idx)}
                onMouseDown={e => {
                  // preventDefault evita blur do input antes do click disparar
                  e.preventDefault()
                  selectOption(opt)
                }}
                className={`px-3 py-1.5 text-xs cursor-pointer transition-colors ${
                  isActive
                    ? 'bg-[#1f1f1f] text-white'
                    : 'text-[#d4d4d4] hover:bg-[#1f1f1f] hover:text-white'
                }`}
              >
                {opt}
              </li>
            )
          })}
        </ul>,
        document.body,
      )}
    </>
  )
}
