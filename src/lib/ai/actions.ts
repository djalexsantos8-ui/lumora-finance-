'use server'

/**
 * src/lib/ai/actions.ts
 *
 * Server actions utilitárias de IA (read-only).
 *   · getMyAIQuota(): retorna quota do workspace do usuário logado.
 *
 * As actions de geração (generateBudgetFields, generateOrderFields) vivem
 * em arquivos separados porque cada uma tem payload próprio e são
 * chamadas a partir das páginas específicas.
 */

import { createClient } from '@/lib/supabase/server'
import { getWorkspaceId } from '@/lib/utils/workspace'
import { getAIQuota, type AIQuota } from '@/lib/ai/quota'

export type QuotaResult =
  | { success: true;  quota: AIQuota }
  | { success: false; message: string }

export async function getMyAIQuota(): Promise<QuotaResult> {
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) {
    return { success: false, message: 'Não autenticado.' }
  }
  const workspaceId = await getWorkspaceId(userData.user.id)
  if (!workspaceId) {
    return { success: false, message: 'Workspace não encontrado.' }
  }
  const quota = await getAIQuota(supabase, workspaceId)
  return { success: true, quota }
}
