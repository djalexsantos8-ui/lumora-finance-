import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import BudgetPreview from './budget-preview'
import type { Budget, BudgetItem } from '@/types/budget'
import type { WorkspaceSettings } from '@/types/workspace-settings'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('budgets').select('title').eq('id', id).single()
  return { title: `Preview — ${data?.title ?? 'Orçamento'} — Lumora Finance` }
}

export default async function BudgetPreviewPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: budget, error } = await supabase
    .from('budgets')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (error || !budget) notFound()

  const { data: settings } = await supabase
    .from('workspace_settings')
    .select('*')
    .eq('workspace_id', budget.workspace_id)
    .maybeSingle()

  // Somente itens marcados para o PDF
  const { data: items } = await supabase
    .from('budget_items')
    .select('*')
    .eq('budget_id', id)
    .eq('show_in_pdf', true)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })

  return (
    <BudgetPreview
      budget={budget as Budget}
      settings={settings as WorkspaceSettings | null}
      items={(items ?? []) as BudgetItem[]}
    />
  )
}
