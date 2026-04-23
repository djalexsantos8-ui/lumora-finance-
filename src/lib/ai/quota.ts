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
 * consumeAICredit — tenta consumir 1 crédito atomicamente via RPC.
 * Retorna ok=false se o limite foi atingido (a RPC retorna NULL).
 */
export async function consumeAICredit(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<ConsumeResult> {
  const period = getCurrentPeriod()
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
