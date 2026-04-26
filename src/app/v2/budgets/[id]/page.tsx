import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import BudgetEditorClient from './client'
import { DEFAULT_LETTER_MD } from '@/lib/budgets/letter-vars'
import { getProjectTypes } from '@/lib/v2/project-types'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function BudgetEditorV2Page({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const [budgetRes, itemsRes, clientsRes, templatesRes, versionsRes, projectTypes, datesRes] = await Promise.all([
    supabase.from('budgets_v2').select('*').eq('id', id).maybeSingle(),
    supabase
      .from('budget_items_v2')
      .select('*')
      .eq('budget_id', id)
      .order('sort_order', { ascending: true }),
    supabase
      .from('clients')
      .select('id, name')
      .is('deleted_at', null)
      .order('name'),
    supabase
      .from('letter_templates_v2')
      .select('id, name, text_md, is_default')
      .order('is_default', { ascending: false })
      .order('name', { ascending: true }),
    supabase
      .from('budget_versions_v2')
      .select('id, version_number, label, total_value_cents, created_at')
      .eq('budget_id', id)
      .order('version_number', { ascending: false })
      .limit(20),
    getProjectTypes(),
    supabase
      .from('shooting_dates_v2')
      .select('id, date_start, date_end, time_start, time_end, label, local_descricao, local_endereco, notes, order_idx')
      .eq('budget_id', id)
      .order('order_idx', { ascending: true })
      .order('date_start', { ascending: true }),
  ])

  if (!budgetRes.data) notFound()

  // ── EPIC-17: pré-popula carta vazia com default template (se houver)
  let initialLetter = budgetRes.data.letter_text_md as string | null
  if (!initialLetter || !initialLetter.trim()) {
    const defaultTpl = (templatesRes.data ?? []).find((t) => t.is_default)
    initialLetter = defaultTpl?.text_md ?? DEFAULT_LETTER_MD
  }

  return (
    <BudgetEditorClient
      budget={{ ...budgetRes.data, letter_text_md: initialLetter }}
      initialItems={itemsRes.data ?? []}
      clients={clientsRes.data ?? []}
      letterTemplates={(templatesRes.data ?? []).map((t) => ({
        id:         t.id,
        name:       t.name,
        text_md:    t.text_md,
        is_default: Boolean(t.is_default),
      }))}
      versions={(versionsRes.data ?? []).map((v) => ({
        id:                v.id,
        version_number:    v.version_number,
        label:             v.label,
        total_value_cents: Number(v.total_value_cents ?? 0),
        created_at:        v.created_at,
      }))}
      projectTypes={projectTypes}
      shootingDates={(datesRes.data ?? []) as Array<{
        id:               string
        date_start:       string
        date_end:         string | null
        time_start:       string | null
        time_end:         string | null
        label:            string | null
        local_descricao:  string | null
        local_endereco:   string | null
        notes:            string | null
        order_idx:        number
      }>}
    />
  )
}
