'use client'

import { Fragment, useMemo, useState } from 'react'

type Status = 'pending' | 'doing' | 'blocked' | 'validating' | 'done' | 'cancelled'
type Priority = 'P0' | 'P1' | 'P2' | 'P3'

interface Task {
  id: string
  epic_code: string
  title: string
  description_simple: string | null
  description_technical: string | null
  area: string
  priority: Priority
  status: Status
  result: string | null
  blocker: string | null
  next_step: string | null
  notes: string | null
  parent_task_id: string | null
  auto_created: boolean
  started_at: string | null
  finished_at: string | null
  created_at: string
  updated_at: string
}

const STATUS_LABEL: Record<Status, string> = {
  pending: 'Pendente',
  doing: 'Em andamento',
  blocked: 'Bloqueado',
  validating: 'Em validação',
  done: 'Concluído',
  cancelled: 'Cancelado',
}

const STATUS_COLOR: Record<Status, string> = {
  pending: 'bg-[#1a1a1a] text-[#a3a3a3] border-[#2a2a2a]',
  doing: 'bg-[#D4A853]/15 text-[#D4A853] border-[#D4A853]/40',
  blocked: 'bg-red-500/15 text-red-400 border-red-500/40',
  validating: 'bg-blue-500/15 text-blue-400 border-blue-500/40',
  done: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40',
  cancelled: 'bg-[#1a1a1a] text-[#525252] border-[#2a2a2a] line-through',
}

const PRIORITY_COLOR: Record<Priority, string> = {
  P0: 'bg-red-500/15 text-red-400 border-red-500/40',
  P1: 'bg-amber-500/15 text-amber-400 border-amber-500/40',
  P2: 'bg-blue-500/15 text-blue-400 border-blue-500/40',
  P3: 'bg-[#1a1a1a] text-[#737373] border-[#2a2a2a]',
}

const AREA_EMOJI: Record<string, string> = {
  database: '🗄️',
  backend: '⚙️',
  frontend: '🎨',
  devops: '🛠️',
  stripe: '💳',
  ia: '🤖',
  produto: '📋',
}

function formatDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

function durationLabel(start: string | null, finish: string | null) {
  if (!start) return '—'
  const end = finish ? new Date(finish) : new Date()
  const minutes = Math.round((end.getTime() - new Date(start).getTime()) / 60000)
  if (minutes < 60) return `${minutes} min`
  if (minutes < 1440) return `${Math.round(minutes / 60 * 10) / 10} h`
  return `${Math.round(minutes / 1440 * 10) / 10} d`
}

interface Props {
  initialTasks: Task[]
  loadError: string | null
}

export default function PlanoImplementacaoClient({ initialTasks, loadError }: Props) {
  const [tasks] = useState(initialTasks)
  const [filterStatus, setFilterStatus] = useState<Status | 'all'>('all')
  const [filterPriority, setFilterPriority] = useState<Priority | 'all'>('all')
  const [filterArea, setFilterArea] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const stats = useMemo(() => {
    const byStatus = tasks.reduce<Record<string, number>>((acc, t) => {
      acc[t.status] = (acc[t.status] || 0) + 1
      return acc
    }, {})
    const total = tasks.length
    const done = byStatus.done || 0
    const doing = byStatus.doing || 0
    const blocked = byStatus.blocked || 0
    const pending = byStatus.pending || 0
    const pct = total > 0 ? Math.round((done / total) * 100) : 0
    return { total, done, doing, blocked, pending, pct }
  }, [tasks])

  const areas = useMemo(() => {
    const set = new Set(tasks.map(t => t.area))
    return Array.from(set).sort()
  }, [tasks])

  const filtered = useMemo(() => {
    return tasks.filter(t => {
      if (filterStatus !== 'all' && t.status !== filterStatus) return false
      if (filterPriority !== 'all' && t.priority !== filterPriority) return false
      if (filterArea !== 'all' && t.area !== filterArea) return false
      if (search) {
        const s = search.toLowerCase()
        const blob = `${t.epic_code} ${t.title} ${t.description_simple ?? ''} ${t.area}`.toLowerCase()
        if (!blob.includes(s)) return false
      }
      return true
    })
  }, [tasks, filterStatus, filterPriority, filterArea, search])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Plano de Implementação</h1>
        <p className="text-sm text-[#a3a3a3] mt-1">
          Centro de controle da V2. Cada linha é uma etapa do plano. Decisões travadas: arquitetura A.3+A.1 progressiva · Trial 7d com cartão · planos Creator + Enterprise · 1 banco Supabase · RLS por workspace_id.
        </p>
      </div>

      {/* Erro de carga */}
      {loadError && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-400">
          <strong>Erro ao carregar tasks:</strong> {loadError}
          <p className="mt-2 text-xs text-red-300/80">
            Provavelmente a migration <code>20260425200000_v2_implementation_tasks.sql</code> ainda não foi aplicada.
            Rode <code>npm run db:push</code> e recarregue.
          </p>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Stat label="Total" value={stats.total} />
        <Stat label="Pendentes" value={stats.pending} accent="text-[#a3a3a3]" />
        <Stat label="Em andamento" value={stats.doing} accent="text-[#D4A853]" />
        <Stat label="Bloqueados" value={stats.blocked} accent="text-red-400" />
        <Stat label="Concluídos" value={stats.done} accent="text-emerald-400" extra={`${stats.pct}%`} />
      </div>

      {/* Barra de progresso */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-[#a3a3a3]">
          <span>Progresso geral</span>
          <span>{stats.done} de {stats.total} concluídos</span>
        </div>
        <div className="h-2 bg-[#1a1a1a] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-[#D4A853] transition-all"
            style={{ width: `${stats.pct}%` }}
          />
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="text"
          placeholder="Buscar por título, epic, descrição…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-md px-3 py-1.5 text-xs text-white placeholder:text-[#525252] focus:outline-none focus:border-[#D4A853]/60 min-w-[260px]"
        />
        <Select label="Status" value={filterStatus} onChange={v => setFilterStatus(v as Status | 'all')}
          options={[
            ['all', 'Todos status'],
            ['pending', 'Pendente'],
            ['doing', 'Em andamento'],
            ['blocked', 'Bloqueado'],
            ['validating', 'Em validação'],
            ['done', 'Concluído'],
            ['cancelled', 'Cancelado'],
          ]}
        />
        <Select label="Prioridade" value={filterPriority} onChange={v => setFilterPriority(v as Priority | 'all')}
          options={[
            ['all', 'Todas prioridades'],
            ['P0', 'P0 — Essencial'],
            ['P1', 'P1 — Muito importante'],
            ['P2', 'P2 — Boa'],
            ['P3', 'P3 — Futuro'],
          ]}
        />
        <Select label="Área" value={filterArea} onChange={setFilterArea}
          options={[['all', 'Todas áreas'], ...areas.map(a => [a, a] as [string, string])]}
        />
        <span className="text-xs text-[#737373] ml-auto">
          {filtered.length} {filtered.length === 1 ? 'task visível' : 'tasks visíveis'}
        </span>
      </div>

      {/* Tabela */}
      <div className="border border-[#1a1a1a] rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#0d0d0d] text-[10px] uppercase tracking-wider text-[#737373]">
            <tr>
              <th className="px-3 py-2.5 text-left">Epic</th>
              <th className="px-3 py-2.5 text-left">Pri</th>
              <th className="px-3 py-2.5 text-left">Área</th>
              <th className="px-3 py-2.5 text-left">Título</th>
              <th className="px-3 py-2.5 text-left">Status</th>
              <th className="px-3 py-2.5 text-left">Início</th>
              <th className="px-3 py-2.5 text-left">Duração</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-12 text-center text-[#525252]">
                  Nenhuma task corresponde aos filtros.
                </td>
              </tr>
            )}
            {filtered.map(t => {
              const isExpanded = expandedId === t.id
              return (
                <Fragment key={t.id}>
                  <tr
                    onClick={() => setExpandedId(isExpanded ? null : t.id)}
                    className="border-t border-[#1a1a1a] hover:bg-[#0d0d0d]/60 cursor-pointer transition-colors"
                  >
                    <td className="px-3 py-2.5 font-mono text-[11px] text-[#D4A853]">{t.epic_code}</td>
                    <td className="px-3 py-2.5">
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded border ${PRIORITY_COLOR[t.priority]}`}>
                        {t.priority}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-[#a3a3a3]">
                      <span className="mr-1">{AREA_EMOJI[t.area] ?? ''}</span>
                      {t.area}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-white">{t.title}</div>
                      {!isExpanded && t.description_simple && (
                        <div className="text-xs text-[#737373] mt-0.5 line-clamp-1">{t.description_simple}</div>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`px-2 py-0.5 text-[10px] font-medium rounded border ${STATUS_COLOR[t.status]}`}>
                        {STATUS_LABEL[t.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-[#737373]">{formatDate(t.started_at)}</td>
                    <td className="px-3 py-2.5 text-xs text-[#737373]">{durationLabel(t.started_at, t.finished_at)}</td>
                  </tr>
                  {isExpanded && (
                    <tr className="border-t border-[#1a1a1a] bg-[#0a0a0a]">
                      <td colSpan={7} className="px-6 py-4 space-y-3">
                        {t.description_simple && (
                          <Field label="O que é (em linguagem simples)">{t.description_simple}</Field>
                        )}
                        {t.description_technical && (
                          <Field label="Detalhe técnico">{t.description_technical}</Field>
                        )}
                        {t.next_step && <Field label="Próximo passo">{t.next_step}</Field>}
                        {t.blocker && <Field label="Bloqueio" accent="text-red-400">{t.blocker}</Field>}
                        {t.notes && <Field label="Observações">{t.notes}</Field>}
                        {t.result && <Field label="Resultado">{t.result}</Field>}
                        <div className="grid grid-cols-2 gap-3 text-xs text-[#737373] pt-2 border-t border-[#1a1a1a]">
                          <div>Início: <span className="text-[#a3a3a3]">{formatDate(t.started_at)}</span></div>
                          <div>Fim: <span className="text-[#a3a3a3]">{formatDate(t.finished_at)}</span></div>
                          <div>Criado: <span className="text-[#a3a3a3]">{formatDate(t.created_at)}</span></div>
                          <div>Atualizado: <span className="text-[#a3a3a3]">{formatDate(t.updated_at)}</span></div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Rodapé com dica */}
      <p className="text-xs text-[#525252]">
        Clique numa linha para ver detalhes. Atualização de status virá na próxima etapa (server actions).
      </p>
    </div>
  )
}

function Stat({ label, value, accent, extra }: { label: string, value: number, accent?: string, extra?: string }) {
  return (
    <div className="border border-[#1a1a1a] rounded-md p-3 bg-[#0d0d0d]">
      <div className={`text-2xl font-bold tracking-tight ${accent ?? 'text-white'}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-[#737373] mt-1">
        {label}
        {extra && <span className="ml-1 text-[#a3a3a3]">· {extra}</span>}
      </div>
    </div>
  )
}

function Select({ label, value, onChange, options }: {
  label: string
  value: string
  onChange: (v: string) => void
  options: Array<[string, string]>
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={e => onChange(e.target.value)}
      className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-md px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#D4A853]/60"
    >
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  )
}

function Field({ label, children, accent }: { label: string, children: React.ReactNode, accent?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[#737373] mb-1">{label}</div>
      <div className={`text-sm whitespace-pre-wrap ${accent ?? 'text-[#e5e5e5]'}`}>{children}</div>
    </div>
  )
}
