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
