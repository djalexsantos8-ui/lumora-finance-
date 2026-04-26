'use client'

import { Fragment, useMemo, useState, useTransition } from 'react'
import {
  startTask, completeTask, blockTask, cancelTask, reopenTask,
  queueForClaude, unqueueFromClaude, createTask, updateNotes,
} from './actions'

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
  result_notes: string | null
  blocker: string | null
  next_step: string | null
  notes: string | null
  parent_task_id: string | null
  auto_created: boolean
  queued_for_claude: boolean
  last_action_by: string | null
  last_action_at: string | null
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

function fmtDate(s: string | null) {
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
  const [pending, startTransition] = useTransition()
  const [showNewTask, setShowNewTask] = useState(false)

  const stats = useMemo(() => {
    const byStatus = tasks.reduce<Record<string, number>>((acc, t) => {
      acc[t.status] = (acc[t.status] || 0) + 1
      return acc
    }, {})
    const total = tasks.length
    const done = byStatus.done || 0
    const doing = byStatus.doing || 0
    const blocked = byStatus.blocked || 0
    const pending_ = byStatus.pending || 0
    const queued = tasks.filter(t => t.queued_for_claude).length
    const pct = total > 0 ? Math.round((done / total) * 100) : 0
    return { total, done, doing, blocked, pending: pending_, queued, pct }
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
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Plano de Implementação</h1>
          <p className="text-sm text-[#a3a3a3] mt-1 max-w-2xl">
            Centro de controle da V2. Decisões travadas: arquitetura A.3+A.1 progressiva · Trial 7d com cartão · Creator + Enterprise · 1 banco Supabase · RLS por workspace_id.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowNewTask(true)}
          className="bg-[#D4A853] text-black font-semibold px-4 py-2 rounded-md text-sm hover:bg-[#e0b95f] transition shrink-0"
        >
          + Nova task
        </button>
      </div>

      {loadError && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-400">
          <strong>Erro ao carregar tasks:</strong> {loadError}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-3">
        <Stat label="Total" value={stats.total} />
        <Stat label="Pendentes" value={stats.pending} accent="text-[#a3a3a3]" />
        <Stat label="Em andamento" value={stats.doing} accent="text-[#D4A853]" />
        <Stat label="Bloqueados" value={stats.blocked} accent="text-red-400" />
        <Stat label="Concluídos" value={stats.done} accent="text-emerald-400" extra={`${stats.pct}%`} />
        <Stat label="Fila Claude" value={stats.queued} accent="text-purple-400" />
      </div>

      {/* Barra de progresso */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-[#a3a3a3]">
          <span>Progresso</span>
          <span>{stats.done} de {stats.total} · {stats.pct}%</span>
        </div>
        <div className="h-2 bg-[#1a1a1a] rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-emerald-500 to-[#D4A853] transition-all" style={{ width: `${stats.pct}%` }} />
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="text"
          placeholder="Buscar…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-md px-3 py-2 text-xs text-white placeholder:text-[#525252] focus:outline-none focus:border-[#D4A853]/60 flex-1 min-w-[160px]"
        />
        <Select value={filterStatus} onChange={v => setFilterStatus(v as Status | 'all')} options={[
          ['all', 'Todos status'], ['pending', 'Pendente'], ['doing', 'Em andamento'],
          ['blocked', 'Bloqueado'], ['validating', 'Em validação'], ['done', 'Concluído'], ['cancelled', 'Cancelado'],
        ]} />
        <Select value={filterPriority} onChange={v => setFilterPriority(v as Priority | 'all')} options={[
          ['all', 'Todas prioridades'], ['P0', 'P0'], ['P1', 'P1'], ['P2', 'P2'], ['P3', 'P3'],
        ]} />
        <Select value={filterArea} onChange={setFilterArea} options={[
          ['all', 'Todas áreas'], ...areas.map(a => [a, a] as [string, string]),
        ]} />
      </div>

      <p className="text-[10px] text-[#525252]">
        {filtered.length} {filtered.length === 1 ? 'task visível' : 'tasks visíveis'} · clique pra ver detalhes
      </p>

      {/* Mobile (< sm): cards stackados */}
      <div className="sm:hidden space-y-3">
        {filtered.length === 0 && <EmptyState />}
        {filtered.map(t => (
          <MobileCard
            key={t.id}
            task={t}
            isExpanded={expandedId === t.id}
            onToggle={() => setExpandedId(expandedId === t.id ? null : t.id)}
            disabled={pending}
            startTransition={startTransition}
          />
        ))}
      </div>

      {/* Desktop (≥ sm): tabela */}
      <div className="hidden sm:block border border-[#1a1a1a] rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#0d0d0d] text-[10px] uppercase tracking-wider text-[#737373]">
            <tr>
              <th className="px-3 py-2.5 text-left">Epic</th>
              <th className="px-3 py-2.5 text-left">Pri</th>
              <th className="px-3 py-2.5 text-left">Área</th>
              <th className="px-3 py-2.5 text-left">Título</th>
              <th className="px-3 py-2.5 text-left">Status</th>
              <th className="px-3 py-2.5 text-left">Duração</th>
              <th className="px-3 py-2.5 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-12 text-center text-[#525252]">Nada por aqui.</td></tr>
            )}
            {filtered.map(t => {
              const isExpanded = expandedId === t.id
              return (
                <Fragment key={t.id}>
                  <tr
                    onClick={() => setExpandedId(isExpanded ? null : t.id)}
                    className="border-t border-[#1a1a1a] hover:bg-[#0d0d0d]/60 cursor-pointer transition-colors"
                  >
                    <td className="px-3 py-2.5 font-mono text-[11px] text-[#D4A853] whitespace-nowrap">
                      {t.epic_code}
                      {t.queued_for_claude && <span className="ml-1 text-purple-400" title="Na fila do Claude">🤖</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded border ${PRIORITY_COLOR[t.priority]}`}>{t.priority}</span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-[#a3a3a3] whitespace-nowrap">
                      <span className="mr-1">{AREA_EMOJI[t.area] ?? ''}</span>{t.area}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-white">{t.title}</div>
                      {!isExpanded && t.description_simple && (
                        <div className="text-xs text-[#737373] mt-0.5 line-clamp-1">{t.description_simple}</div>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`px-2 py-0.5 text-[10px] font-medium rounded border whitespace-nowrap ${STATUS_COLOR[t.status]}`}>
                        {STATUS_LABEL[t.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-[#737373] whitespace-nowrap">{durationLabel(t.started_at, t.finished_at)}</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      <ActionButtons task={t} disabled={pending} startTransition={startTransition} compact />
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="border-t border-[#1a1a1a] bg-[#0a0a0a]">
                      <td colSpan={7} className="px-6 py-4 space-y-3">
                        <ExpandedDetail task={t} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Modal Nova task */}
      {showNewTask && (
        <NewTaskModal onClose={() => setShowNewTask(false)} disabled={pending} startTransition={startTransition} />
      )}
    </div>
  )
}

// ────────────────── Sub-componentes ──────────────────

function Stat({ label, value, accent, extra }: { label: string, value: number, accent?: string, extra?: string }) {
  return (
    <div className="border border-[#1a1a1a] rounded-md p-2.5 sm:p-3 bg-[#0d0d0d]">
      <div className={`text-xl sm:text-2xl font-bold tracking-tight ${accent ?? 'text-white'}`}>{value}</div>
      <div className="text-[9px] sm:text-[10px] uppercase tracking-wider text-[#737373] mt-0.5 sm:mt-1">
        {label}{extra && <span className="ml-1 text-[#a3a3a3]">· {extra}</span>}
      </div>
    </div>
  )
}

function Select({ value, onChange, options }: {
  value: string, onChange: (v: string) => void, options: Array<[string, string]>
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-md px-2.5 py-2 text-xs text-white focus:outline-none focus:border-[#D4A853]/60"
    >
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  )
}

function EmptyState() {
  return <div className="border border-[#1a1a1a] rounded-md p-12 text-center text-[#525252]">Nada por aqui.</div>
}

function MobileCard({
  task: t, isExpanded, onToggle, disabled, startTransition,
}: {
  task: Task
  isExpanded: boolean
  onToggle: () => void
  disabled: boolean
  startTransition: (cb: () => void) => void
}) {
  return (
    <div className="border border-[#1a1a1a] rounded-lg bg-[#0d0d0d] overflow-hidden">
      <div onClick={onToggle} className="p-3 cursor-pointer">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="font-mono text-[10px] text-[#D4A853]">
            {t.epic_code} {t.queued_for_claude && '🤖'}
          </span>
          <div className="flex gap-1">
            <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded border ${PRIORITY_COLOR[t.priority]}`}>{t.priority}</span>
            <span className={`px-1.5 py-0.5 text-[9px] font-medium rounded border ${STATUS_COLOR[t.status]}`}>{STATUS_LABEL[t.status]}</span>
          </div>
        </div>
        <div className="text-sm text-white font-medium leading-tight">{t.title}</div>
        {t.description_simple && (
          <div className={`text-xs text-[#a3a3a3] mt-1 ${isExpanded ? '' : 'line-clamp-2'}`}>{t.description_simple}</div>
        )}
        <div className="flex items-center gap-2 mt-2 text-[10px] text-[#525252]">
          <span>{AREA_EMOJI[t.area] ?? ''} {t.area}</span>
          <span>·</span>
          <span>{durationLabel(t.started_at, t.finished_at)}</span>
        </div>
      </div>
      {isExpanded && (
        <div className="px-3 pb-3 pt-0 space-y-3 border-t border-[#1a1a1a]">
          <ExpandedDetail task={t} mobile />
        </div>
      )}
      <div className="border-t border-[#1a1a1a] p-2 bg-[#080808]">
        <ActionButtons task={t} disabled={disabled} startTransition={startTransition} />
      </div>
    </div>
  )
}

function ExpandedDetail({ task: t, mobile }: { task: Task, mobile?: boolean }) {
  return (
    <>
      {t.description_simple && <Field label="O que é (em linguagem simples)">{t.description_simple}</Field>}
      {t.result_notes && <Field label="✓ Resultado (relatório)" accent="text-emerald-400">{t.result_notes}</Field>}
      {t.next_step && <Field label="Próximo passo">{t.next_step}</Field>}
      {t.blocker && <Field label="Bloqueio" accent="text-red-400">{t.blocker}</Field>}
      {t.notes && <Field label="Observações técnicas">{t.notes}</Field>}
      {t.description_technical && <Field label="Detalhe técnico">{t.description_technical}</Field>}
      <div className={`grid ${mobile ? 'grid-cols-1' : 'grid-cols-2'} gap-2 text-[11px] text-[#737373] pt-2 border-t border-[#1a1a1a]`}>
        <div>Início: <span className="text-[#a3a3a3]">{fmtDate(t.started_at)}</span></div>
        <div>Fim: <span className="text-[#a3a3a3]">{fmtDate(t.finished_at)}</span></div>
        <div>Última ação: <span className="text-[#a3a3a3]">{t.last_action_by ?? '—'} · {fmtDate(t.last_action_at)}</span></div>
      </div>
    </>
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

function ActionButtons({
  task: t, disabled, startTransition, compact,
}: {
  task: Task
  disabled: boolean
  startTransition: (cb: () => void) => void
  compact?: boolean
}) {
  const [showComplete, setShowComplete] = useState(false)
  const [showBlock, setShowBlock] = useState(false)

  const cls = compact
    ? 'px-2 py-1 text-[10px] rounded font-medium transition disabled:opacity-50'
    : 'px-3 py-2 text-xs rounded-md font-medium transition disabled:opacity-50 flex-1 sm:flex-initial'

  const iconCls = compact ? 'text-base' : 'text-sm'

  const handle = (fn: () => Promise<unknown>) => () => startTransition(async () => { await fn() })

  return (
    <>
      <div className={compact ? 'inline-flex gap-1' : 'flex gap-2 flex-wrap'}>
        {t.status === 'pending' && (
          <button disabled={disabled} onClick={handle(() => startTask(t.id))}
            className={`${cls} bg-[#D4A853]/15 text-[#D4A853] hover:bg-[#D4A853]/25 border border-[#D4A853]/40`}>
            ▶ Iniciar
          </button>
        )}
        {(t.status === 'doing' || t.status === 'validating') && (
          <button disabled={disabled} onClick={() => setShowComplete(true)}
            className={`${cls} bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/40`}>
            ✓ Concluir
          </button>
        )}
        {t.status === 'doing' && (
          <button disabled={disabled} onClick={() => setShowBlock(true)}
            className={`${cls} bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-500/40`}>
            ⊘ Bloquear
          </button>
        )}
        {(t.status === 'pending' || t.status === 'doing') && (
          <button disabled={disabled} onClick={handle(() =>
            t.queued_for_claude ? unqueueFromClaude(t.id) : queueForClaude(t.id)
          )}
            className={`${cls} ${t.queued_for_claude
              ? 'bg-purple-500/30 text-purple-300 border border-purple-500/60'
              : 'bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 border border-purple-500/30'}`}>
            🤖 {t.queued_for_claude ? 'Na fila' : 'Claude'}
          </button>
        )}
        {(t.status === 'done' || t.status === 'cancelled') && (
          <button disabled={disabled} onClick={handle(() => reopenTask(t.id))}
            className={`${cls} bg-[#1a1a1a] text-[#a3a3a3] hover:bg-[#2a2a2a] border border-[#2a2a2a]`}>
            ↺ Reabrir
          </button>
        )}
      </div>

      {showComplete && (
        <CompleteModal task={t} onClose={() => setShowComplete(false)} disabled={disabled} startTransition={startTransition} />
      )}
      {showBlock && (
        <BlockModal task={t} onClose={() => setShowBlock(false)} disabled={disabled} startTransition={startTransition} />
      )}
    </>
  )
}

function CompleteModal({
  task: t, onClose, disabled, startTransition,
}: {
  task: Task
  onClose: () => void
  disabled: boolean
  startTransition: (cb: () => void) => void
}) {
  const [text, setText] = useState('')
  return (
    <ModalShell title="Concluir task" onClose={onClose}>
      <p className="text-xs text-[#a3a3a3] mb-3">
        <strong className="text-white">{t.epic_code}</strong> · {t.title}
      </p>
      <label className="block text-[11px] uppercase tracking-wider text-[#737373] mb-1.5">
        O que foi feito? (linguagem simples — vai pro relatório)
      </label>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        rows={5}
        autoFocus
        placeholder="Ex: Adicionei o campo de Custo no orçamento. Agora cada item tem 2 valores: o que VOCÊ pagou pelo item e o que COBROU do cliente."
        className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-[#D4A853]/60"
      />
      <div className="flex justify-end gap-2 mt-4">
        <button type="button" onClick={onClose}
          className="px-4 py-2 text-xs rounded-md bg-[#1a1a1a] text-[#a3a3a3] hover:bg-[#2a2a2a]">
          Cancelar
        </button>
        <button
          type="button"
          disabled={disabled || !text.trim()}
          onClick={() => startTransition(async () => {
            await completeTask(t.id, text.trim())
            onClose()
          })}
          className="px-4 py-2 text-xs rounded-md bg-emerald-500 text-black font-semibold hover:bg-emerald-400 disabled:opacity-50"
        >
          ✓ Concluir
        </button>
      </div>
    </ModalShell>
  )
}

function BlockModal({
  task: t, onClose, disabled, startTransition,
}: {
  task: Task
  onClose: () => void
  disabled: boolean
  startTransition: (cb: () => void) => void
}) {
  const [text, setText] = useState('')
  return (
    <ModalShell title="Marcar como bloqueado" onClose={onClose}>
      <p className="text-xs text-[#a3a3a3] mb-3">
        <strong className="text-white">{t.epic_code}</strong> · {t.title}
      </p>
      <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2 mb-3">
        ⚠️ Você vai receber um email no admin quando bloquear.
      </p>
      <label className="block text-[11px] uppercase tracking-wider text-[#737373] mb-1.5">Qual o bloqueio?</label>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        rows={4}
        autoFocus
        placeholder="Ex: faltou definir o preço do plano Pro com o cliente."
        className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500/60"
      />
      <div className="flex justify-end gap-2 mt-4">
        <button type="button" onClick={onClose}
          className="px-4 py-2 text-xs rounded-md bg-[#1a1a1a] text-[#a3a3a3] hover:bg-[#2a2a2a]">
          Cancelar
        </button>
        <button type="button" disabled={disabled || !text.trim()}
          onClick={() => startTransition(async () => {
            await blockTask(t.id, text.trim())
            onClose()
          })}
          className="px-4 py-2 text-xs rounded-md bg-red-500 text-white font-semibold hover:bg-red-400 disabled:opacity-50">
          ⊘ Bloquear
        </button>
      </div>
    </ModalShell>
  )
}

function NewTaskModal({
  onClose, disabled, startTransition,
}: {
  onClose: () => void
  disabled: boolean
  startTransition: (cb: () => void) => void
}) {
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [priority, setPriority] = useState<Priority>('P2')
  const [area, setArea] = useState('produto')

  return (
    <ModalShell title="Nova task" onClose={onClose}>
      <p className="text-xs text-[#a3a3a3] mb-4">
        Adicione um pedido novo. Vai pra fila como pendente.
      </p>
      <div className="space-y-3">
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-[#737373] mb-1">Título</label>
          <input value={title} onChange={e => setTitle(e.target.value)} autoFocus
            placeholder="Ex: Adicionar gráfico de receita semanal no dashboard"
            className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-[#D4A853]/60" />
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-[#737373] mb-1">Descrição (linguagem simples)</label>
          <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={4}
            placeholder="Explique o que você quer e por quê. Não precisa ser técnico."
            className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-[#D4A853]/60" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-[#737373] mb-1">Prioridade</label>
            <select value={priority} onChange={e => setPriority(e.target.value as Priority)}
              className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-md px-3 py-2 text-sm text-white focus:outline-none">
              <option value="P0">P0 — Essencial</option>
              <option value="P1">P1 — Muito importante</option>
              <option value="P2">P2 — Boa</option>
              <option value="P3">P3 — Futuro</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-[#737373] mb-1">Área</label>
            <select value={area} onChange={e => setArea(e.target.value)}
              className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-md px-3 py-2 text-sm text-white focus:outline-none">
              <option value="produto">📋 Produto</option>
              <option value="frontend">🎨 Frontend</option>
              <option value="backend">⚙️ Backend</option>
              <option value="database">🗄️ Database</option>
              <option value="stripe">💳 Stripe</option>
              <option value="ia">🤖 IA</option>
              <option value="devops">🛠️ Devops</option>
            </select>
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <button type="button" onClick={onClose}
          className="px-4 py-2 text-xs rounded-md bg-[#1a1a1a] text-[#a3a3a3] hover:bg-[#2a2a2a]">
          Cancelar
        </button>
        <button type="button" disabled={disabled || !title.trim()}
          onClick={() => startTransition(async () => {
            await createTask({ title: title.trim(), descriptionSimple: desc.trim(), priority, area })
            onClose()
          })}
          className="px-4 py-2 text-xs rounded-md bg-[#D4A853] text-black font-semibold hover:bg-[#e0b95f] disabled:opacity-50">
          + Criar task
        </button>
      </div>
    </ModalShell>
  )
}

function ModalShell({ title, onClose, children }: { title: string, onClose: () => void, children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-[#131826] border border-[#2a2a2a] rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2a2a2a]">
          <h3 className="font-semibold text-base">{title}</h3>
          <button onClick={onClose} className="text-[#737373] hover:text-white text-xl leading-none">×</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}
