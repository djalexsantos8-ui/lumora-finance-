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

'use client'

import { useMemo, useState, useTransition } from 'react'
import { updateClient, deleteClient } from '@/lib/actions/clients'
import { normalizeName } from '@/lib/utils/normalize-name'
import type { Client } from '@/types/client'

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
  const [name,      setName]      = useState(client.name)
  const [phone,     setPhone]     = useState(client.phone     ?? '')
  const [instagram, setInstagram] = useState(client.instagram ?? '')
  const [email,     setEmail]     = useState(client.email     ?? '')
  const [document,  setDocument]  = useState(client.document  ?? '')
  const [notes,     setNotes]     = useState(client.notes     ?? '')

  const [error,     setError]     = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    setError(null)
    startTransition(async () => {
      const res = await updateClient(client.id, {
        name,
        phone,
        instagram,
        email,
        document,
        notes,
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3">
            <Field label="Nome" value={name} onChange={setName} required />
            <Field label="Telefone" value={phone} onChange={setPhone} placeholder="(11) 99999-9999" />
            <Field label="Instagram" value={instagram} onChange={setInstagram} placeholder="@handle" />
            <Field label="Email" value={email} onChange={setEmail} placeholder="email@exemplo.com" />
            <Field label="Documento" value={document} onChange={setDocument} placeholder="CPF/CNPJ" />
          </div>

          <div className="mt-3">
            <label className="block text-[10px] font-semibold text-[#525252] tracking-widest mb-2">
              NOTAS
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Referência interna, estilo de contrato, preferências…"
              className="w-full bg-[#1c1c1c] border border-[#2a2a2a] rounded-xl px-3 py-2 text-sm text-white placeholder-[#525252] focus:outline-none focus:border-[#D4A853]/50 focus:ring-1 focus:ring-[#D4A853]/20 transition-colors resize-none"
            />
          </div>

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

// ─── Campo simples ───────────────────────────────────────────────────────────

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label:       string
  value:       string
  onChange:    (v: string) => void
  placeholder?: string
  required?:   boolean
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
        className="w-full bg-[#1c1c1c] border border-[#2a2a2a] rounded-xl px-3 py-2 text-sm text-white placeholder-[#525252] focus:outline-none focus:border-[#D4A853]/50 focus:ring-1 focus:ring-[#D4A853]/20 transition-colors"
      />
    </div>
  )
}
