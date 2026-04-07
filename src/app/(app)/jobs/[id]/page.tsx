import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import JobDetail from './job-detail'
import type { Job, JobPayment } from '@/types/job'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from('jobs')
    .select('title, client_name')
    .eq('id', id)
    .maybeSingle()
  const title = data?.title ?? 'Job'
  const client = data?.client_name ? ` · ${data.client_name}` : ''
  return { title: `${title}${client} — Lumora Finance` }
}

export default async function JobDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: job, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (error || !job) notFound()

  const { data: payments } = await supabase
    .from('job_payments')
    .select('*')
    .eq('job_id', id)
    .order('received_at', { ascending: false })

  return (
    <JobDetail
      job={job as Job}
      initialPayments={(payments ?? []) as JobPayment[]}
    />
  )
}
