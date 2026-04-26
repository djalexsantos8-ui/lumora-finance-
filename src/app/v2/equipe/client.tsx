'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createInvite, removeMember, revokeInvite } from './actions'

interface Member {
  id:          string
  user_id:     string | null
  email:       string
  role:        string
  status:      string
  invited_at:  string
  joined_at:   string | null
}

interface Invite {
  id:          string
  email:       string
  role:        string
  token:       string
  invited_at:  string
  expires_at:  string
  accepted_at: string | null
  revoked_at:  string | null
  message:     string | null
}

interface Props {
  members:     Member[]
  invites:     Invite[]
  myUserId:    string
  isOwner:     boolean
  seatsUsed:   number
  seatsLimit:  number
  baseUrl:     string
}

export default function EquipeClient({
  members, invites: initialInvites, myUserId, isOwner, seatsUsed, seatsLimit, baseUrl,
}: Props) {
  const router = useRouter()
  const [invites, setInvites] = useState<Invite[]>(initialInvites)
  const [pending, startTx]    = useTransition()
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [emailInput, setEmailInput] = useState('')
  const [messageInput, setMessageInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [linkCopiada, setLinkCopiada] = useState<string | null>(null)

  const seatsAvailable = seatsLimit - seatsUsed
  const canInvite = isOwner && seatsAvailable > 0

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!emailInput.trim()) return

    startTx(async () => {
      const r = await createInvite({
        email:   emailInput.trim(),
        role:    'member',
        message: messageInput.trim() || null,
      })

      if (!r.ok) {
        if (r.error === 'seat_limit_reached') {
          setError('Limite de vagas atingido. Faça upgrade pra Enterprise pra adicionar mais membros.')
        } else if (r.error === 'invite_already_exists') {
          setError('Já existe um convite pendente pra esse email.')
        } else if (r.error === 'already_member') {
          setError('Esse email já é membro do workspace.')
        } else if (r.error === 'invalid_email') {
          setError('Email inválido.')
        } else {
          setError(`Erro: ${r.error}`)
        }
        return
      }

      // Adiciona à lista local + mostra link
      const newInvite: Invite = {
        id:          r.data!.id,
        email:       emailInput.trim().toLowerCase(),
        role:        'member',
        token:       r.data!.token,
        invited_at:  new Date().toISOString(),
        expires_at:  new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        accepted_at: null,
        revoked_at:  null,
        message:     messageInput.trim() || null,
      }
      setInvites((prev) => [newInvite, ...prev])
      setEmailInput('')
      setMessageInput('')
      setShowInviteForm(false)

      // Copia link automaticamente pra clipboard
      const link = `${baseUrl}/aceitar-convite/${r.data!.token}`
      try {
        await navigator.clipboard.writeText(link)
        setLinkCopiada(link)
        setTimeout(() => setLinkCopiada(null), 4000)
      } catch {
        // Sem clipboard? Mostra modal/alert
        alert(`Convite criado. Copie o link:\n\n${link}`)
      }
    })
  }

  async function handleRevoke(inviteId: string) {
    if (!confirm('Revogar esse convite? O link deixa de funcionar.')) return
    startTx(async () => {
      const r = await revokeInvite(inviteId)
      if (r.ok) {
        setInvites((prev) => prev.filter((i) => i.id !== inviteId))
      } else {
        alert(`Erro: ${r.error}`)
      }
    })
  }

  async function handleRemove(memberUserId: string, memberEmail: string) {
    if (!confirm(`Remover ${memberEmail} do workspace?`)) return
    startTx(async () => {
      const r = await removeMember(memberUserId)
      if (r.ok) {
        router.refresh()
      } else {
        alert(`Erro: ${r.error}`)
      }
    })
  }

  function copyLink(token: string) {
    const link = `${baseUrl}/aceitar-convite/${token}`
    navigator.clipboard.writeText(link).then(() => {
      setLinkCopiada(link)
      setTimeout(() => setLinkCopiada(null), 3000)
    }).catch(() => {
      alert(`Link:\n\n${link}`)
    })
  }

  return (
    <div className="space-y-6">
      {/* Banner link copiado */}
      {linkCopiada && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm">
          <div className="font-semibold text-emerald-300">✓ Link copiado pra área de transferência</div>
          <div className="mt-1 break-all text-[10px] text-emerald-300/70 font-mono">{linkCopiada}</div>
          <p className="mt-2 text-xs text-emerald-300/70">
            Cole no WhatsApp/Email do convidado. Link expira em 7 dias.
          </p>
        </div>
      )}

      {/* Botão convidar / form */}
      {canInvite ? (
        <div>
          {!showInviteForm ? (
            <button
              type="button"
              onClick={() => setShowInviteForm(true)}
              className="rounded-md bg-[#D4A853] px-4 py-2 text-sm font-semibold text-black hover:bg-[#e0b95f]"
            >
              + Convidar membro
            </button>
          ) : (
            <form onSubmit={handleInvite} className="rounded-xl border border-[#1f1f1f] bg-[#0d0d0d] p-5 space-y-4">
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-[#737373]">
                  Email do convidado
                </label>
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  required
                  placeholder="email@dominio.com"
                  className="w-full rounded-md border border-[#2a2a2a] bg-[#111] px-3 py-2 text-sm text-white placeholder-[#525252] focus:border-[#D4A853] focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-[#737373]">
                  Mensagem (opcional)
                </label>
                <textarea
                  rows={2}
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  placeholder="Te convido pra equipe da Aurora Films..."
                  className="w-full rounded-md border border-[#2a2a2a] bg-[#111] px-3 py-2 text-sm text-white placeholder-[#525252] focus:border-[#D4A853] focus:outline-none"
                />
              </div>

              {error ? (
                <div className="rounded border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-300">
                  {error}
                </div>
              ) : null}

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-md bg-[#D4A853] px-4 py-2 text-sm font-semibold text-black hover:bg-[#e0b95f] disabled:opacity-50"
                >
                  {pending ? 'Criando…' : 'Gerar link de convite'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowInviteForm(false); setEmailInput(''); setMessageInput(''); setError(null) }}
                  className="text-sm text-[#737373] hover:text-white"
                >
                  Cancelar
                </button>
              </div>

              <p className="text-[10px] text-[#525252]">
                Após criar, o link é copiado automaticamente. Envie pelo WhatsApp ou email.
                Email automático via Resend ainda não está ativo nesse ambiente — V2.1.
              </p>
            </form>
          )}
        </div>
      ) : null}

      {/* Membros ativos */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#a3a3a3]">
          Membros ({members.filter((m) => m.status === 'active').length})
        </h2>
        <div className="overflow-hidden rounded-xl border border-[#1f1f1f] bg-[#0d0d0d]">
          <table className="w-full text-sm">
            <thead className="border-b border-[#1f1f1f] bg-[#111] text-xs uppercase tracking-wider text-[#737373]">
              <tr>
                <th className="px-4 py-2 text-left">Email</th>
                <th className="px-4 py-2 text-left">Papel</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Entrou em</th>
                <th className="px-4 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {members.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-xs text-[#525252]">
                    Nenhum membro ainda.
                  </td>
                </tr>
              ) : (
                members.map((m) => {
                  const isMe = m.user_id === myUserId
                  const isOwnerRow = m.role === 'owner'
                  return (
                    <tr key={m.id} className="border-b border-[#1f1f1f] last:border-0 hover:bg-[#111]">
                      <td className="px-4 py-2.5 text-white">
                        {m.email}
                        {isMe ? <span className="ml-2 text-[10px] text-[#737373]">(você)</span> : null}
                      </td>
                      <td className="px-4 py-2.5">
                        <RoleBadge role={m.role} />
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge status={m.status} />
                      </td>
                      <td className="px-4 py-2.5 text-xs text-[#737373]">
                        {m.joined_at ? fmtDate(m.joined_at) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {isOwner && !isMe && !isOwnerRow && m.user_id ? (
                          <button
                            type="button"
                            onClick={() => handleRemove(m.user_id!, m.email)}
                            className="text-[10px] text-[#737373] hover:text-red-400"
                          >
                            Remover
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Convites pendentes */}
      {invites.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#a3a3a3]">
            Convites pendentes ({invites.length})
          </h2>
          <div className="overflow-hidden rounded-xl border border-[#1f1f1f] bg-[#0d0d0d]">
            <table className="w-full text-sm">
              <thead className="border-b border-[#1f1f1f] bg-[#111] text-xs uppercase tracking-wider text-[#737373]">
                <tr>
                  <th className="px-4 py-2 text-left">Email</th>
                  <th className="px-4 py-2 text-left">Enviado em</th>
                  <th className="px-4 py-2 text-left">Expira em</th>
                  <th className="px-4 py-2 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {invites.map((inv) => {
                  const expiresIn = Math.ceil(
                    (new Date(inv.expires_at).getTime() - Date.now()) / (24 * 60 * 60 * 1000)
                  )
                  return (
                    <tr key={inv.id} className="border-b border-[#1f1f1f] last:border-0 hover:bg-[#111]">
                      <td className="px-4 py-2.5 text-white">{inv.email}</td>
                      <td className="px-4 py-2.5 text-xs text-[#737373]">{fmtDate(inv.invited_at)}</td>
                      <td className="px-4 py-2.5 text-xs">
                        {expiresIn > 0 ? (
                          <span className="text-[#a3a3a3]">{expiresIn} dia{expiresIn === 1 ? '' : 's'}</span>
                        ) : (
                          <span className="text-red-400">expirado</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {isOwner ? (
                          <div className="flex items-center justify-end gap-3 text-[10px]">
                            <button
                              type="button"
                              onClick={() => copyLink(inv.token)}
                              className="text-[#D4A853] hover:underline"
                            >
                              Copiar link
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRevoke(inv.id)}
                              className="text-[#737373] hover:text-red-400"
                            >
                              Revogar
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}

function RoleBadge({ role }: { role: string }) {
  const map: Record<string, { color: string; label: string }> = {
    owner:  { color: 'bg-[#D4A853]/15 text-[#D4A853] border-[#D4A853]/30', label: 'Owner' },
    admin:  { color: 'bg-violet-500/10 text-violet-300 border-violet-500/30', label: 'Admin' },
    editor: { color: 'bg-blue-500/10 text-blue-300 border-blue-500/30',     label: 'Editor' },
    viewer: { color: 'bg-[#1f1f1f] text-[#a3a3a3] border-[#2a2a2a]',        label: 'Viewer' },
    member: { color: 'bg-[#1f1f1f] text-[#a3a3a3] border-[#2a2a2a]',        label: 'Membro' },
  }
  const r = map[role] ?? map.member
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${r.color}`}>
      {r.label}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string }> = {
    active:  { color: 'text-emerald-400',  label: 'Ativo' },
    pending: { color: 'text-amber-400',    label: 'Pendente' },
  }
  const s = map[status] ?? { color: 'text-[#737373]', label: status }
  return <span className={`text-xs ${s.color}`}>{s.label}</span>
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
  } catch {
    return iso
  }
}
