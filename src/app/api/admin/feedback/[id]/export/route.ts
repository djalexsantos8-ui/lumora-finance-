import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { checkAdmin } from '@/lib/auth/is-admin'
import { APP_VERSION, APP_BRAND } from '@/lib/app-version'
import type { Feedback } from '@/types/feedback'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/feedback/:id/export?format=md|pdf
 *
 * md:  Markdown rico com análise completa + prompt Cloud Code (cola em nova sessão).
 * pdf: HTML imprimível (usar Ctrl+P → Salvar como PDF no navegador). Sem dependência
 *      de lib de PDF no server — mantém bundle leve e funciona em edge.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const check = await checkAdmin()
  if (!check.isAdmin) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })

  const format = (req.nextUrl.searchParams.get('format') || 'md').toLowerCase()

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('feedback')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error || !data) {
    return NextResponse.json({ error: 'Feedback não encontrado' }, { status: 404 })
  }

  const fb   = data as Feedback
  const slug = (fb.summary ?? 'feedback').slice(0, 40).replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-').toLowerCase() || 'feedback'
  const date = fb.created_at.slice(0, 10)

  if (format === 'pdf') {
    const html = buildHtml(fb)
    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        // inline: abre no navegador, usuário imprime como PDF
        'Content-Disposition': `inline; filename="lumora-feedback-${date}-${slug}.html"`,
      },
    })
  }

  // default: md
  const md = buildMarkdown(fb)
  return new NextResponse(md, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="lumora-feedback-${date}-${slug}.md"`,
    },
  })
}

// ─── Markdown ────────────────────────────────────────────────────────────────

function buildMarkdown(fb: Feedback): string {
  const a = fb.analysis
  const L: string[] = []

  L.push(`# ${fb.summary ?? (fb.raw_text ?? 'Feedback').slice(0, 80)}`)
  L.push('')
  L.push(`_${APP_BRAND} · Lumora Finance v${APP_VERSION} · exportado em ${new Date().toISOString()}_`)
  L.push('')

  L.push('## Metadados')
  L.push(`- **ID:** \`${fb.id}\``)
  L.push(`- **Data:** ${fb.created_at}`)
  L.push(`- **De:** ${fb.email ?? (fb.source === 'admin_manual' ? 'admin (manual)' : 'usuário')}`)
  L.push(`- **Página de origem:** ${fb.source_page ?? '—'}`)
  L.push(`- **Versão do app:** ${fb.app_version ?? '—'}`)
  L.push(`- **User-Agent:** ${fb.user_agent ?? '—'}`)
  L.push(`- **Tipo (usuário):** ${fb.user_type ?? '—'}`)
  L.push(`- **Tipo (IA):** ${fb.ai_type ?? '—'}`)
  L.push(`- **Severidade:** ${fb.severity ?? '—'}`)
  L.push(`- **Priority score:** ${fb.priority_score ?? '—'}`)
  L.push(`- **Status:** ${fb.status}`)
  if (a) {
    L.push(`- **Urgência:** ${a.urgencia}`)
    L.push(`- **Bucket:** ${a.bucket}`)
    L.push(`- **Bloqueia uso:** ${a.bloqueia_uso ? 'sim' : 'não'}`)
    L.push(`- **Tags:** ${a.tags.join(', ') || '—'}`)
  }
  L.push('')

  if (fb.raw_text) {
    L.push('## Texto original (digitado pelo usuário)')
    L.push('')
    L.push('> ' + fb.raw_text.replace(/\n/g, '\n> '))
    L.push('')
  }

  if (fb.transcript) {
    L.push('## Transcrição do áudio')
    L.push('')
    L.push('> ' + fb.transcript.replace(/\n/g, '\n> '))
    L.push('')
    if (fb.audio_duration_sec) {
      L.push(`_Duração: ${fb.audio_duration_sec}s_`)
      L.push('')
    }
  }

  if (fb.attachment_path) {
    L.push('## Anexo')
    L.push(`- **Arquivo:** ${fb.attachment_filename ?? '(sem nome)'}`)
    L.push(`- **Tipo:** ${fb.attachment_mime ?? '?'}`)
    L.push(`- **Tamanho:** ${fb.attachment_size_bytes ?? '?'} bytes`)
    L.push(`- **Path (privado, abra via admin):** \`${fb.attachment_path}\``)
    L.push('')
  }

  if (a) {
    L.push('## Análise IA — três camadas')
    L.push('')
    L.push('### 1. O que o usuário quis dizer')
    L.push(a.explicacao_humana)
    L.push('')
    L.push('### 2. O que isso provavelmente significa no código')
    L.push(a.interpretacao_tecnica)
    L.push('')
    L.push('### 3. O que fazer a respeito')
    L.push(a.sugestao_acao)
    L.push('')
    L.push(`**Área afetada:** ${a.area_afetada}`)
    L.push('')
    L.push(`**Próximo passo (amanhã cedo):** ${a.proximo_passo}`)
    L.push('')
    L.push(`**Priority justificativa:** ${a.priority_justificativa}`)
    L.push('')
  }

  if (fb.prompt_cloud_code) {
    L.push('## Prompt Cloud Code — cole em uma nova sessão')
    L.push('')
    L.push('```text')
    L.push(fb.prompt_cloud_code)
    L.push('```')
    L.push('')
  }

  if (fb.admin_notes) {
    L.push('## Notas internas do time')
    L.push(fb.admin_notes)
    L.push('')
  }

  L.push('---')
  L.push('_Gerado por Lumora Finance · feedback engine._')
  return L.join('\n')
}

// ─── HTML (para usuário imprimir como PDF) ───────────────────────────────────

function buildHtml(fb: Feedback): string {
  const a = fb.analysis
  const title = escapeHtml(fb.summary ?? (fb.raw_text ?? 'Feedback').slice(0, 80))

  const sections: string[] = []

  sections.push(`<section><h2>Metadados</h2><ul>
    <li><strong>ID:</strong> <code>${escapeHtml(fb.id)}</code></li>
    <li><strong>Data:</strong> ${escapeHtml(fb.created_at)}</li>
    <li><strong>De:</strong> ${escapeHtml(fb.email ?? (fb.source === 'admin_manual' ? 'admin (manual)' : 'usuário'))}</li>
    <li><strong>Página:</strong> ${escapeHtml(fb.source_page ?? '—')}</li>
    <li><strong>Versão:</strong> ${escapeHtml(fb.app_version ?? '—')}</li>
    <li><strong>Tipo (user/IA):</strong> ${escapeHtml(fb.user_type ?? '—')} / ${escapeHtml(fb.ai_type ?? '—')}</li>
    <li><strong>Severidade:</strong> ${escapeHtml(fb.severity ?? '—')} · <strong>Priority:</strong> ${escapeHtml(String(fb.priority_score ?? '—'))}</li>
    <li><strong>Status:</strong> ${escapeHtml(fb.status)}</li>
    ${a ? `<li><strong>Urgência:</strong> ${escapeHtml(a.urgencia)} · <strong>Bucket:</strong> ${escapeHtml(a.bucket)} · <strong>Bloqueia uso:</strong> ${a.bloqueia_uso ? 'sim' : 'não'}</li>` : ''}
    ${a ? `<li><strong>Tags:</strong> ${escapeHtml(a.tags.join(', ') || '—')}</li>` : ''}
  </ul></section>`)

  if (fb.raw_text) {
    sections.push(`<section><h2>Texto original</h2><blockquote>${escapeHtml(fb.raw_text).replace(/\n/g, '<br>')}</blockquote></section>`)
  }
  if (fb.transcript) {
    sections.push(`<section><h2>Transcrição do áudio</h2><blockquote>${escapeHtml(fb.transcript).replace(/\n/g, '<br>')}</blockquote>${fb.audio_duration_sec ? `<p class="muted">Duração: ${fb.audio_duration_sec}s</p>` : ''}</section>`)
  }
  if (fb.attachment_path) {
    sections.push(`<section><h2>Anexo</h2><ul>
      <li><strong>Arquivo:</strong> ${escapeHtml(fb.attachment_filename ?? '(sem nome)')}</li>
      <li><strong>Tipo:</strong> ${escapeHtml(fb.attachment_mime ?? '?')}</li>
      <li><strong>Tamanho:</strong> ${escapeHtml(String(fb.attachment_size_bytes ?? '?'))} bytes</li>
    </ul></section>`)
  }
  if (a) {
    sections.push(`<section><h2>Análise IA — três camadas</h2>
      <h3>1 · O que o usuário quis dizer</h3>
      <p>${escapeHtml(a.explicacao_humana).replace(/\n/g, '<br>')}</p>
      <h3>2 · O que isso provavelmente significa no código</h3>
      <p>${escapeHtml(a.interpretacao_tecnica).replace(/\n/g, '<br>')}</p>
      <h3>3 · O que fazer a respeito</h3>
      <p>${escapeHtml(a.sugestao_acao).replace(/\n/g, '<br>')}</p>
      <p><strong>Área afetada:</strong> ${escapeHtml(a.area_afetada)}</p>
      <p><strong>Próximo passo:</strong> ${escapeHtml(a.proximo_passo)}</p>
      <p class="muted"><strong>Justificativa do priority score:</strong> ${escapeHtml(a.priority_justificativa)}</p>
    </section>`)
  }
  if (fb.prompt_cloud_code) {
    sections.push(`<section class="prompt-block"><h2>Prompt Cloud Code</h2>
      <p class="muted">Cole em uma nova sessão do Claude Code / Cloud Code.</p>
      <pre>${escapeHtml(fb.prompt_cloud_code)}</pre>
    </section>`)
  }
  if (fb.admin_notes) {
    sections.push(`<section><h2>Notas internas do time</h2><p>${escapeHtml(fb.admin_notes).replace(/\n/g, '<br>')}</p></section>`)
  }

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${title} — Lumora Feedback</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    max-width: 800px; margin: 32px auto; padding: 0 24px;
    color: #111; line-height: 1.55;
  }
  h1 { border-bottom: 2px solid #D4A853; padding-bottom: 8px; margin-bottom: 4px; }
  h2 { color: #8a6d2b; border-bottom: 1px solid #eee; padding-bottom: 4px; margin-top: 28px; font-size: 18px; }
  h3 { color: #333; margin-top: 16px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; }
  .muted { color: #666; font-size: 13px; }
  blockquote { margin: 8px 0; padding: 12px 16px; background: #faf7ef; border-left: 4px solid #D4A853; border-radius: 4px; }
  pre { background: #f4f4f4; padding: 16px; border-radius: 6px; white-space: pre-wrap; word-wrap: break-word; font-size: 12.5px; font-family: 'Menlo', 'Consolas', monospace; }
  ul { padding-left: 20px; }
  code { background: #f4f4f4; padding: 2px 4px; border-radius: 3px; font-size: 90%; }
  .header-meta { color: #666; font-size: 13px; margin-bottom: 24px; }
  .prompt-block pre { background: #fef8e7; border: 1px solid #D4A853; }
  .print-btn {
    position: fixed; top: 16px; right: 16px;
    background: #D4A853; color: #111; border: none; padding: 10px 16px;
    border-radius: 6px; font-weight: 600; cursor: pointer;
    font-size: 13px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  }
  @media print {
    .print-btn { display: none; }
    body { margin: 0; padding: 16px; max-width: none; }
    .prompt-block pre { background: #f8f8f8; }
  }
</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">🖨 Imprimir / Salvar PDF</button>
<h1>${title}</h1>
<p class="header-meta">${APP_BRAND} · Lumora Finance v${APP_VERSION} · gerado em ${new Date().toISOString()}</p>
${sections.join('\n')}
<hr>
<p class="muted">Gerado automaticamente pelo Lumora Finance · feedback engine.</p>
</body>
</html>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
