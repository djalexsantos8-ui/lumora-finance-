import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import JobDetail from './job-detail'
import { listContractsByOriginQuery } from '@/lib/queries/contracts'
import type { Job, JobRevenueItem, JobCostItem, JobPayment } from '@/types/job'
import type { Expense } from '@/types/expense'
import type { JobFile } from '@/types/job-file'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data } = await supabase
      .from('jobs')
      .select('title, client_name')
      .eq('id', id)
      .maybeSingle()
    // Fallback defensivo: title vazio/whitespace/null → "Freelance sem título"
    // (mesmo padrão da listagem e do h1 do editor, consistência visual).
    const rawTitle = typeof data?.title === 'string' ? data.title.trim() : ''
    const title    = rawTitle || 'Freelance sem título'
    const client   = data?.client_name ? ` · ${data.client_name}` : ''
    return { title: `${title}${client} — Lumora Finance` }
  } catch {
    return { title: 'Freelance — Lumora Finance' }
  }
}

export default async function JobDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Join com clients via FK client_id → permite pré-popular a ficha completa
  // do cliente no modo expandido do freelance sem endpoint extra.
  // Quando client_id é null, `client` vem null (nada quebra).
  const { data: job, error } = await supabase
    .from('jobs')
    .select('*, client:clients(id, name, phone, instagram, email, document, notes)')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (error || !job) notFound()

  const [
    { data: revenueItems },
    { data: costItems },
    { data: payments },
    { data: jobExpenses },
    { data: jobFiles },
  ] = await Promise.all([
    supabase
      .from('job_revenue_items')
      .select('*')
      .eq('job_id', id)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true }),
    supabase
      .from('job_cost_items')
      .select('*')
      .eq('job_id', id)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true }),
    supabase
      .from('job_payments')
      .select('*')
      .eq('job_id', id)
      .order('received_at', { ascending: false }),
    // Despesas operacionais DESTE freelance (expenses.job_id = id).
    // Não tocamos em aggregators; é o próprio detalhe que calcula o lucro.
    supabase
      .from('expenses')
      .select('*')
      .eq('job_id', id)
      .is('deleted_at', null)
      .order('expense_date', { ascending: false })
      .order('created_at',   { ascending: false }),
    // Arquivos anexos (contratos, comprovantes, entregáveis). Metadata em
    // job_files; binário em bucket job-files via signed URL sob demanda.
    supabase
      .from('job_files')
      .select('*')
      .eq('job_id', id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
  ])

  const linkedContracts = await listContractsByOriginQuery('freelance', id)

  // Pente fino 2026-04-23: ContractEntryPoint agora é renderizado DENTRO
  // do JobDetail (herda max-w-3xl e fica alinhado com o resto do editor).
  return (
    <JobDetail
      job={job as Job}
      initialRevenueItems={(revenueItems ?? []) as JobRevenueItem[]}
      initialCostItems={(costItems    ?? []) as JobCostItem[]}
      initialPayments={(payments      ?? []) as JobPayment[]}
      initialJobExpenses={(jobExpenses ?? []) as Expense[]}
      initialJobFiles={(jobFiles      ?? []) as JobFile[]}
      linkedContracts={linkedContracts}
    />
  )
}
