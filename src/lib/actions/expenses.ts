'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getWorkspaceId } from '@/lib/utils/workspace'
import type { ExpenseCategory, ExpenseActionResult, Expense } from '@/types/expense'

// ─── addMonths — TZ-safe ──────────────────────────────────────────────────────

function addMonths(dateISO: string, n: number): string {
  const [y, m, d] = dateISO.split('-').map(Number)
  const result = new Date(y, m - 1 + n, d)
  const targetMonth = ((m - 1 + n) % 12 + 12) % 12
  if (result.getMonth() !== targetMonth) {
    result.setDate(0)
  }
  return `${result.getFullYear()}-${String(result.getMonth() + 1).padStart(2, '0')}-${String(result.getDate()).padStart(2, '0')}`
}

// ─── Traduz erros do Supabase para mensagens legíveis ─────────────────────────

function translateSupabaseError(err: { code?: string; message?: string } | null): string {
  if (!err) return 'Erro desconhecido.'
  const msg = err.message ?? ''
  const code = err.code ?? ''
  if (code === '42501' || msg.includes('row-level security'))
    return 'Erro de permissão: workspace inválido ou sessão expirada.'
  if (code === '23503')
    return 'Erro de referência: registro relacionado não encontrado.'
  if (code === '23514' || msg.includes('check'))
    return 'Erro de validação: valor fora do intervalo permitido.'
  if (code === '23502' || msg.includes('null value'))
    return `Erro: campo obrigatório ausente (${msg.match(/column "([^"]+)"/)?.[1] ?? 'desconhecido'}).`
  if (code === '23505')
    return 'Erro: registro duplicado.'
  return `Erro ao salvar: ${msg.slice(0, 120)}`
}

// ─── CREATE ───────────────────────────────────────────────────────────────────

export async function createExpense(fields: {
  description:         string
  category:            ExpenseCategory
  amount:              number          // se parcelado: valor TOTAL na moeda original
  currency?:           string
  expense_date:        string          // YYYY-MM-DD — data da 1ª parcela
  is_deductible:       boolean
  notes?:              string
  is_installment?:     boolean
  installments_total?: number          // nº de parcelas (2–60)
  // Multimoeda (migration 011)
  exchange_rate?:      number          // 1 moeda = X BRL — fixado no momento da criação
  iof_applied?:        boolean         // se IOF (6,38%) deve ser somado
}): Promise<ExpenseActionResult & { installments?: Expense[] }> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { success: false, error: 'Não autorizado.' }

  const workspaceId = await getWorkspaceId(user.id)
  if (!workspaceId) return { success: false, error: 'Workspace não encontrado.' }

  if (!fields.description.trim()) return { success: false, error: 'Descrição obrigatória.' }
  if (fields.amount <= 0)          return { success: false, error: 'Valor deve ser maior que zero.' }
  if (!fields.expense_date)        return { success: false, error: 'Data obrigatória.' }

  const isInstallment = fields.is_installment === true
  const n = fields.installments_total ?? 1

  if (isInstallment && (!Number.isInteger(n) || n < 2 || n > 60))
    return { success: false, error: 'Número de parcelas deve ser entre 2 e 60.' }

  const currency    = fields.currency ?? 'BRL'
  const notes       = fields.notes?.trim() || null
  const description = fields.description.trim()

  // ── Helpers multimoeda ───────────────────────────────────────────────────
  const rate    = fields.exchange_rate ?? null
  const iofRate = (fields.iof_applied && rate) ? 0.0638 : 0

  function computeBRL(amt: number): { amount_brl: number | null; iof_amount: number | null } {
    if (!rate) return { amount_brl: null, iof_amount: null }
    const brl = amt * rate
    const iof = iofRate > 0 ? Math.round(brl * iofRate * 100) / 100 : null
    return {
      amount_brl: Math.round(brl * (1 + iofRate) * 100) / 100,
      iof_amount: iof,
    }
  }

  // ── Caso simples ─────────────────────────────────────────────────────────
  if (!isInstallment) {
    const simpleAmt = Math.round(fields.amount * 100) / 100
    const { amount_brl, iof_amount } = computeBRL(simpleAmt)

    const { data, error } = await supabase
      .from('expenses')
      .insert({
        workspace_id:       workspaceId,
        description,
        category:           fields.category,
        amount:             simpleAmt,
        currency,
        expense_date:       fields.expense_date,
        is_deductible:      fields.is_deductible,
        notes,
        is_installment:     false,
        installments_total: null,
        installment_index:  null,
        parent_expense_id:  null,
        exchange_rate:      rate,
        amount_brl,
        iof_applied:        fields.iof_applied ?? false,
        iof_amount,
      })
      .select()
      .single()

    if (error) {
      console.error('[expenses/create] supabase error:', JSON.stringify(error))
      return { success: false, error: translateSupabaseError(error) }
    }

    revalidatePath('/expenses')
    return { success: true, data }
  }

  // ── Caso parcelado ────────────────────────────────────────────────────────
  // Estratégia: gerar o UUID do parent ANTES do insert.
  // Todos os N registros são inseridos em UM único batch.
  // - Parcela 1: id = parentId, parent_expense_id = null  (ela É a raiz)
  // - Parcelas 2..N: parent_expense_id = parentId
  // Sem updates intermediários, sem FK circulares, totalmente atômico.

  const baseAmount   = Math.floor((fields.amount / n) * 100) / 100
  const totalRounded = Math.round(baseAmount * n * 100) / 100
  const lastAmount   = Math.round((fields.amount - totalRounded + baseAmount) * 100) / 100

  // Gera TODOS os UUIDs antes do insert.
  // Crítico: o PostgREST usa as chaves do 1º objeto como lista de colunas
  // para todo o batch. Se só o 1º tiver "id" e os demais não, o SQL gerado
  // manda NULL nos demais — violando o NOT NULL de id.
  const allIds   = Array.from({ length: n }, () => crypto.randomUUID())
  const parentId = allIds[0]

  const allRecords = Array.from({ length: n }, (_, i) => {
    const idx      = i + 1
    const isFirst  = i === 0
    const isLast   = idx === n
    const parcelAmt = isLast ? lastAmount : baseAmount
    const { amount_brl: parcelBrl, iof_amount: parcelIof } = computeBRL(parcelAmt)
    return {
      id:                 allIds[i],   // id explícito em TODOS os records
      workspace_id:       workspaceId,
      description:        `${description} (${idx}/${n})`,
      category:           fields.category,
      amount:             parcelAmt,
      currency,
      expense_date:       isFirst ? fields.expense_date : addMonths(fields.expense_date, i),
      is_deductible:      fields.is_deductible,
      notes,
      is_installment:     true,
      installments_total: n,
      installment_index:  idx,
      parent_expense_id:  isFirst ? null : parentId,
      exchange_rate:      rate,
      amount_brl:         parcelBrl,
      iof_applied:        fields.iof_applied ?? false,
      iof_amount:         parcelIof,
    }
  })

  const { data: inserted, error: insertErr } = await supabase
    .from('expenses')
    .insert(allRecords)
    .select()

  if (insertErr || !inserted) {
    console.error('[expenses/create-installments] supabase error:', JSON.stringify(insertErr))
    return { success: false, error: translateSupabaseError(insertErr) }
  }

  revalidatePath('/expenses')
  return {
    success:      true,
    data:         inserted[0],
    installments: inserted,
  }
}

// ─── MARK PAID ───────────────────────────────────────────────────────────────
// paidAmount: opcional. Se omitido, usa o valor original da despesa.

export async function markExpensePaid(
  id: string,
  paidAmount?: number
): Promise<ExpenseActionResult> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { success: false, error: 'Não autorizado.' }

  const workspaceId = await getWorkspaceId(user.id)
  if (!workspaceId) return { success: false, error: 'Workspace não encontrado.' }

  // Busca o amount original para usar como fallback
  const { data: original, error: fetchErr } = await supabase
    .from('expenses')
    .select('amount, workspace_id')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (fetchErr || !original)
    return { success: false, error: 'Despesa não encontrada.' }

  if (original.workspace_id !== workspaceId)
    return { success: false, error: 'Não autorizado.' }

  const finalAmount = (paidAmount !== undefined && paidAmount > 0)
    ? Math.round(paidAmount * 100) / 100
    : Math.round(Number(original.amount) * 100) / 100

  const { data, error } = await supabase
    .from('expenses')
    .update({
      is_paid:     true,
      paid_amount: finalAmount,
      paid_at:     new Date().toISOString(),
    })
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single()

  if (error) {
    console.error('[expenses/mark-paid]', JSON.stringify(error))
    return { success: false, error: translateSupabaseError(error) }
  }

  revalidatePath('/expenses')
  return { success: true, data }
}

// ─── GET INSTALLMENTS REMAINING ──────────────────────────────────────────────
// Retorna quantas parcelas ainda estão em aberto e o total em BRL.

export async function getInstallmentsRemaining(expenseId: string): Promise<{
  success:        boolean
  parentId?:      string
  count?:         number
  total?:         number
  installments?:  {
    id:                string
    amount:            number
    amount_brl:        number | null
    currency:          string
    expense_date:      string
    installment_index: number | null
  }[]
  error?:         string
}> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { success: false, error: 'Não autorizado.' }

  const workspaceId = await getWorkspaceId(user.id)
  if (!workspaceId) return { success: false, error: 'Workspace não encontrado.' }

  const { data: ref, error: refErr } = await supabase
    .from('expenses')
    .select('id, parent_expense_id, workspace_id')
    .eq('id', expenseId)
    .is('deleted_at', null)
    .single()

  if (refErr || !ref)                    return { success: false, error: 'Despesa não encontrada.' }
  if (ref.workspace_id !== workspaceId)  return { success: false, error: 'Não autorizado.' }

  const parentId = ref.parent_expense_id ?? ref.id

  const { data: unpaid, error: fetchErr } = await supabase
    .from('expenses')
    .select('id, amount, amount_brl, currency, expense_date, installment_index')
    .or(`id.eq.${parentId},parent_expense_id.eq.${parentId}`)
    .eq('is_paid', false)
    .is('deleted_at', null)
    .order('installment_index', { ascending: true })

  if (fetchErr)                          return { success: false, error: translateSupabaseError(fetchErr) }
  if (!unpaid || unpaid.length === 0)    return { success: false, error: 'Nenhuma parcela em aberto.' }

  const total = Math.round(
    unpaid.reduce((s, e) => s + Number(e.amount_brl ?? e.amount), 0) * 100
  ) / 100

  return {
    success: true,
    parentId,
    count:   unpaid.length,
    total,
    installments: unpaid.map(e => ({
      id:                e.id,
      amount:            Number(e.amount),
      amount_brl:        e.amount_brl  != null ? Number(e.amount_brl)  : null,
      currency:          e.currency,
      expense_date:      e.expense_date,
      installment_index: e.installment_index,
    })),
  }
}

// ─── SETTLE SELECTED INSTALLMENTS ────────────────────────────────────────────
// Quita apenas as parcelas com os IDs informados.
// Se paidTotal < soma dos valores, o desconto vai para a última parcela.

export async function settleSelectedInstallments(
  ids:        string[],
  paidTotal?: number
): Promise<{ success: boolean; count?: number; error?: string }> {
  if (!ids || ids.length === 0) return { success: false, error: 'Nenhuma parcela selecionada.' }

  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { success: false, error: 'Não autorizado.' }

  const workspaceId = await getWorkspaceId(user.id)
  if (!workspaceId) return { success: false, error: 'Workspace não encontrado.' }

  // Busca as parcelas selecionadas e valida workspace
  const { data: selected, error: fetchErr } = await supabase
    .from('expenses')
    .select('id, amount, installment_index, workspace_id')
    .in('id', ids)
    .eq('is_paid', false)
    .is('deleted_at', null)
    .order('installment_index', { ascending: true })

  if (fetchErr)                              return { success: false, error: translateSupabaseError(fetchErr) }
  if (!selected || selected.length === 0)   return { success: false, error: 'Nenhuma parcela em aberto encontrada.' }
  if (selected.some(e => e.workspace_id !== workspaceId))
                                             return { success: false, error: 'Não autorizado.' }

  const n             = selected.length
  const totalOriginal = selected.reduce((s, e) => s + Number(e.amount), 0)
  const effectivePaid = (paidTotal && paidTotal > 0 && paidTotal <= totalOriginal)
    ? paidTotal
    : totalOriginal

  const now        = new Date().toISOString()
  const sumNonLast = selected.slice(0, -1).reduce((s, e) => s + Number(e.amount), 0)
  const paidLast   = Math.max(0, Math.round((effectivePaid - sumNonLast) * 100) / 100)
  const discLast   = Math.max(0, Math.round((Number(selected[n - 1].amount) - paidLast) * 100) / 100)

  const results = await Promise.all(
    selected.map((e, i) => {
      const isLast  = i === n - 1
      const paidAmt = isLast ? paidLast : Math.round(Number(e.amount) * 100) / 100
      const discAmt = isLast && discLast > 0.005 ? discLast : null
      return supabase
        .from('expenses')
        .update({
          is_paid:         true,
          paid_at:         now,
          paid_amount:     paidAmt,
          discount_amount: discAmt,
        })
        .eq('id', e.id)
    })
  )

  const firstError = results.find(r => r.error)
  if (firstError?.error) return { success: false, error: translateSupabaseError(firstError.error) }

  revalidatePath('/expenses')
  return { success: true, count: selected.length }
}

// ─── SETTLE INSTALLMENTS ──────────────────────────────────────────────────────
// Quita todas as parcelas em aberto de um grupo de uma vez.
// paidTotal: se menor que o total original, o desconto vai para a última parcela.

export async function settleInstallments(
  parentId:   string,
  paidTotal?: number
): Promise<{ success: boolean; count?: number; error?: string }> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { success: false, error: 'Não autorizado.' }

  const workspaceId = await getWorkspaceId(user.id)
  if (!workspaceId) return { success: false, error: 'Workspace não encontrado.' }

  // Valida que o parentId pertence ao workspace
  const { data: parentExp } = await supabase
    .from('expenses')
    .select('workspace_id')
    .eq('id', parentId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!parentExp || parentExp.workspace_id !== workspaceId)
    return { success: false, error: 'Não autorizado.' }

  // Busca todas as parcelas em aberto, ordenadas por índice
  const { data: unpaid, error: fetchErr } = await supabase
    .from('expenses')
    .select('id, amount, installment_index')
    .or(`id.eq.${parentId},parent_expense_id.eq.${parentId}`)
    .eq('is_paid', false)
    .is('deleted_at', null)
    .order('installment_index', { ascending: true })

  if (fetchErr)                        return { success: false, error: translateSupabaseError(fetchErr) }
  if (!unpaid || unpaid.length === 0)  return { success: false, error: 'Nenhuma parcela em aberto.' }

  const n             = unpaid.length
  const totalOriginal = unpaid.reduce((s, e) => s + Number(e.amount), 0)
  const effectivePaid = (paidTotal && paidTotal > 0 && paidTotal <= totalOriginal)
    ? paidTotal
    : totalOriginal

  const now        = new Date().toISOString()
  const sumNonLast = unpaid.slice(0, -1).reduce((s, e) => s + Number(e.amount), 0)
  const paidLast   = Math.max(0, Math.round((effectivePaid - sumNonLast) * 100) / 100)
  const discLast   = Math.max(0, Math.round((Number(unpaid[n - 1].amount) - paidLast) * 100) / 100)

  // Atualiza todas as parcelas em paralelo
  const results = await Promise.all(
    unpaid.map((e, i) => {
      const isLast  = i === n - 1
      const paidAmt = isLast ? paidLast : Math.round(Number(e.amount) * 100) / 100
      const discAmt = isLast && discLast > 0.005 ? discLast : null
      return supabase
        .from('expenses')
        .update({
          is_paid:         true,
          paid_at:         now,
          paid_amount:     paidAmt,
          discount_amount: discAmt,
        })
        .eq('id', e.id)
    })
  )

  const firstError = results.find(r => r.error)
  if (firstError?.error) return { success: false, error: translateSupabaseError(firstError.error) }

  revalidatePath('/expenses')
  return { success: true, count: n }
}

// ─── DELETE (soft) ────────────────────────────────────────────────────────────

export async function deleteExpense(id: string): Promise<ExpenseActionResult> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { success: false, error: 'Não autorizado.' }

  const { error } = await supabase
    .from('expenses')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)

  if (error) {
    console.error('[expenses/delete]', JSON.stringify(error))
    return { success: false, error: translateSupabaseError(error) }
  }

  revalidatePath('/expenses')
  return { success: true }
}
