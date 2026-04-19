import { NextRequest, NextResponse } from 'next/server'
import { createElement } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { Job, JobRevenueItem, JobCostItem } from '@/types/job'
import type { JobFile } from '@/types/job-file'

// react-pdf e sharp não rodam no Edge Runtime
export const runtime  = 'nodejs'
// Geração de PDF com imagens pode passar dos 10s padrão
export const maxDuration = 60

interface Params {
  params: Promise<{ id: string }>
}

// Tipo de arquivo passado pro PDF — imagens viram data URL, PDFs ficam só
// como referência textual (não dá pra embedar PDF dentro de PDF com react-pdf).
export interface PdfJobFile {
  id:         string
  file_name:  string
  mime_type:  string
  size_bytes: number
  /** data URL JPEG pronto pro <Image> do react-pdf. Só presente quando
   *  o arquivo original era uma imagem. PDFs vêm sem esse campo. */
  data_url?:  string
}

// Parâmetros de otimização — equilíbrio qualidade × tamanho final do PDF.
const IMG_MAX_WIDTH  = 1200    // redimensiona se largura original > 1200px
const IMG_JPEG_Q     = 82      // qualidade JPEG na recompressão
const IMG_DOWNLOAD_TIMEOUT_MS = 15_000

function isImageMime(mime: string): boolean {
  return mime === 'image/jpeg' || mime === 'image/png'
}

/**
 * Baixa um arquivo do Storage e — se for imagem — redimensiona com sharp
 * e retorna como data URL JPEG. Se falhar, retorna o file sem data_url
 * (o PDF então lista ele só como referência).
 */
async function prepareImageForPdf(
  supabase: Awaited<ReturnType<typeof createClient>>,
  file: JobFile,
): Promise<PdfJobFile> {
  const base: PdfJobFile = {
    id:         file.id,
    file_name:  file.file_name,
    mime_type:  file.mime_type,
    size_bytes: file.size_bytes,
  }

  if (!isImageMime(file.mime_type)) return base

  try {
    // 1. Signed URL pra ler o binário do bucket privado
    const { data: signed, error: signErr } = await supabase.storage
      .from('job-files')
      .createSignedUrl(file.storage_path, 300) // 5 min é mais que suficiente

    if (signErr || !signed?.signedUrl) {
      console.warn('[pdf] signed url failed', file.id, signErr?.message)
      return base
    }

    // 2. Download do binário (com timeout pra não travar o PDF)
    const controller = new AbortController()
    const timeout    = setTimeout(() => controller.abort(), IMG_DOWNLOAD_TIMEOUT_MS)
    let   buffer: Buffer
    try {
      const res = await fetch(signed.signedUrl, { signal: controller.signal })
      if (!res.ok) {
        console.warn('[pdf] image download failed', file.id, res.status)
        return base
      }
      const ab = await res.arrayBuffer()
      buffer   = Buffer.from(ab)
    } finally {
      clearTimeout(timeout)
    }

    // 3. Sharp: resize (só se necessário) + JPEG re-encode
    const { default: sharp } = await import('sharp')
    const pipeline = sharp(buffer, { failOn: 'none' })
      .rotate() // respeita orientação EXIF
      .resize({
        width: IMG_MAX_WIDTH,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: IMG_JPEG_Q, mozjpeg: true })

    const optimized = await pipeline.toBuffer()
    const dataUrl   = `data:image/jpeg;base64,${optimized.toString('base64')}`

    return { ...base, data_url: dataUrl }
  } catch (err) {
    console.warn('[pdf] prepare image failed', file.id, err)
    return base
  }
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

  // ─── busca itens + comprovantes ───────────────────────────────────────────
  const [
    { data: revenueItems },
    { data: costItems },
    { data: jobFiles },
  ] = await Promise.all([
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
    supabase
      .from('job_files')
      .select('*')
      .eq('job_id', id)
      .is('deleted_at', null)
      .order('created_at', { ascending: true }), // ordem de upload
  ])

  // ─── prepara imagens pra embedar no PDF (paralelo) ────────────────────────
  const files = (jobFiles ?? []) as JobFile[]
  const pdfFiles: PdfJobFile[] = await Promise.all(
    files.map(f => prepareImageForPdf(supabase, f)),
  )

  // ─── renderiza PDF ────────────────────────────────────────────────────────
  try {
    const { renderToBuffer } = await import('@react-pdf/renderer')
    const { default: JobDocument } = await import('@/lib/pdf/job-document')

    const element = createElement(JobDocument, {
      job:          job as Job,
      revenueItems: (revenueItems ?? []) as JobRevenueItem[],
      costItems:    (costItems    ?? []) as JobCostItem[],
      files:        pdfFiles,
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(element as any)

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
