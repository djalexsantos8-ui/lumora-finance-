import Link from 'next/link'
import { requireWorkspace } from '@/lib/workspace/get-current-workspace'
import { createClient } from '@/lib/supabase/server'
import { fmtBRL } from '@/lib/v2/budget-calc'
import { getProjectTypes, projectTypeDisplay } from '@/lib/v2/project-types'

export const dynamic = 'force-dynamic'

/**
 * EPIC-44 — Dashboard V2 (versão enxuta).
 *
 * Hoje consome dados da Phase 2 (orçamentos V2 + view upcoming_shootings).
 * Quando Phase 4 (CRM), Phase 6 (DRE/Caixa/Forecast) chegarem, este dashboard
 * ganha mais widgets — `<Suspense>` por widget mantém isolamento.
 *
 * Server Components paralelos via Promise.all — sem polling, sem useEffect.
 * Re-renderiza a cada navegação Next 16.
 */
export default async function V2DashboardPage() {
  const { workspace } = await requireWorkspace()
  const supabase = await createClient()

  // ── Datas de referência ──────────────────────────────────────────────────
  const now       = new Date()
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const endMonth   = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()
  const todayIso  = now.toISOString().slice(0, 10)
  const stale14d  = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString()

  // ── Queries paralelas ────────────────────────────────────────────────────
  const [
    pipelineRes,
    approvedMonthRes,
    upcomingRes,
    recentRes,
    staleSentRes,
    projectTypes,
  ] = await Promise.all([
    // Pipeline aberto: draft + sent (não considera converted/rejected)
    supabase
      .from('budgets_v2')
      .select('id, total', { count: 'exact' })
      .eq('workspace_id', workspace.id)
      .in('status', ['draft', 'sent']),

    // Aprovados/convertidos no mês corrente — base do "faturado mês"
    supabase
      .from('budgets_v2')
      .select('id, total, total_cost, status, updated_at')
      .eq('workspace_id', workspace.id)
      .in('status', ['approved', 'converted'])
      .gte('updated_at', startMonth)
      .lt('updated_at', endMonth),

    // Próximas captações via view upcoming_shootings (EPIC-23)
    supabase
      .from('upcoming_shootings')
      .select('shooting_date_id, budget_id, budget_number, budget_name, date_start, date_end, time_start, time_end, label, local_descricao')
      .eq('workspace_id', workspace.id)
      .limit(5),

    // Atividade recente: 10 últimos budgets atualizados
    supabase
      .from('budgets_v2')
      .select('id, number, name, status, total, updated_at, project_type, project_type_other')
      .eq('workspace_id', workspace.id)
      .order('updated_at', { ascending: false })
      .limit(10),

    // Alertas: orçamentos enviados há +14 dias sem decisão
    supabase
      .from('budgets_v2')
      .select('id, number, name, total, updated_at')
      .eq('workspace_id', workspace.id)
      .eq('status', 'sent')
      .lt('updated_at', stale14d)
      .limit(5),

    getProjectTypes(),
  ])

  // ── Cálculos derivados ───────────────────────────────────────────────────
  const pipelineCount = pipelineRes.count ?? 0
  const pipelineValue = (pipelineRes.data ?? []).reduce((s, b) => s + Number(b.total ?? 0), 0)

  const approvedRows = approvedMonthRes.data ?? []
  const monthRevenue = approvedRows.reduce((s, b) => s + Number(b.total ?? 0), 0)
  const monthCost    = approvedRows.reduce((s, b) => s + Number(b.total_cost ?? 0), 0)
  const monthProfit  = monthRevenue - monthCost
  const monthMargin  = monthRevenue > 0 ? (monthProfit / monthRevenue) * 100 : 0

  const upcomingShootings = upcomingRes.data ?? []
  const recentBudgets     = recentRes.data ?? []
  const staleSent         = staleSentRes.data ?? []

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 space-y-6">
      {/* Header */}
      <header>
        <div className="text-xs uppercase tracking-wider text-[#D4A853]/70">
          Lumora V2 · {workspace.name}
        </div>
        <h1 className="mt-1 text-3xl font-bold text-white">Dashboard</h1>
        <p className="mt-2 text-sm text-[#a3a3a3]">
          Visão geral do seu negócio — atualizada a cada navegação.
        </p>
      </header>

      {/* Alertas — só aparecem se existem */}
      {staleSent.length > 0 && (
        <section className="space-y-2">
          {staleSent.map((b) => (
            <Link
              key={b.id}
              href={`/v2/budgets/${b.id}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-sm hover:bg-amber-500/10"
            >
              <span className="flex items-center gap-2">
                <span>⏳</span>
                <span className="text-amber-300">
                  Orçamento <span className="font-mono">{b.number}</span> enviado há +14 dias sem resposta — {b.name}
                </span>
              </span>
              <span className="text-xs text-amber-300/70">{fmtBRL(Number(b.total ?? 0))}</span>
            </Link>
          ))}
        </section>
      )}

      {/* 4 KPIs hero */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Pipeline aberto"
          value={fmtBRL(pipelineValue)}
          hint={`${pipelineCount} orçamento${pipelineCount === 1 ? '' : 's'} (rascunho + enviado)`}
          color="text-blue-400"
          href="/v2/budgets"
        />
        <KpiCard
          label="Faturado no mês"
          value={fmtBRL(monthRevenue)}
          hint={`${approvedRows.length} aprovado${approvedRows.length === 1 ? '' : 's'} este mês`}
          color="text-[#D4A853]"
          href="/v2/budgets"
        />
        <KpiCard
          label="Margem do mês"
          value={`${monthMargin.toFixed(1)}%`}
          hint={`Lucro ${fmtBRL(monthProfit)}`}
          color={monthProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}
        />
        <KpiCard
          label="Próximas captações"
          value={`${upcomingShootings.length}`}
          hint={upcomingShootings.length > 0
            ? `Próxima: ${fmtShortDate(upcomingShootings[0].date_start)}`
            : 'Sem datas marcadas'}
          color="text-violet-400"
        />
      </section>

      {/* Linha 2: próximas captações + atividade recente */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Próximas captações */}
        <div className="rounded-xl border border-[#1a1a1a] bg-[#0d0d0d] p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[#a3a3a3]">
              📅 Próximas captações
            </h2>
            <Link
              href="/v2/budgets"
              className="text-xs text-[#D4A853] hover:underline"
            >
              Ver todos →
            </Link>
          </div>

          {upcomingShootings.length === 0 ? (
            <p className="text-xs text-[#525252]">
              Nenhuma data marcada nos próximos dias.
              Adicione datas em algum orçamento na aba <span className="text-[#a3a3a3]">📅 Datas</span>.
            </p>
          ) : (
            <ul className="space-y-3">
              {upcomingShootings.map((s) => (
                <li key={s.shooting_date_id}>
                  <Link
                    href={`/v2/budgets/${s.budget_id}`}
                    className="flex items-start justify-between gap-3 rounded-lg p-2 -m-2 hover:bg-[#161616]"
                  >
                    <div className="min-w-0">
                      <div className="text-sm text-white truncate">
                        {s.budget_name || 'Sem nome'}
                      </div>
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

        {/* Atividade recente */}
        <div className="rounded-xl border border-[#1a1a1a] bg-[#0d0d0d] p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[#a3a3a3]">
              📝 Atividade recente
            </h2>
            <Link
              href="/v2/budgets"
              className="text-xs text-[#D4A853] hover:underline"
            >
              Ver todos →
            </Link>
          </div>

          {recentBudgets.length === 0 ? (
            <p className="text-xs text-[#525252]">
              Nenhum orçamento ainda.{' '}
              <Link href="/v2/budgets/new" className="text-[#D4A853] hover:underline">
                Criar o primeiro →
              </Link>
            </p>
          ) : (
            <ul className="space-y-2">
              {recentBudgets.map((b) => {
                const typeDisplay = projectTypeDisplay(b.project_type, b.project_type_other, projectTypes)
                return (
                  <li key={b.id}>
                    <Link
                      href={`/v2/budgets/${b.id}`}
                      className="flex items-center justify-between gap-3 rounded-lg p-2 -m-2 hover:bg-[#161616]"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] text-[#525252]">{b.number}</span>
                          <StatusDot status={b.status} />
                        </div>
                        <div className="text-sm text-white truncate">
                          {typeDisplay ? <span className="mr-1">{typeDisplay.icon}</span> : null}
                          {b.name || 'Sem nome'}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm text-[#D4A853] font-mono">{fmtBRL(Number(b.total ?? 0))}</div>
                        <div className="text-[10px] text-[#525252]">
                          {fmtShortDate(b.updated_at)}
                        </div>
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>

      {/* Atalhos */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#D4A853]/70">
          Atalhos
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Shortcut href="/v2/budgets/new"  emoji="➕" label="Novo orçamento"     hint="Cria orçamento V2 com tipo + cliente" />
          <Shortcut href="/v2/budgets"      emoji="📋" label="Orçamentos"          hint={`${recentBudgets.length} no histórico`} />
          <Shortcut href="/v2/freelancers"  emoji="👥" label="Freelancers"         hint="Sua rede de confiança" />
          <Shortcut href="/v2/equipe"       emoji="🤝" label="Equipe"               hint="Convidar membros pro workspace" />
          <Shortcut href="/dashboard"       emoji="🏠" label="Voltar pra V1"       hint="Dashboard V1 em produção" />
        </div>
      </section>
    </div>
  )
}

// ── Helpers UI ──────────────────────────────────────────────────────────────

function KpiCard({
  label, value, hint, color, href,
}: {
  label: string
  value: string
  hint:  string
  color: string
  href?: string
}) {
  const inner = (
    <>
      <div className="text-[10px] uppercase tracking-wider text-[#737373]">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${color}`}>{value}</div>
      <div className="mt-1 text-[10px] text-[#525252]">{hint}</div>
    </>
  )

  if (href) {
    return (
      <Link
        href={href}
        className="block rounded-xl border border-[#1a1a1a] bg-[#0d0d0d] p-4 transition-colors hover:bg-[#161616]"
      >
        {inner}
      </Link>
    )
  }
  return (
    <div className="rounded-xl border border-[#1a1a1a] bg-[#0d0d0d] p-4">
      {inner}
    </div>
  )
}

function StatusDot({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string }> = {
    draft:     { color: 'bg-[#525252]',     label: 'Rascunho' },
    sent:      { color: 'bg-blue-400',      label: 'Enviado' },
    approved:  { color: 'bg-emerald-400',   label: 'Aprovado' },
    rejected:  { color: 'bg-red-400',       label: 'Recusado' },
    converted: { color: 'bg-violet-400',    label: 'Convertido' },
    expired:   { color: 'bg-amber-400',     label: 'Vencido' },
    archived:  { color: 'bg-[#3a3a3a]',     label: 'Arquivado' },
  }
  const s = map[status] ?? map.draft
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-[#a3a3a3]">
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${s.color}`} />
      {s.label}
    </span>
  )
}

function Shortcut({
  href, emoji, label, hint,
}: {
  href:  string
  emoji: string
  label: string
  hint?: string
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-[#1a1a1a] bg-[#0d0d0d] p-4 transition-colors hover:bg-[#161616]"
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl">{emoji}</span>
        <div className="min-w-0">
          <div className="text-sm font-medium text-white truncate">{label}</div>
          {hint ? <div className="text-xs text-[#525252] truncate">{hint}</div> : null}
        </div>
      </div>
    </Link>
  )
}

function fmtShortDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  } catch {
    return iso
  }
}
