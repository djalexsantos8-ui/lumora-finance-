import { NextRequest, NextResponse } from 'next/server'
import { createElement } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { OrderItem } from '@/types/order'

// Força runtime Node.js — react-pdf não funciona no Edge
export const runtime = 'nodejs'

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()

  if (authErr || !user) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (orderErr || !order) {
    return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 })
  }

  // Itens do pedido — gracefully degrade se tabela não existe
  let items: OrderItem[] = []
  try {
    const { data, error } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', id)
      .eq('show_in_pdf', true)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true })
    if (!error) items = (data ?? []) as OrderItem[]
  } catch {
    // tabela não existe ainda — segue com items vazio
  }

  // Configurações do workspace
  const { data: settings } = await supabase
    .from('workspace_settings')
    .select('*')
    .eq('workspace_id', order.workspace_id)
    .maybeSingle()

  try {
    const { renderToBuffer } = await import('@react-pdf/renderer')
    const { default: OrderDocument } = await import('@/lib/pdf/order-document')

    const element = createElement(OrderDocument, {
      order,
      items,
      settings: settings ?? null,
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(element as any)

    const slug = (order.title || 'pedido')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'pedido'

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `attachment; filename="${slug}.pdf"`,
        'Cache-Control':       'no-store',
      },
    })
  } catch (err) {
    console.error('[orders/pdf]', err)
    return NextResponse.json(
      { error: 'Erro ao gerar PDF. Tente novamente.' },
      { status: 500 }
    )
  }
}
