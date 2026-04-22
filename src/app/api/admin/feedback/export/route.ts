import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { checkAdmin } from '@/lib/auth/is-admin'
import { APP_VERSION, APP_BRAND } from '@/lib/app-version'
import type { Feedback } from '@/types/feedback'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/feedback/export?format=csv|md
 *
 * csv: planilha operacional (Excel/Sheets). Todos os campos, colunas prontas
 *      para filtro. UTF-8 com BOM p/ Excel abrir acentos corretos.
 *
 * md:  relatório consolidado legível por IA (Claude/GPT). Rico em contexto,
 *      agrupado por prioridade, com resumo executivo no topo.
 */
export async function GET(req: NextRequest) {
  const check = await checkAdmin()
  if (!check.isAdmin) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const format = (req.nextUrl.searchParams.get('format') || 'csv').toLowerCase()
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('feedback')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(2000)

  if (error) {
    console.error('[feedback/export] load error:', error)
    return NextResponse.json({ error: 'Falha ao carregar' }, { status: 500 })
  }

  const items = (data ?? []) as Feedback[]
  const today = new Date().toISOString().slice(0, 10)

  if (format === 'md') {
    const body = buildMarkdown(items)
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type':        'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="feedback-lumora-${today}.md"`,
      },
    })
  }

  // default: csv
  const body = buildCsv(items)
  // UTF-8 BOM p/ Excel abrir acentos
  const bom = '\uFEFF'
  return new NextResponse(bom + body, {
    status: 200,
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="feedback-lumora-${today}.csv"`,
    },
  })
}

// ─── CSV ──────────────────────────────────────────────────────────────────────

function buildCsv(items: Feedback[]): string {
  const headers = [
    'id',
    'created_at',
    'email',
    'source',
    'source_page',
    'app_version',
    'user_type',
    'ai_type',
    'severity',
    'priority_score',
    'urgencia',
    'bucket',
    'bloqueia_uso',
    'status',
    'summary',
    'area_afetada',
    'proximo_passo',
    'sugestao_acao',
    'explicacao_humana',
    'interpretacao_tecnica',
    'priority_justificativa',
    'tags',
    'raw_text',
    'transcript',
    'admin_notes',
    'transcription_status',
    'analysis_status',
    'audio_path',
    'audio_duration_sec',
    'attachment_path',
    'attachment_filename',
    'attachment_mime',
    'attachment_size_bytes',
    'prompt_cloud_code',
  ]

  const rows = items.map(i => {
    const a = i.analysis ?? null
    return [
      i.id,
      i.created_at,
      i.email ?? '',
      i.source,
      i.source_page ?? '',
      i.app_version ?? '',
      i.user_type ?? '',
      i.ai_type ?? '',
      i.severity ?? '',
      i.priority_score ?? '',
      a?.urgencia ?? '',
      a?.bucket ?? '',
      a?.bloqueia_uso === true ? 'sim' : a?.bloqueia_uso === false ? 'não' : '',
      i.status,
      i.summary ?? '',
      a?.area_afetada ?? '',
      a?.proximo_passo ?? '',
      a?.sugestao_acao ?? '',
      a?.explicacao_humana ?? '',
      a?.interpretacao_tecnica ?? '',
      a?.priority_justificativa ?? '',
      (i.tags ?? []).join('|'),
      i.raw_text ?? '',
      i.transcript ?? '',
      i.admin_notes ?? '',
      i.transcription_status,
      i.analysis_status,
      i.audio_path ?? '',
      i.audio_duration_sec ?? '',
      i.attachment_path ?? '',
      i.attachment_filename ?? '',
      i.attachment_mime ?? '',
      i.attachment_size_bytes ?? '',
      i.prompt_cloud_code ?? '',
    ]
  })

  const csvLines = [headers, ...rows].map(row =>
    row.map(cell => csvEscape(String(cell ?? ''))).join(',')
  )
  return csvLines.join('\r\n')
}

function csvEscape(s: string): string {
  // RFC 4180: envolve em aspas se tem vírgula, aspas, CR ou LF; duplica aspas internas
  if (/[",\r\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

// ─── Markdown ────────────────────────────────────────────────────────────────

function buildMarkdown(items: Feedback[]): string {
  const now  = new Date().toISOString()
  const bySev: Record<string, Feedback[]> = { critica: [], alta: [], media: [], baixa: [], sem: [] }
  for (const i of items) {
    const k = i.severity ?? 'sem'
    if (!bySev[k]) bySev[k] = []
    bySev[k].push(i)
  }

  const counts = {
    total:    items.length,
    novo:     items.filter(i => i.status === 'novo').length,
    critica:  bySev.critica.length,
    alta:     bySev.alta.length,
    bugs:     items.filter(i => i.ai_type === 'bug').length,
    melhoria: items.filter(i => i.ai_type === 'melhoria').length,
    ux:       items.filter(i => i.ai_type === 'ux').length,
  }

  const lines: string[] = []
  lines.push(`# Relatório de feedback — ${APP_BRAND} · Lumora Finance v${APP_VERSION}`)
  lines.push('')
  lines.push(`_Gerado em ${now}_`)
  lines.push('')
  lines.push('## Resumo executivo')
  lines.push('')
  lines.push(`- **Total de feedbacks (não arquivados):** ${counts.total}`)
  lines.push(`- **Novos (sem triagem):** ${counts.novo}`)
  lines.push(`- **Severidade crítica:** ${counts.critica}`)
  lines.push(`- **Severidade alta:** ${counts.alta}`)
  lines.push(`- **Bugs reportados:** ${counts.bugs}`)
  lines.push(`- **Pedidos de melhoria:** ${counts.melhoria}`)
  lines.push(`- **Problemas de UX:** ${counts.ux}`)
  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push('## Top 10 por prioridade')
  lines.push('')

  const top = [...items]
    .filter(i => typeof i.priority_score === 'number')
    .sort((a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0))
    .slice(0, 10)

  if (top.length === 0) {
    lines.push('_(nenhum item com priority_score)_')
  } else {
    top.forEach((i, idx) => {
      lines.push(`${idx + 1}. **[${i.priority_score}]** ${i.summary ?? (i.raw_text ?? '').slice(0, 80)} · \`${i.ai_type ?? '—'}\` · ${i.severity ?? '—'}`)
    })
  }

  lines.push('')
  lines.push('---')
  lines.push('')

  const severityLabels: Array<[string, string]> = [
    ['critica', '🔴 Críticos'],
    ['alta',    '🟠 Alta severidade'],
    ['media',   '🟡 Média severidade'],
    ['baixa',   '🔵 Baixa severidade'],
    ['sem',     '⚪ Sem análise'],
  ]

  for (const [key, label] of severityLabels) {
    const group = bySev[key]
    if (!group || group.length === 0) continue
    lines.push(`## ${label} (${group.length})`)
    lines.push('')
    for (const i of group) {
      lines.push(renderItem(i))
      lines.push('')
    }
    lines.push('---')
    lines.push('')
  }

  lines.push('')
  lines.push('_Fim do relatório. Use como input para análise via LLM._')
  return lines.join('\n')
}

function renderItem(i: Feedback): string {
  const a = i.analysis
  const parts: string[] = []
  parts.push(`### ${i.summary ?? (i.raw_text ?? '').slice(0, 80) ?? i.id}`)
  parts.push('')
  parts.push(`- **ID:** \`${i.id}\``)
  parts.push(`- **Data:** ${i.created_at}`)
  parts.push(`- **De:** ${i.email ?? (i.source === 'admin_manual' ? 'admin (manual)' : 'usuário')}`)
  parts.push(`- **Página:** ${i.source_page ?? '—'}`)
  parts.push(`- **Tipo (user/IA):** ${i.user_type ?? '—'} / ${i.ai_type ?? '—'}`)
  parts.push(`- **Severidade:** ${i.severity ?? '—'} · **Priority:** ${i.priority_score ?? '—'}`)
  if (a) {
    parts.push(`- **Urgência:** ${a.urgencia ?? '—'} · **Bucket:** ${a.bucket ?? '—'} · **Bloqueia uso:** ${a.bloqueia_uso === true ? 'sim' : 'não'}`)
    parts.push(`- **Tags:** ${(Array.isArray(a.tags) ? a.tags : []).join(', ') || '—'}`)
  }
  parts.push(`- **Status:** ${i.status}`)
  if (i.raw_text) {
    parts.push('')
    parts.push('**Texto original:**')
    parts.push('> ' + i.raw_text.replace(/\n/g, '\n> '))
  }
  if (i.transcript) {
    parts.push('')
    parts.push('**Transcrição do áudio:**')
    parts.push('> ' + i.transcript.replace(/\n/g, '\n> '))
  }
  if (i.attachment_path) {
    parts.push('')
    parts.push(`**Anexo:** ${i.attachment_filename ?? '(sem nome)'} · ${i.attachment_mime ?? '?'} · ${i.attachment_size_bytes ?? '?'} bytes`)
  }
  if (a) {
    parts.push('')
    parts.push('**Análise IA:**')
    parts.push(`- _Explicação humana:_ ${a.explicacao_humana ?? '—'}`)
    parts.push(`- _Interpretação técnica:_ ${a.interpretacao_tecnica ?? '—'}`)
    parts.push(`- _Área afetada:_ ${a.area_afetada ?? '—'}`)
    parts.push(`- _Sugestão de ação:_ ${a.sugestao_acao ?? '—'}`)
    parts.push(`- _Próximo passo:_ **${a.proximo_passo ?? '—'}**`)
    parts.push(`- _Priority justificativa:_ ${a.priority_justificativa ?? '—'}`)
  }
  if (i.prompt_cloud_code) {
    parts.push('')
    parts.push('**Prompt Cloud Code (cole em nova sessão):**')
    parts.push('```')
    parts.push(i.prompt_cloud_code)
    parts.push('```')
  }
  if (i.admin_notes) {
    parts.push('')
    parts.push(`**Notas do time:** ${i.admin_notes}`)
  }
  return parts.join('\n')
}
