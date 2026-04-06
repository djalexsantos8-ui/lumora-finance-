import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import BudgetEditor from './budget-editor'
import type { Budget, BudgetItem } from '@/types/budget'
import type { Freelancer } from '@/types/freelancer'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from('budgets')
    .select('title')
    .eq('id', id)
    .single()
  return { title: `${data?.title ?? 'Orçamento'} — Lumora Finance` }
}

export default async function BudgetPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Busca o orçamento (RLS garante acesso apenas ao workspace do usuário)
  const { data: budget, error } = await supabase
    .from('budgets')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (error || !budget) notFound()

  // Busca itens do orçamento ordenados por sort_order
  const { data: items } = await supabase
    .from('budget_items')
    .select('*')
    .eq('budget_id', id)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  // Busca freelancers ativos do workspace para o dropdown
  const { data: freelancers } = await supabase
    .from('freelancers')
    .select('id, name, role, daily_rate, currency')
    .eq('workspace_id', budget.workspace_id)
    .is('deleted_at', null)
    .order('name', { ascending: true })

  return (
    <BudgetEditor
      budget={budget as Budget}
      items={(items ?? []) as BudgetItem[]}
      freelancers={(freelancers ?? []) as Freelancer[]}
    />
  )
}
