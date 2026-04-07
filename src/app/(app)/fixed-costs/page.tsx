import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { FixedCostsClient } from './fixed-costs-client'
import type { FixedCost } from '@/types/expense'

export const metadata = { title: 'Custos Fixos — Lumora Finance' }

export default async function FixedCostsPage() {
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

  const { data: fixedCosts } = await supabase
    .from('fixed_costs')
    .select('*')
    .eq('workspace_id', member.workspace_id)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  return (
    <div className="min-h-full p-6 md:p-8">
      <div className="flex items-center justify-between mb-6 gap-4">
        <h1 className="text-xl font-bold text-white">Custos Fixos</h1>
      </div>
      <FixedCostsClient
        initialItems={(fixedCosts ?? []) as FixedCost[]}
      />
    </div>
  )
}
