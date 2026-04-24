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
import { getAIQuota, getAIBalance, type AIQuota, type AIBalance } from '@/lib/ai/quota'

export type QuotaResult =
  | { success: true;  quota: AIQuota }
  | { success: false; message: string }

export type BalanceResult =
  | { success: true;  balance: AIBalance }
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

/**
 * getMyAIBalance — breakdown completo por origem (Deploy H 2026-04-23).
 *
 * Retorna créditos concedidos manualmente (granted), comprados (purchased)
 * e plano mensal (included_used/limit/remaining). Usado pela aba Créditos
 * em /settings pra mostrar "100 do plano + 500 extras" etc.
 *
 * Se a migration do ledger ainda não rodou, retorna granted/purchased=0 e
 * reusa o quota antigo (getAIBalance já faz esse fallback internamente).
 */
export async function getMyAIBalance(): Promise<BalanceResult> {
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) {
    return { success: false, message: 'Não autenticado.' }
  }
  const workspaceId = await getWorkspaceId(userData.user.id)
  if (!workspaceId) {
    return { success: false, message: 'Workspace não encontrado.' }
  }
  const balance = await getAIBalance(supabase, workspaceId)
  return { success: true, balance }
}

// ──────────────────────────────────────────────────────────────────────────────
// getMyAICreditHistory — histórico de eventos de IA do workspace do usuário.
//
// Deploy H.2 (2026-04-24) — FASE 4 "OpenAI usage UI".
//
// Contexto:
//   · Settings → aba Créditos hoje mostra saldo + extras (granted/purchased),
//     mas não mostra QUANDO a IA foi usada. Usuário não tem visibilidade
//     do próprio consumo.
//   · Agora listamos os últimos eventos (consume, grant, purchase) com
//     timestamp + motivo, read-only. Filtrado por workspace via RLS.
//
// Segurança:
//   · Usa createClient() (sessão do usuário) — RLS de ai_credit_events
//     (policy ai_credit_events_member_select) filtra automaticamente.
//   · Se a tabela não existir (migration pendente), retorna [] sem crash.
//
// Contrato:
//   · limit opcional (default 50, max 200).
//   · Retorna ordenado por created_at DESC.
// ──────────────────────────────────────────────────────────────────────────────

export type AICreditHistoryRow = {
  id:          string
  kind:        string        // 'grant' | 'purchase' | 'consume' | outros
  origin:      string        // 'granted' | 'purchased' | 'consumption'
  amount:      number        // positivo em grant/purchase, negativo em consume
  reason:      string | null
  created_at:  string
  expires_at:  string | null
}

export type HistoryResult =
  | { success: true;  events: AICreditHistoryRow[] }
  | { success: false; message: string }

export async function getMyAICreditHistory(limit: number = 50): Promise<HistoryResult> {
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) {
    return { success: false, message: 'Não autenticado.' }
  }
  const workspaceId = await getWorkspaceId(userData.user.id)
  if (!workspaceId) {
    return { success: false, message: 'Workspace não encontrado.' }
  }

  const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 200)

  try {
    const { data, error } = await supabase
      .from('ai_credit_events')
      .select('id, kind, origin, amount, reason, created_at, expires_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(safeLimit)

    if (error) {
      // Tabela ainda não existe (migration pendente) — degrada silencioso.
      return { success: true, events: [] }
    }

    const events: AICreditHistoryRow[] = (data ?? []).map(r => ({
      id:         r.id,
      kind:       r.kind,
      origin:     r.origin,
      amount:     r.amount,
      reason:     r.reason ?? null,
      created_at: r.created_at,
      expires_at: r.expires_at ?? null,
    }))

    return { success: true, events }
  } catch {
    // Rede / RLS / parse — fallback silencioso (UI mostra estado vazio).
    return { success: true, events: [] }
  }
}
