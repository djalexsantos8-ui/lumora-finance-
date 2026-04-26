import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import EscolherPlanoClient from './client'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ canceled?: string }>
}

export default async function EscolherPlanoPage({ searchParams }: PageProps) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Se já tem subscription V2 ativa → manda pro dashboard
  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('subscriptions_v2')
    .select('id, status')
    .eq('user_id', user.id)
    .in('status', ['trialing', 'active'])
    .maybeSingle()

  if (existing) redirect('/dashboard')

  const params = await searchParams
  const canceled = params.canceled === '1'

  return (
    <EscolherPlanoClient
      email={user.email ?? ''}
      canceled={canceled}
    />
  )
}
