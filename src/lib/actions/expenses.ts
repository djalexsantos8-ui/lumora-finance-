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
// Incrementa N meses em uma data YYYY-MM-DD sem conversão UTC.

function addMonths(dateISO: string, n: number): string {
  const [y, m, d] = dateISO.split('-').map(Number)
  const result = new Date(y, m - 1 + n, d)
  // Se o dia transbordar (ex: 31 jan + 1 mês → 3 mar), recua para último dia do mês alvo
  const targetMonth = ((m - 1 + n) % 12 + 12) % 12
  if (result.getMonth() !== targetMonth) {
    result.setDate(0) // último dia do mês anterior
  }
  return `${result.getFullYear()}-${String(result.getMonth() + 1).padStart(2, '0')}-${String(result.getDate()).padStart(2, '0')}`
}

// ─── CREATE ───────────────────────────────────────────────────────────────────

export async function createExpense(fields: {
  description:        string
  category:           ExpenseCategory
  amount:             number          // se parcelado: valor TOTAL
  currency?:          string
  expense_date:       string          // YYYY-MM-DD — data da 1ª parcela
  is_deductible:      boolean
  notes?:             string
  // Parcelamento
  is_installment?:    boolean
  installments_total?: number         // nº de parcelas (2–60)
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

  if (isInstallment) {
    if (!Number.isInteger(n) || n < 2 || n > 60)
      return { success: false, error: 'Número de parcelas deve ser entre 2 e 60.' }
  }

  // ── Caso simples: despesa única ───────────────────────────────────────────
  if (!isInstallment) {
    const { data, error } = await supabase
      .from('expenses')
      .insert({
        workspace_id:  workspaceId,
        description:   fields.description.trim(),
        category:      fields.category,
        amount:        Math.round(fields.amount * 100) / 100,
        currency:      fields.currency ?? 'BRL',
        expense_date:  fields.expense_date,
        is_deductible: fields.is_deductible,
        notes:         fields.notes?.trim() || null,
        is_installment: false,
        installments_total: null,
        installment_index:  null,
        parent_expense_id:  null,
      })
      .select()
      .single()

    if (error) {
      console.error('[expenses/create]', error)
      return { success: false, error: 'Erro ao criar despesa.' }
    }

    revalidatePath('/expenses')
    return { success: true, data }
  }

  // ── Caso parcelado: inserir N registros ───────────────────────────────────
  // Valor por parcela arredondado para 2 casas; última parcela absorve centavos.
  const baseAmount  = Math.floor((fields.amount / n) * 100) / 100
  const totalRounded = Math.round(baseAmount * n * 100) / 100
  const lastAmount   = Math.round((fields.amount - totalRounded + baseAmount) * 100) / 100

  // Insere a 1ª parcela para obter o parent_expense_id
  const { data: first, error: firstErr } = await supabase
    .from('expenses')
    .insert({
      workspace_id:       workspaceId,
      description:        `${fields.description.trim()} (1/${n})`,
      category:           fields.category,
      amount:             n === 1 ? fields.amount : baseAmount,
      currency:           fields.currency ?? 'BRL',
      expense_date:       fields.expense_date,
      is_deductible:      fields.is_deductible,
      notes:              fields.notes?.trim() || null,
      is_installment:     true,
      installments_total: n,
      installment_index:  1,
      parent_expense_id:  null,  // será atualizado para si mesmo
    })
    .select()
    .single()

  if (firstErr || !first) {
    console.error('[expenses/create-installment-first]', firstErr)
    return { success: false, error: 'Erro ao criar parcelas.' }
  }

  // Atualiza parent_expense_id da 1ª parcela para apontar para si mesma
  await supabase
    .from('expenses')
    .update({ parent_expense_id: first.id })
    .eq('id', first.id)

  // Insere parcelas 2..N
  const remaining = Array.from({ length: n - 1 }, (_, i) => ({
    workspace_id:       workspaceId,
    description:        `${fields.description.trim()} (${i + 2}/${n})`,
    category:           fields.category,
    amount:             i + 2 === n ? lastAmount : baseAmount,
    currency:           fields.currency ?? 'BRL',
    expense_date:       addMonths(fields.expense_date, i + 1),
    is_deductible:      fields.is_deductible,
    notes:              fields.notes?.trim() || null,
    is_installment:     true,
    installments_total: n,
    installment_index:  i + 2,
    parent_expense_id:  first.id,
  }))

  const { data: rest, error: restErr } = await supabase
    .from('expenses')
    .insert(remaining)
    .select()

  if (restErr) {
    console.error('[expenses/create-installment-rest]', restErr)
    return { success: false, error: 'Erro ao criar parcelas.' }
  }

  revalidatePath('/expenses')
  return {
    success: true,
    data:         { ...first, parent_expense_id: first.id },
    installments: [{ ...first, parent_expense_id: first.id }, ...(rest ?? [])],
  }
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
    console.error('[expenses/delete]', error)
    return { success: false, error: 'Erro ao excluir despesa.' }
  }

  revalidatePath('/expenses')
  return { success: true }
}
