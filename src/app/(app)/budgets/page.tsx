import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createBudget } from '@/lib/actions/budgets'
import { formatCurrency } from '@/lib/utils/format'
import type { Budget, BudgetStatus } from '@/types/budget'

export const metadata = { title: 'Orçamentos — Lumora Finance' }

export default async function BudgetsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member, error: memberError } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  console.log('[budgets] user.id:', user.id)
  console.log('[budgets] member:', JSON.stringify(member))
  console.log('[budgets] memberError:', JSON.stringify(memberError))

  if (!member) redirect('/dashboard')

  const { data: budgets } = await supabase
    .from('budgets')
    .select('*')
    .eq('workspace_id', member.workspace_id)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })

  const list = (budgets ?? []) as Budget[]

  return (
    <div className="min-h-full p-6 md:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Orçamentos</h1>
          <p className="text-[#a3a3a3] text-sm mt-0.5">
            {list.length === 0
              ? 'Nenhum orçamento criado ainda'
              : `${list.length} orçamento${list.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <form action={createBudget}>
          <button
            type="submit"
            className="flex items-center gap-2 bg-[#D4A853] hover:bg-[#E8C47A] text-[#0a0a0a] font-semibold text-sm px-4 py-2.5 rounded-xl transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Novo Orçamento
          </button>
        </form>
      </div>

      {/* Empty state */}
      {list.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#141414] border border-[#2a2a2a] flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-[#D4A853]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-white font-medium mb-1">Nenhum orçamento ainda</p>
          <p className="text-[#525252] text-sm max-w-xs mb-6">
            Crie orçamentos profissionais com cálculo de margem e PDFs apresentáveis para seus clientes.
          </p>
          <form action={createBudget}>
            <button
              type="submit"
              className="flex items-center gap-2 bg-[#D4A853] hover:bg-[#E8C47A] text-[#0a0a0a] font-semibold text-sm px-4 py-2.5 rounded-xl transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Criar primeiro orçamento
            </button>
          </form>
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((budget) => (
            <Link
              key={budget.id}
              href={`/budgets/${budget.id}`}
              className="flex items-center justify-between bg-[#141414] border border-[#2a2a2a] hover:border-[#3a3a3a] rounded-xl p-4 transition-all group"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <p className="text-sm font-semibold text-white truncate">
                    {budget.title || 'Orçamento sem título'}
                  </p>
                  <StatusBadge status={budget.status} />
                </div>
                <p className="text-xs text-[#525252] truncate">
                  {budget.client_name || 'Cliente não informado'}
                </p>
              </div>
              <div className="flex items-center gap-4 shrink-0 ml-4">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-semibold text-white">
                    {formatCurrency(budget.total, budget.currency)}
                  </p>
                  <p className="text-xs text-[#525252]">total</p>
                </div>
                <svg
                  className="w-4 h-4 text-[#525252] group-hover:text-[#a3a3a3] transition-colors"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: BudgetStatus }) {
  const map: Record<BudgetStatus, { label: string; cls: string }> = {
    draft:    { label: 'Rascunho', cls: 'bg-[#262626] text-[#a3a3a3]' },
    sent:     { label: 'Enviado',  cls: 'bg-blue-500/10 text-blue-400' },
    approved: { label: 'Aprovado', cls: 'bg-emerald-500/10 text-emerald-400' },
    rejected: { label: 'Rejeitado', cls: 'bg-red-500/10 text-red-400' },
    expired:  { label: 'Expirado', cls: 'bg-[#262626] text-[#525252]' },
  }
  const { label, cls } = map[status] ?? map.draft
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${cls}`}>
      {label}
    </span>
  )
}
