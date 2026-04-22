import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import BudgetsList from './budgets-list'
import type { Budget } from '@/types/budget'

export const metadata = { title: 'Orçamentos — Lumora Finance' }

// Server component enxuto: auth + fetch + render. Toda UX de seleção em
// massa / cleanup / confirmações mora no client `BudgetsList`.
export default async function BudgetsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  if (!member) redirect('/dashboard')

  // Defensive: captura erros do PostgREST e degrada pra lista vazia em vez
  // de quebrar a renderização. Qualquer 4xx/5xx aqui vira console.warn + []
  // — usuário vê empty state ao invés de error boundary.
  const { data: budgets, error: budgetsError } = await supabase
    .from('budgets')
    .select('*')
    .eq('workspace_id', member.workspace_id)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })

  if (budgetsError) {
    console.warn('[budgets/page] falha ao carregar lista:', budgetsError.message)
  }

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
        <Link
          href="/budgets/new"
          prefetch
          className="flex items-center gap-2 bg-[#D4A853] hover:bg-[#E8C47A] text-[#0a0a0a] font-semibold text-sm px-4 py-2.5 rounded-xl transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Novo Orçamento
        </Link>
      </div>

      <BudgetsList budgets={list} />
    </div>
  )
}
