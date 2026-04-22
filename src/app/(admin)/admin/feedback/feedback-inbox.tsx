'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { Feedback, FeedbackStatus } from '@/types/feedback'

const STATUSES: Array<FeedbackStatus | 'todos'> = [
  'todos', 'novo', 'triagem', 'planejado', 'em_andamento', 'resolvido', 'descartado',
]

const SEVERITIES = ['todas', 'critica', 'alta', 'media', 'baixa'] as const

export default function FeedbackInbox({ items }: { items: Feedback[] }) {
  const [status, setStatus]     = useState<FeedbackStatus | 'todos'>('todos')
  const [severity, setSeverity] = useState<string>('todas')
  const [search, setSearch]     = useState('')
  const [sortBy, setSortBy]     = useState<'recent' | 'priority'>('recent')
  const [hasFilter, setHasFilter] = useState<'all' | 'attachment' | 'audio' | 'text'>('all')

  const filtered = useMemo(() => {
    let out = items
    if (status !== 'todos')       out = out.filter(i => i.status === status)
    if (severity !== 'todas')     out = out.filter(i => i.severity === severity)
    if (hasFilter === 'attachment') out = out.filter(i => !!i.attachment_path)
    if (hasFilter === 'audio')     out = out.filter(i => !!i.audio_path)
    if (hasFilter === 'text')      out = out.filter(i => !!i.raw_text && i.raw_text.trim().length > 0)
    if (search.trim()) {
      const s = search.trim().toLowerCase()
      out = out.filter(i =>
        (i.raw_text ?? '').toLowerCase().includes(s) ||
        (i.transcript ?? '').toLowerCase().includes(s) ||
        (i.summary ?? '').toLowerCase().includes(s) ||
        (i.email ?? '').toLowerCase().includes(s) ||
        (i.tags ?? []).some(t => t.toLowerCase().includes(s))
      )
    }

    const sorted = [...out]
    if (sortBy === 'priority') {
      sorted.sort((a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0))
    } else {
      sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    }
    return sorted
  }, [items, status, severity, search, sortBy, hasFilter])

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="rounded-lg border border-[#1a1a1a] bg-[#0d0d0d] p-3 flex gap-3 flex-wrap items-center">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar texto, resumo, email, tag…"
          className="flex-1 min-w-[200px] bg-[#0a0a0a] border border-[#2a2a2a] rounded-md px-3 py-1.5 text-xs text-white placeholder:text-[#525252] focus:border-[#D4A853] focus:outline-none"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as FeedbackStatus | 'todos')}
          className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-md px-2 py-1.5 text-xs text-white"
        >
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
          className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-md px-2 py-1.5 text-xs text-white"
        >
          {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={hasFilter}
          onChange={(e) => setHasFilter(e.target.value as 'all' | 'attachment' | 'audio' | 'text')}
          className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-md px-2 py-1.5 text-xs text-white"
          title="Filtrar por conteúdo"
        >
          <option value="all">Todos conteúdos</option>
          <option value="attachment">📎 Com anexo</option>
          <option value="audio">🎤 Com áudio</option>
          <option value="text">✍️ Só texto</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'recent' | 'priority')}
          className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-md px-2 py-1.5 text-xs text-white"
        >
          <option value="recent">Mais recentes</option>
          <option value="priority">Prioridade</option>
        </select>
        <span className="text-[11px] text-[#525252] ml-auto">{filtered.length} resultado{filtered.length === 1 ? '' : 's'}</span>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-[#1a1a1a] bg-[#0d0d0d] p-10 text-center text-sm text-[#525252]">
          Nenhum feedback encontrado com esses filtros.
        </div>
      ) : (
        <div className="rounded-lg border border-[#1a1a1a] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#111] text-[10px] uppercase tracking-wider text-[#737373]">
              <tr>
                <th className="text-left px-3 py-2.5 font-medium">Data</th>
                <th className="text-left px-3 py-2.5 font-medium">Resumo</th>
                <th className="text-left px-3 py-2.5 font-medium">Tipo</th>
                <th className="text-left px-3 py-2.5 font-medium">Severidade</th>
                <th className="text-right px-3 py-2.5 font-medium">Prioridade</th>
                <th className="text-left px-3 py-2.5 font-medium">Status</th>
                <th className="text-left px-3 py-2.5 font-medium">Origem</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(i => (
                <tr key={i.id} className="border-t border-[#1a1a1a] hover:bg-[#0d0d0d]">
                  <td className="px-3 py-2.5 text-[11px] text-[#737373] whitespace-nowrap">
                    {new Date(i.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td className="px-3 py-2.5 max-w-[320px]">
                    <Link
                      href={`/admin/feedback/${i.id}`}
                      className="block text-xs text-white hover:text-[#D4A853] truncate"
                      title={i.summary ?? i.raw_text ?? ''}
                    >
                      {i.summary || (i.raw_text ?? '').slice(0, 90) || (i.transcript ?? '').slice(0, 90) || '(sem texto)'}
                    </Link>
                    <div className="mt-0.5 flex gap-1 flex-wrap">
                      {i.audio_path && (
                        <span className="text-[9px] uppercase tracking-wider text-[#D4A853]/70 inline-block">
                          🎤 áudio
                        </span>
                      )}
                      {i.attachment_path && (
                        <span
                          className="text-[9px] uppercase tracking-wider text-[#D4A853]/70 inline-block"
                          title={i.attachment_filename ?? 'anexo'}
                        >
                          📎 anexo
                        </span>
                      )}
                      {i.raw_text && i.raw_text.trim().length > 0 && !i.audio_path && (
                        <span className="text-[9px] uppercase tracking-wider text-[#525252] inline-block">
                          ✍️ texto
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <TypeBadge type={i.ai_type ?? i.user_type ?? null} />
                  </td>
                  <td className="px-3 py-2.5">
                    <SeverityBadge sev={i.severity} />
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs tabular-nums text-[#a3a3a3]">
                    {i.priority_score ?? '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusBadge status={i.status} />
                  </td>
                  <td className="px-3 py-2.5 text-[11px] text-[#a3a3a3]">
                    {i.source === 'admin_manual' ? 'admin' : (i.email?.split('@')[0] ?? 'user')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function TypeBadge({ type }: { type: string | null }) {
  if (!type) return <span className="text-[#525252] text-xs">—</span>
  const map: Record<string, string> = {
    bug:         'bg-red-500/10 text-red-400',
    ux:          'bg-amber-500/10 text-amber-400',
    melhoria:    'bg-emerald-500/10 text-emerald-400',
    duvida:      'bg-blue-500/10 text-blue-400',
    elogio:      'bg-pink-500/10 text-pink-400',
    irrelevante: 'bg-zinc-500/10 text-zinc-400',
    outro:       'bg-zinc-500/10 text-zinc-400',
  }
  return (
    <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${map[type] ?? 'bg-zinc-500/10 text-zinc-400'}`}>
      {type}
    </span>
  )
}

function SeverityBadge({ sev }: { sev: string | null }) {
  if (!sev) return <span className="text-[#525252] text-xs">—</span>
  const map: Record<string, string> = {
    critica: 'bg-red-500/20 text-red-300',
    alta:    'bg-orange-500/15 text-orange-300',
    media:   'bg-yellow-500/10 text-yellow-300',
    baixa:   'bg-zinc-500/10 text-zinc-400',
  }
  return (
    <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${map[sev] ?? 'bg-zinc-500/10 text-zinc-400'}`}>
      {sev}
    </span>
  )
}

function StatusBadge({ status }: { status: FeedbackStatus }) {
  const map: Record<FeedbackStatus, string> = {
    novo:         'bg-[#D4A853]/10 text-[#D4A853]',
    triagem:      'bg-blue-500/10 text-blue-400',
    planejado:    'bg-violet-500/10 text-violet-400',
    em_andamento: 'bg-amber-500/10 text-amber-400',
    resolvido:    'bg-emerald-500/10 text-emerald-400',
    descartado:   'bg-zinc-500/10 text-zinc-400',
  }
  return (
    <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${map[status]}`}>
      {status.replace('_', ' ')}
    </span>
  )
}
