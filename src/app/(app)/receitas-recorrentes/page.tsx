import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import RecurringList from './recurring-list'
import { NewRecurringButton } from './new-recurring-button'
import type { RecurringRevenue } from '@/types/recurring-revenue'

export const metadata = { title: 'Receita Recorrente — Lumora Finance' }

export default async function ReceitasRecorrentesPage() {
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

  const { data: items } = await supabase
    .from('recurring_revenue')
    .select('*')
    .eq('workspace_id', member.workspace_id)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })

  const list = (items ?? []) as RecurringRevenue[]

  return (
    <div className="min-h-full p-6 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Receita Recorrente</h1>
          <p className="text-[#a3a3a3] text-sm mt-0.5">
            {list.length === 0
              ? 'Nenhum contrato recorrente cadastrado'
              : `${list.length} contrato${list.length !== 1 ? 's' : ''} ativo${list.length !== 1 ? 's' : ''} / cadastrado${list.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <NewRecurringButton />
      </div>

      <RecurringList items={list} />
    </div>
  )
}
