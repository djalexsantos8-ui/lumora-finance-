import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import RecurringEditor from './recurring-editor'
import { listContractsByOrigin } from '@/lib/actions/contracts'
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

  const contractsRes = await listContractsByOrigin('recurring', id)
  const linkedContracts = contractsRes.success ? contractsRes.data : []

  return (
    <>
      <RecurringEditor item={data as RecurringRevenue} />
      <div className="max-w-5xl mx-auto px-6 md:px-8 pb-10">
        <ContractEntryPoint
          originKind="recurring"
          originId={id}
          contracts={linkedContracts}
        />
      </div>
    </>
  )
}
