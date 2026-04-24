import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import RecurringEditor from './recurring-editor'
import { listContractsByOriginQuery } from '@/lib/queries/contracts'
import { listInvoicesByRecurring } from '@/lib/actions/recurring-invoices'
import {
  listRecurringItems,
  listRecurringCostItems,
} from '@/lib/actions/recurring-items'
import type { RecurringRevenue } from '@/types/recurring-revenue'

// Hardening 2026-04-23 — evita RSC stale em cache na edge causar sumiço
// temporário do ContractEntryPoint pós-deploy.
export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = { title: 'Receita Recorrente — Lumora Finance' }

export default async function RecurringDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
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

  const { data } = await supabase
    .from('recurring_revenue')
    .select('*')
    .eq('id', id)
    .eq('workspace_id', member.workspace_id)
    .is('deleted_at', null)
    .maybeSingle()

  if (!data) notFound()

  const [linkedContracts, invoices, itemsRes, costItemsRes] = await Promise.all([
    listContractsByOriginQuery('recurring', id),
    listInvoicesByRecurring(id),
    listRecurringItems(id),
    listRecurringCostItems(id),
  ])

  // Pente fino 2026-04-23: ContractEntryPoint agora é renderizado DENTRO
  // do RecurringEditor (herda max-w-3xl e fica alinhado com o editor).
  return (
    <RecurringEditor
      item={data as RecurringRevenue}
      initialInvoices={invoices}
      linkedContracts={linkedContracts}
      initialItems={itemsRes.items}
      initialCostItems={costItemsRes.items}
      itemsTableMissing={itemsRes.tableMissing}
      costsTableMissing={costItemsRes.tableMissing}
    />
  )
}
