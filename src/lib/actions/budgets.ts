'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getWorkspaceId } from '@/lib/utils/workspace'
import { getOrCreateClient } from '@/lib/actions/clients'
import type {
  BudgetActionResult,
  BudgetIntendedDestination,
  BudgetMarginType,
  BudgetStatus,
} from '@/types/budget'

// Recalcula subtotal, margin_amount e total a partir dos itens ativos
export async function recalculateBudgetTotals(budgetId: string): Promise<void> {
  const supabase = await createClient()

  const { data: budget } = await supabase
    .from('budgets')
    .select('margin_type, margin_input')
    .eq('id', budgetId)
    .single()

  if (!budget) return

  const { data: items } = await supabase
    .from('budget_items')
    .select('total_value')
    .eq('budget_id', budgetId)
    .is('deleted_at', null)

  const subtotal = (items ?? []).reduce(
    (sum, item) => sum + Number(item.total_value),
    0
  )

  const marginAmount =
    budget.margin_type === 'percentage'
      ? (subtotal * Number(budget.margin_input)) / 100
      : Number(budget.margin_input)

  const total = subtotal + marginAmount

  await supabase
    .from('budgets')
    .update({
      subtotal:      Math.round(subtotal * 100) / 100,
      margin_amount: Math.round(marginAmount * 100) / 100,
      total:         Math.round(total * 100) / 100,
    })
    .eq('id', budgetId)
}

// ─── CREATE — INSERT do primeiro save de um orçamento novo ───────────────────
//
// Chamado pelo BudgetEditor em modo "isNew" no primeiro auto-save. Antes,
// esta action criava um rascunho vazio e redirecionava — resultado: 82 drafts
// R$ 0,00 no banco e ~4s de latência no clique.
//
// Agora o fluxo é optimistic:
//   · botão "Novo Orçamento" navega CLIENT-SIDE pra /budgets/new (instantâneo)
//   · /budgets/new renderiza o editor vazio
//   · No primeiro auto-save, esta action cria o registro COM os dados já
//     digitados. Se o usuário sair sem editar nada, ZERO INSERT acontece.
//   · Retorna o id pro cliente trocar a URL via history.replaceState
export async function createBudget(
  fields: {
    title?:                 string
    client_name?:           string
    client_id?:             string | null
    segment?:               string | null
    lead_source?:           string | null
    project_description?:   string
    deliverables?:          string
    event_date?:            string
    // ── Multi-datas 2026-04-23 — adapter {date_start, date_end} espelha jobs.
    // Quando ambos vierem: event_date=start, event_date_end=end (se > start),
    // is_multi_day=true. Se só vier date_start (ou date_end vazio) é single-day.
    // event_date "cru" ainda é aceito como fallback pra callers legados.
    date_start?:            string | null
    date_end?:              string | null
    valid_until?:           string
    currency?:              string
    notes_internal?:        string
    payment_term?:          string
    intended_destination?:  BudgetIntendedDestination | null
  } = {}
): Promise<BudgetActionResult> {
  const supabase = await createClient()

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()
  if (authErr || !user) return { success: false, message: 'Não autorizado.' }

  const { data: member } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  if (!member?.workspace_id) {
    return { success: false, message: 'Workspace não encontrado.' }
  }

  // Resolve cliente se nome foi passado. Deploy A (2026-04-22): agora também
  // preenchemos `client_id` automaticamente — espelha jobs/orders/recurring.
  let resolvedClient: Awaited<ReturnType<typeof getOrCreateClient>> | undefined
  const clientName = fields.client_name?.trim() ?? ''
  if (clientName) {
    resolvedClient = await getOrCreateClient(member.workspace_id, clientName)
  }
  // Prioridade: client_id explícito > resolvedClient.id > null
  const resolvedClientId =
    fields.client_id !== undefined
      ? fields.client_id
      : (resolvedClient && 'id' in resolvedClient ? (resolvedClient as { id: string }).id : null)

  // ── Multi-datas adapter — mesma lógica de updateJob({date_start, date_end})
  // Prioridade: date_start/date_end (explicita) > event_date (legado/caller raso).
  let insertEventDate: string | null = null
  let insertEventDateEnd: string | null = null
  let insertIsMultiDay = false
  if (fields.date_start !== undefined) {
    const start = fields.date_start || null
    const rawEnd = fields.date_end ?? null
    const safeEnd = start && rawEnd && rawEnd > start ? rawEnd : null
    insertEventDate    = start
    insertEventDateEnd = safeEnd // null quando single-day
    insertIsMultiDay   = safeEnd !== null
  } else if (fields.event_date !== undefined) {
    insertEventDate    = fields.event_date || null
    insertEventDateEnd = null
    insertIsMultiDay   = false
  }

  const { data, error } = await supabase
    .from('budgets')
    .insert({
      workspace_id:        member.workspace_id,
      created_by:          user.id,
      title:               fields.title?.trim() || 'Orçamento sem título',
      client_name:         clientName,
      client_id:           resolvedClientId,
      segment:             fields.segment?.trim() || null,
      lead_source:         fields.lead_source?.trim() || null,
      project_description: fields.project_description?.trim() || null,
      deliverables:        fields.deliverables?.trim() || null,
      event_date:          insertEventDate,
      event_date_end:      insertEventDateEnd,
      is_multi_day:        insertIsMultiDay,
      valid_until:         fields.valid_until || null,
      status:              'draft',
      currency:            fields.currency || 'BRL',
      notes_internal:      fields.notes_internal?.trim() || null,
      payment_term:        fields.payment_term?.trim() || null,
      intended_destination: fields.intended_destination ?? null,
    })
    .select()
    .single()

  if (error || !data) {
    console.error('[budgets/create]', error)
    return { success: false, message: 'Erro ao criar orçamento. Tente novamente.' }
  }

  return { success: true, data, client: resolvedClient ?? undefined }
}

// ─── UPDATE INFO — salva dados do projeto (chamado pelo auto-save) ─────────────

export async function updateBudgetInfo(
  id: string,
  fields: {
    title?:                 string
    client_name?:           string
    client_id?:             string | null
    segment?:               string | null
    lead_source?:           string | null
    project_description?:   string
    deliverables?:          string
    event_date?:            string
    // Adapter unificado multi-datas (preferir esses campos, não event_date cru).
    date_start?:            string | null
    date_end?:              string | null
    valid_until?:           string
    currency?:              string
    notes_internal?:        string
    payment_term?:          string
    intended_destination?:  BudgetIntendedDestination | null
  }
): Promise<BudgetActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()

  if (authErr || !user) return { success: false, message: 'Não autorizado.' }

  const payload: Record<string, unknown> = {}

  if (fields.title !== undefined)
    payload.title = fields.title.trim() || 'Orçamento sem título'

  // Cliente: sempre que `client_name` for tocado, resolve via getOrCreateClient.
  // Deploy A (2026-04-22): agora budgets tem `client_id` e preenchemos junto.
  // Se `client_id` vier explícito (ClientPicker), ele tem prioridade — permite
  // selecionar cliente existente sem digitar nome de novo.
  let resolvedClient: Awaited<ReturnType<typeof getOrCreateClient>> | undefined
  if (fields.client_name !== undefined) {
    const cleaned = fields.client_name.trim()
    payload.client_name = cleaned

    if (cleaned) {
      const workspaceId = await getWorkspaceId(user.id)
      if (workspaceId) {
        resolvedClient = await getOrCreateClient(workspaceId, cleaned)
      }
    } else {
      // Se nome foi limpado, limpa também o client_id
      payload.client_id = null
    }
  }

  // client_id explícito sobrepõe o resolvido (ClientPicker com ID real)
  if (fields.client_id !== undefined) {
    payload.client_id = fields.client_id
  } else if (resolvedClient && 'id' in resolvedClient) {
    payload.client_id = (resolvedClient as { id: string }).id
  }

  if (fields.segment !== undefined)
    payload.segment = fields.segment?.trim() || null
  if (fields.lead_source !== undefined)
    payload.lead_source = fields.lead_source?.trim() || null
  if (fields.project_description !== undefined)
    payload.project_description = fields.project_description.trim() || null
  if (fields.deliverables !== undefined)
    payload.deliverables = fields.deliverables.trim() || null

  // ── Multi-datas adapter — sincroniza 3 colunas atomicamente. Se o caller
  // mandar {date_start, date_end}, ele vence event_date cru.
  // Semântica:
  //   date_start null/vazio  → limpa todas (sem data)
  //   date_start + sem end   → single-day (event_date=start, end=null, multi=false)
  //   date_start + end>start → multi-day  (event_date=start, end=end,  multi=true)
  //   date_start + end<=start → coage pra single-day (defesa)
  if (fields.date_start !== undefined) {
    const start = fields.date_start || null
    const rawEnd = fields.date_end ?? null
    const safeEnd = start && rawEnd && rawEnd > start ? rawEnd : null
    payload.event_date     = start
    payload.event_date_end = safeEnd
    payload.is_multi_day   = safeEnd !== null
  } else if (fields.event_date !== undefined) {
    // Caller legado ainda aceito — força single-day explicitamente.
    payload.event_date     = fields.event_date || null
    payload.event_date_end = null
    payload.is_multi_day   = false
  }

  if (fields.valid_until !== undefined)
    payload.valid_until = fields.valid_until || null
  if (fields.currency !== undefined)
    payload.currency = fields.currency
  if (fields.notes_internal !== undefined)
    payload.notes_internal = fields.notes_internal.trim() || null
  if (fields.payment_term !== undefined)
    payload.payment_term = fields.payment_term.trim() || null
  if (fields.intended_destination !== undefined)
    payload.intended_destination = fields.intended_destination ?? null

  const { data, error } = await supabase
    .from('budgets')
    .update(payload)
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single()

  if (error) {
    console.error('[budgets/update-info]', error)
    return { success: false, message: 'Erro ao salvar orçamento.' }
  }

  revalidatePath('/budgets')
  revalidatePath(`/budgets/${id}`)
  // Expõe o client resolvido pro caller (frontend usa o id pra chamar
  // updateClient() no modo expandido do ClientPicker). Pode vir undefined
  // quando `client_name` não foi tocado nessa chamada — comportamento ok.
  return { success: true, data, client: resolvedClient ?? undefined }
}

// ─── UPDATE MARGIN — atualiza margem e recalcula totais ───────────────────────

export async function updateBudgetMargin(
  id: string,
  marginType: BudgetMarginType,
  marginInput: number
): Promise<BudgetActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()

  if (authErr || !user) return { success: false, message: 'Não autorizado.' }

  const { data: current } = await supabase
    .from('budgets')
    .select('subtotal')
    .eq('id', id)
    .single()

  if (!current) return { success: false, message: 'Orçamento não encontrado.' }

  const subtotal = Number(current.subtotal)
  const marginAmount =
    marginType === 'percentage'
      ? (subtotal * marginInput) / 100
      : marginInput
  const total = subtotal + marginAmount

  const { data, error } = await supabase
    .from('budgets')
    .update({
      margin_type:   marginType,
      margin_input:  Math.round(marginInput * 100) / 100,
      margin_amount: Math.round(marginAmount * 100) / 100,
      total:         Math.round(total * 100) / 100,
    })
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single()

  if (error) {
    console.error('[budgets/update-margin]', error)
    return { success: false, message: 'Erro ao atualizar margem.' }
  }

  return { success: true, data }
}

// ─── UPDATE STATUS ────────────────────────────────────────────────────────────

export async function updateBudgetStatus(
  id: string,
  status: BudgetStatus
): Promise<BudgetActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()

  if (authErr || !user) return { success: false, message: 'Não autorizado.' }

  const timestamps: Record<string, string> = {}
  if (status === 'sent')     timestamps.sent_at     = new Date().toISOString()
  if (status === 'approved') timestamps.approved_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('budgets')
    .update({ status, ...timestamps })
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single()

  if (error) {
    console.error('[budgets/update-status]', error)
    return { success: false, message: 'Erro ao atualizar status.' }
  }

  revalidatePath('/budgets')
  revalidatePath(`/budgets/${id}`)
  return { success: true, data }
}

// ─── SOFT DELETE ──────────────────────────────────────────────────────────────

export async function deleteBudget(id: string): Promise<BudgetActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()

  if (authErr || !user) return { success: false, message: 'Não autorizado.' }

  const { error } = await supabase
    .from('budgets')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)

  if (error) {
    console.error('[budgets/delete]', error)
    return { success: false, message: 'Erro ao excluir orçamento.' }
  }

  revalidatePath('/budgets')
  return { success: true }
}

// ─── BULK SOFT DELETE ─────────────────────────────────────────────────────────
//
// Soft-deleta múltiplos orçamentos em uma única chamada. A RLS garante que
// o usuário só pode tocar em budgets do workspace dele — não precisamos
// filtrar por workspace_id aqui (e não temos acesso fácil a ele sem 1 query
// a mais). Usado pela toolbar de seleção em massa e pelo botão "limpar
// rascunhos vazios" (via `deleteEmptyDraftBudgets`).
export async function bulkDeleteBudgets(
  ids: string[]
): Promise<{ success: boolean; count: number; message?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()

  if (authErr || !user) return { success: false, count: 0, message: 'Não autorizado.' }
  if (!ids || ids.length === 0) return { success: true, count: 0 }

  const { error, data } = await supabase
    .from('budgets')
    .update({ deleted_at: new Date().toISOString() })
    .in('id', ids)
    .is('deleted_at', null)
    .select('id')

  if (error) {
    console.error('[budgets/bulk-delete]', error)
    return { success: false, count: 0, message: 'Erro ao excluir orçamentos.' }
  }

  revalidatePath('/budgets')
  return { success: true, count: data?.length ?? 0 }
}

// ─── CLEANUP — rascunhos vazios ───────────────────────────────────────────────
//
// Remove (soft delete) apenas orçamentos que claramente são lixo:
//   · status = 'draft'
//   · subtotal = 0 E total = 0 (nenhum item com valor real)
//   · title default ou vazio
//   · client_name vazio
//   · sem descrição, sem entregas, sem notas internas
//   · sem items ativos associados (budget_items)
//
// Tudo soft delete. Se algo for deletado por engano, basta um UPDATE zerando
// deleted_at no Supabase (reversível).
//
// Esta action NÃO aceita filtros do usuário — o critério é fixo e conservador
// (a favor de NÃO deletar quando em dúvida). Para deletar casos específicos,
// use a seleção em lote manual.
export async function deleteEmptyDraftBudgets(): Promise<{
  success: boolean
  count:   number
  message?: string
}> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()

  if (authErr || !user) return { success: false, count: 0, message: 'Não autorizado.' }

  // 1. Workspace do usuário (scoping extra, além da RLS).
  const { data: member } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  if (!member?.workspace_id) {
    return { success: false, count: 0, message: 'Workspace não encontrado.' }
  }

  // 2. Busca candidatos a "vazio" — critério conservador.
  const { data: candidates, error: selErr } = await supabase
    .from('budgets')
    .select('id, budget_items!left(id, deleted_at)')
    .eq('workspace_id', member.workspace_id)
    .eq('status', 'draft')
    .eq('subtotal', 0)
    .eq('total', 0)
    .or('title.is.null,title.eq.,title.eq.Orçamento sem título')
    .or('client_name.is.null,client_name.eq.')
    .is('project_description', null)
    .is('deliverables', null)
    .is('notes_internal', null)
    .is('deleted_at', null)

  if (selErr) {
    console.error('[budgets/cleanup-empty]', selErr)
    return { success: false, count: 0, message: 'Erro ao buscar rascunhos vazios.' }
  }

  // 3. Filtra só os que NÃO têm items ativos (join pode trazer itens soft-deleted,
  // que não contam como conteúdo real).
  const emptyIds = (candidates ?? [])
    .filter(b => {
      const items = (b.budget_items as Array<{ deleted_at: string | null }> | null) ?? []
      return items.every(it => it.deleted_at !== null)
    })
    .map(b => b.id)

  if (emptyIds.length === 0) return { success: true, count: 0 }

  // 4. Soft delete em lote.
  const { error: delErr, data: deleted } = await supabase
    .from('budgets')
    .update({ deleted_at: new Date().toISOString() })
    .in('id', emptyIds)
    .is('deleted_at', null)
    .select('id')

  if (delErr) {
    console.error('[budgets/cleanup-empty/delete]', delErr)
    return { success: false, count: 0, message: 'Erro ao excluir rascunhos vazios.' }
  }

  revalidatePath('/budgets')
  return { success: true, count: deleted?.length ?? 0 }
}
