'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { calcItemTotals, type BudgetItemV2 } from '@/lib/v2/budget-calc'

/**
 * Server actions do editor de orçamento V2.
 *
 * RLS protege escritas — usuário só consegue mexer no próprio workspace.
 * Trigger SQL recalc_budget_v2_totals atualiza budgets_v2.* sempre que
 * budget_items_v2 muda. Aqui só fazemos os UPDATE/INSERT/DELETE.
 */

export type ActionResult = { ok: true } | { ok: false; error: string }

interface SaveBudgetInput {
  id:                   string
  name?:                string | null
  client_id?:           string | null
  agency_id?:           string | null
  project_type?:        string | null
  start_date?:          string | null
  end_date?:            string | null
  location?:            string | null
  status?:              string | null
  margin_percent?:      number | null
  tax_percent?:         number | null
  discount_amount?:     number | null
  payment_terms?:       string | null
  validity_days?:       number | null
  delivery_days?:       number | null
  revisions_included?:  number | null
  notes_internal?:      string | null
  notes_client?:        string | null
}

export async function saveBudget(input: SaveBudgetInput): Promise<ActionResult> {
  const sb = await createClient()
  const { id, ...patch } = input

  const { error } = await sb
    .from('budgets_v2')
    .update(patch as Record<string, unknown>)
    .eq('id', id)

  if (error) return { ok: false, error: error.message }
  revalidatePath(`/v2/budgets/${id}`)
  return { ok: true }
}

export async function addItem(budgetId: string): Promise<ActionResult & { id?: string }> {
  const sb = await createClient()

  const { data: budget } = await sb
    .from('budgets_v2')
    .select('workspace_id')
    .eq('id', budgetId)
    .maybeSingle()

  if (!budget) return { ok: false, error: 'budget_not_found' }

  const { data: lastItems } = await sb
    .from('budget_items_v2')
    .select('sort_order')
    .eq('budget_id', budgetId)
    .order('sort_order', { ascending: false })
    .limit(1)

  const nextOrder =
    (lastItems && lastItems[0]?.sort_order != null ? Number(lastItems[0].sort_order) : -1) + 1

  const { data, error } = await sb
    .from('budget_items_v2')
    .insert({
      budget_id:    budgetId,
      workspace_id: budget.workspace_id,
      description:  'Novo item',
      category:     'Geral',
      unit:         'unidade',
      days:         1,
      people:       1,
      quantity:     1,
      unit_price:   0,
      unit_cost:    0,
      total:        0,
      total_cost:   0,
      sort_order:   nextOrder,
    })
    .select('id')
    .single()

  if (error || !data) return { ok: false, error: error?.message ?? 'insert_failed' }
  revalidatePath(`/v2/budgets/${budgetId}`)
  return { ok: true, id: data.id }
}

interface UpdateItemPatch {
  description?:         string
  description_visible?: string | null
  is_encargo?:          boolean
  category?:            string
  unit?:                string
  days?:                number
  people?:              number
  quantity?:            number
  unit_price?:          number
  unit_cost?:           number
  sort_order?:          number
}

export async function updateItem(
  itemId: string,
  patch: UpdateItemPatch
): Promise<ActionResult> {
  const sb = await createClient()

  // Se mudou algo que afeta total/total_cost, recalcula
  const affectsTotals =
    patch.unit_price !== undefined ||
    patch.unit_cost  !== undefined ||
    patch.days       !== undefined ||
    patch.people     !== undefined ||
    patch.quantity   !== undefined

  let payload: Record<string, unknown> = { ...patch }

  if (affectsTotals) {
    const { data: existing } = await sb
      .from('budget_items_v2')
      .select('unit_price, unit_cost, days, people, quantity, budget_id')
      .eq('id', itemId)
      .maybeSingle()

    if (!existing) return { ok: false, error: 'item_not_found' }

    const merged: BudgetItemV2 = {
      unit_price: patch.unit_price ?? existing.unit_price,
      unit_cost:  patch.unit_cost  ?? existing.unit_cost,
      days:       patch.days       ?? existing.days,
      people:     patch.people     ?? existing.people,
      quantity:   patch.quantity   ?? existing.quantity,
    }

    const { total, total_cost } = calcItemTotals(merged)
    payload = { ...payload, total, total_cost }
  }

  const { error, data } = await sb
    .from('budget_items_v2')
    .update(payload)
    .eq('id', itemId)
    .select('budget_id')
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  if (data?.budget_id) revalidatePath(`/v2/budgets/${data.budget_id}`)
  return { ok: true }
}

export async function removeItem(
  itemId: string,
  budgetId: string
): Promise<ActionResult> {
  const sb = await createClient()
  const { error } = await sb.from('budget_items_v2').delete().eq('id', itemId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/v2/budgets/${budgetId}`)
  return { ok: true }
}

export async function reorderItems(
  budgetId: string,
  itemIds: string[]
): Promise<ActionResult> {
  const sb = await createClient()
  // Em batch — uma transação seria ideal, mas RLS já protege.
  for (let i = 0; i < itemIds.length; i++) {
    await sb.from('budget_items_v2').update({ sort_order: i }).eq('id', itemIds[i])
  }
  revalidatePath(`/v2/budgets/${budgetId}`)
  return { ok: true }
}

// ─── EPIC-17: Carta de orçamento ───────────────────────────────────────────

export async function saveLetter(
  budgetId: string,
  textMd: string
): Promise<ActionResult> {
  const sb = await createClient()
  const { error } = await sb
    .from('budgets_v2')
    .update({ letter_text_md: textMd })
    .eq('id', budgetId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/v2/budgets/${budgetId}`)
  return { ok: true }
}

export interface LetterTemplateRow {
  id:         string
  name:       string
  text_md:    string
  is_default: boolean
}

export async function listLetterTemplates(): Promise<LetterTemplateRow[]> {
  const sb = await createClient()
  const { data } = await sb
    .from('letter_templates_v2')
    .select('id, name, text_md, is_default')
    .order('is_default', { ascending: false })
    .order('name', { ascending: true })
  return (data ?? []) as LetterTemplateRow[]
}

export async function saveLetterTemplate(input: {
  name:        string
  text_md:     string
  is_default?: boolean
}): Promise<ActionResult & { id?: string }> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { ok: false, error: 'unauthorized' }

  // Resolve workspace ativo
  const { data: member } = await sb
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()
  if (!member) return { ok: false, error: 'no_workspace' }

  // Se vai virar default, desmarca os outros primeiro (índice unique exige)
  if (input.is_default) {
    await sb
      .from('letter_templates_v2')
      .update({ is_default: false })
      .eq('workspace_id', member.workspace_id)
      .eq('is_default', true)
  }

  const { data, error } = await sb
    .from('letter_templates_v2')
    .insert({
      workspace_id: member.workspace_id,
      name:         input.name.trim() || 'Sem nome',
      text_md:      input.text_md,
      is_default:   Boolean(input.is_default),
    })
    .select('id')
    .single()

  if (error || !data) return { ok: false, error: error?.message ?? 'insert_failed' }
  return { ok: true, id: data.id }
}

export async function deleteLetterTemplate(templateId: string): Promise<ActionResult> {
  const sb = await createClient()
  const { error } = await sb.from('letter_templates_v2').delete().eq('id', templateId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ─── EPIC-18: Histórico de versões ──────────────────────────────────────────

export interface BudgetVersionRow {
  id:                string
  version_number:    number
  label:             string | null
  total_value_cents: number
  created_at:        string
}

export async function listBudgetVersions(budgetId: string): Promise<BudgetVersionRow[]> {
  const sb = await createClient()
  const { data } = await sb
    .from('budget_versions_v2')
    .select('id, version_number, label, total_value_cents, created_at')
    .eq('budget_id', budgetId)
    .order('version_number', { ascending: false })
  return (data ?? []) as BudgetVersionRow[]
}

export async function saveBudgetVersion(
  budgetId: string,
  label?: string | null
): Promise<ActionResult & { versionNumber?: number; id?: string }> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { ok: false, error: 'unauthorized' }

  // Carrega estado completo
  const [budgetRes, itemsRes] = await Promise.all([
    sb.from('budgets_v2').select('*').eq('id', budgetId).maybeSingle(),
    sb.from('budget_items_v2').select('*').eq('budget_id', budgetId).order('sort_order'),
  ])
  if (!budgetRes.data) return { ok: false, error: 'budget_not_found' }
  const budget = budgetRes.data
  const items  = itemsRes.data ?? []

  // Próximo number (race protegido por unique constraint)
  const { data: lastVer } = await sb
    .from('budget_versions_v2')
    .select('version_number')
    .eq('budget_id', budgetId)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextNumber = ((lastVer?.version_number as number | undefined) ?? 0) + 1

  const totalCents = Math.round(Number(budget.total ?? 0) * 100)

  const snapshot = {
    snapshot_version:    1,
    snapshot_at:         new Date().toISOString(),
    budget: {
      number:              budget.number,
      name:                budget.name,
      client_id:           budget.client_id,
      agency_id:           budget.agency_id,
      project_type:        budget.project_type,
      status:              budget.status,
      start_date:          budget.start_date,
      end_date:            budget.end_date,
      location:            budget.location,
      margin_percent:      budget.margin_percent,
      tax_percent:         budget.tax_percent,
      discount_amount:     budget.discount_amount,
      payment_terms:       budget.payment_terms,
      validity_days:       budget.validity_days,
      delivery_days:       budget.delivery_days,
      revisions_included:  budget.revisions_included,
      notes_internal:      budget.notes_internal,
      notes_client:        budget.notes_client,
      letter_text_md:      budget.letter_text_md,
      subtotal:            budget.subtotal,
      total_cost:          budget.total_cost,
      margin_amount:       budget.margin_amount,
      tax_amount:          budget.tax_amount,
      total:               budget.total,
    },
    items: items.map((i) => ({
      description:         i.description,
      description_visible: i.description_visible,
      category:            i.category,
      unit:                i.unit,
      days:                i.days,
      people:              i.people,
      quantity:            i.quantity,
      unit_price:          i.unit_price,
      unit_cost:           i.unit_cost,
      total:               i.total,
      total_cost:          i.total_cost,
      sort_order:          i.sort_order,
      is_encargo:          i.is_encargo,
    })),
  }

  const { data, error } = await sb
    .from('budget_versions_v2')
    .insert({
      budget_id:         budgetId,
      workspace_id:      budget.workspace_id,
      version_number:    nextNumber,
      label:             label?.trim() || `Versão ${nextNumber}`,
      snapshot,
      total_value_cents: totalCents,
      created_by:        user.id,
    })
    .select('id')
    .single()

  if (error || !data) return { ok: false, error: error?.message ?? 'insert_failed' }
  revalidatePath(`/v2/budgets/${budgetId}`)
  return { ok: true, versionNumber: nextNumber, id: data.id }
}

export async function restoreVersionAsCurrent(
  versionId: string
): Promise<ActionResult> {
  const sb = await createClient()

  const { data: version } = await sb
    .from('budget_versions_v2')
    .select('snapshot, budget_id, workspace_id')
    .eq('id', versionId)
    .maybeSingle()
  if (!version) return { ok: false, error: 'version_not_found' }

  const snap = version.snapshot as { budget: Record<string, unknown>; items: Record<string, unknown>[] }

  // 1. Update header (NÃO mexe em number — é único por workspace)
  const headerPayload = { ...snap.budget }
  delete (headerPayload as { number?: unknown }).number
  await sb.from('budgets_v2').update(headerPayload).eq('id', version.budget_id)

  // 2. Replace items
  await sb.from('budget_items_v2').delete().eq('budget_id', version.budget_id)
  if (snap.items.length > 0) {
    await sb.from('budget_items_v2').insert(
      snap.items.map((i) => ({ ...i, budget_id: version.budget_id, workspace_id: version.workspace_id }))
    )
  }

  revalidatePath(`/v2/budgets/${version.budget_id}`)
  return { ok: true }
}
