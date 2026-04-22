import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import RecurringEditor from './recurring-editor'
import { listContractsByOriginQuery } from '@/lib/queries/contracts'
import { ContractEntryPoint } from '@/components/contracts/contract-entry-point'
import type { RecurringRevenue } from '@/types/recurring-revenue'

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

  const linkedContracts = await listContractsByOriginQuery('recurring', id)

  return (
    <>
      <RecurringEditor item={data as RecurringRevenue} />
      {/* Alinhado com max-w do recurring-editor (max-w-3xl) */}
      <div className="max-w-3xl mx-auto px-6 md:px-8 pb-10">
        <ContractEntryPoint
          originKind="recurring"
          originId={id}
          contracts={linkedContracts}
        />
      </div>
    </>
  )
}
