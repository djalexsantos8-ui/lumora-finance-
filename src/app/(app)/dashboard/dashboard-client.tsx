'use client'

import { useState } from 'react'
import { formatCurrency } from '@/lib/utils/format'
import type { DashboardData, MonthlySeries, CategoryBreakdown } from '@/lib/dashboard/getDashboardData'

// ─── Types ────────────────────────────────────────────────────────────────────

type TabId = 'overview' | 'commercial' | 'financial' | 'insights'

interface Props {
  data: DashboardData
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function pct(n: number, color = true): JSX.Element {
  const positive = n >= 0
  return (
    <span className={color ? (positive ? 'text-emerald-400' : 'text-red-400') : 'text-white'}>
      {positive ? '+' : ''}{n.toFixed(1)}%
    </span>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DashboardClient({ data }: Props) {
  const [tab, setTab] = useState<TabId>('overview')
  const { overview, commercial, financial } = data

  const tabs: { id: TabId; label: string }[] = [
    { id: 'overview',   label: 'Visão Geral' },
    { id: 'commercial', label: 'Comercial' },
    { id: 'financial',  label: 'Financeiro' },
    { id: 'insights',   label: 'Insights' },
  ]

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">Dashboard</h1>
          <p className="text-[10px] text-[#525252] mt-0.5 tracking-wide">
            {new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase())}
          </p>
        </div>
        {/* Tabs */}
        <div className="flex gap-1 bg-[#141414] border border-[#2a2a2a] rounded-lg p-1">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`text-xs font-semibold px-3 py-1.5 rounded transition-colors ${
                tab === t.id ? 'bg-[#D4A853] text-[#0a0a0a]' : 'text-[#525252] hover:text-white'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'overview'   && <OverviewTab   data={overview} />}
      {tab === 'commercial' && <CommercialTab data={commercial} />}
      {tab === 'financial'  && <FinancialTab  data={financial} />}
      {tab === 'insights'   && <InsightsTab />}
    </div>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, accent,
}: {
  label: string
  value: string
  sub?: string
  accent?: 'green' | 'red' | 'amber' | 'default'
}) {
  const valueColor =
    accent === 'green' ? 'text-emerald-400' :
    accent === 'red'   ? 'text-red-400'     :
    accent === 'amber' ? 'text-[#D4A853]'   :
    'text-white'

  return (
    <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-4">
      <p className="text-[10px] font-semibold text-[#525252] tracking-widest mb-2">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${valueColor}`}>{value}</p>
      {sub && <p className="text-[10px] text-[#525252] mt-1">{sub}</p>}
    </div>
  )
}

// ─── Bar Chart (CSS, no lib) ──────────────────────────────────────────────────

function BarChart({ series }: { series: MonthlySeries[] }) {
  const max = Math.max(...series.map(s => s.value), 1)
  return (
    <div className="flex items-end gap-2 h-28">
      {series.map((s, i) => {
        const h = Math.round((s.value / max) * 100)
        const isLast = i === series.length - 1
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <span className="text-[9px] text-[#525252] tabular-nums">
              {s.value > 0 ? formatCurrency(s.value, 'BRL').replace('R$\u00a0', '') : ''}
            </span>
            <div className="w-full flex items-end" style={{ height: '80px' }}>
              <div
                className={`w-full rounded-t transition-all ${isLast ? 'bg-[#D4A853]' : 'bg-[#2a2a2a]'}`}
                style={{ height: `${Math.max(h, s.value > 0 ? 4 : 0)}%` }}
              />
            </div>
            <span className="text-[9px] text-[#525252]">{s.month}</span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Horizontal Bar ───────────────────────────────────────────────────────────

function HBar({ label, value, max, currency = 'BRL' }: { label: string; value: number; max: number; currency?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-[#a3a3a3] w-24 shrink-0 truncate">{label}</span>
      <div className="flex-1 h-1.5 bg-[#2a2a2a] rounded-full overflow-hidden">
        <div className="h-full bg-[#D4A853] rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-white tabular-nums w-24 text-right shrink-0">
        {formatCurrency(value, currency)}
      </span>
    </div>
  )
}

// ─── Tab: Visão Geral ─────────────────────────────────────────────────────────

function OverviewTab({ data }: { data: DashboardData['overview'] }) {
  const netAccent = data.netResult >= 0 ? 'green' : 'red'

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard
          label="RECEBIDO / MÊS"
          value={formatCurrency(data.receivedMonth, 'BRL')}
          sub="pagamentos confirmados"
          accent="green"
        />
        <KpiCard
          label="A RECEBER"
          value={formatCurrency(data.toReceive, 'BRL')}
          sub="jobs em aberto"
          accent="amber"
        />
        <KpiCard
          label="SAÍDA / MÊS"
          value={formatCurrency(data.expensesMonth + data.fixedMonth, 'BRL')}
          sub={`fixos ${formatCurrency(data.fixedMonth, 'BRL')} + variáveis ${formatCurrency(data.expensesMonth, 'BRL')}`}
        />
        <KpiCard
          label="RESULTADO LÍQUIDO"
          value={formatCurrency(data.netResult, 'BRL')}
          sub="recebido − saídas"
          accent={netAccent}
        />
      </div>

      {/* Chart + Job Status */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Bar chart */}
        <div className="sm:col-span-2 bg-[#141414] border border-[#2a2a2a] rounded-xl p-4">
          <p className="text-[10px] font-semibold text-[#525252] tracking-widest mb-4">RECEBIDO POR MÊS</p>
          {data.monthlySeries.every(s => s.value === 0) ? (
            <div className="h-28 flex items-center justify-center">
              <p className="text-[#525252] text-xs">Nenhum pagamento registrado ainda.</p>
            </div>
          ) : (
            <BarChart series={data.monthlySeries} />
          )}
        </div>

        {/* Job status */}
        <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-4">
          <p className="text-[10px] font-semibold text-[#525252] tracking-widest mb-3">STATUS DOS JOBS</p>
          {data.jobStatusCounts.length === 0 ? (
            <p className="text-[#525252] text-xs">Nenhum job criado ainda.</p>
          ) : (
            <div className="space-y-2">
              {data.jobStatusCounts.map(s => (
                <div key={s.status} className="flex items-center justify-between">
                  <span className="text-xs text-[#a3a3a3]">{s.label}</span>
                  <span className={`text-xs font-bold tabular-nums ${
                    s.status === 'paid'            ? 'text-emerald-400' :
                    s.status === 'pending_payment' ? 'text-[#D4A853]'   :
                    s.status === 'cancelled'       ? 'text-red-400'     :
                    'text-white'
                  }`}>{s.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Alerts */}
      {data.alerts.length > 0 && (
        <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-4">
          <p className="text-[10px] font-semibold text-[#525252] tracking-widest mb-3">ALERTAS DE COBRANÇA</p>
          <div className="space-y-2">
            {data.alerts.slice(0, 4).map(a => (
              <div key={a.job_id} className="flex items-center gap-3">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                  a.status === 'overdue'   ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                  a.status === 'due_today' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                  'bg-[#1c1c1c] text-[#525252] border border-[#2a2a2a]'
                }`}>
                  {a.status === 'overdue' ? `${a.days_delta}d atraso` :
                   a.status === 'due_today' ? 'Vence hoje' : 'Pendente'}
                </span>
                <span className="text-xs text-white truncate flex-1">{a.job_title}</span>
                <span className="text-xs text-[#525252] shrink-0">{a.client_name}</span>
                <span className="text-xs font-bold text-[#D4A853] tabular-nums shrink-0">
                  {formatCurrency(a.amount_due, a.currency)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Tab: Comercial ───────────────────────────────────────────────────────────

function CommercialTab({ data }: { data: DashboardData['commercial'] }) {
  const maxRev = Math.max(...data.revenueByCategory.map(c => c.value), 1)
  const totalPipeline = data.pipeline.reduce((s, p) => s + p.count, 0)

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard
          label="ORÇAMENTOS / MÊS"
          value={String(data.budgetsMonth)}
          sub="criados neste mês"
        />
        <KpiCard
          label="TAXA DE APROVAÇÃO"
          value={`${data.approvalRate}%`}
          sub="aprovados / enviados"
          accent={data.approvalRate >= 50 ? 'green' : data.approvalRate > 0 ? 'amber' : 'default'}
        />
        <KpiCard
          label="TICKET MÉDIO"
          value={data.avgTicket > 0 ? formatCurrency(data.avgTicket, 'BRL') : '—'}
          sub="orçamentos aprovados"
          accent="amber"
        />
        <KpiCard
          label="AGUARDANDO RESPOSTA"
          value={String(data.awaitingResponse)}
          sub="orçamentos enviados"
          accent={data.awaitingResponse > 0 ? 'amber' : 'default'}
        />
      </div>

      {/* Pipeline */}
      <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-4">
        <p className="text-[10px] font-semibold text-[#525252] tracking-widest mb-4">PIPELINE DE ORÇAMENTOS</p>
        {totalPipeline === 0 ? (
          <p className="text-[#525252] text-xs">Nenhum orçamento criado ainda.</p>
        ) : (
          <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto pb-1">
            {data.pipeline.map((p, i) => {
              const pctW = totalPipeline > 0 ? Math.round((p.count / totalPipeline) * 100) : 0
              const colors: Record<string, string> = {
                draft:    'bg-[#2a2a2a] text-[#525252]',
                sent:     'bg-blue-500/10 text-blue-400 border border-blue-500/20',
                approved: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
                rejected: 'bg-red-500/10 text-red-400 border border-red-500/20',
                expired:  'bg-[#1c1c1c] text-[#525252] border border-[#2a2a2a]',
              }
              return (
                <div key={p.status} className="flex items-center gap-1 sm:gap-2 shrink-0">
                  <div className={`flex flex-col items-center px-3 py-2 rounded-lg ${colors[p.status] ?? 'bg-[#1c1c1c] text-[#525252]'}`}>
                    <span className="text-lg font-bold tabular-nums">{p.count}</span>
                    <span className="text-[10px] font-semibold mt-0.5">{p.label}</span>
                    {pctW > 0 && <span className="text-[9px] mt-0.5 opacity-60">{pctW}%</span>}
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
        )}
      </div>

      {/* Revenue by category + Lead sources */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-4">
          <p className="text-[10px] font-semibold text-[#525252] tracking-widest mb-3">RECEITA POR CATEGORIA</p>
          {data.revenueByCategory.length === 0 ? (
            <p className="text-[#525252] text-xs">Nenhuma receita registrada.</p>
          ) : (
            <div className="space-y-2.5">
              {data.revenueByCategory.map(c => (
                <HBar key={c.category} label={c.label} value={c.value} max={maxRev} />
              ))}
            </div>
          )}
        </div>

        <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-4">
          <p className="text-[10px] font-semibold text-[#525252] tracking-widest mb-3">ORIGEM DOS LEADS</p>
          {data.leadSources.length === 0 ? (
            <p className="text-[#525252] text-xs">Nenhuma origem de lead registrada nos jobs.</p>
          ) : (
            <div className="space-y-2">
              {data.leadSources.map((l, i) => (
                <div key={i} className="flex items-center justify-between gap-2">
                  <span className="text-xs text-[#a3a3a3] flex-1 truncate">{l.source}</span>
                  <span className="text-[10px] text-[#525252] shrink-0">{l.count} job{l.count !== 1 ? 's' : ''}</span>
                  <span className="text-xs font-semibold text-white tabular-nums shrink-0 w-20 text-right">
                    {formatCurrency(l.revenue, 'BRL')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Financeiro ──────────────────────────────────────────────────────────

function FinancialTab({ data }: { data: DashboardData['financial'] }) {
  const maxExp = Math.max(...data.expensesByCategory.map(c => c.value), 1)

  const FIXED_CAT_LABELS: Record<string, string> = {
    software:     'Software',
    subscription: 'Assinaturas',
    internet:     'Internet',
    phone:        'Telefonia',
    equipment:    'Equipamentos',
    workspace:    'Espaço',
    housing:      'Moradia',
    transport:    'Transporte',
    taxes:        'Impostos',
    services:     'Serviços',
    other:        'Outros',
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard
          label="DESPESAS VARIÁVEIS"
          value={formatCurrency(data.variableExpenses, 'BRL')}
          sub="lançadas neste mês"
        />
        <KpiCard
          label="CUSTOS FIXOS / MÊS"
          value={formatCurrency(data.fixedCosts, 'BRL')}
          sub="recorrentes ativos"
        />
        <KpiCard
          label="PARCELAS EM ABERTO"
          value={formatCurrency(data.pendingInstallments, 'BRL')}
          sub="fixos + despesas"
          accent={data.pendingInstallments > 0 ? 'amber' : 'default'}
        />
        <KpiCard
          label="TOTAL DEDUTÍVEL"
          value={formatCurrency(data.deductibleTotal, 'BRL')}
          sub="abatível no IR"
          accent="green"
        />
      </div>

      {/* Expense breakdown + Fixed costs list */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-4">
          <p className="text-[10px] font-semibold text-[#525252] tracking-widest mb-3">DESPESAS POR CATEGORIA</p>
          {data.expensesByCategory.length === 0 ? (
            <p className="text-[#525252] text-xs">Nenhuma despesa registrada neste mês.</p>
          ) : (
            <div className="space-y-2.5">
              {data.expensesByCategory.map(c => (
                <HBar key={c.category} label={c.label} value={c.value} max={maxExp} />
              ))}
            </div>
          )}
        </div>

        <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-4">
          <p className="text-[10px] font-semibold text-[#525252] tracking-widest mb-3">CUSTOS FIXOS ATIVOS</p>
          {data.fixedCostsList.length === 0 ? (
            <p className="text-[#525252] text-xs">Nenhum custo fixo recorrente ativo.</p>
          ) : (
            <div className="space-y-2">
              {data.fixedCostsList.map(f => (
                <div key={f.id} className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#1c1c1c] text-[#525252] shrink-0">
                    {FIXED_CAT_LABELS[f.category] ?? f.category}
                  </span>
                  <span className="text-xs text-[#a3a3a3] flex-1 truncate">{f.description}</span>
                  <span className="text-xs font-bold text-white tabular-nums shrink-0">
                    {formatCurrency(f.amount, f.currency)}<span className="text-[#525252] font-normal">/mês</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Pending installments */}
      {data.installmentsList.length > 0 && (
        <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-4">
          <p className="text-[10px] font-semibold text-[#525252] tracking-widest mb-3">PRÓXIMAS PARCELAS</p>
          <div className="space-y-2">
            {data.installmentsList.map(item => (
              <div key={item.id} className="flex items-center gap-3">
                <span className="text-[10px] font-semibold text-[#D4A853] tabular-nums shrink-0 w-8">
                  {item.index}/{item.total}
                </span>
                <span className="text-xs text-white flex-1 truncate">{item.description}</span>
                <span className="text-[10px] text-[#525252] shrink-0">{formatDate(item.dueDate)}</span>
                <span className="text-xs font-bold text-white tabular-nums shrink-0">
                  {formatCurrency(item.amount, item.currency)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Tab: Insights ────────────────────────────────────────────────────────────

function InsightsTab() {
  const placeholders = [
    'Mês com maior faturamento',
    'Categoria mais rentável',
    'Melhor origem de lead',
    'Onde você perde mais caixa',
    'Tendência dos últimos 3 meses',
    'Margem real por projeto',
  ]
  return (
    <div className="space-y-4">
      <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-6 text-center">
        <div className="w-10 h-10 rounded-xl bg-[#D4A853]/10 border border-[#D4A853]/20 flex items-center justify-center mx-auto mb-3">
          <svg className="w-5 h-5 text-[#D4A853]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
        <p className="text-sm font-bold text-white mb-1">Insights em construção</p>
        <p className="text-xs text-[#525252] max-w-xs mx-auto">
          Inteligência financeira automática baseada nos seus dados reais. Em breve.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {placeholders.map((p, i) => (
          <div key={i} className="bg-[#141414] border border-[#1c1c1c] rounded-xl p-4 opacity-40">
            <div className="h-2 bg-[#2a2a2a] rounded w-3/4 mb-2" />
            <div className="h-6 bg-[#1c1c1c] rounded w-1/2 mb-1" />
            <p className="text-[10px] text-[#3a3a3a]">{p}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
