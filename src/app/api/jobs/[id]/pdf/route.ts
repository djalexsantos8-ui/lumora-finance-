import { NextRequest, NextResponse } from 'next/server'
import { createElement } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { Job, JobRevenueItem, JobCostItem } from '@/types/job'

// Força runtime Node.js — react-pdf não funciona no Edge Runtime
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

  // ─── busca job ────────────────────────────────────────────────────────────
  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (jobErr || !job) {
    return NextResponse.json({ error: 'Job não encontrado.' }, { status: 404 })
  }

  // ─── busca itens ──────────────────────────────────────────────────────────
  const [{ data: revenueItems }, { data: costItems }] = await Promise.all([
    supabase
      .from('job_revenue_items')
      .select('*')
      .eq('job_id', id)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true }),
    supabase
      .from('job_cost_items')
      .select('*')
      .eq('job_id', id)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true }),
  ])

  // ─── renderiza PDF ────────────────────────────────────────────────────────
  try {
    // Dynamic imports para evitar problemas de bundling (igual ao budget PDF)
    const { renderToBuffer } = await import('@react-pdf/renderer')
    const { default: JobDocument } = await import('@/lib/pdf/job-document')

    const element = createElement(JobDocument, {
      job:          job as Job,
      revenueItems: (revenueItems ?? []) as JobRevenueItem[],
      costItems:    (costItems    ?? []) as JobCostItem[],
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(element as any)

    // Slug seguro para o nome do arquivo
    const slug = (job.title ?? 'job')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'job'

    const clientSlug = (job.client_name ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40)

    const filename = clientSlug
      ? `cobranca_${clientSlug}_${slug}.pdf`
      : `cobranca_${slug}.pdf`

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control':       'no-store',
      },
    })
  } catch (err) {
    console.error('[jobs/pdf/generate]', err)
    return NextResponse.json(
      { error: 'Erro ao gerar PDF. Tente novamente.' },
      { status: 500 }
    )
  }
}
