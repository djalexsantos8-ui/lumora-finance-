'use server'

// ─── Recurring Revenue Invoices — Actions ───────────────────────────────────
//
// Server actions para emissão e gestão de cobranças mensais geradas a partir
// de uma receita recorrente. Fase 4 (2026-04-22).
//
// Princípio: **snapshot no momento da emissão**. title/amount/client_name são
// copiados para a invoice no generate, para que mudanças posteriores na
// recorrência não alterem o histórico.
//
// Segurança:
//   · Toda query passa por workspace_id do usuário (RLS + aplicação)
//   · Idempotência: unique(recurring_revenue_id, period_year, period_month)
//     impede gerar duas invoices para o mesmo mês
//
// NÃO modifica recurring_revenue, aggregators ou narrativa.

import { revalidatePath } from 'next/cache'
import { createClient as createSupabase } from '@/lib/supabase/server'
import { getWorkspaceId } from '@/lib/utils/workspace'
import type {
  RecurringRevenueInvoice,
  RecurringInvoiceActionResult,
  RecurringInvoiceStatus,
} from '@/types/recurring-revenue'

// ─── helpers ───────────────────────────────────────────────────────────────

async function requireAuth(): Promise<
  | { ok: true; userId: string; workspaceId: string }
  | { ok: false; message: string }
> {
  const supabase = await createSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: 'Não autorizado.' }

  const workspaceId = await getWorkspaceId(user.id)
  if (!workspaceId) return { ok: false, message: 'Workspace não encontrado.' }

  return { ok: true, userId: user.id, workspaceId }
}

/** Calcula o vencimento padrão dado year+month+billing_day (1-31). */
function computeDueDate(year: number, month: number, billingDay: number | null): string | null {
  if (!billingDay) return null
  // Atende casos como "dia 31" em meses de 30 dias → cai no último dia do mês.
  const lastDay = new Date(year, month, 0).getDate()
  const day = Math.min(billingDay, lastDay)
  const m = String(month).padStart(2, '0')
  const d = String(day).padStart(2, '0')
  return `${year}-${m}-${d}`
}

// ─── listInvoicesByRecurring ───────────────────────────────────────────────

export async function listInvoicesByRecurring(
  recurringId: string
): Promise<RecurringRevenueInvoice[]> {
  const auth = await requireAuth()
  if (!auth.ok) return []

  const supabase = await createSupabase()
  const { data, error } = await supabase
    .from('recurring_revenue_invoices')
    .select('*')
    .eq('recurring_revenue_id', recurringId)
    .eq('workspace_id', auth.workspaceId)
    .is('deleted_at', null)
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false })

  if (error) {
    console.error('[recurring-invoices/list]', error)
    return []
  }
  return (data ?? []) as RecurringRevenueInvoice[]
}

// ─── generateInvoice ───────────────────────────────────────────────────────
//
// Gera uma cobrança para (recurringId, year, month). Idempotente via unique
// constraint — se já existe, devolve a existente (sem erro).

export async function generateInvoice(
  recurringId: string,
  year: number,
  month: number
): Promise<RecurringInvoiceActionResult> {
  const auth = await requireAuth()
  if (!auth.ok) return { success: false, message: auth.message }

  if (month < 1 || month > 12) {
    return { success: false, message: 'Mês inválido (1-12).' }
  }
  if (year < 2000 || year > 2100) {
    return { success: false, message: 'Ano inválido.' }
  }

  const supabase = await createSupabase()

  // Busca a recorrência para fazer o snapshot
  const { data: rr, error: rrErr } = await supabase
    .from('recurring_revenue')
    .select('id, workspace_id, title, client_name, amount, currency, billing_day, status, deleted_at')
    .eq('id', recurringId)
    .eq('workspace_id', auth.workspaceId)
    .is('deleted_at', null)
    .single()

  if (rrErr || !rr) {
    return { success: false, message: 'Receita recorrente não encontrada.' }
  }
  if (rr.status === 'cancelled') {
    return { success: false, message: 'Receita cancelada — não é possível emitir cobrança.' }
  }

  // Se já existe, devolve. Snapshot fica congelado na primeira emissão.
  const { data: existing } = await supabase
    .from('recurring_revenue_invoices')
    .select('*')
    .eq('recurring_revenue_id', recurringId)
    .eq('period_year', year)
    .eq('period_month', month)
    .is('deleted_at', null)
    .maybeSingle()

  if (existing) {
    return { success: true, data: existing as RecurringRevenueInvoice }
  }

  const dueDate = computeDueDate(year, month, rr.billing_day)

  const { data, error } = await supabase
    .from('recurring_revenue_invoices')
    .insert({
      workspace_id:         auth.workspaceId,
      recurring_revenue_id: recurringId,
      created_by:           auth.userId,
      period_year:          year,
      period_month:         month,
      due_date:             dueDate,
      title:                rr.title ?? 'Cobrança',
      client_name:          rr.client_name ?? null,
      amount:               Number(rr.amount ?? 0),
      currency:             rr.currency ?? 'BRL',
      status:               'open',
    })
    .select('*')
    .single()

  if (error || !data) {
    console.error('[recurring-invoices/generate]', error)
    return { success: false, message: 'Erro ao gerar cobrança.' }
  }

  revalidatePath(`/receitas-recorrentes/${recurringId}`)
  revalidatePath('/receitas-recorrentes')
  return { success: true, data: data as RecurringRevenueInvoice }
}

// ─── updateInvoiceStatus ──────────────────────────────────────────────────

export async function updateInvoiceStatus(
  invoiceId: string,
  status: RecurringInvoiceStatus,
  paidAmount?: number
): Promise<RecurringInvoiceActionResult> {
  const auth = await requireAuth()
  if (!auth.ok) return { success: false, message: auth.message }

  const supabase = await createSupabase()

  const patch: Record<string, unknown> = { status }
  if (status === 'paid') {
    patch.paid_at = new Date().toISOString().slice(0, 10)
    if (typeof paidAmount === 'number') patch.paid_amount = paidAmount
  } else if (status === 'open' || status === 'cancelled' || status === 'overdue') {
    patch.paid_at = null
    patch.paid_amount = null
  }

  const { data, error } = await supabase
    .from('recurring_revenue_invoices')
    .update(patch)
    .eq('id', invoiceId)
    .eq('workspace_id', auth.workspaceId)
    .is('deleted_at', null)
    .select('*')
    .single()

  if (error || !data) {
    console.error('[recurring-invoices/update-status]', error)
    return { success: false, message: 'Erro ao atualizar status.' }
  }

  revalidatePath(`/receitas-recorrentes/${data.recurring_revenue_id}`)
  return { success: true, data: data as RecurringRevenueInvoice }
}

// ─── deleteInvoice (soft delete) ──────────────────────────────────────────

export async function deleteInvoice(
  invoiceId: string
): Promise<{ success: boolean; message?: string }> {
  const auth = await requireAuth()
  if (!auth.ok) return { success: false, message: auth.message }

  const supabase = await createSupabase()
  const { data, error } = await supabase
    .from('recurring_revenue_invoices')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', invoiceId)
    .eq('workspace_id', auth.workspaceId)
    .select('recurring_revenue_id')
    .single()

  if (error || !data) {
    console.error('[recurring-invoices/delete]', error)
    return { success: false, message: 'Erro ao excluir cobrança.' }
  }
  revalidatePath(`/receitas-recorrentes/${data.recurring_revenue_id}`)
  return { success: true }
}

// ─── getInvoiceById ───────────────────────────────────────────────────────

export async function getInvoiceById(
  invoiceId: string
): Promise<RecurringRevenueInvoice | null> {
  const auth = await requireAuth()
  if (!auth.ok) return null

  const supabase = await createSupabase()
  const { data, error } = await supabase
    .from('recurring_revenue_invoices')
    .select('*')
    .eq('id', invoiceId)
    .eq('workspace_id', auth.workspaceId)
    .is('deleted_at', null)
    .single()

  if (error || !data) return null
  return data as RecurringRevenueInvoice
}
