import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getContractMeta } from '@/lib/contracts/catalog'
import type { ContractType } from '@/types/contract'

// docx também é Node-only
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

  const { data: settings } = await supabase
    .from('workspace_settings')
    .select('*')
    .eq('workspace_id', contract.workspace_id)
    .maybeSingle()

  try {
    const { buildContractDocx } = await import('@/lib/contracts/docx-builder')
    const meta = getContractMeta(contract.contract_type as ContractType)

    const buffer = await buildContractDocx({
      contract,
      settings: settings ?? null,
      contractTypeLabel: meta?.title ?? 'Contrato',
    })

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
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${slug}.docx"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[contracts/docx]', err)
    return NextResponse.json(
      { error: 'Erro ao gerar DOCX. Tente novamente.' },
      { status: 500 }
    )
  }
}
