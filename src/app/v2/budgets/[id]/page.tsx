import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import BudgetEditorClient from './client'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function BudgetEditorV2Page({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const [budgetRes, itemsRes, clientsRes] = await Promise.all([
    supabase.from('budgets_v2').select('*').eq('id', id).maybeSingle(),
    supabase
      .from('budget_items_v2')
      .select('*')
      .eq('budget_id', id)
      .order('sort_order', { ascending: true }),
    supabase
      .from('clients')
      .select('id, name')
      .is('deleted_at', null)
      .order('name'),
  ])

  if (!budgetRes.data) notFound()

  return (
    <BudgetEditorClient
      budget={budgetRes.data}
      initialItems={itemsRes.data ?? []}
      clients={clientsRes.data ?? []}
    />
  )
}
