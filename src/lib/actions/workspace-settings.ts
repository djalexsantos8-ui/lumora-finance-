'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { SettingsActionResult } from '@/types/workspace-settings'

// ─── helpers ──────────────────────────────────────────────────────────────────

async function getActiveWorkspaceId(userId: string): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()
  return data?.workspace_id ?? null
}

// ─── UPSERT — salva ou atualiza as configurações do workspace ─────────────────

export async function upsertWorkspaceSettings(
  formData: FormData
): Promise<SettingsActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()

  if (authErr || !user) return { success: false, message: 'Não autorizado.' }

  const workspaceId = await getActiveWorkspaceId(user.id)
  if (!workspaceId) return { success: false, message: 'Workspace não encontrado.' }

  const company_name    = (formData.get('company_name') as string)?.trim()    || null
  const company_logo_url = (formData.get('company_logo_url') as string)        || null
  const signature_name  = (formData.get('signature_name') as string)?.trim()  || null
  const signature_title = (formData.get('signature_title') as string)?.trim() || null
  const footer_text     = (formData.get('footer_text') as string)?.trim()     || null

  // ─── Dados contratuais da empresa (migration 20260421130000) ───────────
  const company_legal_name    = (formData.get('company_legal_name')    as string)?.trim() || null
  const company_cnpj          = (formData.get('company_cnpj')          as string)?.trim() || null
  const company_cpf           = (formData.get('company_cpf')           as string)?.trim() || null
  const company_address_line  = (formData.get('company_address_line')  as string)?.trim() || null
  const company_address_city  = (formData.get('company_address_city')  as string)?.trim() || null
  const company_address_state = (formData.get('company_address_state') as string)?.trim() || null
  const company_address_zip   = (formData.get('company_address_zip')   as string)?.trim() || null
  const company_email         = (formData.get('company_email')         as string)?.trim() || null
  const company_phone         = (formData.get('company_phone')         as string)?.trim() || null

  const noticeDaysRaw  = formData.get('default_cancellation_notice_days') as string | null
  const penaltyPctRaw  = formData.get('default_cancellation_penalty_pct') as string | null
  const default_cancellation_notice_days = noticeDaysRaw ? Number(noticeDaysRaw) || null : null
  const default_cancellation_penalty_pct = penaltyPctRaw ? Number(penaltyPctRaw) || null : null

  const { data, error } = await supabase
    .from('workspace_settings')
    .upsert(
      {
        workspace_id: workspaceId,
        company_name,
        company_logo_url,
        signature_name,
        signature_title,
        footer_text,
        company_legal_name,
        company_cnpj,
        company_cpf,
        company_address_line,
        company_address_city,
        company_address_state,
        company_address_zip,
        company_email,
        company_phone,
        default_cancellation_notice_days,
        default_cancellation_penalty_pct,
      },
      { onConflict: 'workspace_id' }
    )
    .select()
    .single()

  if (error) {
    console.error('[settings/upsert]', error)
    return { success: false, message: 'Erro ao salvar configurações.' }
  }

  revalidatePath('/settings')
  return { success: true, data }
}
