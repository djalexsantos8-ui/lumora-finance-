import Link from 'next/link'
import { requireWorkspace } from '@/lib/workspace/get-current-workspace'
import { createClient } from '@/lib/supabase/server'
import { fmtBRL } from '@/lib/v2/budget-calc'
import { projectTypeDisplay, getProjectTypes } from '@/lib/v2/project-types'
import { fetchFinSummary, fetchForecast, fmtShortDate, fonteLabel } from '@/lib/v2/financial'

export const dynamic = 'force-dynamic'

/**
 * EPIC-44 + Phase 6 — Dashboard V2.
 *
 * Server Components paralelos. Lê fin_summary (RPC SECURITY DEFINER) que
 * agrega V1+V2 em 1 round-trip JSON, mais forecast 30d e atividade
 * recente (budgets V2 + jobs V1 últimos atualizados).
 */
export default async function V2DashboardPage() {
  const { workspace } = await requireWorkspace()
  const supabase = await createClient()

  const [
    summary,
    forecast30,
    recentBudgetsRes,
    recentJobsRes,
    upcomingRes,
    projectTypes,
  ] = await Promise.all([
    fetchFinSummary(workspace.id),
    fetchForecast(workspace.id, 30),
    supabase
      .from('budgets_v2')
      .select('id, number, name, status, total, updated_at, project_type, project_type_other')
      .eq('workspace_id', workspace.id)
      .order('updated_at', { ascending: false })
      .limit(5),
    supabase
      .from('jobs')
      .select('id, title, client_name, total_value, revenue_total, amount_paid, status, job_date, payment_due_date, updated_at')
      .eq('workspace_id', workspace.id)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(5),
    supabase
      .from('upcoming_shootings')
      .select('shooting_date_id, budget_id, budget_name, date_start, date_end, time_start, time_end, label, local_descricao')
      .eq('workspace_id', workspace.id)
      .limit(5),
    getProjectTypes(),
  ])

  const recentBudgets    = recentBudgetsRes.data ?? []
  const recentJobs       = recentJobsRes.data ?? []
  const upcoming         = upcomingRes.data ?? []

  const trendPct = summary && summary.receita_prev > 0
    ? ((summary.receita_mes - summary.receita_prev) / summary.receita_prev) * 100
    : null

  // Top 3 alertas (vencidos/inadimplência + saldo crítico)
  const alerts: Array<{ tone: 'amber' | 'red' | 'blue'; icon: string; text: string; href?: string }> = []
  if (summary && summary.inadimplencia_qtd > 0) {
    alerts.push({
      tone: 'red',
      icon: '⚠️',
      text: `${summary.inadimplencia_qtd} cobrança${summary.inadimplencia_qtd === 1 ? '' : 's'} vencida${summary.inadimplencia_qtd === 1 ? '' : 's'} — total ${fmtBRL(summary.inadimplencia_valor)}`,
      href: '/v2/financeiro?tab=forecast',
    })
  }
  if (summary && summary.caixa_saldo < 0) {
    alerts.push({
      tone: 'amber',
      icon: '📉',
      text: `Caixa do mês negativo: ${fmtBRL(summary.caixa_saldo)} — saídas pesando mais que entradas`,
      href: '/v2/financeiro?tab=caixa',
    })
  }
  if (summary && summary.proximas_saidas_30d > summary.proximas_entradas_30d * 1.3 && summary.proximas_saidas_30d > 0) {
    alerts.push({
      tone: 'amber',
      icon: '⚡',
      text: `Próximos 30 dias: saídas (${fmtBRL(summary.proximas_saidas_30d)}) maiores que entradas (${fmtBRL(summary.proximas_entradas_30d)})`,
      href: '/v2/financeiro?tab=forecast',
    })
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-[#a3a3a3]">
          Visão geral do seu negócio — {workspace.name}.
        </p>
      </header>

      {alerts.length > 0 && (
        <section className="space-y-2">
          {alerts.map((a, i) => {
            const cls = a.tone === 'red'
              ? 'border-red-500/30 bg-red-500/5 text-red-300'
              : a.tone === 'amber'
              ? 'border-amber-500/30 bg-amber-500/5 text-amber-300'
              : 'border-blue-500/30 bg-blue-500/5 text-blue-300'
            const inner = (
              <span className="flex items-center gap-2">
                <span>{a.icon}</span>
                <span className="text-sm">{a.text}</span>
              </span>
            )
            return a.href
              ? <Link key={i} href={a.href} className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5 hover:bg-opacity-10 ${cls}`}>{inner}<span className="text-xs opacity-70">Abrir →</span></Link>
              : <div key={i} className={`flex items-center gap-3 rounded-lg border px-4 py-2.5 ${cls}`}>{inner}</div>
          })}
        </section>
      )}

      {/* Call-out: visão narrativa "Seu mês em 30 segundos" (Dashboard V1) */}
      <Link
        href="/dashboard"
        className="group flex flex-col gap-3 rounded-xl border-2 border-[#D4A853]/40 bg-gradient-to-br from-[#D4A853]/10 via-[#0d0d0d] to-[#0d0d0d] p-5 transition-all hover:border-[#D4A853]/70 hover:from-[#D4A853]/20 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
      >
        <div className="flex items-start gap-4">
          <div className="text-3xl">📖</div>
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[#D4A853]">
              Quer entender o que esses números significam?
            </div>
            <div className="mt-1 text-lg font-bold text-white">
              Seu mês em 30 segundos
            </div>
            <div className="mt-1 text-xs text-[#a3a3a3]">
              Explicação humana sem jargão de contador.{' '}
              <span className="text-[#D4A853]/80">
                Inadimplência · Receita · Custos · Clientes · Diagnóstico
              </span>
              {' '}— cada aba responde uma pergunta prática do seu negócio.
            </div>
          </div>
        </div>
        <div className="shrink-0">
          <span className="inline-flex items-center gap-2 rounded-md bg-[#D4A853] px-4 py-2.5 text-sm font-semibold text-black transition-transform group-hover:translate-x-1">
            Abrir explicação
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </span>
        </div>
      </Link>

      {/* 4 KPIs financeiros reais */}
      {summary ? (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Faturado este mês"
            value={fmtBRL(summary.receita_mes)}
            hint={`${summary.qtd_projetos} projeto${summary.qtd_projetos === 1 ? '' : 's'} executado${summary.qtd_projetos === 1 ? '' : 's'}`}
            trend={trendPct}
            color="text-[#D4A853]"
            href="/v2/financeiro?tab=dre"
          />
          <KpiCard
            label="Margem do mês"
            value={`${summary.margem_pct.toFixed(1)}%`}
            hint={`Lucro ${fmtBRL(summary.margem_mes)} (custo ${fmtBRL(summary.custo_mes)})`}
            color={summary.margem_mes >= 0 ? 'text-emerald-400' : 'text-red-400'}
            href="/v2/financeiro?tab=dre"
          />
          <KpiCard
            label="Caixa do mês"
            value={fmtBRL(summary.caixa_saldo)}
            hint={`Entrou ${fmtBRL(summary.caixa_entradas)} · Saiu ${fmtBRL(summary.caixa_saidas)}`}
            color={summary.caixa_saldo >= 0 ? 'text-blue-400' : 'text-red-400'}
            href="/v2/financeiro?tab=caixa"
          />
          <KpiCard
            label="Próximos 30 dias"
            value={fmtBRL(summary.proximas_entradas_30d - summary.proximas_saidas_30d)}
            hint={`${summary.qtd_recebimentos_30d} a receber · ${summary.qtd_pagamentos_30d} a pagar`}
            color={summary.proximas_entradas_30d >= summary.proximas_saidas_30d ? 'text-violet-400' : 'text-amber-400'}
            href="/v2/financeiro?tab=forecast"
          />
        </section>
      ) : (
        <section className="rounded-xl border border-dashed border-[#2a2a2a] bg-[#0d0d0d] p-8 text-center">
          <p className="text-sm text-[#737373]">
            Os indicadores financeiros aparecem assim que houver jobs, pedidos ou recorrências cadastrados.
          </p>
        </section>
      )}

      {/* 2 colunas: forecast 30d + próximas captações */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-[#1a1a1a] bg-[#0d0d0d] p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[#a3a3a3]">
              💰 Próximos 30 dias
            </h2>
            <Link href="/v2/financeiro?tab=forecast" className="text-xs text-[#D4A853] hover:underline">
              Ver tudo →
            </Link>
          </div>
          {forecast30.length === 0 ? (
            <p className="text-xs text-[#525252]">
              Nada agendado nos próximos 30 dias.
            </p>
          ) : (
            <ul className="space-y-2">
              {forecast30.slice(0, 6).map((f) => {
                const fl = fonteLabel(f.fonte)
                const tipoCls = f.tipo === 'a_receber' ? 'text-emerald-400' : 'text-red-400'
                return (
                  <li key={`${f.fonte}-${f.ref_id}`} className="flex items-center justify-between gap-3 rounded-md p-2 -m-2 hover:bg-[#161616]">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-xs">
                        <span>{fl.icon}</span>
                        <span className="truncate text-white">{f.ref_label}</span>
                      </div>
                      {f.cliente !== '—' ? (
                        <div className="text-[10px] text-[#737373]">{f.cliente}</div>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className={`text-sm font-mono ${tipoCls}`}>
                        {f.tipo === 'a_pagar' ? '−' : '+'} {fmtBRL(f.valor)}
                      </div>
                      <div className="text-[10px] text-[#525252]">
                        {fmtShortDate(f.data)} ({f.dias_para_data === 0 ? 'hoje' : `${f.dias_para_data}d`})
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-[#1a1a1a] bg-[#0d0d0d] p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[#a3a3a3]">
              📅 Próximas captações
            </h2>
            <Link href="/v2/budgets" className="text-xs text-[#D4A853] hover:underline">
              Ver todas →
            </Link>
          </div>
          {upcoming.length === 0 ? (
            <p className="text-xs text-[#525252]">
              Nenhuma data marcada. Adicione datas em algum orçamento na aba 📅 Datas.
            </p>
          ) : (
            <ul className="space-y-3">
              {upcoming.map((s) => (
                <li key={s.shooting_date_id}>
                  <Link href={`/v2/budgets/${s.budget_id}`} className="flex items-start justify-between gap-3 rounded-md p-2 -m-2 hover:bg-[#161616]">
                    <div className="min-w-0">
                      <div className="text-sm text-white truncate">{s.budget_name || 'Sem nome'}</div>
                      {s.label || s.local_descricao ? (
                        <div className="text-[11px] text-[#737373] truncate">
                          {[s.label, s.local_descricao].filter(Boolean).join(' · ')}
                        </div>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-mono text-sm text-[#D4A853]">
                        {fmtShortDate(s.date_start)}
                        {s.date_end && s.date_end !== s.date_start ? ` → ${fmtShortDate(s.date_end)}` : ''}
                      </div>
                      {s.time_start ? (
                        <div className="text-[10px] text-[#737373]">
                          {s.time_start.slice(0, 5)}{s.time_end ? `–${s.time_end.slice(0, 5)}` : ''}
                        </div>
                      ) : null}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Atividade recente: orçamentos V2 + jobs V1 */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-[#1a1a1a] bg-[#0d0d0d] p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[#a3a3a3]">
              📝 Orçamentos recentes (V2)
            </h2>
            <Link href="/v2/budgets" className="text-xs text-[#D4A853] hover:underline">
              Ver todos →
            </Link>
          </div>
          {recentBudgets.length === 0 ? (
            <p className="text-xs text-[#525252]">
              Nenhum orçamento V2 ainda.{' '}
              <Link href="/v2/budgets/new" className="text-[#D4A853] hover:underline">Criar →</Link>
            </p>
          ) : (
            <ul className="space-y-2">
              {recentBudgets.map((b) => {
                const td = projectTypeDisplay(b.project_type, b.project_type_other, projectTypes)
                return (
                  <li key={b.id}>
                    <Link href={`/v2/budgets/${b.id}`} className="flex items-center justify-between gap-3 rounded-md p-2 -m-2 hover:bg-[#161616]">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-[10px] text-[#525252]">
                          <span className="font-mono">{b.number}</span>
                          <StatusDot status={b.status} />
                        </div>
                        <div className="text-sm text-white truncate">
                          {td ? <span className="mr-1">{td.icon}</span> : null}
                          {b.name || 'Sem nome'}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm font-mono text-[#D4A853]">{fmtBRL(Number(b.total ?? 0))}</div>
                        <div className="text-[10px] text-[#525252]">{fmtShortDate(String(b.updated_at))}</div>
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-[#1a1a1a] bg-[#0d0d0d] p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[#a3a3a3]">
              🎬 Jobs recentes (V1)
            </h2>
            <Link href="/jobs" className="text-xs text-[#D4A853] hover:underline">
              Ver todos →
            </Link>
          </div>
          {recentJobs.length === 0 ? (
            <p className="text-xs text-[#525252]">Nenhum job ainda.</p>
          ) : (
            <ul className="space-y-2">
              {recentJobs.map((j) => {
                const total = Number(j.revenue_total ?? j.total_value ?? 0)
                const paid  = Number(j.amount_paid ?? 0)
                const remaining = total - paid
                return (
                  <li key={j.id}>
                    <Link href={`/jobs/${j.id}`} className="flex items-center justify-between gap-3 rounded-md p-2 -m-2 hover:bg-[#161616]">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-white truncate">
                          {j.title || j.client_name || 'Sem título'}
                        </div>
                        <div className="text-[10px] text-[#737373] truncate">
                          {j.client_name || '—'}{j.job_date ? ` · ${fmtShortDate(j.job_date)}` : ''}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm font-mono text-[#D4A853]">{fmtBRL(total)}</div>
                        {remaining > 0 ? (
                          <div className="text-[10px] text-amber-300">a receber {fmtBRL(remaining)}</div>
                        ) : (
                          <div className="text-[10px] text-emerald-400">quitado</div>
                        )}
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>

    </div>
  )
}

// ── Helpers UI ──────────────────────────────────────────────────────────────

function KpiCard({
  label, value, hint, color, href, trend,
}: {
  label: string
  value: string
  hint:  string
  color: string
  href?: string
  trend?: number | null
}) {
  const inner = (
    <>
      <div className="text-[10px] uppercase tracking-wider text-[#737373]">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${color}`}>{value}</div>
      <div className="mt-1 text-[10px] text-[#525252]">{hint}</div>
      {trend != null ? (
        <div className={`mt-1 text-[10px] font-semibold ${trend >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {trend >= 0 ? '▲' : '▼'} {Math.abs(trend).toFixed(1)}% vs mês passado
        </div>
      ) : null}
    </>
  )
  if (href) {
    return (
      <Link href={href} className="block rounded-xl border border-[#1a1a1a] bg-[#0d0d0d] p-4 transition-colors hover:bg-[#161616]">
        {inner}
      </Link>
    )
  }
  return <div className="rounded-xl border border-[#1a1a1a] bg-[#0d0d0d] p-4">{inner}</div>
}

function StatusDot({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string }> = {
    draft:     { color: 'bg-[#525252]',  label: 'Rascunho' },
    sent:      { color: 'bg-blue-400',   label: 'Enviado' },
    approved:  { color: 'bg-emerald-400', label: 'Aprovado' },
    rejected:  { color: 'bg-red-400',     label: 'Recusado' },
    converted: { color: 'bg-violet-400',  label: 'Convertido' },
    expired:   { color: 'bg-amber-400',   label: 'Vencido' },
    archived:  { color: 'bg-[#3a3a3a]',   label: 'Arquivado' },
  }
  const s = map[status] ?? map.draft
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-[#a3a3a3]">
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${s.color}`} />
      {s.label}
    </span>
  )
}

