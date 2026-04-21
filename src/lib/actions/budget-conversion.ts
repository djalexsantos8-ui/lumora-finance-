'use server'

/**
 * Conversão de Orçamento aprovado em outro tipo de receita:
 *   · Pedido (orders)
 *   · Freelance (jobs)
 *   · Receita Recorrente (recurring_revenue)
 *
 * Regra comum: copia cliente, descrição, entregas, datas (quando aplicável),
 * moeda e itens (para destinos que suportam). Marca o budget como "convertido"
 * via campo notes_internal (sem schema change — reuso do que já existe).
 *
 * Todos os destinos recebem um "status inicial" razoável:
 *   · order       → in_progress
 *   · freelance   → in_progress
 *   · recurring   → active
 */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getWorkspaceId } from '@/lib/utils/workspace'
import type { Budget, BudgetItem } from '@/types/budget'

type Target = 'order' | 'freelance' | 'recurring'

export type ConversionResult =
  | { success: true; target: Target; id: string }
  | { success: false; message: string }

async function requireAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, message: 'Não autorizado.' }
  const workspaceId = await getWorkspaceId(user.id)
  if (!workspaceId) return { ok: false as const, message: 'Workspace não encontrado.' }
  return { ok: true as const, user, workspaceId, supabase }
}

async function loadBudgetWithItems(
  supabase: Awaited<ReturnType<typeof createClient>>,
  budgetId: string,
  workspaceId: string
): Promise<{ budget: Budget; items: BudgetItem[] } | null> {
  const [budgetRes, itemsRes] = await Promise.all([
    supabase
      .from('budgets')
      .select('*')
      .eq('id', budgetId)
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .maybeSingle(),
    supabase
      .from('budget_items')
      .select('*')
      .eq('budget_id', budgetId)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true }),
  ])
  if (!budgetRes.data) return null
  return {
    budget: budgetRes.data as Budget,
    items: (itemsRes.data ?? []) as BudgetItem[],
  }
}

/**
 * convertBudgetTo — cria novo registro derivado do orçamento.
 * Não apaga o budget. Adiciona no notes_internal do budget uma linha de audit.
 */
export async function convertBudgetTo(
  budgetId: string,
  target: Target
): Promise<ConversionResult> {
  const auth = await requireAuth()
  if (!auth.ok) return { success: false, message: auth.message }

  const ctx = await loadBudgetWithItems(auth.supabase, budgetId, auth.workspaceId)
  if (!ctx) return { success: false, message: 'Orçamento não encontrado.' }

  const { budget, items } = ctx

  // Só permite converter aprovados (UX protection) — front também gate.
  if (budget.status !== 'approved') {
    return { success: false, message: 'Só orçamentos aprovados podem ser convertidos.' }
  }

  if (target === 'order') {
    return await convertToOrder(auth.supabase, auth.user.id, auth.workspaceId, budget, items)
  }
  if (target === 'freelance') {
    return await convertToFreelance(auth.supabase, auth.user.id, auth.workspaceId, budget, items)
  }
  if (target === 'recurring') {
    return await convertToRecurring(auth.supabase, auth.user.id, auth.workspaceId, budget)
  }

  return { success: false, message: 'Alvo inválido.' }
}

// ─── ORDER ──────────────────────────────────────────────────────────────────

async function convertToOrder(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  workspaceId: string,
  budget: Budget,
  items: BudgetItem[]
): Promise<ConversionResult> {
  const today = new Date().toISOString().slice(0, 10)

  const { data: order, error } = await supabase
    .from('orders')
    .insert({
      workspace_id:        workspaceId,
      created_by:          userId,
      title:               budget.title || 'Pedido sem título',
      client_id:           null, // resolve depois via client_name se necessário
      client_name:         budget.client_name ?? '',
      project_description: budget.project_description,
      deliverables:        budget.deliverables,
      notes_internal:      `Convertido do orçamento "${budget.title}" em ${today}.`,
      order_date:          today,
      event_date:          budget.event_date,
      currency:            budget.currency,
      amount:              budget.total,
      status:              'in_progress',
    })
    .select('id')
    .single()

  if (error || !order) {
    console.error('[budget-conversion/to-order]', error)
    if (error?.code === '42P01' || error?.message?.includes('does not exist')) {
      return { success: false, message: 'Aplique a migration de pedidos antes de converter.' }
    }
    return { success: false, message: 'Erro ao converter em pedido.' }
  }

  // Copia items (best-effort — se tabela nova não existe ainda, ignora)
  if (items.length > 0) {
    const rows = items.map((it, idx) => ({
      order_id:    order.id,
      description: it.label,
      category:    null as string | null,
      quantity:    Number(it.quantity) * Number(it.days || 1) || 1,
      unit_value:  Number(it.unit_value),
      sort_order:  idx,
    }))
    const { error: itemsErr } = await supabase.from('order_items').insert(rows)
    if (itemsErr) console.warn('[budget-conversion/to-order/items]', itemsErr)
  }

  await markBudgetConverted(supabase, budget, 'Pedido', order.id)
  revalidatePath('/pedidos')
  revalidatePath(`/budgets/${budget.id}`)

  return { success: true, target: 'order', id: order.id }
}

// ─── FREELANCE ───────────────────────────────────────────────────────────────

async function convertToFreelance(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  workspaceId: string,
  budget: Budget,
  items: BudgetItem[]
): Promise<ConversionResult> {
  const today = new Date().toISOString().slice(0, 10)

  const { data: job, error } = await supabase
    .from('jobs')
    .insert({
      workspace_id:      workspaceId,
      created_by:        userId,
      title:             budget.title || 'Rascunho',
      client_name:       budget.client_name ?? '',
      status:            'in_progress',
      job_type:          'freelance',
      payment_condition: 'upfront',
      currency:          budget.currency,
      total_value:       budget.total,
      job_date:          budget.event_date || today,
      notes:             `Convertido do orçamento "${budget.title}" em ${today}.`,
      budget_id:         budget.id,
    })
    .select('id')
    .single()

  if (error || !job) {
    console.error('[budget-conversion/to-freelance]', error)
    return { success: false, message: 'Erro ao converter em freelance.' }
  }

  // Copia items como revenue items
  if (items.length > 0) {
    const rows = items.map((it, idx) => ({
      job_id:      job.id,
      description: it.label,
      quantity:    Number(it.quantity) * Number(it.days || 1) || 1,
      unit_value:  Number(it.unit_value),
      sort_order:  idx,
    }))
    const { error: itemsErr } = await supabase.from('job_revenue_items').insert(rows)
    if (itemsErr) console.warn('[budget-conversion/to-freelance/items]', itemsErr)
  }

  await markBudgetConverted(supabase, budget, 'Freelance', job.id)
  revalidatePath('/freelances')
  revalidatePath(`/budgets/${budget.id}`)

  return { success: true, target: 'freelance', id: job.id }
}

// ─── RECURRING ───────────────────────────────────────────────────────────────

async function convertToRecurring(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  workspaceId: string,
  budget: Budget
): Promise<ConversionResult> {
  const today = new Date().toISOString().slice(0, 10)

  const { data: rr, error } = await supabase
    .from('recurring_revenue')
    .insert({
      workspace_id:        workspaceId,
      created_by:          userId,
      title:               budget.title || 'Receita sem título',
      client_name:         budget.client_name ?? '',
      project_description: budget.project_description,
      scope_summary:       budget.deliverables,
      currency:            budget.currency,
      amount:              budget.total,
      frequency:           'monthly',
      status:              'active',
      started_at:          today,
      notes_internal:      `Convertido do orçamento "${budget.title}" em ${today}.`,
    })
    .select('id')
    .single()

  if (error || !rr) {
    console.error('[budget-conversion/to-recurring]', error)
    if (error?.code === '42703') {
      return { success: false, message: 'Aplique a migration de polish de Receita Recorrente antes.' }
    }
    return { success: false, message: 'Erro ao converter em receita recorrente.' }
  }

  await markBudgetConverted(supabase, budget, 'Receita Recorrente', rr.id)
  revalidatePath('/receitas-recorrentes')
  revalidatePath(`/budgets/${budget.id}`)

  return { success: true, target: 'recurring', id: rr.id }
}

// ─── audit no budget ─────────────────────────────────────────────────────────

async function markBudgetConverted(
  supabase: Awaited<ReturnType<typeof createClient>>,
  budget: Budget,
  targetLabel: string,
  targetId: string
) {
  const note = `[${new Date().toISOString().slice(0, 10)}] Convertido em ${targetLabel} (id: ${targetId})`
  const existingNotes = budget.notes_internal ?? ''
  const updatedNotes = existingNotes
    ? `${existingNotes}\n${note}`
    : note

  await supabase
    .from('budgets')
    .update({ notes_internal: updatedNotes })
    .eq('id', budget.id)
}
