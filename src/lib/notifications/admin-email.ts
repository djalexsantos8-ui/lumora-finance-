/**
 * Notificação por email pro admin quando algo der errado.
 * Usado pela página de Plano de Implementação V2 — chamado quando
 * uma task falha ou um pedido pro Claude Inbox dá erro.
 *
 * Não falha silenciosamente: se Resend cair, logamos e continuamos
 * (a falha original já foi gravada em result_notes da task).
 */

import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/server'

const FROM_EMAIL  = process.env.RESEND_FROM_EMAIL || 'Lumora <noreply@lumorafinance.com.br>'
const FROM_NAME   = process.env.RESEND_FROM_NAME  || 'Lumora Finance'
const PRODUCTION_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://www.lumorafinance.com.br'

export interface AdminFailureParams {
  taskId: string
  epicCode: string
  taskTitle: string
  errorMessage: string
  toEmail: string
  whatWasTried?: string  // explicação simples do que se tentou fazer
}

/**
 * Envia email pro admin quando uma task da V2 falha.
 * Retorna { ok, resendId, error } — chamador decide o que fazer.
 */
export async function notifyAdminOfFailure(p: AdminFailureParams): Promise<{
  ok: boolean
  resendId?: string
  error?: string
}> {
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) {
    console.error('[notifyAdminOfFailure] RESEND_API_KEY ausente — pulando envio')
    return { ok: false, error: 'RESEND_API_KEY not configured' }
  }

  const resend = new Resend(resendKey)
  const subject = `[Lumora V2] ${p.epicCode} falhou — ${p.taskTitle.slice(0, 60)}`
  const detailUrl = `${PRODUCTION_URL}/admin/plano-implementacao`

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0a; color: #e5e5e5; margin: 0; padding: 32px 24px;">
  <div style="max-width: 600px; margin: 0 auto; background: #131826; border: 1px solid #232a3f; border-radius: 12px; overflow: hidden;">
    <div style="background: linear-gradient(135deg, #f87171, #ef4444); padding: 20px 24px;">
      <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: rgba(255,255,255,0.85);">
        Lumora V2 · Falha em task
      </div>
      <div style="font-size: 18px; font-weight: 700; color: white; margin-top: 6px;">
        ${escapeHtml(p.epicCode)} — ${escapeHtml(p.taskTitle)}
      </div>
    </div>
    <div style="padding: 24px;">
      ${p.whatWasTried ? `
      <div style="margin-bottom: 16px;">
        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #95a0b8; margin-bottom: 4px;">O que tentei fazer</div>
        <div style="color: #e5e5e5; font-size: 14px; line-height: 1.5;">${escapeHtml(p.whatWasTried)}</div>
      </div>
      ` : ''}
      <div style="margin-bottom: 16px;">
        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #95a0b8; margin-bottom: 4px;">O erro que apareceu</div>
        <div style="background: #0a0a0a; border-left: 3px solid #f87171; padding: 12px 14px; border-radius: 0 8px 8px 0; font-family: monospace; font-size: 12px; color: #f87171; white-space: pre-wrap; word-break: break-word;">${escapeHtml(p.errorMessage)}</div>
      </div>
      <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid #232a3f;">
        <a href="${detailUrl}" style="display: inline-block; background: linear-gradient(135deg, #8b7cf9, #6ad8ff); color: white; padding: 12px 22px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 14px;">Ver no painel →</a>
      </div>
      <div style="margin-top: 16px; font-size: 12px; color: #525252;">
        Esta é uma notificação automática. A task continua marcada como bloqueada/erro no painel até você marcar como resolvida.
      </div>
    </div>
  </div>
</body>
</html>
  `.trim()

  const text = `[Lumora V2] ${p.epicCode} falhou — ${p.taskTitle}

${p.whatWasTried ? `O que tentei: ${p.whatWasTried}\n\n` : ''}Erro:
${p.errorMessage}

Ver no painel: ${detailUrl}
`

  try {
    const result = await resend.emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL.replace(/^[^<]*<|>$/g, '')}>`,
      to: [p.toEmail],
      subject,
      html,
      text,
    })

    if (result.error) {
      console.error('[notifyAdminOfFailure] Resend error:', result.error)
      return { ok: false, error: String(result.error) }
    }

    // Log na tabela admin_failure_notifications
    try {
      const supabase = createAdminClient()
      await supabase.from('admin_failure_notifications').insert({
        task_id: p.taskId,
        admin_email: p.toEmail,
        subject,
        body_excerpt: p.errorMessage.slice(0, 500),
        resend_id: result.data?.id ?? null,
      })
    } catch (logErr) {
      console.error('[notifyAdminOfFailure] log failed but email sent:', logErr)
    }

    return { ok: true, resendId: result.data?.id }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[notifyAdminOfFailure] Send threw:', msg)
    return { ok: false, error: msg }
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
