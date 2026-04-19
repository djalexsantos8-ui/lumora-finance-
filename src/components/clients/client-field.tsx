// ─── ClientField · Componente ÚNICO de seleção/criação de cliente ───────────
//
// Substitui ClientPicker + ClientCombobox + botão "+ Adicionar detalhes" em
// todo o sistema (Jobs, Budgets, Contracts futuros).
//
// Spec final (revisada):
//   · 3 estados: idle | searching | selected
//   · 2 caminhos no dropdown: selecionar existente · criar novo cliente (abre modal)
//   · Criação NUNCA acontece sem clique/Enter explícito
//   · value = { id, name } | null — única fonte de verdade para o pai
//   · onChange só dispara com cliente JÁ persistido no banco
//   · Modal de criação é um <form> real: Enter submete, botão Criar type="submit"
//   · Modal oferece merge em caso de duplicata (não descarta dados preenchidos)
//   · AbortController cancela buscas obsoletas
//   · Sem flag isSettled — pai salva direto no próximo ciclo de auto-save
//
// Uso:
//   <ClientField
//     value={clientRef}
//     onChange={setClientRef}
//   />
//
// O componente resolve criação internamente via server action createClientFull.
// O pai não precisa saber de nada além do value.

'use client'

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react'
import {
  searchClients,
  createClientFull,
} from '@/lib/actions/clients'
import { normalizeName, validateClientName } from '@/lib/utils/normalize-name'
import type { Client, ClientSearchItem } from '@/types/client'

// ─── Tipo público do value ───────────────────────────────────────────────────

export interface ClientRef {
  id:   string
  name: string
}

interface Props {
  value:         ClientRef | null
  onChange:      (next: ClientRef | null) => void
  disabled?:     boolean
  autoFocus?:    boolean
  placeholder?:  string
  /** ID do input (útil para <label htmlFor>). */
  inputId?:      string
  /** Classe extra no wrapper externo. */
  className?:    string
  /**
   * Se true, expõe um botão explícito para desvincular cliente (onChange(null)).
   * Se false/ausente: "trocar" apenas abre modo de busca — só onChange(new) ao
   * selecionar outro. Protege a invariante "job nunca fica sem cliente".
   */
  allowClear?:   boolean
  /**
   * Dispara sempre que o usuário entra/sai do modo "trocar cliente".
   * O pai pode usar para pausar outros autosaves, mostrar indicadores, etc.
   *
   *   true  → usuário clicou em "trocar", ainda não confirmou nova seleção
   *   false → idle / selecionado / seleção confirmada
   *
   * Garantia: ClientField NUNCA chama onChange(null) durante switching —
   * a pill só muda após seleção/criação persistida no banco.
   */
  onSwitchingChange?: (switching: boolean) => void
}

// ─── Estado interno (UI) ─────────────────────────────────────────────────────
//
// Não exposto ao pai — pai só vê `value`. Estes estados modelam apenas a
// interação visual:
//   idle      → sem query, sem dropdown aberto
//   searching → query ativa ou dropdown aberto (com/sem texto)
//   selected  → pill visível (controlado por value !== null)

type UiState = 'idle' | 'searching' | 'selected'

// ─── Debounce & busca ────────────────────────────────────────────────────────

const DEBOUNCE_MS = 300
const RECENT_LIMIT = 5

// ─────────────────────────────────────────────────────────────────────────────

export function ClientField({
  value,
  onChange,
  disabled,
  autoFocus,
  placeholder = 'Buscar ou criar cliente…',
  inputId,
  className,
  allowClear = false,
  onSwitchingChange,
}: Props) {
  // Estado visual
  const [query, setQuery]       = useState('')
  const [open, setOpen]         = useState(false)
  const [items, setItems]       = useState<ClientSearchItem[]>([])
  const [recents, setRecents]   = useState<ClientSearchItem[]>([])
  const [highlight, setHighlight] = useState(0)
  const [modalOpen, setModalOpen] = useState(false)
  const [switching, setSwitching] = useState(false)     // trocar cliente sem apagar

  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef   = useRef<AbortController | null>(null)
  const reactId = useId()
  const listboxId = `clientfield-listbox-${reactId}`

  // Pill aparece quando há cliente selecionado E não está em modo switching.
  const uiState: UiState = (value && !switching) ? 'selected' : (open ? 'searching' : 'idle')

  // Propaga modo "trocando" pro pai (permite pausar autosaves, mostrar flags).
  useEffect(() => {
    onSwitchingChange?.(switching)
  }, [switching, onSwitchingChange])

  // ─── Busca (debounced + abortável) ─────────────────────────────────────────
  const runSearch = useCallback(async (q: string) => {
    // Cancela busca anterior em voo
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    try {
      const res = await searchClients(q)
      if (ctrl.signal.aborted) return
      if (res.success) {
        setItems(res.data)
        setHighlight(0)
      } else {
        setItems([])
      }
    } catch {
      if (!ctrl.signal.aborted) setItems([])
    }
  }, [])

  // Dispara busca com debounce ao digitar
  useEffect(() => {
    if (!open) return
    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(() => {
      runSearch(query)
    }, DEBOUNCE_MS)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, open, runSearch])

  // Carrega "5 mais recentes" uma vez quando o dropdown abre sem query
  useEffect(() => {
    if (!open || query.trim()) return
    if (recents.length > 0) return
    ;(async () => {
      const res = await searchClients('')
      if (res.success) setRecents(res.data.slice(0, RECENT_LIMIT))
    })()
  }, [open, query, recents.length])

  // ─── Fecha ao clicar fora ──────────────────────────────────────────────────
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (modalOpen) return // modal tem sua própria gestão
      if (!wrapperRef.current) return
      if (!wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
        // Se estava trocando cliente sem commitar, reverte para a pill original.
        if (switching) cancelSwitch()
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [modalOpen])

  // ─── Opções do dropdown ────────────────────────────────────────────────────
  //
  // Ordem fixa (regra determinística p/ Enter):
  //   1. Clientes existentes (matches do query, ou recentes se vazio)
  //   2. "Criar novo cliente: X" — única opção de criação. Abre o modal.
  //      Escondido se query vazia, se há match exato, ou se nome é inválido.

  type Option =
    | { kind: 'existing'; client: ClientSearchItem }
    | { kind: 'full';     label: string }

  // Valida query para decidir se "Criar novo cliente" aparece.
  // Mesma regra usada nos server actions (createClientFull).
  const queryValidation = useMemo(
    () => validateClientName(query),
    [query],
  )

  const options: Option[] = useMemo(() => {
    const q = query.trim()
    const nq = normalizeName(q)
    const list = q ? items : recents
    const existing: Option[] = list.map(c => ({ kind: 'existing' as const, client: c }))

    if (!q) return existing  // sem query: só recentes

    const hasExact = items.some(c => c.name_normalized === nq)
    const tail: Option[] = []
    // Só mostra "criar novo cliente" se nome for válido (bloqueia "a", "1", etc.)
    // e se não existir match exato (evita criar duplicata).
    if (!hasExact && queryValidation.valid) {
      tail.push({ kind: 'full' as const, label: q })
    }
    return [...existing, ...tail]
  }, [query, items, recents, queryValidation.valid])

  // Mantém highlight dentro dos limites quando options muda
  useEffect(() => {
    if (highlight >= options.length) setHighlight(0)
  }, [options.length, highlight])

  // ─── Handlers ──────────────────────────────────────────────────────────────

  function openDropdown() {
    if (disabled) return
    setOpen(true)
  }

  function handleInput(e: ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value)
    setOpen(true)
  }

  async function selectExisting(c: ClientSearchItem) {
    setOpen(false)
    setQuery('')
    setSwitching(false)
    onChange({ id: c.id, name: c.name })
  }

  function openFullCreate() {
    setModalOpen(true)
    // não fecha o dropdown ainda — modal fica por cima
  }

  // "trocar" na pill: entra em modo busca SEM apagar o value.
  // Só muda quando o usuário selecionar/criar outro cliente.
  function beginSwitch() {
    setSwitching(true)
    setQuery('')
    setTimeout(() => {
      inputRef.current?.focus()
      setOpen(true)
    }, 0)
  }

  function cancelSwitch() {
    setSwitching(false)
    setOpen(false)
    setQuery('')
  }

  // Desvincular explicitamente (apenas se allowClear=true).
  function clearSelection() {
    onChange(null)
    setQuery('')
    setSwitching(false)
    setTimeout(() => {
      inputRef.current?.focus()
      setOpen(true)
    }, 0)
  }

  function executeOption(opt: Option) {
    switch (opt.kind) {
      case 'existing': return selectExisting(opt.client)
      case 'full':     return openFullCreate()
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setOpen(true)
      }
      return
    }
    if (options.length === 0) {
      if (e.key === 'Escape') setOpen(false)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight(h => (h + 1) % options.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight(h => (h - 1 + options.length) % options.length)
    } else if (e.key === 'Enter') {
      const opt = options[highlight]
      if (opt) {
        e.preventDefault()
        executeOption(opt)
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
      if (switching) cancelSwitch()
    }
  }

  // ─── Render: pill quando selected ──────────────────────────────────────────

  if (uiState === 'selected' && value) {
    return (
      <div ref={wrapperRef} className={className}>
        <div className="inline-flex items-center gap-2 w-full bg-[#1c1c1c] border border-[#D4A853]/40 rounded-xl px-4 py-3">
          <span
            className="flex items-center justify-center w-6 h-6 rounded-full bg-[#D4A853]/15 text-[#D4A853] text-xs font-semibold shrink-0"
            aria-hidden
          >
            ✓
          </span>
          <span className="flex-1 text-sm text-white truncate" title={value.name}>
            {value.name}
          </span>
          <button
            type="button"
            onClick={beginSwitch}
            disabled={disabled}
            className="text-xs text-[#737373] hover:text-white transition-colors disabled:opacity-40"
            title="Trocar cliente"
            aria-label="Trocar cliente"
          >
            trocar
          </button>
          {allowClear && (
            <button
              type="button"
              onClick={clearSelection}
              disabled={disabled}
              className="text-xs text-[#737373] hover:text-red-400 transition-colors disabled:opacity-40"
              title="Desvincular cliente"
              aria-label="Desvincular cliente"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    )
  }

  // ─── Render: input + dropdown ──────────────────────────────────────────────

  return (
    <div ref={wrapperRef} className={`relative ${className ?? ''}`}>
      {switching && value && (
        <div className="flex items-center justify-between mb-1.5 px-1">
          <span className="text-[10px] text-[#737373]">
            Trocando <span className="text-[#a3a3a3] font-medium">{value.name}</span>
          </span>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={cancelSwitch}
            className="text-[10px] text-[#737373] hover:text-white transition-colors"
          >
            cancelar troca (Esc)
          </button>
        </div>
      )}
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        value={query}
        onChange={handleInput}
        onFocus={openDropdown}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        autoFocus={autoFocus || switching}
        placeholder={switching ? 'Buscar outro cliente…' : placeholder}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={
          open && options[highlight] ? `${listboxId}-opt-${highlight}` : undefined
        }
        className="w-full bg-[#1c1c1c] border border-[#2a2a2a] rounded-xl px-4 py-3 text-sm text-white placeholder-[#525252] focus:outline-none focus:border-[#D4A853]/50 focus:ring-1 focus:ring-[#D4A853]/20 transition-colors disabled:opacity-60"
      />

      {open && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-20 mt-1 w-full max-h-80 overflow-y-auto bg-[#141414] border border-[#2a2a2a] rounded-xl shadow-lg py-1"
        >
          {options.length === 0 && !query.trim() && (
            <li className="px-3 py-2 text-xs text-[#525252]">
              Digite para buscar ou criar um cliente…
            </li>
          )}

          {options.length === 0 && query.trim() && (
            <li className="px-3 py-2 text-xs text-[#525252]">
              Nenhum cliente encontrado
            </li>
          )}

          {/* Hint discreta quando query muito curta/inválida — substitui "criar rápido" */}
          {query.trim() && !queryValidation.valid && (
            <li
              className="px-3 py-2 text-[11px] text-[#737373] border-t border-[#1f1f1f] flex items-center gap-2"
              aria-live="polite"
            >
              <span aria-hidden>ℹ</span>
              <span>Digite pelo menos 2 letras para criar um novo cliente.</span>
            </li>
          )}

          {options.map((opt, idx) => {
            const active = idx === highlight
            const id = `${listboxId}-opt-${idx}`

            if (opt.kind === 'existing') {
              return (
                <li
                  key={`existing-${opt.client.id}`}
                  id={id}
                  role="option"
                  aria-selected={active}
                  onMouseDown={(e) => { e.preventDefault(); executeOption(opt) }}
                  onMouseEnter={() => setHighlight(idx)}
                  className={`px-3 py-2 text-sm cursor-pointer truncate ${
                    active ? 'bg-[#D4A853]/10 text-white' : 'text-[#e5e5e5] hover:bg-[#1c1c1c]'
                  }`}
                >
                  {opt.client.name}
                </li>
              )
            }

            // full create — única opção de criação de cliente
            return (
              <li
                key="full"
                id={id}
                role="option"
                aria-selected={active}
                onMouseDown={(e) => { e.preventDefault(); executeOption(opt) }}
                onMouseEnter={() => setHighlight(idx)}
                className={`px-3 py-2 text-sm cursor-pointer flex items-center gap-2 border-t border-[#1f1f1f] ${
                  active ? 'bg-[#D4A853]/10' : ''
                }`}
              >
                <span className="text-[#D4A853]" aria-hidden>+</span>
                <span className="flex-1 truncate text-[#D4A853]">
                  Criar novo cliente: <span className="font-semibold">{opt.label}</span>
                </span>
                <span className="text-[10px] text-[#525252]" aria-hidden>↵</span>
              </li>
            )
          })}
        </ul>
      )}

      {modalOpen && (
        <FullCreateModal
          initialName={query}
          onClose={() => setModalOpen(false)}
          onCreated={(client) => {
            setModalOpen(false)
            setOpen(false)
            setQuery('')
            onChange({ id: client.id, name: client.name })
          }}
        />
      )}
    </div>
  )
}

// ─── Modal de criação completa ───────────────────────────────────────────────

interface FullModalProps {
  initialName: string
  onClose:     () => void
  onCreated:   (client: Client) => void
}

function FullCreateModal({ initialName, onClose, onCreated }: FullModalProps) {
  const [name,      setName]      = useState(initialName.trim())
  const [phone,     setPhone]     = useState('')
  const [instagram, setInstagram] = useState('')
  const [email,     setEmail]     = useState('')
  const [document_, setDocument]  = useState('')
  const [notes,     setNotes]     = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [duplicate,  setDuplicate]  = useState<Client | null>(null)
  const [errorMsg,   setErrorMsg]   = useState<string | null>(null)
  const [confirmingClose, setConfirmingClose] = useState(false)

  const hasExtras =
    !!phone.trim() || !!instagram.trim() || !!email.trim() ||
    !!document_.trim() || !!notes.trim()

  // Esc fecha (com confirmação se preenchido)
  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        attemptClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasExtras])

  function attemptClose() {
    if (submitting) return
    if (hasExtras) {
      setConfirmingClose(true)
      return
    }
    onClose()
  }

  async function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault()
    if (submitting) return
    // Validação centralizada — mesma regra do backend.
    const v = validateClientName(name)
    if (!v.valid) {
      setErrorMsg(v.message!)
      return
    }
    setErrorMsg(null)
    setSubmitting(true)
    try {
      const res = await createClientFull({
        name: v.cleaned,
        phone:     phone.trim()     || null,
        instagram: instagram.trim() || null,
        email:     email.trim()     || null,
        document:  document_.trim() || null,
        notes:     notes.trim()     || null,
      })

      if (res.success) {
        onCreated(res.data)
        return
      }

      if ('duplicate' in res) {
        setDuplicate(res.duplicate)
        return
      }

      setErrorMsg(res.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleMergeIntoExisting() {
    if (!duplicate || submitting) return
    setSubmitting(true)
    setErrorMsg(null)
    try {
      // Faz update no existente usando updateClient (import dinâmico só pra
      // evitar mover import pro topo — preserva bundle pequeno).
      const { updateClient } = await import('@/lib/actions/clients')
      const patch: Record<string, string | null> = {}
      if (phone.trim()     && !duplicate.phone)     patch.phone     = phone.trim()
      if (instagram.trim() && !duplicate.instagram) patch.instagram = instagram.trim()
      if (email.trim()     && !duplicate.email)     patch.email     = email.trim()
      if (document_.trim() && !duplicate.document)  patch.document  = document_.trim()
      if (notes.trim()     && !duplicate.notes)     patch.notes     = notes.trim()

      if (Object.keys(patch).length === 0) {
        // Nada pra mergear — só seleciona o existente
        onCreated(duplicate)
        return
      }

      const res = await updateClient(duplicate.id, patch)
      if (res.success) {
        onCreated(res.data)
      } else {
        setErrorMsg(res.message)
        setSubmitting(false)
      }
    } catch {
      setErrorMsg('Erro ao atualizar cliente existente.')
      setSubmitting(false)
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/70"
        onMouseDown={attemptClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="clientfield-modal-title"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
      >
        <form
          onSubmit={handleSubmit}
          className="pointer-events-auto w-full max-w-[480px] bg-[#0a0a0a] border border-[#2a2a2a] rounded-2xl shadow-2xl overflow-hidden"
          onMouseDown={(e) => e.stopPropagation()}
          noValidate
        >
          <header className="flex items-center justify-between px-5 py-4 border-b border-[#1f1f1f]">
            <h2 id="clientfield-modal-title" className="text-sm font-semibold text-white">
              Novo cliente
            </h2>
            <button
              type="button"
              onClick={attemptClose}
              disabled={submitting}
              className="text-[#737373] hover:text-white transition-colors text-lg leading-none disabled:opacity-40"
              aria-label="Fechar"
            >
              ✕
            </button>
          </header>

          <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
            {duplicate ? (
              <DuplicateMergePanel
                duplicate={duplicate}
                hasExtras={hasExtras}
                submitting={submitting}
                onMerge={handleMergeIntoExisting}
                onSelectExisting={() => onCreated(duplicate)}
                onBack={() => setDuplicate(null)}
              />
            ) : (
              <>
                <ModalField
                  label="Nome"
                  required
                  value={name}
                  onChange={setName}
                  disabled={submitting}
                  autoFocus
                />
                <ModalField
                  label="Telefone"
                  value={phone}
                  onChange={setPhone}
                  disabled={submitting}
                  placeholder="(11) 99999-9999"
                />
                <ModalField
                  label="Email"
                  value={email}
                  onChange={setEmail}
                  disabled={submitting}
                  placeholder="email@exemplo.com"
                />
                <ModalField
                  label="Instagram"
                  value={instagram}
                  onChange={setInstagram}
                  disabled={submitting}
                  placeholder="@handle"
                />
                <ModalField
                  label="CNPJ / CPF"
                  value={document_}
                  onChange={setDocument}
                  disabled={submitting}
                />
                <div>
                  <label className="block text-[10px] font-semibold text-[#525252] tracking-widest mb-2">
                    NOTAS
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    disabled={submitting}
                    rows={3}
                    placeholder="Referência interna, preferências…"
                    className="w-full bg-[#1c1c1c] border border-[#2a2a2a] rounded-xl px-3 py-2 text-sm text-white placeholder-[#525252] focus:outline-none focus:border-[#D4A853]/50 focus:ring-1 focus:ring-[#D4A853]/20 transition-colors resize-none disabled:opacity-60"
                  />
                </div>

                {errorMsg && (
                  <p className="text-xs text-red-400">{errorMsg}</p>
                )}
              </>
            )}
          </div>

          {!duplicate && (
            <footer className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#1f1f1f] bg-[#0a0a0a]">
              <button
                type="button"
                onClick={attemptClose}
                disabled={submitting}
                className="px-4 py-2 text-sm text-[#a3a3a3] hover:text-white transition-colors disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting || !name.trim()}
                className="px-4 py-2 text-sm font-medium bg-[#D4A853] hover:bg-[#c89a47] text-black rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Criando…' : 'Criar'}
              </button>
            </footer>
          )}
        </form>
      </div>

      {confirmingClose && (
        <ConfirmDiscardDialog
          onKeep={() => setConfirmingClose(false)}
          onDiscard={() => { setConfirmingClose(false); onClose() }}
        />
      )}
    </>
  )
}

// ─── Panels & sub-components ─────────────────────────────────────────────────

function DuplicateMergePanel({
  duplicate,
  hasExtras,
  submitting,
  onMerge,
  onSelectExisting,
  onBack,
}: {
  duplicate:        Client
  hasExtras:        boolean
  submitting:       boolean
  onMerge:          () => void
  onSelectExisting: () => void
  onBack:           () => void
}) {
  return (
    <div className="space-y-4">
      <div className="p-3 rounded-xl bg-[#1c1410] border border-[#D4A853]/30">
        <p className="text-sm text-white font-medium mb-1">
          Já existe um cliente chamado &ldquo;{duplicate.name}&rdquo;.
        </p>
        <p className="text-xs text-[#a3a3a3]">
          {hasExtras
            ? 'Você pode adicionar os dados preenchidos ao cliente existente — ou apenas selecioná-lo sem mudar nada.'
            : 'Você pode selecionar o cliente existente.'}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {hasExtras && (
          <button
            type="button"
            onClick={onMerge}
            disabled={submitting}
            className="w-full px-4 py-2.5 text-sm font-medium bg-[#D4A853] hover:bg-[#c89a47] text-black rounded-xl transition-colors disabled:opacity-50"
          >
            {submitting ? 'Atualizando…' : 'Adicionar dados ao cliente existente'}
          </button>
        )}
        <button
          type="button"
          onClick={onSelectExisting}
          disabled={submitting}
          className="w-full px-4 py-2.5 text-sm font-medium bg-[#1c1c1c] hover:bg-[#262626] text-white border border-[#2a2a2a] rounded-xl transition-colors disabled:opacity-50"
        >
          Selecionar cliente existente
        </button>
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="w-full px-4 py-2 text-xs text-[#737373] hover:text-white transition-colors disabled:opacity-40"
        >
          ← Voltar e editar nome
        </button>
      </div>
    </div>
  )
}

function ConfirmDiscardDialog({
  onKeep,
  onDiscard,
}: {
  onKeep:    () => void
  onDiscard: () => void
}) {
  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/80" onMouseDown={onKeep} aria-hidden />
      <div className="fixed inset-0 z-[61] flex items-center justify-center p-4 pointer-events-none">
        <div
          role="alertdialog"
          aria-modal="true"
          className="pointer-events-auto w-full max-w-[360px] bg-[#0a0a0a] border border-[#2a2a2a] rounded-2xl p-5"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <p className="text-sm text-white mb-1 font-medium">
            Descartar dados preenchidos?
          </p>
          <p className="text-xs text-[#a3a3a3] mb-4">
            Você tem campos preenchidos que serão perdidos.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onKeep}
              className="px-3 py-2 text-sm text-[#a3a3a3] hover:text-white transition-colors"
            >
              Continuar editando
            </button>
            <button
              type="button"
              onClick={onDiscard}
              className="px-3 py-2 text-sm font-medium bg-red-500/90 hover:bg-red-500 text-white rounded-xl transition-colors"
            >
              Descartar
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

function ModalField({
  label,
  value,
  onChange,
  placeholder,
  required,
  disabled,
  autoFocus,
}: {
  label:        string
  value:        string
  onChange:     (v: string) => void
  placeholder?: string
  required?:    boolean
  disabled?:    boolean
  autoFocus?:   boolean
}) {
  return (
    <div>
      <label className="block text-[10px] font-semibold text-[#525252] tracking-widest mb-2">
        {label.toUpperCase()} {required && <span className="text-[#D4A853]">*</span>}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        className="w-full bg-[#1c1c1c] border border-[#2a2a2a] rounded-xl px-3 py-2 text-sm text-white placeholder-[#525252] focus:outline-none focus:border-[#D4A853]/50 focus:ring-1 focus:ring-[#D4A853]/20 transition-colors disabled:opacity-60"
      />
    </div>
  )
}
