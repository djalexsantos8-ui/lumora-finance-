import { createAdminClient } from '@/lib/supabase/server'
import { checkAdmin } from '@/lib/auth/is-admin'
import { redirect } from 'next/navigation'
import PlanoImplementacaoClient from './client'

export const dynamic = 'force-dynamic'

type Task = {
  id: string
  epic_code: string
  title: string
  description_simple: string | null
  description_technical: string | null
  area: string
  priority: 'P0' | 'P1' | 'P2' | 'P3'
  status: 'pending' | 'doing' | 'blocked' | 'validating' | 'done' | 'cancelled'
  result: string | null
  blocker: string | null
  next_step: string | null
  notes: string | null
  parent_task_id: string | null
  auto_created: boolean
  started_at: string | null
  finished_at: string | null
  created_at: string
  updated_at: string
}

async function loadTasks() {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('implementation_tasks')
    .select('*')
    .order('priority', { ascending: true })
    .order('epic_code', { ascending: true })

  if (error) return { rows: [] as Task[], error: error.message }
  return { rows: (data ?? []) as Task[], error: null }
}

export default async function PlanoImplementacaoPage() {
  const check = await checkAdmin()
  if (!check.isAdmin) redirect('/dashboard')

  const { rows, error } = await loadTasks()

  return <PlanoImplementacaoClient initialTasks={rows} loadError={error} />
}
