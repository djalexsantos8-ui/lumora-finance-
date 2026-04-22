import { NextRequest, NextResponse } from 'next/server'
import { createElement } from 'react'
import { createClient } from '@/lib/supabase/server'

// Força runtime Node.js — react-pdf não roda no Edge.
export const runtime = 'nodejs'

interface Params {
  params: Promise<{ id: string; invoiceId: string }>
}

const MONTHS_PT_SHORT = [
  'jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez',
] as const

export async function GET(_request: NextRequest, { params }: Params) {
  const { id, invoiceId } = await params

  // ── auth ──
  const supabase = await createClient()
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()

  if (authErr || !user) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  // ── busca invoice + garante que pertence à recorrência informada ──
  const { data: invoice, error: invErr } = await supabase
    .from('recurring_revenue_invoices')
    .select('*')
    .eq('id', invoiceId)
    .eq('recurring_revenue_id', id)
    .is('deleted_at', null)
    .single()

  if (invErr || !invoice) {
    return NextResponse.json({ error: 'Cobrança não encontrada.' }, { status: 404 })
  }

  // ── busca settings do workspace para branding ──
  const { data: settings } = await supabase
    .from('workspace_settings')
    .select('*')
    .eq('workspace_id', invoice.workspace_id)
    .maybeSingle()

  // ── renderiza PDF ──
  try {
    const { renderToBuffer } = await import('@react-pdf/renderer')
    const { default: MonthlyInvoiceDocument } = await import('@/lib/pdf/monthly-invoice-document')

    const element = createElement(MonthlyInvoiceDocument, {
      invoice,
      settings: settings ?? null,
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(element as any)

    const mm = MONTHS_PT_SHORT[invoice.period_month - 1]
    const titleSlug = (invoice.title || 'cobranca')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'cobranca'

    const filename = `cobranca-${titleSlug}-${mm}-${invoice.period_year}.pdf`

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control':       'no-store',
      },
    })
  } catch (err) {
    console.error('[recurring-invoices/pdf]', err)
    return NextResponse.json(
      { error: 'Erro ao gerar PDF.' },
      { status: 500 }
    )
  }
}
