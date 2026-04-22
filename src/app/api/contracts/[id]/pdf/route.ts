import { NextRequest, NextResponse } from 'next/server'
import { createElement } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getContractMeta } from '@/lib/contracts/catalog'
import type { ContractType } from '@/types/contract'

// Força runtime Node.js — react-pdf não funciona no Edge
export const runtime = 'nodejs'

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params

  // ── auth ─────────────────────────────────────────────────────────────
  const supabase = await createClient()
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()

  if (authErr || !user) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  // ── busca contrato ────────────────────────────────────────────────────
  const { data: contract, error: contractErr } = await supabase
    .from('contracts')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (contractErr || !contract) {
    return NextResponse.json({ error: 'Contrato não encontrado.' }, { status: 404 })
  }

  if (!contract.rendered_content || typeof contract.rendered_content !== 'string') {
    return NextResponse.json(
      { error: 'Contrato ainda não foi gerado. Salve e regere antes de baixar.' },
      { status: 400 }
    )
  }

  // ── busca settings para branding ──────────────────────────────────────
  const { data: settings } = await supabase
    .from('workspace_settings')
    .select('*')
    .eq('workspace_id', contract.workspace_id)
    .maybeSingle()

  // ── renderiza PDF ─────────────────────────────────────────────────────
  try {
    const { renderToBuffer } = await import('@react-pdf/renderer')
    const { default: ContractDocument } = await import('@/lib/pdf/contract-document')

    const meta = getContractMeta(contract.contract_type as ContractType)

    const element = createElement(ContractDocument, {
      contract,
      settings: settings ?? null,
      contractTypeLabel: meta?.title ?? 'Contrato',
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(element as any)

    const slug =
      (contract.title || 'contrato')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 60) || 'contrato'

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `attachment; filename="${slug}.pdf"`,
        'Cache-Control':       'no-store',
      },
    })
  } catch (err) {
    console.error('[contracts/pdf]', err)
    return NextResponse.json(
      { error: 'Erro ao gerar PDF. Tente novamente.' },
      { status: 500 }
    )
  }
}
