import { redirect } from 'next/navigation'
import { checkAdmin } from '@/lib/auth/is-admin'
import {
  listAICreditGrants,
  getAICreditAdminKpis,
} from '@/lib/ai/admin-actions'
import GrantForm from './grant-form'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Créditos de IA — Admin Lumora' }

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day:    '2-digit',
      month:  '2-digit',
      year:   'numeric',
      hour:   '2-digit',
      minute: '2-digit',
    })
  } catch { return '—' }
}

export default async function AdminAICreditsPage() {
  const check = await checkAdmin()
  if (!check.isAdmin) redirect('/dashboard')

  const [{ grants }, kpis] = await Promise.all([
    listAICreditGrants(100),
    getAICreditAdminKpis(),
  ])

  const activeWorkspaces = kpis.active_workspaces
  const includedUsagePct = kpis.included_limit_month > 0
    ? Math.round((kpis.included_used_month / kpis.included_limit_month) * 100)
    : 0

  return (
    <div className="space-y-8">
      {/* ─── Header ─────────────────────────────────────────────────────── */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-[#D4A853] font-semibold mb-1">
          Créditos de IA
        </p>
        <h1 className="text-2xl font-bold">Gestão de créditos</h1>
        <p className="text-sm text-[#737373] mt-1">
          Plano mensal inclui 100 créditos que resetam todo mês. Aqui você pode
          conceder créditos extras de cortesia (parcerias, beta, reembolso)
          sem passar pelo Stripe.
        </p>
      </div>

      {/* ─── KPIs ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi
          label="Concedidos (ativos)"
          value={kpis.granted_active}
          sub={`${kpis.granted_lifetime} no total histórico`}
          accent
        />
        <Kpi
          label="Comprados (ativos)"
          value={kpis.purchased_active}
          sub={`${kpis.purchased_lifetime} histórico · via Stripe`}
        />
        <Kpi
          label="Consumidos este mês"
          value={kpis.consumed_this_month}
          sub={`${kpis.included_used_month} do plano incluído · ${includedUsagePct}% do teto`}
        />
        <Kpi
          label="Workspaces com atividade"
          value={activeWorkspaces}
          sub="no mês corrente"
        />
      </div>

      {/* ─── Grant form ────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-[#1a1a1a] bg-[#0d0d0d] p-6">
        <h2 className="text-sm font-semibold text-white mb-4">
          Conceder créditos extras
        </h2>
        <GrantForm />
      </div>

      {/* ─── Historical grants table ──────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-semibold text-white mb-3">
          Histórico de concessões ({grants.length})
        </h2>
        <div className="rounded-lg border border-[#1a1a1a] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#111] text-[10px] uppercase tracking-wider text-[#737373]">
              <tr>
                <th className="text-left  px-4 py-2.5 font-medium">Usuário</th>
                <th className="text-right px-4 py-2.5 font-medium">Qtd</th>
                <th className="text-left  px-4 py-2.5 font-medium">Motivo</th>
                <th className="text-left  px-4 py-2.5 font-medium">Expira</th>
                <th className="text-right px-4 py-2.5 font-medium">Concedido em</th>
              </tr>
            </thead>
            <tbody>
              {grants.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-[#525252] text-sm">
                    Nenhum grant manual registrado ainda.
                  </td>
                </tr>
              )}
              {grants.map(g => (
                <tr key={g.id} className="border-t border-[#1a1a1a] hover:bg-[#0d0d0d]">
                  <td className="px-4 py-3 text-xs">
                    {g.full_name ? (
                      <>
                        <div className="text-white">{g.full_name}</div>
                        <div className="text-[10px] text-[#737373]">{g.email ?? '—'}</div>
                      </>
                    ) : (
                      <span className="text-[#a3a3a3]">{g.email ?? '(sem email)'}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-[#D4A853] font-semibold">
                    +{g.amount}
                  </td>
                  <td className="px-4 py-3 text-xs text-[#a3a3a3] max-w-md truncate" title={g.reason ?? ''}>
                    {g.reason ?? <span className="text-[#525252]">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {g.expires_at ? (
                      <span className="text-[#a3a3a3]">{formatDate(g.expires_at)}</span>
                    ) : (
                      <span className="text-emerald-400">Perpétuo</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-[#737373]">
                    {formatDate(g.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Privacy note ──────────────────────────────────────────────── */}
      <div className="rounded-lg border border-[#1a1a1a] bg-[#0d0d0d] p-4 text-[11px] text-[#737373] leading-relaxed">
        <strong className="block mb-1 text-[#a3a3a3]">LGPD / Privacidade</strong>
        Esta página exibe APENAS email e nome do owner do workspace. Nenhum dado
        de cliente final, descrição de projeto ou conteúdo textual é exibido aqui.
        Histórico de grants é append-only (append de eventos, sem UPDATE/DELETE) —
        audit trail preservado.
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────

function Kpi({
  label, value, sub, accent,
}: {
  label: string
  value: number
  sub?:  string
  accent?: boolean
}) {
  return (
    <div className={`rounded-lg border p-4 ${accent
      ? 'border-[#D4A853]/30 bg-[#D4A853]/5'
      : 'border-[#1a1a1a] bg-[#0d0d0d]'}`}>
      <div className="text-[10px] uppercase tracking-wider text-[#737373] mb-1.5">
        {label}
      </div>
      <div className={`text-2xl font-bold tabular-nums ${accent ? 'text-[#D4A853]' : 'text-white'}`}>
        {value.toLocaleString('pt-BR')}
      </div>
      {sub && (
        <div className="text-[10px] text-[#525252] mt-1">{sub}</div>
      )}
    </div>
  )
}
