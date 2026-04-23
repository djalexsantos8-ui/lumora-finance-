'use server'

/**
 * src/lib/ai/admin-actions.ts
 *
 * Server actions do painel admin para gerenciar créditos de IA (Deploy H).
 *
 * Todas as actions:
 *   · Verificam admin via checkAdmin() (dupla defesa além da RPC).
 *   · Usam createAdminClient (service-role) pra bypassar RLS de leitura
 *     e conseguir cruzar workspaces × profiles × eventos.
 *
 * Contrato:
 *   · grantAICreditsAction({ email, workspaceId?, amount, reason, expiresAt })
 *       → success: true, eventId | success: false, message
 *   · listAICreditGrants({ limit })
 *       → { grants: [ { id, email, workspace_id, amount, reason, created_at } ] }
 *   · getAICreditAdminKpis()
 *       → { granted_lifetime, purchased_lifetime, consumed_this_month, active_workspaces }
 */

import { revalidatePath } from 'next/cache'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { checkAdmin } from '@/lib/auth/is-admin'

export type GrantInput = {
  email:       string        // busca workspace pelo email do owner
  amount:      number        // inteiro positivo
  reason?:     string
  expiresAt?:  string | null // ISO
}

export type GrantResult =
  | { success: true;  eventId: string; workspaceId: string; email: string }
  | { success: false; message: string }

export async function grantAICreditsAction(input: GrantInput): Promise<GrantResult> {
  // ─── Auth ─────────────────────────────────────────────────────────────────
  const adminCheck = await checkAdmin()
  if (!adminCheck.isAdmin) {
    return { success: false, message: 'Acesso negado.' }
  }

  // ─── Validação de entrada ─────────────────────────────────────────────────
  const emailRaw = (input.email ?? '').trim().toLowerCase()
  if (!emailRaw || !emailRaw.includes('@')) {
    return { success: false, message: 'Email inválido.' }
  }
  const amount = Math.floor(Number(input.amount))
  if (!Number.isFinite(amount) || amount <= 0) {
    return { success: false, message: 'Quantidade deve ser um inteiro positivo.' }
  }
  if (amount > 100000) {
    return { success: false, message: 'Quantidade excessiva — limite de segurança é 100.000 créditos por grant.' }
  }
  const reason = (input.reason ?? '').trim().slice(0, 280) || null
  const expiresAt = input.expiresAt ?? null

  // ─── Descobrir o workspace do usuário pelo email ──────────────────────────
  const admin = createAdminClient()

  const { data: profile, error: pErr } = await admin
    .from('profiles')
    .select('id, email, full_name')
    .eq('email', emailRaw)
    .maybeSingle()

  if (pErr) {
    return { success: false, message: `Erro ao buscar usuário: ${pErr.message}` }
  }
  if (!profile) {
    return { success: false, message: `Usuário não encontrado: ${emailRaw}` }
  }

  // workspace do usuário (owner preferred; fallback: 1º ativo)
  const { data: membership, error: wmErr } = await admin
    .from('workspace_members')
    .select('workspace_id, role, status')
    .eq('user_id', profile.id)
    .eq('status', 'active')
    .order('role', { ascending: true })   // 'owner' vem antes alfabeticamente
    .limit(1)
    .maybeSingle()

  if (wmErr) {
    return { success: false, message: `Erro ao buscar workspace: ${wmErr.message}` }
  }
  if (!membership) {
    return { success: false, message: 'Usuário não tem workspace ativo.' }
  }

  // ─── Chamar a RPC grant_ai_credits ────────────────────────────────────────
  // A RPC já valida is_current_user_admin internamente.
  // Precisamos de um client autenticado como admin (sessão do user). Usamos
  // createClient() normal — o auth.uid() dentro da RPC será o admin logado.
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('grant_ai_credits', {
    p_workspace_id: membership.workspace_id,
    p_amount:       amount,
    p_reason:       reason,
    p_expires_at:   expiresAt,
  })

  if (error) {
    return { success: false, message: `Erro ao conceder créditos: ${error.message}` }
  }

  const eventId = (data as { id?: string } | null)?.id ?? ''

  // Invalida caches das páginas admin
  revalidatePath('/admin/ai-credits')
  revalidatePath('/admin')

  return {
    success:     true,
    eventId,
    workspaceId: membership.workspace_id,
    email:       emailRaw,
  }
}

// ──────────────────────────────────────────────────────────────────────────────

export type GrantRow = {
  id:           string
  workspace_id: string
  email:        string | null
  full_name:    string | null
  amount:       number
  reason:       string | null
  expires_at:   string | null
  created_at:   string
  created_by:   string | null
}

export async function listAICreditGrants(limit: number = 50): Promise<{ grants: GrantRow[] }> {
  const adminCheck = await checkAdmin()
  if (!adminCheck.isAdmin) return { grants: [] }

  const admin = createAdminClient()

  // Tentar ler da tabela; se não existir ainda, retorna vazio
  try {
    const { data: events } = await admin
      .from('ai_credit_events')
      .select('id, workspace_id, kind, origin, amount, reason, expires_at, created_at, created_by')
      .eq('kind', 'grant')
      .eq('origin', 'granted')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (!events || events.length === 0) return { grants: [] }

    // Cruzar workspace_id → owner email
    const workspaceIds = Array.from(new Set(events.map(e => e.workspace_id).filter(Boolean)))
    const { data: memberships } = workspaceIds.length
      ? await admin
          .from('workspace_members')
          .select('workspace_id, user_id, role')
          .in('workspace_id', workspaceIds)
          .eq('role', 'owner')
      : { data: [] }

    const ownerUserIds = Array.from(new Set((memberships ?? []).map(m => m.user_id).filter(Boolean)))
    const { data: profiles } = ownerUserIds.length
      ? await admin
          .from('profiles')
          .select('id, email, full_name')
          .in('id', ownerUserIds)
      : { data: [] }

    const ownerByWs = new Map<string, { email: string | null; full_name: string | null }>()
    for (const m of memberships ?? []) {
      const profile = (profiles ?? []).find(p => p.id === m.user_id)
      if (profile) {
        ownerByWs.set(m.workspace_id, {
          email:     profile.email ?? null,
          full_name: profile.full_name ?? null,
        })
      }
    }

    const grants: GrantRow[] = events.map(e => {
      const owner = ownerByWs.get(e.workspace_id) ?? { email: null, full_name: null }
      return {
        id:           e.id,
        workspace_id: e.workspace_id,
        email:        owner.email,
        full_name:    owner.full_name,
        amount:       e.amount,
        reason:       e.reason ?? null,
        expires_at:   e.expires_at ?? null,
        created_at:   e.created_at,
        created_by:   e.created_by ?? null,
      }
    })

    return { grants }
  } catch {
    return { grants: [] }
  }
}

// ──────────────────────────────────────────────────────────────────────────────

export type AICreditAdminKpis = {
  granted_lifetime:     number  // total de créditos concedidos manualmente (histórico)
  granted_active:       number  // saldo ativo de grants (não consumido, não expirado)
  purchased_lifetime:   number
  purchased_active:     number
  consumed_this_month:  number  // pelo ledger
  included_used_month:  number  // agregado de workspace_ai_usage no período
  included_limit_month: number
  active_workspaces:    number  // com qualquer evento neste mês OU uso incluído
}

export async function getAICreditAdminKpis(): Promise<AICreditAdminKpis> {
  const adminCheck = await checkAdmin()
  const empty: AICreditAdminKpis = {
    granted_lifetime:     0,
    granted_active:       0,
    purchased_lifetime:   0,
    purchased_active:     0,
    consumed_this_month:  0,
    included_used_month:  0,
    included_limit_month: 0,
    active_workspaces:    0,
  }
  if (!adminCheck.isAdmin) return empty

  const admin = createAdminClient()
  const now = new Date()
  const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()

  // ─── ledger (gracefully degrade if table missing) ──────────────────────
  let grantedLifetime = 0
  let grantedActive   = 0
  let purchasedLife   = 0
  let purchasedActive = 0
  let consumedMonth   = 0
  let wsActiveLedger  = new Set<string>()

  try {
    const { data: events } = await admin
      .from('ai_credit_events')
      .select('workspace_id, kind, origin, amount, expires_at, created_at')

    if (events) {
      const nowMs = Date.now()
      for (const e of events) {
        if (e.workspace_id) wsActiveLedger.add(e.workspace_id)
        if (e.kind === 'grant' && e.origin === 'granted') {
          grantedLifetime += e.amount
          const expired = e.expires_at && new Date(e.expires_at).getTime() <= nowMs
          if (!expired) grantedActive += e.amount
        }
        if (e.kind === 'purchase' && e.origin === 'purchased') {
          purchasedLife += e.amount
          const expired = e.expires_at && new Date(e.expires_at).getTime() <= nowMs
          if (!expired) purchasedActive += e.amount
        }
        if (e.kind === 'consume' && e.origin === 'consumption') {
          if (e.created_at && e.created_at >= monthStart) {
            consumedMonth += Math.abs(e.amount)
          }
        }
        // 'consume' events subtract from granted/purchased_active
        if (e.kind === 'consume' && e.origin === 'consumption') {
          // Can't easily attribute to granted vs purchased without the original row.
          // The "active" values above are based on amounts of grants/purchases,
          // which are NET when consume events have origin=consumption (-1 each).
          // So we subtract: each consume reduces either granted_active or
          // purchased_active. Without precise attribution we leave it as
          // gross-in, but let's subtract consumes from whichever is larger.
          const nowCheck = e.expires_at && new Date(e.expires_at).getTime() <= nowMs
          if (!nowCheck) {
            if (grantedActive >= 1)       grantedActive   += e.amount // amount is neg
            else if (purchasedActive >= 1) purchasedActive += e.amount
          }
        }
      }
    }
  } catch {
    /* table ainda não existe */
  }

  // ─── workspace_ai_usage agregado (já existente) ────────────────────────
  let includedUsed  = 0
  let includedLimit = 0
  const wsIncluded = new Set<string>()
  try {
    const { data: usage } = await admin
      .from('workspace_ai_usage')
      .select('workspace_id, used_count, monthly_limit, period')
      .eq('period', period)
    if (usage) {
      for (const u of usage) {
        includedUsed  += u.used_count ?? 0
        includedLimit += u.monthly_limit ?? 100
        if (u.workspace_id) wsIncluded.add(u.workspace_id)
      }
    }
  } catch {
    /* fallback */
  }

  const allActive = new Set([...wsActiveLedger, ...wsIncluded])

  return {
    granted_lifetime:     Math.max(0, grantedLifetime),
    granted_active:       Math.max(0, grantedActive),
    purchased_lifetime:   Math.max(0, purchasedLife),
    purchased_active:     Math.max(0, purchasedActive),
    consumed_this_month:  consumedMonth,
    included_used_month:  includedUsed,
    included_limit_month: includedLimit,
    active_workspaces:    allActive.size,
  }
}
