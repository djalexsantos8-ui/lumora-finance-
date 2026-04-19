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
import { updateClient, deleteClient } from '@/lib/actions/clients'
import { normalizeName } from '@/lib/utils/normalize-name'
import type { Client } from '@/types/client'
import {
  ClientFullForm,
  type ClientFullFormValue,
} from '@/components/clients/client-full-form'

interface Props {
  initialClients: Client[]
}

export function ClientesClient({ initialClients }: Props) {
  const [clients, setClients] = useState<Client[]>(initialClients)
  const [query, setQuery]     = useState('')
  const [openId, setOpenId]   = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = normalizeName(query)
    if (!q) return clients
    return clients.filter(c => c.name_normalized.includes(q))
  }, [clients, query])

  function handleUpdate(updated: Client) {
    setClients(prev => prev.map(c => c.id === updated.id ? updated : c))
  }

  function handleDelete(id: string) {
    setClients(prev => prev.filter(c => c.id !== id))
    setOpenId(null)
  }

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Busca */}
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar cliente…"
          className="w-full bg-[#141414] border border-[#2a2a2a] rounded-xl px-4 py-2.5 text-sm text-white placeholder-[#525252] focus:outline-none focus:border-[#D4A853]/50 focus:ring-1 focus:ring-[#D4A853]/20 transition-colors"
        />
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-[#2a2a2a] bg-[#141414] p-8 text-center">
          <p className="text-sm text-[#737373]">
            {clients.length === 0
              ? 'Nenhum cliente ainda. Eles aparecem aqui automaticamente quando você cadastra um job.'
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
  client:     Client
  isOpen:     boolean
  onToggle:   () => void
  onUpdated:  (c: Client) => void
  onDeleted:  () => void
}

function ClientRow({ client, isOpen, onToggle, onUpdated, onDeleted }: RowProps) {
  // Nome fica fora do `form` porque aqui ele É editável (renomear o cliente).
  // Em /freelances esse mesmo componente renderiza o nome como read-only.
  const [name, setName] = useState(client.name)

  const [form, setForm] = useState<ClientFullFormValue>({
    phone:     client.phone     ?? '',
    instagram: client.instagram ?? '',
    email:     client.email     ?? '',
    document:  client.document  ?? '',
    notes:     client.notes     ?? '',
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
    <li>
      {/* Cabeçalho da row (clicável) */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[#171717] transition-colors"
      >
        <div className="min-w-0">
          <p className="text-sm text-white truncate">{client.name}</p>
          <p className="text-[11px] text-[#525252] mt-0.5 truncate">
            {client.phone || client.email || client.instagram || 'Sem contato preenchido'}
          </p>
        </div>
        <svg
          className={`w-4 h-4 text-[#525252] shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

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
