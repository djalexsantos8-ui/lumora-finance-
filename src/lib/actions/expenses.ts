'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { ExpenseCategory, ExpenseActionResult, Expense } from '@/types/expense'

// ─── helper ───────────────────────────────────────────────────────────────────

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
  amount:              number          // se parcelado: valor TOTAL
  currency?:           string
  expense_date:        string          // YYYY-MM-DD — data da 1ª parcela
  is_deductible:       boolean
  notes?:              string
  is_installment?:     boolean
  installments_total?: number          // nº de parcelas (2–60)
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

  // ── Caso simples ─────────────────────────────────────────────────────────
  if (!isInstallment) {
    const { data, error } = await supabase
      .from('expenses')
      .insert({
        workspace_id:       workspaceId,
        description,
        category:           fields.category,
        amount:             Math.round(fields.amount * 100) / 100,
        currency,
        expense_date:       fields.expense_date,
        is_deductible:      fields.is_deductible,
        notes,
        is_installment:     false,
        installments_total: null,
        installment_index:  null,
        parent_expense_id:  null,
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
    const idx     = i + 1
    const isFirst = i === 0
    const isLast  = idx === n
    return {
      id:                 allIds[i],   // id explícito em TODOS os records
      workspace_id:       workspaceId,
      description:        `${description} (${idx}/${n})`,
      category:           fields.category,
      amount:             isLast ? lastAmount : baseAmount,
      currency,
      expense_date:       isFirst ? fields.expense_date : addMonths(fields.expense_date, i),
      is_deductible:      fields.is_deductible,
      notes,
      is_installment:     true,
      installments_total: n,
      installment_index:  idx,
      parent_expense_id:  isFirst ? null : parentId,
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
