'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { randomUUID } from 'crypto'
import { getWorkspaceId } from '@/lib/utils/workspace'
import type { FixedCostCategory, FixedCostActionResult, FixedCost } from '@/types/expense'
import { normalizeFixedCostCategory } from '@/types/expense'

// ─── CREATE RECORRENTE ────────────────────────────────────────────────────────
// Cria UM registro que se repete todo mês enquanto is_active = true.

export async function createRecurringCost(fields: {
  description:   string
  category:      FixedCostCategory
  amount:        number
  currency?:     string
  start_date:    string          // YYYY-MM-DD
  is_deductible: boolean
  notes?:        string
  // Multimoeda
  exchange_rate?: number | null
  amount_brl?:    number | null
  iof_applied?:   boolean
  iof_amount?:    number | null
}): Promise<FixedCostActionResult> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { success: false, message: 'Não autorizado.' }

  const workspaceId = await getWorkspaceId(user.id)
  if (!workspaceId) return { success: false, message: 'Workspace não encontrado.' }

  if (!fields.description.trim()) return { success: false, message: 'Descrição obrigatória.' }
  if (fields.amount <= 0)         return { success: false, message: 'Valor deve ser maior que zero.' }

  const billingDay = fields.start_date
    ? parseInt(fields.start_date.split('-')[2], 10)
    : 1

  const payload = {
    workspace_id:   workspaceId,
    created_by:     user.id,
    name:           fields.description.trim(),
    description:    fields.description.trim(),
    category:       normalizeFixedCostCategory(fields.category),
    amount:         Math.round(fields.amount * 100) / 100,
    currency:       (fields.currency ?? 'BRL').toUpperCase(),
    billing_day:    billingDay,
    is_active:      true,
    is_deductible:  fields.is_deductible,
    notes:          fields.notes?.trim() || null,
    is_recurring:   true,
    is_installment: false,
    start_date:     fields.start_date,
    end_date:       null as null,
    next_due_date:  fields.start_date,
    exchange_rate:  fields.exchange_rate ?? null,
    amount_brl:     fields.amount_brl ?? null,
    iof_applied:    fields.iof_applied ?? false,
    iof_amount:     fields.iof_amount ?? null,
  }


  const { data, error } = await supabase
    .from('fixed_costs')
    .insert(payload)
    .select()
    .single()

  if (error) {
    console.error('[fixed-costs/create-recurring] error:', JSON.stringify(error))
    return { success: false, message: error.message ?? 'Erro ao criar custo fixo.' }
  }

  revalidatePath('/fixed-costs')
  return { success: true, data }
}

// ─── CREATE PARCELADO ─────────────────────────────────────────────────────────
// Cria N registros (um por parcela), agrupados por parent_fixed_cost_id.

export async function createInstallmentCost(fields: {
  description:    string
  category:       FixedCostCategory
  amount_per:     number          // valor por parcela
  installments:   number          // total de parcelas
  currency?:      string
  start_date:     string          // YYYY-MM-DD — mês da 1ª parcela
  is_deductible:  boolean
  notes?:         string
  exchange_rate?: number | null
  amount_brl?:    number | null   // amount_brl POR PARCELA
  iof_applied?:   boolean
  iof_amount?:    number | null   // iof POR PARCELA
}): Promise<{ success: boolean; count?: number; message?: string }> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { success: false, message: 'Não autorizado.' }

  const workspaceId = await getWorkspaceId(user.id)
  if (!workspaceId) return { success: false, message: 'Workspace não encontrado.' }

  if (!fields.description.trim())  return { success: false, message: 'Descrição obrigatória.' }
  if (fields.amount_per <= 0)      return { success: false, message: 'Valor deve ser maior que zero.' }
  if (fields.installments < 2)     return { success: false, message: 'Parcelado requer ao menos 2 parcelas.' }

  const parentId   = randomUUID()
  const billingDay = parseInt(fields.start_date.split('-')[2], 10)
  const [y, m]     = fields.start_date.split('-').map(Number)
  const currency   = (fields.currency ?? 'BRL').toUpperCase()
  const now        = new Date().toISOString()

  const rows = Array.from({ length: fields.installments }, (_, i) => {
    const monthOffset = i
    const date = new Date(y, m - 1 + monthOffset, billingDay)
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(billingDay).padStart(2, '0')}`

    return {
      id:                    i === 0 ? parentId : randomUUID(),
      workspace_id:          workspaceId,
      created_by:            user.id,
      name:                  fields.description.trim(),
      description:           fields.description.trim(),
      category:              normalizeFixedCostCategory(fields.category),
      amount:                Math.round(fields.amount_per * 100) / 100,
      currency,
      billing_day:           billingDay,
      is_active:             true,
      is_deductible:         fields.is_deductible,
      notes:                 fields.notes?.trim() || null,
      is_recurring:          false,
      is_installment:        true,
      installments_total:    fields.installments,
      installment_index:     i + 1,
      parent_fixed_cost_id:  parentId,
      start_date:            dateStr,
      end_date:              null,
      next_due_date:         dateStr,
      exchange_rate:         fields.exchange_rate ?? null,
      amount_brl:            fields.amount_brl ?? null,
      iof_applied:           fields.iof_applied ?? false,
      iof_amount:            fields.iof_amount ?? null,
      is_paid:               false,
      created_at:            now,
    }
  })

  const { error } = await supabase.from('fixed_costs').insert(rows)

  if (error) {
    console.error('[fixed-costs/create-installment]', error)
    return { success: false, message: `Erro ao criar parcelas: ${error.message}` }
  }

  revalidatePath('/fixed-costs')
  return { success: true, count: fields.installments }
}

// ─── LEGACY CREATE (mantido para compatibilidade) ─────────────────────────────

export async function createFixedCost(fields: {
  description:   string
  category:      FixedCostCategory
  amount:        number
  currency?:     string
  billing_day:   number
  is_active?:    boolean
  is_deductible: boolean
  notes?:        string
}): Promise<FixedCostActionResult> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { success: false, message: 'Não autorizado.' }

  const workspaceId = await getWorkspaceId(user.id)
  if (!workspaceId) return { success: false, message: 'Workspace não encontrado.' }

  if (!fields.description.trim()) return { success: false, message: 'Descrição obrigatória.' }
  if (fields.amount <= 0)         return { success: false, message: 'Valor deve ser maior que zero.' }

  const billingDay = Math.max(1, Math.min(31, Math.round(fields.billing_day)))

  const { data, error } = await supabase
    .from('fixed_costs')
    .insert({
      workspace_id:   workspaceId,
      created_by:     user.id,
      name:           fields.description.trim(),
      description:    fields.description.trim(),
      category:       normalizeFixedCostCategory(fields.category),
      amount:         Math.round(fields.amount * 100) / 100,
      currency:       (fields.currency ?? 'BRL').toUpperCase(),
      billing_day:    billingDay,
      is_active:      fields.is_active ?? true,
      is_deductible:  fields.is_deductible,
      notes:          fields.notes?.trim() || null,
      is_recurring:   true,
      is_installment: false,
    })
    .select()
    .single()

  if (error) {
    console.error('[fixed-costs/create]', error)
    return { success: false, message: 'Erro ao criar custo fixo.' }
  }

  revalidatePath('/fixed-costs')
  return { success: true, data }
}

// ─── TOGGLE is_active ─────────────────────────────────────────────────────────

export async function toggleFixedCost(
  id: string,
  isActive: boolean
): Promise<FixedCostActionResult> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { success: false, message: 'Não autorizado.' }

  const { data, error } = await supabase
    .from('fixed_costs')
    .update({ is_active: isActive })
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single()

  if (error) {
    console.error('[fixed-costs/toggle]', error)
    return { success: false, message: 'Erro ao atualizar custo fixo.' }
  }

  revalidatePath('/fixed-costs')
  return { success: true, data }
}

// ─── ENCERRAR RECORRENTE ──────────────────────────────────────────────────────
// Define end_date = hoje e desativa o custo recorrente.

export async function endRecurringCost(id: string): Promise<FixedCostActionResult> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { success: false, message: 'Não autorizado.' }

  const today = new Date().toLocaleDateString('en-CA')

  const { data, error } = await supabase
    .from('fixed_costs')
    .update({ is_active: false, end_date: today })
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single()

  if (error) {
    console.error('[fixed-costs/end]', error)
    return { success: false, message: 'Erro ao encerrar custo recorrente.' }
  }

  revalidatePath('/fixed-costs')
  return { success: true, data }
}

// ─── GET INSTALLMENTS REMAINING ───────────────────────────────────────────────
// Retorna parcelas não pagas de um grupo, ordenadas por installment_index.

export async function getFixedCostInstallments(
  parentId: string
): Promise<{ success: boolean; items?: FixedCost[]; message?: string }> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { success: false, message: 'Não autorizado.' }

  const { data, error } = await supabase
    .from('fixed_costs')
    .select('*')
    .eq('parent_fixed_cost_id', parentId)
    .is('deleted_at', null)
    .order('installment_index', { ascending: true })

  if (error) {
    console.error('[fixed-costs/get-installments]', error)
    return { success: false, message: 'Erro ao buscar parcelas.' }
  }

  return { success: true, items: data ?? [] }
}

// ─── SETTLE SELECTED FIXED COSTS ─────────────────────────────────────────────
// Quita parcelas selecionadas, com desconto opcional na última.

export async function settleSelectedFixedCosts(
  ids: string[],
  paidTotal?: number
): Promise<{ success: boolean; count?: number; message?: string }> {
  if (!ids.length) return { success: false, message: 'Nenhuma parcela selecionada.' }

  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { success: false, message: 'Não autorizado.' }

  // Busca as parcelas selecionadas
  const { data: selected, error: fetchErr } = await supabase
    .from('fixed_costs')
    .select('id, amount, installment_index, is_paid')
    .in('id', ids)
    .is('deleted_at', null)
    .order('installment_index', { ascending: true })

  if (fetchErr || !selected?.length) {
    return { success: false, message: 'Erro ao buscar parcelas.' }
  }

  const n          = selected.length
  const now        = new Date().toISOString()
  const totalOrig  = selected.reduce((s, e) => s + Number(e.amount), 0)
  const paidAmt    = paidTotal != null && paidTotal > 0 ? paidTotal : totalOrig
  const lastOrigAmt = Number(selected[n - 1].amount)

  // Distribui: todas exceto última recebem valor original, última recebe o restante
  const paidNonLast = selected
    .slice(0, n - 1)
    .reduce((s, e) => s + Number(e.amount), 0)
  const paidLast    = Math.max(0, Math.round((paidAmt - paidNonLast) * 100) / 100)
  const discLast    = Math.max(0, Math.round((lastOrigAmt - paidLast) * 100) / 100)

  const results = await Promise.all(
    selected.map((e, i) => {
      const isLast   = i === n - 1
      const paidThis = isLast ? paidLast : Math.round(Number(e.amount) * 100) / 100
      const discThis = isLast && discLast > 0.005 ? discLast : null
      return supabase
        .from('fixed_costs')
        .update({ is_paid: true, paid_at: now, paid_amount: paidThis, discount_amount: discThis })
        .eq('id', e.id)
    })
  )

  const failed = results.filter(r => r.error)
  if (failed.length) {
    console.error('[fixed-costs/settle-selected]', failed[0].error)
    return { success: false, message: 'Erro ao quitar parcelas.' }
  }

  revalidatePath('/fixed-costs')
  return { success: true, count: n }
}

// ─── UNPAY INSTALLMENT ───────────────────────────────────────────────────────
// Desfaz o pagamento de uma parcela individual (reverte is_paid para false).

export async function unpayInstallment(
  id: string
): Promise<FixedCostActionResult> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { success: false, message: 'Não autorizado.' }

  const { data, error } = await supabase
    .from('fixed_costs')
    .update({ is_paid: false, paid_at: null, paid_amount: null, discount_amount: null })
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single()

  if (error) {
    console.error('[fixed-costs/unpay-installment]', error)
    return { success: false, message: error.message ?? 'Erro ao desfazer pagamento.' }
  }

  revalidatePath('/fixed-costs')
  return { success: true, data }
}

// ─── UNPAY MONTHLY RECURRING ─────────────────────────────────────────────────
// Desfaz o pagamento do mês atual de um custo recorrente (limpa last_paid_date).

export async function unpayMonthlyRecurring(
  id: string
): Promise<FixedCostActionResult> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { success: false, message: 'Não autorizado.' }

  const { data, error } = await supabase
    .from('fixed_costs')
    .update({ last_paid_date: null })
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single()

  if (error) {
    console.error('[fixed-costs/unpay-monthly]', error)
    return { success: false, message: error.message ?? 'Erro ao desfazer pagamento.' }
  }

  revalidatePath('/fixed-costs')
  return { success: true, data }
}

// ─── PAY MONTHLY RECURRING ────────────────────────────────────────────────────
// Registra pagamento do mês atual para um custo recorrente.
// Armazena last_paid_date = hoje. UI usa isso para mostrar "Pago este mês".

export async function payMonthlyRecurring(
  id: string
): Promise<FixedCostActionResult> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { success: false, message: 'Não autorizado.' }

  const today = new Date().toLocaleDateString('en-CA')

  const { data, error } = await supabase
    .from('fixed_costs')
    .update({ last_paid_date: today })
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single()

  if (error) {
    console.error('[fixed-costs/pay-monthly]', error)
    return { success: false, message: error.message ?? 'Erro ao registrar pagamento.' }
  }

  revalidatePath('/fixed-costs')
  return { success: true, data }
}

// ─── PAY NEXT INSTALLMENT ─────────────────────────────────────────────────────
// Quita a próxima parcela não paga de um grupo (ação rápida, sem desconto).

export async function payNextInstallment(
  parentId: string
): Promise<{ success: boolean; paidIndex?: number; message?: string }> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { success: false, message: 'Não autorizado.' }

  // Busca a primeira parcela não paga do grupo
  const { data: next, error: fetchErr } = await supabase
    .from('fixed_costs')
    .select('id, installment_index, amount')
    .eq('parent_fixed_cost_id', parentId)
    .eq('is_paid', false)
    .is('deleted_at', null)
    .order('installment_index', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (fetchErr) {
    console.error('[fixed-costs/pay-next-installment]', fetchErr)
    return { success: false, message: 'Erro ao buscar parcela.' }
  }
  if (!next) return { success: false, message: 'Nenhuma parcela pendente.' }

  const now = new Date().toISOString()
  const { error: updateErr } = await supabase
    .from('fixed_costs')
    .update({ is_paid: true, paid_at: now, paid_amount: Number(next.amount) })
    .eq('id', next.id)

  if (updateErr) {
    console.error('[fixed-costs/pay-next-installment]', updateErr)
    return { success: false, message: updateErr.message ?? 'Erro ao quitar parcela.' }
  }

  revalidatePath('/fixed-costs')
  return { success: true, paidIndex: next.installment_index ?? undefined }
}

// ─── UPDATE FIXED COST ───────────────────────────────────────────────────────
// Atualiza campos editáveis e grava histórico para campos que mudaram de valor.

export async function updateFixedCost(
  id: string,
  fields: {
    description?:           string
    category?:              FixedCostCategory
    amount?:                number
    billing_day?:           number
    start_date?:            string | null
    reminder_days_before?:  number | null
    installment_note?:      string | null
  }
): Promise<FixedCostActionResult> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { success: false, message: 'Não autorizado.' }

  const workspaceId = await getWorkspaceId(user.id)
  if (!workspaceId) return { success: false, message: 'Workspace não encontrado.' }

  // Busca estado atual para diff de histórico
  const { data: current, error: fetchErr } = await supabase
    .from('fixed_costs')
    .select('id,description,category,amount,billing_day,start_date')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (fetchErr || !current) return { success: false, message: 'Custo não encontrado.' }

  // Monta payload apenas com campos fornecidos
  const payload: Record<string, unknown> = {}
  if (fields.description !== undefined) payload.description = fields.description.trim()
  if (fields.description !== undefined) payload.name        = fields.description.trim()
  if (fields.category    !== undefined) payload.category    = normalizeFixedCostCategory(fields.category)
  if (fields.amount      !== undefined) payload.amount      = Math.round(fields.amount * 100) / 100
  if (fields.billing_day !== undefined) payload.billing_day = Math.max(1, Math.min(31, fields.billing_day))
  if (fields.start_date  !== undefined) payload.start_date  = fields.start_date
  if (fields.reminder_days_before !== undefined) {
    // Migration aplicada 2026-04-24: CHECK 0..60 ou NULL. Clampa defensivo.
    const n = fields.reminder_days_before
    payload.reminder_days_before =
      n === null ? null : Math.max(0, Math.min(60, Math.round(Number(n) || 0)))
  }
  if (fields.installment_note !== undefined) {
    const t = fields.installment_note
    payload.installment_note = t === null ? null : (String(t).trim() || null)
  }

  const { data, error } = await supabase
    .from('fixed_costs')
    .update(payload)
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single()

  if (error) {
    console.error('[fixed-costs/update]', error)
    return { success: false, message: error.message ?? 'Erro ao atualizar.' }
  }

  // Grava histórico dos campos que mudaram
  const historyRows: {
    cost_id: string; workspace_id: string; changed_by: string
    field: string; old_value: string | null; new_value: string | null
  }[] = []

  if (fields.description !== undefined && fields.description.trim() !== current.description) {
    historyRows.push({ cost_id: id, workspace_id: workspaceId, changed_by: user.id,
      field: 'description', old_value: current.description, new_value: fields.description.trim() })
  }
  if (fields.category !== undefined && fields.category !== current.category) {
    historyRows.push({ cost_id: id, workspace_id: workspaceId, changed_by: user.id,
      field: 'category', old_value: current.category, new_value: fields.category })
  }
  if (fields.amount !== undefined && Math.abs(fields.amount - Number(current.amount)) > 0.001) {
    historyRows.push({ cost_id: id, workspace_id: workspaceId, changed_by: user.id,
      field: 'amount', old_value: String(current.amount), new_value: String(fields.amount) })
  }
  if (fields.billing_day !== undefined && fields.billing_day !== current.billing_day) {
    historyRows.push({ cost_id: id, workspace_id: workspaceId, changed_by: user.id,
      field: 'billing_day', old_value: String(current.billing_day), new_value: String(fields.billing_day) })
  }

  if (historyRows.length > 0) {
    await supabase.from('fixed_cost_history').insert(historyRows)
  }

  revalidatePath('/fixed-costs')
  return { success: true, data }
}

// ─── DELETE (soft) ────────────────────────────────────────────────────────────

export async function deleteFixedCost(id: string): Promise<FixedCostActionResult> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { success: false, message: 'Não autorizado.' }

  const { error } = await supabase
    .from('fixed_costs')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)

  if (error) {
    console.error('[fixed-costs/delete]', error)
    return { success: false, message: 'Erro ao excluir custo fixo.' }
  }

  revalidatePath('/fixed-costs')
  return { success: true }
}

// ─── DELETE GROUP (soft delete all installments in a group) ──────────────────

export async function deleteInstallmentGroup(
  parentId: string
): Promise<{ success: boolean; message?: string }> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { success: false, message: 'Não autorizado.' }

  const { error } = await supabase
    .from('fixed_costs')
    .update({ deleted_at: new Date().toISOString() })
    .eq('parent_fixed_cost_id', parentId)
    .is('deleted_at', null)

  if (error) {
    console.error('[fixed-costs/delete-group]', error)
    return { success: false, message: 'Erro ao excluir parcelas.' }
  }

  revalidatePath('/fixed-costs')
  return { success: true }
}
