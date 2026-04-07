'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type {
  JobStatus,
  JobType,
  JobCategory,
  PaymentCondition,
  JobActionResult,
  JobPaymentActionResult,
  JobWithPaymentsResult,
} from '@/types/job'

// ─── helpers ──────────────────────────────────────────────────────────────────

async function getWorkspaceId(userId: string): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()
  return data?.workspace_id ?? null
}

// ─── CREATE — cria job e redireciona para o detalhe ──────────────────────────

export async function createJob(): Promise<never> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()

  if (authErr || !user) redirect('/login')

  const workspaceId = await getWorkspaceId(user.id)
  if (!workspaceId) redirect('/dashboard')

  const { data, error } = await supabase
    .from('jobs')
    .insert({
      workspace_id:      workspaceId,
      created_by:        user.id,
      title:             'Job sem título',
      client_name:       '',
      status:            'in_progress' as JobStatus,
      job_type:          'freelance'   as JobType,
      payment_condition: 'upfront'     as PaymentCondition,
      currency:          'BRL',
      total_value:       0,
      job_date:          new Date().toISOString().split('T')[0],
    })
    .select('id')
    .single()

  if (error || !data) {
    console.error('[jobs/create]', error)
    redirect('/jobs')
  }

  revalidatePath('/jobs')
  redirect(`/jobs/${data.id}`)
}

// ─── UPDATE INFO — campos editáveis do job ────────────────────────────────────

export async function updateJob(
  id: string,
  fields: {
    title?:             string
    client_name?:       string
    client_email?:      string
    category?:          JobCategory | null
    job_type?:          JobType
    total_value?:       number
    currency?:          string
    payment_condition?: PaymentCondition
    job_date?:          string
    payment_due_date?:  string
    status?:            JobStatus
    notes?:             string
    budget_id?:         string | null
  }
): Promise<JobActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()

  if (authErr || !user) return { success: false, error: 'Não autorizado.' }

  // Garante que workspace_id nunca será alterado via updateJob
  const payload: Record<string, unknown> = {}

  if (fields.title !== undefined)
    payload.title = fields.title.trim() || 'Job sem título'
  if (fields.client_name !== undefined)
    payload.client_name = fields.client_name.trim()
  if (fields.client_email !== undefined)
    payload.client_email = fields.client_email.trim() || null
  if ('category' in fields)
    payload.category = fields.category ?? null
  if (fields.job_type !== undefined)
    payload.job_type = fields.job_type
  if (fields.total_value !== undefined)
    payload.total_value = Math.max(0, Math.round(fields.total_value * 100) / 100)
  if (fields.currency !== undefined)
    payload.currency = fields.currency
  if (fields.payment_condition !== undefined)
    payload.payment_condition = fields.payment_condition
  if (fields.job_date !== undefined)
    payload.job_date = fields.job_date || new Date().toISOString().split('T')[0]
  if (fields.payment_due_date !== undefined)
    payload.payment_due_date = fields.payment_due_date || null
  if (fields.status !== undefined)
    payload.status = fields.status
  if (fields.notes !== undefined)
    payload.notes = fields.notes.trim() || null
  if ('budget_id' in fields)
    payload.budget_id = fields.budget_id ?? null

  if (Object.keys(payload).length === 0)
    return { success: false, error: 'Nenhum campo para atualizar.' }

  const { data, error } = await supabase
    .from('jobs')
    .update(payload)
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single()

  if (error) {
    console.error('[jobs/update]', error)
    return { success: false, error: 'Erro ao salvar job.' }
  }

  revalidatePath('/jobs')
  revalidatePath(`/jobs/${id}`)
  return { success: true, data }
}

// ─── UPDATE STATUS — atalho para trocar só o status ──────────────────────────

export async function updateJobStatus(
  id: string,
  status: JobStatus
): Promise<JobActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()

  if (authErr || !user) return { success: false, error: 'Não autorizado.' }

  const { data, error } = await supabase
    .from('jobs')
    .update({ status })
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single()

  if (error) {
    console.error('[jobs/update-status]', error)
    return { success: false, error: 'Erro ao atualizar status.' }
  }

  revalidatePath('/jobs')
  revalidatePath(`/jobs/${id}`)
  return { success: true, data }
}

// ─── DELETE — soft delete ────────────────────────────────────────────────────

export async function deleteJob(id: string): Promise<JobActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()

  if (authErr || !user) return { success: false, error: 'Não autorizado.' }

  const { error } = await supabase
    .from('jobs')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)

  if (error) {
    console.error('[jobs/delete]', error)
    return { success: false, error: 'Erro ao excluir job.' }
  }

  revalidatePath('/jobs')
  return { success: true }
}

// ─── ADD PAYMENT — insere em job_payments, trigger recalcula amount_paid ──────

export async function addPayment(
  jobId: string,
  fields: {
    amount:      number
    received_at: string  // YYYY-MM-DD
    notes?:      string
    currency?:   string
  }
): Promise<JobPaymentActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()

  if (authErr || !user) return { success: false, error: 'Não autorizado.' }

  if (!fields.amount || fields.amount <= 0)
    return { success: false, error: 'Valor deve ser maior que zero.' }

  if (!fields.received_at)
    return { success: false, error: 'Data de recebimento é obrigatória.' }

  // Busca moeda do job caso não seja informada
  let currency = fields.currency
  if (!currency) {
    const { data: job } = await supabase
      .from('jobs')
      .select('currency')
      .eq('id', jobId)
      .is('deleted_at', null)
      .maybeSingle()
    currency = job?.currency ?? 'BRL'
  }

  const { data: payment, error: paymentErr } = await supabase
    .from('job_payments')
    .insert({
      job_id:      jobId,
      amount:      Math.round(fields.amount * 100) / 100,
      currency,
      received_at: fields.received_at,
      notes:       fields.notes?.trim() || null,
    })
    .select()
    .single()

  if (paymentErr) {
    console.error('[jobs/add-payment]', paymentErr)
    return { success: false, error: 'Erro ao registrar pagamento.' }
  }

  // Busca job atualizado (amount_paid recalculado pelo trigger)
  const { data: updatedJob } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .is('deleted_at', null)
    .maybeSingle()

  revalidatePath('/jobs')
  revalidatePath(`/jobs/${jobId}`)
  return { success: true, data: payment, job: updatedJob ?? undefined }
}

// ─── DELETE PAYMENT — remove pagamento, trigger recalcula amount_paid ─────────

export async function deletePayment(
  paymentId: string,
  jobId: string
): Promise<JobPaymentActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()

  if (authErr || !user) return { success: false, error: 'Não autorizado.' }

  const { error } = await supabase
    .from('job_payments')
    .delete()
    .eq('id', paymentId)

  if (error) {
    console.error('[jobs/delete-payment]', error)
    return { success: false, error: 'Erro ao remover pagamento.' }
  }

  // Busca job atualizado (amount_paid recalculado pelo trigger)
  const { data: updatedJob } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .is('deleted_at', null)
    .maybeSingle()

  revalidatePath('/jobs')
  revalidatePath(`/jobs/${jobId}`)
  return { success: true, job: updatedJob ?? undefined }
}

// ─── BULK DELETE — soft delete em lote (listagem) ────────────────────────────

export async function bulkDeleteJobs(
  ids: string[]
): Promise<{ success: boolean; error?: string }> {
  if (!ids.length) return { success: false, error: 'Nenhum job selecionado.' }

  const supabase = await createClient()
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()

  if (authErr || !user) return { success: false, error: 'Não autorizado.' }

  const { error } = await supabase
    .from('jobs')
    .update({ deleted_at: new Date().toISOString() })
    .in('id', ids)
    .is('deleted_at', null)

  if (error) {
    console.error('[jobs/bulk-delete]', error)
    return { success: false, error: 'Erro ao excluir jobs.' }
  }

  revalidatePath('/jobs')
  return { success: true }
}

// ─── GET WITH PAYMENTS — para a tela de detalhe ───────────────────────────────

export async function getJobWithPayments(id: string): Promise<JobWithPaymentsResult> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()

  if (authErr || !user) return { success: false, error: 'Não autorizado.' }

  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (jobErr || !job) return { success: false, error: 'Job não encontrado.' }

  const { data: payments } = await supabase
    .from('job_payments')
    .select('*')
    .eq('job_id', id)
    .order('received_at', { ascending: false })

  return {
    success: true,
    data: { ...job, payments: payments ?? [] },
  }
}
