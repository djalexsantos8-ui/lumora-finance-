'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { JobCostCategory, JobItemActionResult } from '@/types/job'

// ─── helpers ──────────────────────────────────────────────────────────────────

function parseDecimal(raw: string | number): number {
  if (typeof raw === 'number') return isNaN(raw) ? 0 : Math.max(0, raw)
  const cleaned = String(raw).replace(/[^\d.,]/g, '').replace(',', '.')
  const val = parseFloat(cleaned)
  return isNaN(val) ? 0 : Math.max(0, Math.round(val * 100) / 100)
}

async function fetchUpdatedJob(supabase: Awaited<ReturnType<typeof createClient>>, jobId: string) {
  const { data } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .is('deleted_at', null)
    .maybeSingle()
  return data ?? undefined
}

// ─── REVENUE ITEMS ────────────────────────────────────────────────────────────

export async function addRevenueItem(
  jobId: string,
  fields: { description: string; quantity: number | string; unit_value: number | string }
): Promise<JobItemActionResult> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { success: false, error: 'Não autorizado.' }

  const description = String(fields.description).trim()
  if (!description) return { success: false, error: 'Descrição obrigatória.' }

  const quantity   = Math.max(0.01, parseDecimal(fields.quantity))
  const unit_value = parseDecimal(fields.unit_value)
  const total_value = Math.round(quantity * unit_value * 100) / 100

  // sort_order = quantidade de itens ativos
  const { count } = await supabase
    .from('job_revenue_items')
    .select('*', { count: 'exact', head: true })
    .eq('job_id', jobId)
    .is('deleted_at', null)

  const { data, error } = await supabase
    .from('job_revenue_items')
    .insert({ job_id: jobId, description, quantity, unit_value, total_value, sort_order: count ?? 0 })
    .select()
    .single()

  if (error) {
    console.error('[job-items/add-revenue]', error)
    return { success: false, error: 'Erro ao adicionar item.' }
  }

  const updatedJob = await fetchUpdatedJob(supabase, jobId)
  revalidatePath(`/jobs/${jobId}`)
  return { success: true, data, job: updatedJob }
}

export async function updateRevenueItem(
  itemId: string,
  jobId: string,
  fields: { description?: string; quantity?: number | string; unit_value?: number | string }
): Promise<JobItemActionResult> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { success: false, error: 'Não autorizado.' }

  const payload: Record<string, unknown> = {}

  if (fields.description !== undefined) {
    const d = String(fields.description).trim()
    if (!d) return { success: false, error: 'Descrição obrigatória.' }
    payload.description = d
  }

  // Busca valores atuais para recalcular total
  const { data: current } = await supabase
    .from('job_revenue_items')
    .select('quantity, unit_value')
    .eq('id', itemId)
    .maybeSingle()

  const quantity   = fields.quantity   !== undefined ? Math.max(0.01, parseDecimal(fields.quantity))   : Number(current?.quantity ?? 1)
  const unit_value = fields.unit_value !== undefined ? parseDecimal(fields.unit_value)                  : Number(current?.unit_value ?? 0)

  if (fields.quantity   !== undefined) payload.quantity   = quantity
  if (fields.unit_value !== undefined) payload.unit_value = unit_value
  payload.total_value = Math.round(quantity * unit_value * 100) / 100

  const { data, error } = await supabase
    .from('job_revenue_items')
    .update(payload)
    .eq('id', itemId)
    .is('deleted_at', null)
    .select()
    .single()

  if (error) {
    console.error('[job-items/update-revenue]', error)
    return { success: false, error: 'Erro ao atualizar item.' }
  }

  const updatedJob = await fetchUpdatedJob(supabase, jobId)
  revalidatePath(`/jobs/${jobId}`)
  return { success: true, data, job: updatedJob }
}

export async function deleteRevenueItem(
  itemId: string,
  jobId: string
): Promise<JobItemActionResult> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { success: false, error: 'Não autorizado.' }

  const { error } = await supabase
    .from('job_revenue_items')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', itemId)
    .is('deleted_at', null)

  if (error) {
    console.error('[job-items/delete-revenue]', error)
    return { success: false, error: 'Erro ao remover item.' }
  }

  const updatedJob = await fetchUpdatedJob(supabase, jobId)
  revalidatePath(`/jobs/${jobId}`)
  return { success: true, job: updatedJob }
}

// ─── COST ITEMS ───────────────────────────────────────────────────────────────

export async function addCostItem(
  jobId: string,
  fields: {
    description: string
    category:    JobCostCategory
    quantity:    number | string
    unit_value:  number | string
  }
): Promise<JobItemActionResult> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { success: false, error: 'Não autorizado.' }

  const description = String(fields.description).trim()
  if (!description) return { success: false, error: 'Descrição obrigatória.' }

  const quantity    = Math.max(0.01, parseDecimal(fields.quantity))
  const unit_value  = parseDecimal(fields.unit_value)
  const total_value = Math.round(quantity * unit_value * 100) / 100

  const { count } = await supabase
    .from('job_cost_items')
    .select('*', { count: 'exact', head: true })
    .eq('job_id', jobId)
    .is('deleted_at', null)

  const { data, error } = await supabase
    .from('job_cost_items')
    .insert({
      job_id: jobId,
      description,
      category:   fields.category,
      quantity,
      unit_value,
      total_value,
      sort_order: count ?? 0,
    })
    .select()
    .single()

  if (error) {
    console.error('[job-items/add-cost]', error)
    return { success: false, error: 'Erro ao adicionar custo.' }
  }

  const updatedJob = await fetchUpdatedJob(supabase, jobId)
  revalidatePath(`/jobs/${jobId}`)
  return { success: true, data, job: updatedJob }
}

export async function updateCostItem(
  itemId: string,
  jobId: string,
  fields: {
    description?: string
    category?:    JobCostCategory
    quantity?:    number | string
    unit_value?:  number | string
  }
): Promise<JobItemActionResult> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { success: false, error: 'Não autorizado.' }

  const payload: Record<string, unknown> = {}

  if (fields.description !== undefined) {
    const d = String(fields.description).trim()
    if (!d) return { success: false, error: 'Descrição obrigatória.' }
    payload.description = d
  }
  if (fields.category !== undefined) payload.category = fields.category

  const { data: current } = await supabase
    .from('job_cost_items')
    .select('quantity, unit_value')
    .eq('id', itemId)
    .maybeSingle()

  const quantity   = fields.quantity   !== undefined ? Math.max(0.01, parseDecimal(fields.quantity))   : Number(current?.quantity ?? 1)
  const unit_value = fields.unit_value !== undefined ? parseDecimal(fields.unit_value)                  : Number(current?.unit_value ?? 0)

  if (fields.quantity   !== undefined) payload.quantity   = quantity
  if (fields.unit_value !== undefined) payload.unit_value = unit_value
  payload.total_value = Math.round(quantity * unit_value * 100) / 100

  const { data, error } = await supabase
    .from('job_cost_items')
    .update(payload)
    .eq('id', itemId)
    .is('deleted_at', null)
    .select()
    .single()

  if (error) {
    console.error('[job-items/update-cost]', error)
    return { success: false, error: 'Erro ao atualizar custo.' }
  }

  const updatedJob = await fetchUpdatedJob(supabase, jobId)
  revalidatePath(`/jobs/${jobId}`)
  return { success: true, data, job: updatedJob }
}

export async function deleteCostItem(
  itemId: string,
  jobId: string
): Promise<JobItemActionResult> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { success: false, error: 'Não autorizado.' }

  const { error } = await supabase
    .from('job_cost_items')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', itemId)
    .is('deleted_at', null)

  if (error) {
    console.error('[job-items/delete-cost]', error)
    return { success: false, error: 'Erro ao remover custo.' }
  }

  const updatedJob = await fetchUpdatedJob(supabase, jobId)
  revalidatePath(`/jobs/${jobId}`)
  return { success: true, job: updatedJob }
}
