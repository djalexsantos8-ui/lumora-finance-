import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireWorkspace } from '@/lib/workspace/get-current-workspace'
import EquipeClient from './client'

export const dynamic = 'force-dynamic'

export default async function EquipePage() {
  const { workspace, userId } = await requireWorkspace()
  const supabase = await createClient()

  // Carrega membros + invites pendentes em paralelo
  const [membersRes, invitesRes, seatsUsedRes, seatsLimitRes] = await Promise.all([
    supabase
      .from('workspace_members')
      .select('id, user_id, email, role, status, invited_at, joined_at')
      .eq('workspace_id', workspace.id)
      .order('joined_at', { ascending: true, nullsFirst: false }),
    supabase
      .from('workspace_invites_v2')
      .select('id, email, role, token, invited_at, expires_at, accepted_at, revoked_at, message')
      .eq('workspace_id', workspace.id)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .order('invited_at', { ascending: false }),
    supabase.rpc('workspace_seats_used',  { p_workspace_id: workspace.id }),
    supabase.rpc('workspace_seats_limit', { p_workspace_id: workspace.id }),
  ])

  const members  = membersRes.data ?? []
  const invites  = invitesRes.data ?? []
  const seatsUsed  = Number(seatsUsedRes.data ?? 0)
  const seatsLimit = Number(seatsLimitRes.data ?? 1)

  // Role do usuário atual no workspace
  const myRole = members.find((m) => m.user_id === userId)?.role ?? 'member'
  const isOwner = myRole === 'owner'

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://lumorafinance.com.br'

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Link href="/v2" className="mb-6 inline-flex items-center gap-2 text-sm text-[#a3a3a3] hover:text-white">
        ← Voltar pro dashboard
      </Link>

      <header className="mb-6">
        <h1 className="text-2xl font-bold text-white">Equipe</h1>
        <p className="mt-1 text-sm text-[#737373]">
          Gerencie quem tem acesso ao workspace <span className="text-white">{workspace.name}</span>.
        </p>
      </header>

      {/* Indicador de vagas */}
      <div className={`mb-6 flex items-center justify-between gap-4 rounded-xl border px-4 py-3 ${
        seatsUsed >= seatsLimit
          ? 'border-amber-500/30 bg-amber-500/5'
          : 'border-[#1f1f1f] bg-[#0d0d0d]'
      }`}>
        <div>
          <div className="text-xs uppercase tracking-wider text-[#737373]">Vagas</div>
          <div className="text-lg font-semibold text-white">
            {seatsUsed} de {seatsLimit}{' '}
            <span className="text-xs font-normal text-[#737373]">utilizadas</span>
          </div>
        </div>
        {seatsUsed >= seatsLimit && isOwner && (
          <Link
            href="/upgrade?feature=multi_user&from=/v2/equipe"
            className="rounded-md border border-[#D4A853]/40 bg-[#D4A853]/10 px-4 py-2 text-xs font-semibold text-[#D4A853] hover:bg-[#D4A853]/20"
          >
            💎 Upgrade para Enterprise
          </Link>
        )}
      </div>

      <EquipeClient
        members={members}
        invites={invites}
        myUserId={userId}
        isOwner={isOwner}
        seatsUsed={seatsUsed}
        seatsLimit={seatsLimit}
        baseUrl={baseUrl}
      />
    </div>
  )
}
