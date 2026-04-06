import { NextRequest, NextResponse } from 'next/server'
import { createElement } from 'react'
import { createClient } from '@/lib/supabase/server'

// Força runtime Node.js — react-pdf não funciona no Edge
export const runtime = 'nodejs'

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params

  // ─── auth ─────────────────────────────────────────────────────────────────
  const supabase = await createClient()
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()

  if (authErr || !user) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  // ─── busca orçamento ──────────────────────────────────────────────────────
  const { data: budget, error: budgetErr } = await supabase
    .from('budgets')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (budgetErr || !budget) {
    return NextResponse.json({ error: 'Orçamento não encontrado.' }, { status: 404 })
  }

  // ─── busca itens visíveis no PDF ──────────────────────────────────────────
  const { data: items } = await supabase
    .from('budget_items')
    .select('*')
    .eq('budget_id', id)
    .eq('show_in_pdf', true)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })

  // ─── busca configurações do workspace ────────────────────────────────────
  const { data: settings } = await supabase
    .from('workspace_settings')
    .select('*')
    .eq('workspace_id', budget.workspace_id)
    .maybeSingle()

  // ─── renderiza PDF ───────────────────────────────────────────────────────
  try {
    // Dynamic imports para evitar problemas de bundling
    const { renderToBuffer } = await import('@react-pdf/renderer')
    const { default: BudgetDocument } = await import('@/lib/pdf/budget-document')

    const element = createElement(BudgetDocument, {
      budget,
      settings: settings ?? null,
      items:    items ?? [],
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(element as any)

    // Slug seguro para o nome do arquivo
    const slug = budget.title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'orcamento'

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `attachment; filename="${slug}.pdf"`,
        'Cache-Control':       'no-store',
      },
    })
  } catch (err) {
    console.error('[pdf/generate]', err)
    return NextResponse.json(
      { error: 'Erro ao gerar PDF. Tente novamente.' },
      { status: 500 }
    )
  }
}
