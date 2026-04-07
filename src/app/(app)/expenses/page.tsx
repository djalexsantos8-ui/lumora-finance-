import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ExpensesClient } from './expenses-client'
import type { Expense } from '@/types/expense'

export const metadata = { title: 'Despesas — Lumora Finance' }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseMonthParam(raw: string | undefined): string {
  if (raw && /^\d{4}-\d{2}$/.test(raw)) {
    const [y, m] = raw.split('-').map(Number)
    if (m >= 1 && m <= 12) return raw
  }
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function monthRange(param: string): { from: string; to: string } {
  const [y, m] = param.split('-').map(Number)
  const from = `${param}-01`
  const to   = new Date(y, m, 0).toISOString().split('T')[0]  // last day of month
  return { from, to }
}

function monthLabel(param: string): string {
  const [y, m] = param.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface Props {
  searchParams: Promise<{ month?: string }>
}

export default async function ExpensesPage({ searchParams }: Props) {
  const { month } = await searchParams
  const monthParam = parseMonthParam(month)
  const { from, to } = monthRange(monthParam)

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  if (!member) redirect('/dashboard')

  const { data: expenses } = await supabase
    .from('expenses')
    .select('*')
    .eq('workspace_id', member.workspace_id)
    .is('deleted_at', null)
    .gte('expense_date', from)
    .lte('expense_date', to)
    .order('expense_date', { ascending: false })

  return (
    <div className="min-h-full p-6 md:p-8">
      <div className="flex items-center justify-between mb-6 gap-4">
        <h1 className="text-xl font-bold text-white">Despesas</h1>
      </div>
      <ExpensesClient
        key={monthParam}
        initialExpenses={(expenses ?? []) as Expense[]}
        monthParam={monthParam}
        monthLabel={monthLabel(monthParam)}
      />
    </div>
  )
}
