// ─── ClientesClient · Lista expansível + edição de ficha ────────────────────
//
// UX:
//   · busca simples no topo (filtro client-side)
//   · cada cliente é uma row; clicar abre o editor inline
//   · editor permite renomear + preencher phone / instagram / email / document / notes
//   · "Remover" é soft delete
//   · Histórico de jobs: placeholder (futuro)
//
// Zero fricção: a página nunca pede criação. Cliente só aparece aqui se já
// nasceu via job/orçamento.
//
// O formulário em si vive em <ClientFullForm> — mesmo componente usado dentro
// do freelance (modo expandido da combobox). Garante paridade visual e evita
// divergir 2 formulários no futuro.

'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  updateClient,
  deleteClient,
  bulkDeleteClients,
  quickCreateClient,
} from '@/lib/actions/clients'
import { normalizeName } from '@/lib/utils/normalize-name'
import type { Client } from '@/types/client'
import {
  ClientFullForm,
  EMPTY_CLIENT_FULL_FORM,
  type ClientFullFormValue,
} from '@/components/clients/client-full-form'

interface Props {
  initialClients: Client[]
}

export function ClientesClient({ initialClients }: Props) {
  const router = useRouter()
  const [clients, setClients] = useState<Client[]>(initialClients)
  const [query, setQuery]     = useState('')
  const [openId, setOpenId]   = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const [creating, setCreating]   = useState(false)
  const [newName, setNewName]     = useState('')
  const [newForm, setNewForm]     = useState<ClientFullFormValue>(EMPTY_CLIENT_FULL_FORM)
  const [createError, setCreateError] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = normalizeName(query)
    if (!q) return clients
    return clients.filter(c => c.name_normalized.includes(q))
  }, [clients, query])

  const someSelected = selected.size > 0
  const allFilteredSelected =
    filtered.length > 0 && filtered.every(c => selected.has(c.id))

  function toggleOne(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (allFilteredSelected) {
      setSelected(prev => {
        const next = new Set(prev)
        filtered.forEach(c => next.delete(c.id))
        return next
      })
    } else {
      setSelected(prev => {
        const next = new Set(prev)
        filtered.forEach(c => next.add(c.id))
        return next
      })
    }
  }

  function handleUpdate(updated: Client) {
    setClients(prev => prev.map(c => c.id === updated.id ? updated : c))
  }

  function handleDelete(id: string) {
    setClients(prev => prev.filter(c => c.id !== id))
    setOpenId(null)
  }

  function handleCreate() {
    const trimmed = newName.trim()
    if (!trimmed) {
      setCreateError('Nome é obrigatório.')
      return
    }
    setCreateError(null)
    startTransition(async () => {
      // 1) cria (ou reaproveita, idempotente por name_normalized)
      const res = await quickCreateClient(trimmed)
      if (!res.success) {
        setCreateError(res.message ?? 'Erro ao criar cliente.')
        return
      }
      let finalClient = res.data

      // 2) se o usuário preencheu qualquer campo adicional, enriquece
      const hasExtra =
        !!newForm.phone ||
        !!newForm.instagram ||
        !!newForm.email ||
        !!newForm.document ||
        !!newForm.notes ||
        !!newForm.person_type ||
        !!newForm.legal_name ||
        !!newForm.trade_name ||
        !!newForm.document_cpf ||
        !!newForm.document_cnpj ||
        !!newForm.address_line ||
        !!newForm.address_city ||
        !!newForm.address_state ||
        !!newForm.address_zip ||
        !!newForm.segment ||
        !!newForm.lead_source ||
        !!newForm.payment_condition ||
        !!newForm.responsible_name ||
        !!newForm.responsible_role

      if (hasExtra) {
        const upd = await updateClient(finalClient.id, {
          phone:     newForm.phone,
          instagram: newForm.instagram,
          email:     newForm.email,
          document:  newForm.document,
          notes:     newForm.notes,
          person_type:       newForm.person_type === '' ? null : newForm.person_type,
          legal_name:        newForm.legal_name,
          trade_name:        newForm.trade_name,
          document_cpf:      newForm.document_cpf,
          document_cnpj:     newForm.document_cnpj,
          address_line:      newForm.address_line,
          address_city:      newForm.address_city,
          address_state:     newForm.address_state,
          address_zip:       newForm.address_zip,
          segment:           newForm.segment,
          lead_source:       newForm.lead_source,
          payment_condition: newForm.payment_condition,
          responsible_name:  newForm.responsible_name,
          responsible_role:  newForm.responsible_role,
        })
        if (upd.success) {
          finalClient = upd.data
        } else {
          // cliente já foi criado, mas o enrich falhou — avisa mas segue
          setCreateError(upd.message ?? 'Cliente criado, mas alguns dados não foram salvos.')
        }
      }

      // 3) adiciona no topo (idempotência: se já tinha, substitui pelo final)
      setClients(prev => {
        const idx = prev.findIndex(c => c.id === finalClient.id)
        if (idx === -1) return [finalClient, ...prev]
        const next = [...prev]
        next[idx] = finalClient
        return next
      })
      setOpenId(finalClient.id)
      setNewName('')
      setNewForm(EMPTY_CLIENT_FULL_FORM)
      setCreating(false)
      router.refresh()
    })
  }

  function cancelCreate() {
    setCreating(false)
    setNewName('')
    setNewForm(EMPTY_CLIENT_FULL_FORM)
    setCreateError(null)
  }

  function handleBulkDelete() {
    if (selected.size === 0) return
    const ids = [...selected]
    const prev = clients
    setClients(list => list.filter(c => !selected.has(c.id)))
    setSelected(new Set())
    setConfirming(false)

    startTransition(async () => {
      const res = await bulkDeleteClients(ids)
      if (!res.success) {
        setClients(prev)
        alert(res.message ?? 'Erro ao remover clientes.')
      } else {
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Busca + Novo cliente */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar cliente…"
          className="flex-1 bg-[#141414] border border-[#2a2a2a] rounded-xl px-4 py-2.5 text-sm text-white placeholder-[#525252] focus:outline-none focus:border-[#D4A853]/50 focus:ring-1 focus:ring-[#D4A853]/20 transition-colors"
        />
        {!creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="shrink-0 px-4 py-2.5 rounded-xl text-xs font-semibold bg-[#D4A853] hover:bg-[#E8C47A] text-[#0a0a0a] transition-colors"
          >
            + Novo cliente
          </button>
        )}
      </div>

      {/* Card de criação — ficha completa, só nome é obrigatório */}
      {creating && (
        <div className="rounded-2xl border border-[#D4A853]/30 bg-[#141414] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Novo cliente</h3>
            <span className="text-[10px] text-[#525252] uppercase tracking-wider">
              Só o nome é obrigatório · preencha o resto quando quiser
            </span>
          </div>

          <ClientFullForm
            value={newForm}
            onChange={setNewForm}
            disabled={isPending}
            name={newName}
            onNameChange={setNewName}
          />

          {createError && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {createError}
            </p>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleCreate}
              disabled={isPending || !newName.trim()}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#D4A853] hover:bg-[#E8C47A] text-[#0a0a0a] disabled:opacity-60 transition-colors"
            >
              {isPending ? 'Criando…' : 'Criar cliente'}
            </button>
            <button
              type="button"
              onClick={cancelCreate}
              disabled={isPending}
              className="px-4 py-2 rounded-xl text-xs font-medium text-[#a3a3a3] hover:text-white bg-[#1c1c1c] hover:bg-[#262626] border border-[#2a2a2a] transition-colors"
            >
              Cancelar
            </button>
            <span className="text-[11px] text-[#525252] ml-auto">
              Se o nome já existir, o cliente existente é reaproveitado.
            </span>
          </div>
        </div>
      )}

      {/* Toolbar (só aparece quando há clientes na listagem filtrada) */}
      {filtered.length > 0 && (
        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-xs text-[#a3a3a3] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allFilteredSelected}
              onChange={toggleAll}
              className="accent-[#D4A853] w-4 h-4"
            />
            {allFilteredSelected ? 'Desmarcar todos' : 'Selecionar todos'}
          </label>
          {someSelected && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#a3a3a3]">
                {selected.size} selecionado{selected.size !== 1 ? 's' : ''}
              </span>
              <button
                onClick={() => setConfirming(true)}
                disabled={isPending}
                className="flex items-center gap-1.5 text-xs font-semibold text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Excluir selecionados
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modal de confirmação */}
      {confirming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setConfirming(false)}
        >
          <div
            className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-6 max-w-sm w-full"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-white font-semibold mb-2">
              Remover {selected.size} cliente{selected.size !== 1 ? 's' : ''}?
            </h3>
            <p className="text-[#a3a3a3] text-sm mb-5">
              Os clientes saem da listagem e do autocomplete. Jobs e orçamentos
              existentes <strong>não</strong> serão excluídos — eles continuam
              referenciando o cliente removido.
            </p>
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => setConfirming(false)}
                className="text-sm text-[#a3a3a3] hover:text-white px-4 py-2 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={isPending}
                className="text-sm font-semibold text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                {isPending ? 'Processando…' : 'Remover'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-[#2a2a2a] bg-[#141414] p-8 text-center">
          <p className="text-sm text-[#737373]">
            {clients.length === 0
              ? 'Nenhum cliente ainda. Clique em “+ Novo cliente” ou cadastre um freelance/orçamento — o cliente nasce automaticamente.'
              : 'Nenhum cliente encontrado para essa busca.'}
          </p>
        </div>
      ) : (
        <ul className="rounded-2xl border border-[#2a2a2a] bg-[#141414] divide-y divide-[#1f1f1f] overflow-hidden">
          {filtered.map((client) => (
            <ClientRow
              key={client.id}
              client={client}
              isOpen={openId === client.id}
              isSelected={selected.has(client.id)}
              onSelectToggle={() => toggleOne(client.id)}
              onToggle={() => setOpenId(openId === client.id ? null : client.id)}
              onUpdated={handleUpdate}
              onDeleted={() => handleDelete(client.id)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Row + Editor ────────────────────────────────────────────────────────────

interface RowProps {
  client:          Client
  isOpen:          boolean
  isSelected:      boolean
  onSelectToggle:  () => void
  onToggle:        () => void
  onUpdated:       (c: Client) => void
  onDeleted:       () => void
}

function ClientRow({
  client,
  isOpen,
  isSelected,
  onSelectToggle,
  onToggle,
  onUpdated,
  onDeleted,
}: RowProps) {
  // Nome fica fora do `form` porque aqui ele É editável (renomear o cliente).
  // Em /freelances esse mesmo componente renderiza o nome como read-only.
  const [name, setName] = useState(client.name)

  const [form, setForm] = useState<ClientFullFormValue>({
    phone:     client.phone     ?? '',
    instagram: client.instagram ?? '',
    email:     client.email     ?? '',
    document:  client.document  ?? '',
    notes:     client.notes     ?? '',
    // ── Expandidos (opcionais) ──
    person_type:       (client.person_type ?? '') as '' | 'pf' | 'pj',
    legal_name:        client.legal_name        ?? '',
    trade_name:        client.trade_name        ?? '',
    document_cpf:      client.document_cpf      ?? '',
    document_cnpj:     client.document_cnpj     ?? '',
    address_line:      client.address_line      ?? '',
    address_city:      client.address_city      ?? '',
    address_state:     client.address_state     ?? '',
    address_zip:       client.address_zip       ?? '',
    segment:           client.segment           ?? '',
    lead_source:       client.lead_source       ?? '',
    payment_condition: client.payment_condition ?? '',
    responsible_name:  client.responsible_name  ?? '',
    responsible_role:  client.responsible_role  ?? '',
  })

  const [error,     setError]     = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    setError(null)
    startTransition(async () => {
      const res = await updateClient(client.id, {
        name,
        phone:     form.phone,
        instagram: form.instagram,
        email:     form.email,
        document:  form.document,
        notes:     form.notes,
        // Expandidos — mandamos só se mudou de string vazia ou tem valor
        person_type:       form.person_type === '' ? null : form.person_type,
        legal_name:        form.legal_name,
        trade_name:        form.trade_name,
        document_cpf:      form.document_cpf,
        document_cnpj:     form.document_cnpj,
        address_line:      form.address_line,
        address_city:      form.address_city,
        address_state:     form.address_state,
        address_zip:       form.address_zip,
        segment:           form.segment,
        lead_source:       form.lead_source,
        payment_condition: form.payment_condition,
        responsible_name:  form.responsible_name,
        responsible_role:  form.responsible_role,
      })
      if (res.success) {
        onUpdated(res.data)
      } else {
        setError(res.message)
      }
    })
  }

  function handleDelete() {
    if (!confirm(`Remover "${client.name}"? Jobs existentes não serão excluídos.`)) return
    startTransition(async () => {
      const res = await deleteClient(client.id)
      if (res.success) onDeleted()
      else setError(res.message ?? 'Erro ao remover.')
    })
  }

  return (
    <li className={isSelected ? 'bg-[#D4A853]/5' : ''}>
      {/* Cabeçalho da row (checkbox + título clicável) */}
      <div className="flex items-center gap-2 px-4 py-3 hover:bg-[#171717] transition-colors">
        <label
          className="shrink-0 cursor-pointer p-1 -m-1"
          onClick={e => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onSelectToggle}
            className="accent-[#D4A853] w-4 h-4 cursor-pointer"
          />
        </label>
        <button
          type="button"
          onClick={onToggle}
          className="flex-1 min-w-0 flex items-center justify-between text-left"
        >
          <div className="min-w-0">
            <p className="text-sm text-white truncate">{client.name}</p>
            <p className="text-[11px] text-[#525252] mt-0.5 truncate">
              {client.phone || client.email || client.instagram || 'Sem contato preenchido'}
            </p>
          </div>
          <svg
            className={`w-4 h-4 text-[#525252] shrink-0 transition-transform ml-2 ${isOpen ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Editor inline */}
      {isOpen && (
        <div className="px-4 pb-4 pt-1 bg-[#101010] border-t border-[#1f1f1f]">
          <ClientFullForm
            value={form}
            onChange={setForm}
            disabled={isPending}
            name={name}
            onNameChange={setName}
          />

          {/* Histórico — placeholder */}
          <div className="mt-4 p-3 rounded-xl border border-dashed border-[#2a2a2a] bg-[#0c0c0c]">
            <p className="text-[10px] font-bold tracking-widest uppercase text-[#525252]">
              Histórico de jobs
            </p>
            <p className="text-xs text-[#525252] mt-1">
              Em breve — lista de jobs vinculados a este cliente e métricas de
              receita, margem e última atividade.
            </p>
          </div>

          {error && (
            <p className="mt-3 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex items-center gap-2 mt-4">
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#D4A853] hover:bg-[#E8C47A] text-[#0a0a0a] disabled:opacity-60 transition-colors"
            >
              {isPending ? 'Salvando…' : 'Salvar'}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              className="px-4 py-2 rounded-xl text-xs font-medium text-[#a3a3a3] hover:text-red-400 bg-[#1c1c1c] hover:bg-[#262626] border border-[#2a2a2a] disabled:opacity-60 transition-colors"
            >
              Remover
            </button>
          </div>
        </div>
      )}
    </li>
  )
}
