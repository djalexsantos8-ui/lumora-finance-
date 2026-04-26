import { NextResponse, type NextRequest } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase/server'
import { BudgetClientePdf } from '@/lib/pdf/budget-cliente-template'

export const dynamic   = 'force-dynamic'
export const runtime   = 'nodejs'  // @react-pdf/renderer não roda em Edge

/**
 * EPIC-16 — gera PDF do orçamento V2 (modo cliente).
 *
 * GET /api/v2/budgets/:id/pdf?download=1
 *
 * Auth via cookies (RLS faz o resto). Retorna `application/pdf` direto
 * no response body — sem Storage bucket por agora (simplicidade
 * + signed URL pode vir em iteração futura quando precisar compartilhar
 * sem login).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const [budgetRes, itemsRes] = await Promise.all([
    supabase
      .from('budgets_v2')
      .select(`
        number, name, status, start_date, end_date, location,
        margin_percent, tax_percent, discount_amount,
        payment_terms, validity_days, delivery_days, revisions_included,
        notes_client, subtotal, margin_amount, tax_amount, total,
        created_at, client_id, workspace_id
      `)
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('budget_items_v2')
      .select('description, description_visible, category, unit, days, people, quantity, unit_price, total, is_encargo')
      .eq('budget_id', id)
      .order('sort_order', { ascending: true }),
  ])

  if (!budgetRes.data) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  const budget = budgetRes.data

  // Busca workspace + client em paralelo (depois de garantir que tem budget)
  const [workspaceRes, clientRes] = await Promise.all([
    supabase
      .from('workspaces')
      .select('name')
      .eq('id', budget.workspace_id)
      .maybeSingle(),
    budget.client_id
      ? supabase.from('clients').select('id, name').eq('id', budget.client_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const workspaceName = workspaceRes.data?.name ?? 'Lumora Solutions'

  const buffer = await renderToBuffer(
    <BudgetClientePdf
      workspaceName={workspaceName}
      budget={{
        number:              budget.number,
        name:                budget.name,
        status:              budget.status,
        start_date:          budget.start_date,
        end_date:            budget.end_date,
        location:            budget.location,
        margin_percent:      Number(budget.margin_percent ?? 0),
        tax_percent:         Number(budget.tax_percent ?? 0),
        discount_amount:     Number(budget.discount_amount ?? 0),
        payment_terms:       budget.payment_terms,
        validity_days:       budget.validity_days,
        delivery_days:       budget.delivery_days,
        revisions_included:  budget.revisions_included,
        notes_client:        budget.notes_client,
        subtotal:            Number(budget.subtotal ?? 0),
        margin_amount:       Number(budget.margin_amount ?? 0),
        tax_amount:          Number(budget.tax_amount ?? 0),
        total:               Number(budget.total ?? 0),
        created_at:          budget.created_at,
      }}
      items={(itemsRes.data ?? []).map((i) => ({
        description:         i.description,
        description_visible: i.description_visible,
        category:            i.category,
        unit:                i.unit,
        days:                Number(i.days ?? 1),
        people:              Number(i.people ?? 1),
        quantity:            Number(i.quantity ?? 1),
        unit_price:          Number(i.unit_price ?? 0),
        total:               Number(i.total ?? 0),
        is_encargo:          Boolean(i.is_encargo),
      }))}
      client={clientRes.data ?? null}
    />
  )

  const filename = `orcamento-${budget.number}.pdf`
  const url      = new URL(req.url)
  const inline   = url.searchParams.get('download') !== '1'

  return new NextResponse(buffer as unknown as BodyInit, {
    status:  200,
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${filename}"`,
      'Cache-Control':       'private, max-age=0, must-revalidate',
    },
  })
}
