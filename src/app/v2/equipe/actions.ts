'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

/**
 * EPIC-38 — Server actions de gestão de equipe.
 *
 * Owner pode convidar, revogar invites, remover membros. Limite por
 * workspace (workspaces.max_users) bloqueia convite além da capacidade
 * — UI mostra paywall direcionado pra Enterprise quando estourar.
 */

export type ActionResult<T = unknown> =
  | { ok: true; data?: T }
  | { ok: false; error: string; requireUpgrade?: boolean; seatsUsed?: number; seatsLimit?: number }

interface InviteInput {
  email:    string
  role?:    'member' | 'admin' | 'editor' | 'viewer'
  message?: string | null
}

export async function createInvite(input: InviteInput): Promise<ActionResult<{ id: string; token: string }>> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { ok: false, error: 'unauthorized' }

  // Resolve workspace ativo + role do user
  const { data: member } = await sb
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()
  if (!member) return { ok: false, error: 'no_workspace' }
  if (member.role !== 'owner') return { ok: false, error: 'only_owner_can_invite' }

  const email = input.email.trim().toLowerCase()
  if (!email || !email.includes('@')) return { ok: false, error: 'invalid_email' }

  // Email já é membro?
  const { data: existingMember } = await sb
    .from('workspace_members')
    .select('user_id, status')
    .eq('workspace_id', member.workspace_id)
    .eq('email', email)
    .maybeSingle()
  if (existingMember && existingMember.status === 'active') {
    return { ok: false, error: 'already_member' }
  }

  // Check seats
  const [{ data: seatsUsed }, { data: seatsLimit }] = await Promise.all([
    sb.rpc('workspace_seats_used',  { p_workspace_id: member.workspace_id }),
    sb.rpc('workspace_seats_limit', { p_workspace_id: member.workspace_id }),
  ])
  const used  = Number(seatsUsed ?? 0)
  const limit = Number(seatsLimit ?? 1)
  if (used >= limit) {
    return { ok: false, error: 'seat_limit_reached', requireUpgrade: true, seatsUsed: used, seatsLimit: limit }
  }

  // Cria invite (unique constraint workspace_id+email evita duplicado pendente)
  const { data, error } = await sb
    .from('workspace_invites_v2')
    .insert({
      workspace_id: member.workspace_id,
      email,
      role:         input.role ?? 'member',
      invited_by:   user.id,
      message:      input.message ?? null,
    })
    .select('id, token')
    .single()

  if (error) {
    if (error.code === '23505') return { ok: false, error: 'invite_already_exists' }
    return { ok: false, error: error.message }
  }

  revalidatePath('/v2/equipe')
  return { ok: true, data: { id: data.id, token: data.token } }
}

export async function revokeInvite(inviteId: string): Promise<ActionResult> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { ok: false, error: 'unauthorized' }

  const { error } = await sb
    .from('workspace_invites_v2')
    .update({ revoked_at: new Date().toISOString(), revoked_by: user.id })
    .eq('id', inviteId)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/v2/equipe')
  return { ok: true }
}

export async function removeMember(memberUserId: string): Promise<ActionResult> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { ok: false, error: 'unauthorized' }

  // Resolve workspace ativo + role do user
  const { data: requester } = await sb
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()
  if (!requester) return { ok: false, error: 'no_workspace' }
  if (requester.role !== 'owner') return { ok: false, error: 'only_owner_can_remove' }

  // Não pode remover outro owner (e não pode remover a si mesmo via essa action)
  if (memberUserId === user.id) return { ok: false, error: 'cannot_remove_self' }

  const { data: target } = await sb
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', requester.workspace_id)
    .eq('user_id', memberUserId)
    .maybeSingle()
  if (!target) return { ok: false, error: 'member_not_found' }
  if (target.role === 'owner') return { ok: false, error: 'cannot_remove_owner' }

  const { error } = await sb
    .from('workspace_members')
    .delete()
    .eq('workspace_id', requester.workspace_id)
    .eq('user_id', memberUserId)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/v2/equipe')
  return { ok: true }
}

export async function getInviteLink(token: string): Promise<string> {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://lumorafinance.com.br'
  return `${base}/aceitar-convite/${token}`
}
