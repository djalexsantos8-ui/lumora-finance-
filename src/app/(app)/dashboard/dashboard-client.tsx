'use client'

import { useState } from 'react'
import { formatCurrency } from '@/lib/utils/format'
import type {
  DashboardData,
  MonthlySeries,
  CategoryBreakdown,
  AutoInsight,
} from '@/lib/dashboard/getDashboardData'

type TabId = 'overview' | 'commercial' | 'financial' | 'insights'

interface Props { data: DashboardData }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function fmt(n: number) {
  return formatCurrency(n, 'BRL')
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function DashboardClient({ data }: Props) {
  const [tab, setTab] = useState<TabId>('overview')
  const { summary, overview, commercial, financial, insights } = data

  const tabs: { id: TabId; label: string }[] = [
    { id: 'overview',   label: 'Visão Geral'  },
    { id: 'commercial', label: 'Comercial'  },
    { id: 'financial',  label: 'Financeiro' },
  ]

  const currentMonth = new Date().toLocaleDateString('pt-BR', {
    month: 'long', year: 'numeric',
  }).replace(/^\w/, c => c.toUpperCase())

  return (
    <div className="space-y-6">

      {/* ── Premium Header ──────────────────────────────────────────────── */}
      <div className="bg-[#141414] border border-[#2a2a2a] rounded-2xl px-5 py-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-base font-bold text-white tracking-tight">
              Visão financeira da operação
            </h1>
            <p className="text-xs text-[#525252] mt-0.5">
              Resumo completo da sua performance · {currentMonth}
            </p>
          </div>
          {/* Filter pills — UI only */}
          <div className="flex gap-2 flex-wrap">
            {['Todos os produtos', 'Todas as origens', 'Todas as categorias'].map(f => (
              <span key={f}
                className="text-[10px] font-semibold px-3 py-1 rounded-full border border-[#2a2a2a] text-[#525252] cursor-default select-none">
                {f}
              </span>
            ))}
          </div>
        </div>

        {/* ── 4 Summary KPIs ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <SummaryKpi
            icon={<IconRevenue />}
            label="FATURAMENTO TOTAL"
            value={fmt(summary.faturamentoTotal)}
            sub="todos os pagamentos"
          />
          <SummaryKpi
            icon={<IconTicket />}
            label="TICKET MÉDIO"
            value={fmt(summary.ticketMedio)}
            sub="por job"
          />
          <SummaryKpi
            icon={<IconNet />}
            label="RECEITA LÍQUIDA"
            value={fmt(summary.receitaLiquida)}
            sub="após todas as saídas"
            accent={summary.receitaLiquida >= 0 ? 'green' : 'red'}
          />
          <SummaryKpi
            icon={<IconMargin />}
            label="MARGEM"
            value={`${summary.margemPct}%`}
            sub="líquida sobre recebido"
            accent={summary.margemPct >= 30 ? 'green' : summary.margemPct >= 0 ? 'amber' : 'red'}
          />
        </div>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-[#141414] border border-[#2a2a2a] rounded-lg p-1 w-fit">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`text-xs font-semibold px-4 py-1.5 rounded transition-colors ${
              tab === t.id ? 'bg-[#D4A853] text-[#0a0a0a]' : 'text-[#525252] hover:text-white'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview'   && <OverviewTab   data={overview} />}
      {tab === 'commercial' && <CommercialTab data={commercial} />}
      {tab === 'financial'  && <FinancialTab  data={financial} />}
    </div>
  )
}

// ─── Summary KPI Card ─────────────────────────────────────────────────────────

function SummaryKpi({ icon, label, value, sub, accent }: {
  icon:    React.ReactNode
  label:   string
  value:   string
  sub?:    string
  accent?: 'green' | 'red' | 'amber'
}) {
  const valueColor =
    accent === 'green' ? 'text-emerald-400' :
    accent === 'red'   ? 'text-red-400'     :
    accent === 'amber' ? 'text-[#D4A853]'   :
    'text-white'
  return (
    <div className="bg-[#0a0a0a] border border-[#1c1c1c] rounded-xl p-3.5">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[#525252]">{icon}</span>
        <p className="text-[9px] font-bold text-[#525252] tracking-widest">{label}</p>
      </div>
      <p className={`text-lg font-bold tabular-nums ${valueColor}`}>{value}</p>
      {sub && <p className="text-[10px] text-[#3a3a3a] mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── KPI Card (tabs) ──────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, accent }: {
  label:   string
  value:   string
  sub?:    string
  accent?: 'green' | 'red' | 'amber'
}) {
  const valueColor =
    accent === 'green' ? 'text-emerald-400' :
    accent === 'red'   ? 'text-red-400'     :
    accent === 'amber' ? 'text-[#D4A853]'   :
    'text-white'
  return (
    <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-4">
      <p className="text-[9px] font-bold text-[#525252] tracking-widest mb-2">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${valueColor}`}>{value}</p>
      {sub && <p className="text-[10px] text-[#525252] mt-1">{sub}</p>}
    </div>
  )
}

// ─── Area / Line Chart (SVG) ──────────────────────────────────────────────────

function AreaChart({ series }: { series: MonthlySeries[] }) {
  const W = 600, H = 120, PAD = { top: 12, right: 16, bottom: 24, left: 8 }
  const iW = W - PAD.left - PAD.right
  const iH = H - PAD.top - PAD.bottom

  const allVals = series.flatMap(s => [s.received, s.expenses, s.result])
  const minV = Math.min(...allVals, 0)
  const maxV = Math.max(...allVals, 1)
  const range = maxV - minV || 1

  function xOf(i: number) { return PAD.left + (i / Math.max(series.length - 1, 1)) * iW }
  function yOf(v: number) { return PAD.top + iH - ((v - minV) / range) * iH }

  function toPath(key: 'received' | 'expenses' | 'result') {
    return series.map((s, i) => `${i === 0 ? 'M' : 'L'}${xOf(i)},${yOf(s[key])}`).join(' ')
  }

  function toArea(key: 'received' | 'expenses' | 'result') {
    const first = series[0], last = series[series.length - 1]
    const base = yOf(Math.max(minV, 0))
    return `${toPath(key)} L${xOf(series.length - 1)},${base} L${xOf(0)},${base} Z`
  }

  const hasData = series.some(s => s.received > 0 || s.expenses > 0)
  if (!hasData) {
    return (
      <div className="h-32 flex items-center justify-center">
        <p className="text-[#525252] text-xs">Nenhum dado no período.</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height: '120px' }}>
        <defs>
          <linearGradient id="grad-rec" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#D4A853" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#D4A853" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="grad-exp" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="grad-res" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Zero line */}
        {minV < 0 && (
          <line x1={PAD.left} y1={yOf(0)} x2={W - PAD.right} y2={yOf(0)}
            stroke="#2a2a2a" strokeWidth="1" strokeDasharray="4 3" />
        )}
        {/* Areas */}
        <path d={toArea('received')} fill="url(#grad-rec)" />
        <path d={toArea('expenses')} fill="url(#grad-exp)" />
        <path d={toArea('result')}   fill="url(#grad-res)" />
        {/* Lines */}
        <path d={toPath('received')} fill="none" stroke="#D4A853" strokeWidth="1.5" strokeLinejoin="round" />
        <path d={toPath('expenses')} fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinejoin="round" strokeDasharray="5 3" />
        <path d={toPath('result')}   fill="none" stroke="#10b981" strokeWidth="1.5" strokeLinejoin="round" />
        {/* Month labels */}
        {series.map((s, i) => (
          <text key={i} x={xOf(i)} y={H - 4} textAnchor="middle"
            fill="#525252" fontSize="9" fontFamily="system-ui">
            {s.month}
          </text>
        ))}
        {/* Dots on last point */}
        {(['received','expenses','result'] as const).map(key => {
          const last = series[series.length - 1]
          const color = key === 'received' ? '#D4A853' : key === 'expenses' ? '#ef4444' : '#10b981'
          return (
            <circle key={key}
              cx={xOf(series.length - 1)} cy={yOf(last[key])}
              r="3" fill={color} />
          )
        })}
      </svg>
      {/* Legend */}
      <div className="flex gap-4 mt-2">
        {[
          { color: '#D4A853', label: 'Recebido' },
          { color: '#ef4444', label: 'Saídas', dash: true },
          { color: '#10b981', label: 'Resultado' },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1.5">
            <svg width="16" height="2">
              <line x1="0" y1="1" x2="16" y2="1" stroke={l.color} strokeWidth="1.5"
                strokeDasharray={l.dash ? '4 2' : undefined} />
            </svg>
            <span className="text-[10px] text-[#525252]">{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Donut Chart (SVG) ────────────────────────────────────────────────────────

const DONUT_COLORS = ['#D4A853','#10b981','#3b82f6','#8b5cf6','#f97316','#ec4899','#14b8a6']

function DonutChart({ data, size = 80 }: { data: CategoryBreakdown[]; size?: number }) {
  const r = 28, cx = size / 2, cy = size / 2
  const circ = 2 * Math.PI * r
  const total = data.reduce((s, d) => s + d.value, 0)

  if (total === 0) return <div className="h-20 flex items-center justify-center"><p className="text-[#525252] text-xs">Sem dados</p></div>

  let cumPct = 0
  const slices = data.map((d, i) => {
    const pct = d.value / total
    const offset = circ * (1 - cumPct)
    cumPct += pct
    return { ...d, dash: circ * pct, offset, color: DONUT_COLORS[i % DONUT_COLORS.length] }
  })

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1c1c1c" strokeWidth="10" />
      {slices.map((s, i) => (
        <circle key={i} cx={cx} cy={cy} r={r} fill="none"
          stroke={s.color} strokeWidth="10"
          strokeDasharray={`${s.dash} ${circ - s.dash}`}
          strokeDashoffset={s.offset}
          style={{ transform: `rotate(-90deg)`, transformOrigin: `${cx}px ${cy}px` }}
        />
      ))}
    </svg>
  )
}

// ─── Horizontal Bar ───────────────────────────────────────────────────────────

function HBar({ label, value, max, pct, color = '#D4A853' }: {
  label: string; value: number; max: number; pct?: number; color?: string
}) {
  const w = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-[#a3a3a3] w-24 shrink-0 truncate">{label}</span>
      <div className="flex-1 h-1.5 bg-[#1c1c1c] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${w}%`, backgroundColor: color }} />
      </div>
      <div className="shrink-0 text-right w-28">
        <span className="text-xs font-semibold text-white tabular-nums">{fmt(value)}</span>
        {pct !== undefined && <span className="text-[10px] text-[#525252] ml-1">{pct}%</span>}
      </div>
    </div>
  )
}

// ─── Section Card ─────────────────────────────────────────────────────────────

function Card({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-[#141414] border border-[#2a2a2a] rounded-xl p-4 ${className}`}>
      <p className="text-[9px] font-bold text-[#525252] tracking-widest mb-4">{title}</p>
      {children}
    </div>
  )
}

// ─── Tab: Visão Geral ─────────────────────────────────────────────────────────

function OverviewTab({ data }: { data: DashboardData['overview'] }) {
  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="RECEBIDO / MÊS"  value={fmt(data.receivedMonth)} sub="pagamentos confirmados" accent="green" />
        <KpiCard label="A RECEBER"        value={fmt(data.toReceive)}     sub="jobs em aberto"         accent="amber" />
        <KpiCard label="SAÍDA / MÊS"      value={fmt(data.expensesMonth + data.fixedMonth)}
          sub={`fixos ${fmt(data.fixedMonth)} · var. ${fmt(data.expensesMonth)}`} />
        <KpiCard label="RESULTADO LÍQUIDO" value={fmt(data.netResult)}    sub="recebido − saídas"
          accent={data.netResult >= 0 ? 'green' : 'red'} />
      </div>

      {/* Area chart */}
      <Card title="EVOLUÇÃO MENSAL — RECEBIDO vs SAÍDAS vs RESULTADO" className="sm:col-span-2">
        <AreaChart series={data.monthlySeries} />
      </Card>

      {/* Status + Alerts */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card title="STATUS DOS JOBS">
          {data.jobStatusCounts.length === 0
            ? <p className="text-[#525252] text-xs">Nenhum job criado ainda.</p>
            : <div className="space-y-2.5">
                {data.jobStatusCounts.map(s => (
                  <div key={s.status} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        s.status === 'paid'            ? 'bg-emerald-400' :
                        s.status === 'pending_payment' ? 'bg-[#D4A853]'   :
                        s.status === 'in_progress'     ? 'bg-blue-400'    :
                        s.status === 'cancelled'       ? 'bg-red-400'     :
                        'bg-[#525252]'}`} />
                      <span className="text-xs text-[#a3a3a3]">{s.label}</span>
                    </div>
                    <span className="text-sm font-bold text-white tabular-nums">{s.count}</span>
                  </div>
                ))}
              </div>
          }
        </Card>

        <Card title="ALERTAS DE COBRANÇA">
          {data.alerts.length === 0
            ? <p className="text-[#525252] text-xs">Nenhuma cobrança em atraso.</p>
            : <div className="space-y-2">
                {data.alerts.slice(0, 4).map(a => (
                  <div key={a.job_id} className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                      a.status === 'overdue'   ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                      a.status === 'due_today' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                      'bg-[#1c1c1c] text-[#525252] border border-[#2a2a2a]'}`}>
                      {a.status === 'overdue' ? `${a.days_delta}d` : a.status === 'due_today' ? 'Hoje' : 'Pend.'}
                    </span>
                    <span className="text-xs text-white truncate flex-1">{a.job_title}</span>
                    <span className="text-xs font-bold text-[#D4A853] tabular-nums shrink-0">
                      {fmt(a.amount_due)}
                    </span>
                  </div>
                ))}
              </div>
          }
        </Card>
      </div>
    </div>
  )
}

// ─── Tab: Comercial ───────────────────────────────────────────────────────────

function CommercialTab({ data }: { data: DashboardData['commercial'] }) {
  const maxRev    = Math.max(...data.revenueByCategory.map(c => c.value), 1)
  const maxLead   = Math.max(...data.leadSources.map(l => l.revenue), 1)
  const totalPipe = data.pipeline.reduce((s, p) => s + p.count, 0)

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="ORÇAMENTOS / MÊS" value={String(data.budgetsMonth)} sub="criados neste mês" />
        <KpiCard label="TAXA DE APROVAÇÃO" value={`${data.approvalRate}%`} sub="aprovados / enviados"
          accent={data.approvalRate >= 50 ? 'green' : data.approvalRate > 0 ? 'amber' : undefined} />
        <KpiCard label="TICKET MÉDIO"      value={data.avgTicket > 0 ? fmt(data.avgTicket) : '—'} sub="orçamentos aprovados" accent="amber" />
        <KpiCard label="AGUARDANDO"        value={String(data.awaitingResponse)} sub="orçamentos enviados"
          accent={data.awaitingResponse > 0 ? 'amber' : undefined} />
      </div>

      {/* Pipeline */}
      <Card title="PIPELINE DE ORÇAMENTOS">
        {totalPipe === 0
          ? <p className="text-[#525252] text-xs">Nenhum orçamento criado ainda.</p>
          : <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {data.pipeline.map((p, i) => {
                const colors: Record<string, string> = {
                  draft:    'border-[#2a2a2a] text-[#525252]',
                  sent:     'border-blue-500/30 text-blue-400',
                  approved: 'border-emerald-500/30 text-emerald-400',
                  rejected: 'border-red-500/30 text-red-400',
                  expired:  'border-[#2a2a2a] text-[#3a3a3a]',
                }
                return (
                  <div key={p.status} className="flex items-center gap-2 shrink-0">
                    <div className={`flex flex-col items-center px-4 py-2.5 rounded-xl border bg-[#0a0a0a] ${colors[p.status] ?? 'border-[#2a2a2a] text-[#525252]'}`}>
                      <span className="text-xl font-bold tabular-nums">{p.count}</span>
                      <span className="text-[9px] font-semibold mt-0.5 tracking-wide">{p.label.toUpperCase()}</span>
                    </div>
                    {i < data.pipeline.length - 1 && (
                      <svg className="w-3 h-3 text-[#3a3a3a] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    )}
                  </div>
                )
              })}
            </div>
        }
      </Card>

      {/* Revenue by category + Lead sources */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card title="RECEITA POR CATEGORIA">
          {data.revenueByCategory.length === 0
            ? <p className="text-[#525252] text-xs">Nenhuma receita registrada.</p>
            : <div className="flex gap-4 items-center">
                <DonutChart data={data.revenueByCategory} size={88} />
                <div className="flex-1 space-y-2">
                  {data.revenueByCategory.map((c, i) => (
                    <div key={c.category} className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                      <span className="text-[10px] text-[#a3a3a3] flex-1 truncate">{c.label}</span>
                      <span className="text-[10px] text-[#525252]">{c.pct}%</span>
                      <span className="text-xs font-semibold text-white tabular-nums w-20 text-right">{fmt(c.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
          }
        </Card>

        <Card title="ORIGEM DOS LEADS">
          {data.leadSources.length === 0
            ? <p className="text-[#525252] text-xs">Nenhuma origem registrada nos jobs.</p>
            : <div className="space-y-2.5">
                {data.leadSources.map((l, i) => (
                  <HBar key={i} label={l.source} value={l.revenue} max={maxLead} pct={l.pct}
                    color={DONUT_COLORS[i % DONUT_COLORS.length]} />
                ))}
              </div>
          }
        </Card>
      </div>

      {/* Performance table */}
      <Card title="PERFORMANCE POR CATEGORIA">
        {data.revenueByCategory.length === 0
          ? <p className="text-[#525252] text-xs">Sem dados de performance.</p>
          : <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#1c1c1c]">
                    {['Categoria', 'Receita', 'Participação', 'Qtd. Jobs'].map(h => (
                      <th key={h} className="text-[9px] font-bold text-[#525252] tracking-widest pb-2 text-left first:text-left last:text-right">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.revenueByCategory.map((c, i) => (
                    <tr key={c.category} className="border-b border-[#1c1c1c] last:border-0">
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                          <span className="text-white">{c.label}</span>
                        </div>
                      </td>
                      <td className="py-2 pr-4 font-bold text-white tabular-nums">{fmt(c.value)}</td>
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1 bg-[#1c1c1c] rounded-full overflow-hidden">
                            <div className="h-full bg-[#D4A853] rounded-full" style={{ width: `${c.pct}%` }} />
                          </div>
                          <span className="text-[#525252]">{c.pct}%</span>
                        </div>
                      </td>
                      <td className="py-2 text-right text-[#525252]">{c.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        }
      </Card>
    </div>
  )
}

// ─── Tab: Financeiro ──────────────────────────────────────────────────────────

const FIXED_CAT_LABELS: Record<string, string> = {
  software: 'Software', subscription: 'Assinaturas', internet: 'Internet',
  phone: 'Telefonia', equipment: 'Equipamentos', workspace: 'Espaço',
  housing: 'Moradia', transport: 'Transporte', taxes: 'Impostos',
  services: 'Serviços', other: 'Outros',
}

function FinancialTab({ data }: { data: DashboardData['financial'] }) {
  const maxExp = Math.max(...data.expensesByCategory.map(c => c.value), 1)

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="DESPESAS VARIÁVEIS"  value={fmt(data.variableExpenses)}    sub="lançadas este mês" />
        <KpiCard label="CUSTOS FIXOS / MÊS"  value={fmt(data.fixedCosts)}          sub="recorrentes ativos" />
        <KpiCard label="PARCELAS EM ABERTO"  value={fmt(data.pendingInstallments)} sub="fixos + despesas"
          accent={data.pendingInstallments > 0 ? 'amber' : undefined} />
        <KpiCard label="TOTAL DEDUTÍVEL"     value={fmt(data.deductibleTotal)}     sub="abatível no IR" accent="green" />
      </div>

      {/* Expenses breakdown + Fixed costs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card title="DESPESAS POR CATEGORIA">
          {data.expensesByCategory.length === 0
            ? <p className="text-[#525252] text-xs">Nenhuma despesa registrada neste mês.</p>
            : <div className="flex gap-4 items-center">
                <DonutChart data={data.expensesByCategory} size={88} />
                <div className="flex-1 space-y-2">
                  {data.expensesByCategory.map((c, i) => (
                    <div key={c.category} className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                      <span className="text-[10px] text-[#a3a3a3] flex-1 truncate">{c.label}</span>
                      <span className="text-[10px] text-[#525252]">{c.pct}%</span>
                      <span className="text-xs font-semibold text-white tabular-nums w-20 text-right">{fmt(c.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
          }
        </Card>

        <Card title="CUSTOS FIXOS ATIVOS">
          {data.fixedCostsList.length === 0
            ? <p className="text-[#525252] text-xs">Nenhum custo recorrente ativo.</p>
            : <div className="space-y-2">
                {data.fixedCostsList.map(f => (
                  <div key={f.id} className="flex items-center gap-2">
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#1c1c1c] text-[#525252] shrink-0">
                      {FIXED_CAT_LABELS[f.category] ?? f.category}
                    </span>
                    <span className="text-xs text-[#a3a3a3] flex-1 truncate">{f.description}</span>
                    <span className="text-xs font-bold text-white tabular-nums shrink-0">
                      {fmt(f.amount)}<span className="text-[#525252] font-normal">/mês</span>
                    </span>
                  </div>
                ))}
              </div>
          }
        </Card>
      </div>

      {/* Pending installments */}
      {data.installmentsList.length > 0 && (
        <Card title="PRÓXIMAS PARCELAS">
          <div className="space-y-2">
            {data.installmentsList.map(item => (
              <div key={item.id} className="flex items-center gap-3">
                <span className="text-[10px] font-bold text-[#D4A853] tabular-nums shrink-0 w-8">
                  {item.index}/{item.total}
                </span>
                <span className="text-xs text-white flex-1 truncate">{item.description}</span>
                <span className="text-[10px] text-[#525252] shrink-0">{formatDate(item.dueDate)}</span>
                <span className="text-xs font-bold text-white tabular-nums shrink-0">
                  {fmt(item.amount)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

// ─── Tab: Insights ────────────────────────────────────────────────────────────

function InsightsTab({ data }: { data: AutoInsight[] }) {
  const placeholders = [
    'Tendência dos últimos 3 meses',
    'Margem real por projeto',
    'Sazonalidade do negócio',
    'Previsão do próximo mês',
  ]

  return (
    <div className="space-y-4">
      {/* Auto insights */}
      {data.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {data.map((ins, i) => (
            <div key={i} className={`rounded-xl p-4 border ${
              ins.type === 'positive' ? 'bg-emerald-500/5 border-emerald-500/20' :
              ins.type === 'negative' ? 'bg-red-500/5 border-red-500/20' :
              'bg-[#141414] border-[#2a2a2a]'
            }`}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-1.5 h-1.5 rounded-full ${
                  ins.type === 'positive' ? 'bg-emerald-400' :
                  ins.type === 'negative' ? 'bg-red-400' : 'bg-[#D4A853]'}`} />
                <p className="text-[9px] font-bold tracking-widest text-[#525252]">{ins.label.toUpperCase()}</p>
              </div>
              <p className={`text-sm font-bold ${
                ins.type === 'positive' ? 'text-emerald-400' :
                ins.type === 'negative' ? 'text-red-400' : 'text-[#D4A853]'}`}>
                {ins.value}
              </p>
              {ins.detail && <p className="text-[10px] text-[#525252] mt-0.5">{ins.detail}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Placeholder — coming soon */}
      <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-5 text-center">
        <div className="w-9 h-9 rounded-xl bg-[#D4A853]/10 border border-[#D4A853]/20 flex items-center justify-center mx-auto mb-3">
          <svg className="w-4 h-4 text-[#D4A853]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
        <p className="text-sm font-bold text-white mb-1">Mais insights em breve</p>
        <p className="text-xs text-[#525252]">Análise de tendências, sazonalidade e projeções automáticas.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {placeholders.map((p, i) => (
          <div key={i} className="bg-[#141414] border border-[#1c1c1c] rounded-xl p-4 opacity-35">
            <div className="h-1.5 bg-[#2a2a2a] rounded w-2/3 mb-3" />
            <div className="h-5 bg-[#1c1c1c] rounded w-1/2 mb-1" />
            <p className="text-[10px] text-[#3a3a3a]">{p}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconRevenue() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}
function IconTicket() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
    </svg>
  )
}
function IconNet() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  )
}
function IconMargin() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  )
}
