import Link from 'next/link'
import { requireWorkspace } from '@/lib/workspace/get-current-workspace'
import { fmtBRL } from '@/lib/v2/budget-calc'
import {
  fetchCaixaRealizado, fetchDreCompetencia, fetchFinSummary, fetchForecast,
  fmtMonthLabel, fmtShortDate, fonteLabel, forecastHref,
} from '@/lib/v2/financial'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ tab?: string; months?: string; horizon?: string }>
}

type Tab = 'dre' | 'caixa' | 'forecast'

/**
 * Phase 6 — Página financeira completa.
 *
 * 3 tabs: DRE (competência), Caixa (realizado) e Forecast (próximos 90d).
 * Tabs via query param ?tab= pra preservar URL e voltar fácil.
 */
export default async function FinanceiroPage({ searchParams }: PageProps) {
  const params = await searchParams
  const { workspace } = await requireWorkspace()

  const tab: Tab    = (params.tab as Tab) ?? 'dre'
  const months      = Math.min(36, Math.max(1, Number(params.months ?? '12')))
  const horizon     = Math.min(180, Math.max(1, Number(params.horizon ?? '90')))

  const summary = await fetchFinSummary(workspace.id)

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-white">Financeiro</h1>
        <p className="mt-1 text-sm text-[#737373]">
          Tudo que importa em uma tela: o que você faturou, o que entrou no caixa,
          e o que tá pra entrar/sair nos próximos dias.
        </p>
      </header>

      {/* KPIs do mês corrente — sempre visíveis */}
      {summary ? (
        <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Mini label="Faturado este mês"  value={fmtBRL(summary.receita_mes)}     color="text-[#D4A853]" />
          <Mini label="Margem"             value={`${summary.margem_pct.toFixed(1)}%`} color={summary.margem_mes >= 0 ? 'text-emerald-400' : 'text-red-400'} />
          <Mini label="Caixa do mês"       value={fmtBRL(summary.caixa_saldo)}     color={summary.caixa_saldo >= 0 ? 'text-blue-400' : 'text-red-400'} />
          <Mini label="Inadimplência"      value={fmtBRL(summary.inadimplencia_valor)} color={summary.inadimplencia_qtd > 0 ? 'text-amber-400' : 'text-[#737373]'} hint={summary.inadimplencia_qtd > 0 ? `${summary.inadimplencia_qtd} cobrança${summary.inadimplencia_qtd === 1 ? '' : 's'} vencida${summary.inadimplencia_qtd === 1 ? '' : 's'}` : 'tudo em dia'} />
        </section>
      ) : null}

      {/* Tabs */}
      <div className="mb-4 flex gap-2 border-b border-[#1f1f1f]">
        <TabLink current={tab} self="dre"      label="📊 DRE" />
        <TabLink current={tab} self="caixa"    label="💰 Caixa" />
        <TabLink current={tab} self="forecast" label="🔭 Previsão" />
      </div>

      {tab === 'dre' && <DreTab workspaceId={workspace.id} months={months} />}
      {tab === 'caixa' && <CaixaTab workspaceId={workspace.id} months={months} />}
      {tab === 'forecast' && <ForecastTab workspaceId={workspace.id} horizon={horizon} />}
    </div>
  )
}

// ── DRE Tab ─────────────────────────────────────────────────────────────────
async function DreTab({ workspaceId, months }: { workspaceId: string; months: number }) {
  const rows = await fetchDreCompetencia(workspaceId, months)
  const hasData = rows.some((r) => r.receita_total > 0 || r.custo_direto > 0)

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-[#1f1f1f] bg-[#0d0d0d]/40 p-3 text-xs text-[#a3a3a3]">
        💡 <strong className="text-white">Regime de competência:</strong> a receita aparece no mês em que o trabalho foi <em>executado</em>, não em que o cliente pagou.
        Ex: você filmou em janeiro, o cliente pagou em março? Aqui conta janeiro.
      </div>

      {!hasData ? (
        <EmptyHint
          title="Sem dados financeiros nos últimos meses"
          msg="Cadastre jobs, pedidos ou recorrências pra começar a ver o resultado por mês."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#1f1f1f] bg-[#0d0d0d]">
          <table className="w-full text-sm">
            <thead className="border-b border-[#1f1f1f] bg-[#111] text-xs uppercase tracking-wider text-[#737373]">
              <tr>
                <th className="px-4 py-2 text-left">Mês</th>
                <th className="px-4 py-2 text-right">Projetos</th>
                <th className="px-4 py-2 text-right">Receita</th>
                <th className="px-4 py-2 text-right">Custos</th>
                <th className="px-4 py-2 text-right">Lucro</th>
                <th className="px-4 py-2 text-right">Margem</th>
                <th className="px-4 py-2 text-right">Ticket médio</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.mes} className="border-b border-[#1f1f1f] last:border-0 hover:bg-[#111]">
                  <td className="px-4 py-2.5 font-mono text-xs text-white">{fmtMonthLabel(r.mes)}</td>
                  <td className="px-4 py-2.5 text-right text-xs text-[#a3a3a3]">{r.qtd_projetos || '—'}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-[#D4A853]">{fmtBRL(r.receita_total)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-amber-300">{fmtBRL(r.custo_direto)}</td>
                  <td className={`px-4 py-2.5 text-right font-mono ${r.margem_bruta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {fmtBRL(r.margem_bruta)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs">
                    <MarginBadge pct={r.margem_pct} />
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-[#a3a3a3]">{r.ticket_medio > 0 ? fmtBRL(r.ticket_medio) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[10px] text-[#525252]">
        Receita inclui jobs (V1), pedidos (V1), recorrências (faturas mensais) e orçamentos V2 status &quot;convertido&quot;.
        Custos diretos = despesas do mês com data de execução + repasses de recorrências.
      </p>
    </div>
  )
}

// ── Caixa Tab ───────────────────────────────────────────────────────────────
async function CaixaTab({ workspaceId, months }: { workspaceId: string; months: number }) {
  const rows = await fetchCaixaRealizado(workspaceId, months)
  const hasData = rows.some((r) => r.entradas_total > 0 || r.saidas_total > 0)

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-[#1f1f1f] bg-[#0d0d0d]/40 p-3 text-xs text-[#a3a3a3]">
        💡 <strong className="text-white">Regime de caixa:</strong> só o que <em>de fato</em> entrou ou saiu da conta naquele mês — não o que você faturou.
      </div>

      {!hasData ? (
        <EmptyHint
          title="Nenhum movimento confirmado nos últimos meses"
          msg="Confirme pagamentos recebidos (jobs/pedidos/recorrências) e despesas pagas pra ver o caixa real."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#1f1f1f] bg-[#0d0d0d]">
          <table className="w-full text-sm">
            <thead className="border-b border-[#1f1f1f] bg-[#111] text-xs uppercase tracking-wider text-[#737373]">
              <tr>
                <th className="px-4 py-2 text-left">Mês</th>
                <th className="px-4 py-2 text-right">Entradas</th>
                <th className="px-4 py-2 text-right">Despesas variáveis</th>
                <th className="px-4 py-2 text-right">Custos fixos</th>
                <th className="px-4 py-2 text-right">Saldo do mês</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.mes} className="border-b border-[#1f1f1f] last:border-0 hover:bg-[#111]">
                  <td className="px-4 py-2.5 font-mono text-xs text-white">{fmtMonthLabel(r.mes)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-emerald-400">+ {fmtBRL(r.entradas_total)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-red-300">− {fmtBRL(r.saidas_variaveis)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-red-300">− {fmtBRL(r.saidas_fixas)}</td>
                  <td className={`px-4 py-2.5 text-right font-mono font-bold ${r.saldo >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                    {fmtBRL(r.saldo)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[10px] text-[#525252]">
        Entradas = pagamentos recebidos (jobs + pedidos status &quot;pago&quot; + faturas recorrentes pagas).
        Saídas = despesas marcadas como pagas + custos fixos pagos.
      </p>
    </div>
  )
}

// ── Forecast Tab ────────────────────────────────────────────────────────────
async function ForecastTab({ workspaceId, horizon }: { workspaceId: string; horizon: number }) {
  const rows = await fetchForecast(workspaceId, horizon)
  const aReceber = rows.filter((r) => r.tipo === 'a_receber')
  const aPagar   = rows.filter((r) => r.tipo === 'a_pagar')
  const totalReceber = aReceber.reduce((s, r) => s + r.valor, 0)
  const totalPagar   = aPagar.reduce((s, r) => s + r.valor, 0)

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-[#1f1f1f] bg-[#0d0d0d]/40 p-3 text-xs text-[#a3a3a3]">
        💡 <strong className="text-white">Previsão dos próximos {horizon} dias:</strong> tudo que tem data marcada pra entrar (cobranças pendentes) ou sair (despesas e custos fixos não pagos).
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Mini label={`A receber (${horizon}d)`} value={fmtBRL(totalReceber)} color="text-emerald-400" hint={`${aReceber.length} cobrança${aReceber.length === 1 ? '' : 's'}`} />
        <Mini label={`A pagar (${horizon}d)`}   value={fmtBRL(totalPagar)}   color="text-red-400" hint={`${aPagar.length} pagamento${aPagar.length === 1 ? '' : 's'}`} />
        <Mini label="Resultado projetado"        value={fmtBRL(totalReceber - totalPagar)} color={(totalReceber - totalPagar) >= 0 ? 'text-blue-400' : 'text-amber-400'} hint="entradas − saídas" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ForecastList title="📥 A receber"
          tone="emerald"
          rows={aReceber}
          emptyMsg="Nada agendado pra entrar nos próximos dias."
        />
        <ForecastList title="📤 A pagar"
          tone="red"
          rows={aPagar}
          emptyMsg="Nada agendado pra sair nos próximos dias."
        />
      </div>
    </div>
  )
}

// ── Helpers UI ──────────────────────────────────────────────────────────────
function TabLink({ current, self, label }: { current: Tab; self: Tab; label: string }) {
  const active = current === self
  return (
    <Link
      href={`/v2/financeiro?tab=${self}`}
      className={`rounded-t-md px-4 py-2 text-sm transition-colors ${
        active ? 'border-b-2 border-[#D4A853] text-white' : 'text-[#737373] hover:text-white'
      }`}
    >
      {label}
    </Link>
  )
}

function Mini({ label, value, color, hint }: { label: string; value: string; color: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-[#1f1f1f] bg-[#0d0d0d] p-4">
      <div className="text-[10px] uppercase tracking-wider text-[#737373]">{label}</div>
      <div className={`mt-1 text-xl font-bold ${color}`}>{value}</div>
      {hint ? <div className="mt-1 text-[10px] text-[#525252]">{hint}</div> : null}
    </div>
  )
}

function MarginBadge({ pct }: { pct: number }) {
  const meta = pct >= 50
    ? { cls: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30', label: '🟢' }
    : pct >= 30
    ? { cls: 'bg-amber-500/10 text-amber-300 border-amber-500/30',     label: '🟡' }
    : pct >= 0
    ? { cls: 'bg-red-500/10 text-red-300 border-red-500/30',           label: '🔴' }
    : { cls: 'bg-red-500/15 text-red-400 border-red-500/40',           label: '⚠️' }
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-bold ${meta.cls}`}>
      {meta.label} {pct.toFixed(1)}%
    </span>
  )
}

function EmptyHint({ title, msg }: { title: string; msg: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#2a2a2a] bg-[#0d0d0d] p-12 text-center">
      <h3 className="mb-2 text-base font-semibold text-white">{title}</h3>
      <p className="mx-auto max-w-md text-sm text-[#737373]">{msg}</p>
    </div>
  )
}

function ForecastList({
  title, tone, rows, emptyMsg,
}: {
  title:    string
  tone:     'emerald' | 'red'
  rows:     Awaited<ReturnType<typeof fetchForecast>>
  emptyMsg: string
}) {
  const valorCls = tone === 'emerald' ? 'text-emerald-400' : 'text-red-400'
  return (
    <div className="rounded-xl border border-[#1f1f1f] bg-[#0d0d0d] p-5">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#a3a3a3]">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-[#525252]">{emptyMsg}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const fl = fonteLabel(r.fonte)
            const overdue = r.dias_para_data < 0
            const href = forecastHref(r.fonte, r.ref_id)
            return (
              <li key={`${r.fonte}-${r.ref_id}`}>
                <Link
                  href={href}
                  className="flex items-center justify-between gap-3 rounded-md p-2 -m-2 hover:bg-[#161616]"
                  title={`Abrir ${fl.label}`}
                >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs">
                    <span title={fl.label}>{fl.icon}</span>
                    <span className="truncate text-white">{r.ref_label}</span>
                  </div>
                  {r.cliente !== '—' ? (
                    <div className="text-[10px] text-[#737373] truncate">{r.cliente}</div>
                  ) : null}
                </div>
                <div className="shrink-0 text-right">
                  <div className={`text-sm font-mono ${valorCls}`}>{fmtBRL(r.valor)}</div>
                  <div className={`text-[10px] ${overdue ? 'text-red-400' : 'text-[#525252]'}`}>
                    {fmtShortDate(r.data)} · {r.dias_para_data === 0 ? 'hoje' : (overdue ? `vencido há ${Math.abs(r.dias_para_data)}d` : `em ${r.dias_para_data}d`)}
                  </div>
                </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
