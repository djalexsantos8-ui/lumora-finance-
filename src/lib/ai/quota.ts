/**
 * src/lib/ai/quota.ts
 *
 * Controle de quota mensal de IA por workspace.
 *
 * Modelo:
 *   · Tabela `workspace_ai_usage (workspace_id, period YYYY-MM, used_count,
 *     monthly_limit)` — PK composta. Reset automático por mês (linha nova).
 *   · RPC `increment_ai_usage(workspace_id, period)` atômica — retorna NULL
 *     se estourou o limite, caso contrário retorna a linha atualizada.
 *
 * Contrato desta camada:
 *   · getCurrentPeriod()  → string YYYY-MM (derivada de new Date())
 *   · getAIQuota(ws)      → { used, limit, remaining, period } (0 se nunca usou)
 *   · consumeAICredit(ws) → { ok: true, quota } | { ok: false, reason, quota }
 *
 * Handlers de UI decidem: se consumeAICredit retornar ok=false, mostrar
 * CTA "Comprar créditos" e NÃO chamar OpenAI.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type AIQuota = {
  period:    string
  used:      number
  limit:     number
  remaining: number
}

/**
 * AIBalance — breakdown por origem de crédito (Deploy H 2026-04-23).
 *
 * Composição do saldo de IA do workspace em um período:
 *   · included  — plano mensal (workspace_ai_usage). Reseta todo mês.
 *   · granted   — cortesia do admin (ai_credit_events, origin=granted).
 *                 Não reseta. Pode ter expires_at (null = perpétuo).
 *   · purchased — comprado via Stripe (origin=purchased). Não reseta.
 *
 * Ordem de consumo: granted → purchased → included (favorece o usuário).
 *
 * Fallback: se migração do ledger (20260423010000_ai_credit_ledger.sql) ainda
 * não rodou, getAIBalance retorna 0 em granted/purchased e usa o quota
 * antigo para os incluídos.
 */
export type AIBalance = {
  period:             string
  granted:            number
  purchased:          number
  included_used:      number
  included_limit:     number
  included_remaining: number
  total_remaining:    number
}

export type ConsumeResult =
  | { ok: true;  quota: AIQuota }
  | { ok: false; reason: 'limit_exceeded' | 'unknown'; quota: AIQuota | null }

export function getCurrentPeriod(now: Date = new Date()): string {
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

/**
 * getAIQuota — busca o estado atual da quota do workspace no mês vigente.
 * Se a linha não existir (nunca usou), retorna used=0/limit=100 (default).
 *
 * HOTFIX 2026-04-22 21:00 (pós-hang Deploy E/F em prod):
 *   Envolvido em Promise.race com timeout de 1.5s. Se a query demorar
 *   mais que isso (prod estava pendurando indefinidamente em
 *   workspace_ai_usage, possivelmente RLS + PostgREST + edge),
 *   retorna fallback padrão (used=0/limit=100). UI não trava.
 */
export async function getAIQuota(
  supabase: SupabaseClient,
  workspaceId: string,
  period: string = getCurrentPeriod()
): Promise<AIQuota> {
  const defaults: AIQuota = {
    period,
    used:      0,
    limit:     100,
    remaining: 100,
  }

  const query: Promise<AIQuota> = (async () => {
    try {
      const { data } = await supabase
        .from('workspace_ai_usage')
        .select('used_count, monthly_limit')
        .eq('workspace_id', workspaceId)
        .eq('period', period)
        .maybeSingle()
      const used  = data?.used_count    ?? 0
      const limit = data?.monthly_limit ?? 100
      return {
        period,
        used,
        limit,
        remaining: Math.max(0, limit - used),
      }
    } catch {
      return defaults
    }
  })()

  // Timeout curto pra não travar SSR caso a query pendure.
  const timeout = new Promise<AIQuota>(resolve =>
    setTimeout(() => resolve(defaults), 1500)
  )

  return Promise.race([query, timeout])
}

/**
 * getAIBalance — breakdown completo de créditos (included + granted + purchased).
 *
 * Usa a RPC `get_ai_balance` (Deploy H). Se ela não existir ainda (migration
 * não aplicada), cai de volta em getAIQuota() — retornando granted/purchased=0.
 * Isso garante que a UI não quebre antes da migration rodar em prod.
 */
export async function getAIBalance(
  supabase: SupabaseClient,
  workspaceId: string,
  period: string = getCurrentPeriod()
): Promise<AIBalance> {
  try {
    const { data, error } = await supabase.rpc('get_ai_balance', {
      p_workspace_id: workspaceId,
      p_period:       period,
    })

    if (!error && data && typeof data === 'object') {
      const b = data as {
        granted?:            number
        purchased?:          number
        included_used?:      number
        included_limit?:     number
        included_remaining?: number
        total_remaining?:    number
      }
      const granted   = Number(b.granted ?? 0)
      const purchased = Number(b.purchased ?? 0)
      const iUsed     = Number(b.included_used ?? 0)
      const iLimit    = Number(b.included_limit ?? 100)
      const iRem      = Number(b.included_remaining ?? Math.max(0, iLimit - iUsed))
      const total     = Number(b.total_remaining ?? (granted + purchased + iRem))
      return {
        period,
        granted,
        purchased,
        included_used:      iUsed,
        included_limit:     iLimit,
        included_remaining: iRem,
        total_remaining:    total,
      }
    }
  } catch {
    // RPC ainda não existe — cai no fallback
  }

  // ── Fallback (pré-migration) ───────────────────────────────────────────────
  const quota = await getAIQuota(supabase, workspaceId, period)
  return {
    period,
    granted:            0,
    purchased:          0,
    included_used:      quota.used,
    included_limit:     quota.limit,
    included_remaining: quota.remaining,
    total_remaining:    quota.remaining,
  }
}

/**
 * consumeAICredit — tenta consumir 1 crédito atomicamente via RPC.
 *
 * Deploy H (2026-04-23): tenta consume_ai_credit_v2 primeiro (usa ledger —
 * granted → purchased → included). Se a RPC v2 não existir (migration pendente),
 * faz fallback para increment_ai_usage (só incluídos).
 *
 * Retorna ok=false se TODAS as origens estão esgotadas.
 */
export async function consumeAICredit(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<ConsumeResult> {
  const period = getCurrentPeriod()

  // ── tentativa 1: ledger v2 ──────────────────────────────────────────────
  try {
    const { data: v2Data, error: v2Err } = await supabase.rpc(
      'consume_ai_credit_v2',
      { p_workspace_id: workspaceId, p_period: period }
    )
    if (!v2Err) {
      if (v2Data === null) {
        // Tudo esgotado
        const quota = await getAIQuota(supabase, workspaceId, period)
        return { ok: false, reason: 'limit_exceeded', quota }
      }
      // v2Data é jsonb { consumed_from, granted_remaining, purchased_remaining,
      //                 included_used, included_limit }
      const b = v2Data as {
        consumed_from?:       string
        granted_remaining?:   number
        purchased_remaining?: number
        included_used?:       number
        included_limit?:      number
      }
      const iUsed  = Number(b.included_used  ?? 0)
      const iLimit = Number(b.included_limit ?? 100)
      const gRem   = Number(b.granted_remaining ?? 0)
      const pRem   = Number(b.purchased_remaining ?? 0)
      const totalRemaining =
        gRem + pRem + Math.max(0, iLimit - iUsed)

      return {
        ok: true,
        quota: {
          period,
          // Mantemos o shape de AIQuota pra UI antiga (limit/used/remaining).
          // A UI nova (Deploy H) consome getAIBalance pra ver breakdown.
          used:      iUsed,
          limit:     iLimit,
          remaining: totalRemaining,
        },
      }
    }
    // v2Err !== null — cai no legacy
  } catch {
    // RPC v2 indisponível — cai no legacy
  }

  // ── tentativa 2 (legacy, pré-migration): increment_ai_usage ────────────
  const { data, error } = await supabase.rpc('increment_ai_usage', {
    p_workspace_id: workspaceId,
    p_period:       period,
  })

  // RPC retorna NULL quando limite estourou.
  if (error) {
    console.error('[ai/quota] rpc error', error)
    // Fallback: busca o estado atual pra mostrar ao usuário.
    const quota = await getAIQuota(supabase, workspaceId, period).catch(() => null)
    return { ok: false, reason: 'unknown', quota }
  }

  if (!data) {
    // Limite estourado: busca a linha pra mostrar o quanto ainda falta (0).
    const quota = await getAIQuota(supabase, workspaceId, period)
    return { ok: false, reason: 'limit_exceeded', quota }
  }

  // RPC pode retornar row ou array de 1 row dependendo do driver.
  const row = Array.isArray(data) ? data[0] : data as {
    used_count?:    number
    monthly_limit?: number
  }
  const used  = row?.used_count    ?? 0
  const limit = row?.monthly_limit ?? 100

  return {
    ok: true,
    quota: {
      period,
      used,
      limit,
      remaining: Math.max(0, limit - used),
    },
  }
}
