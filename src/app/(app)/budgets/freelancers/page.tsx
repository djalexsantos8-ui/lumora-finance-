import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import FreelancerList from './freelancer-list'
import type { Freelancer } from '@/types/freelancer'

export const metadata = { title: 'Profissionais — Lumora Finance' }

export default async function FreelancersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Busca workspace do usuário
  const { data: member } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .limit(1)
    .single()

  if (!member) redirect('/dashboard')

  // Busca freelancers ativos do workspace, ordenados por nome
  const { data: freelancers } = await supabase
    .from('freelancers')
    .select('*')
    .eq('workspace_id', member.workspace_id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  return (
    <div className="min-h-full p-6 md:p-8">
      <FreelancerList freelancers={(freelancers ?? []) as Freelancer[]} />
    </div>
  )
}
