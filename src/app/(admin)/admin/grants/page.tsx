import { createAdminClient } from '@/lib/supabase/server'
import { checkAdmin } from '@/lib/auth/is-admin'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

async function loadGrants() {
  const supabase = createAdminClient()

  const { data: grants, error } = await supabase
    .from('admin_grants')
    .select('id, email, user_id, grant_type, expires_at, notes, created_at, created_by_admin')
    .order('created_at', { ascending: false })

  if (error) return { rows: [], error: error.message }

  // Enrich com email real do profile quando user_id existe
  const userIds = (grants ?? []).map(g => g.user_id).filter(Boolean) as string[]
  const profilesRes = userIds.length
    ? await supabase.from('profiles').select('id, full_name, email').in('id', userIds)
    : { data: [], error: null }

  const byId = new Map((profilesRes.data ?? []).map(p => [p.id, p]))
  const now = Date.now()

  return {
    rows: (grants ?? []).map(g => {
      const profile = g.user_id ? byId.get(g.user_id) : null
      const expired = g.expires_at ? new Date(g.expires_at).getTime() < now : false
      return {
        ...g,
        profileName:  profile?.full_name ?? null,
        profileEmail: profile?.email ?? null,
        isExpired:    expired,
      }
    }),
    error: null as string | null,
  }
}

export default async function AdminGrantsPage() {
  const check = await checkAdmin()
  if (!check.isAdmin) redirect('/dashboard')

  const { rows, error } = await loadGrants()

  const active  = rows.filter(r => !r.isExpired).length
  const expired = rows.length - active

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] uppercase tracking-wider text-[#D4A853] font-semibold mb-1">
          Grants de acesso
        </p>
        <h1 className="text-2xl font-bold">Overrides manuais</h1>
        <p className="text-sm text-[#737373] mt-1">
          {active} ativo{active === 1 ? '' : 's'} · {expired} expirado{expired === 1 ? '' : 's'} ·
          usados pelo middleware para liberar acesso sem subscription.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
          Erro ao carregar: {error}
        </div>
      )}

      <div className="rounded-lg border border-[#1a1a1a] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#111] text-[10px] uppercase tracking-wider text-[#737373]">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium">Email</th>
              <th className="text-left px-4 py-2.5 font-medium">Profile</th>
              <th className="text-left px-4 py-2.5 font-medium">Tipo</th>
              <th className="text-left px-4 py-2.5 font-medium">Expira</th>
              <th className="text-left px-4 py-2.5 font-medium">Notas</th>
              <th className="text-right px-4 py-2.5 font-medium">Criado</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !error && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-[#525252] text-sm">
                  Nenhum grant criado.
                </td>
              </tr>
            )}
            {rows.map(g => (
              <tr key={g.id} className={`border-t border-[#1a1a1a] hover:bg-[#0d0d0d] ${g.isExpired ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3 text-xs">{g.email}</td>
                <td className="px-4 py-3 text-xs">
                  {g.profileName ? (
                    <>
                      <div>{g.profileName}</div>
                      <div className="text-[10px] text-[#737373]">{g.profileEmail}</div>
                    </>
                  ) : (
                    <span className="text-[#525252]">sem profile vinculado</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="text-[10px] uppercase tracking-wider bg-[#D4A853]/10 text-[#D4A853] px-2 py-0.5 rounded">
                    {g.grant_type}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs">
                  {g.expires_at ? (
                    <span className={g.isExpired ? 'text-red-400' : 'text-[#a3a3a3]'}>
                      {new Date(g.expires_at).toLocaleDateString('pt-BR')}
                      {g.isExpired && ' (expirado)'}
                    </span>
                  ) : (
                    <span className="text-emerald-400">Permanente</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-[#a3a3a3] max-w-xs truncate" title={g.notes ?? ''}>
                  {g.notes ?? <span className="text-[#525252]">—</span>}
                </td>
                <td className="px-4 py-3 text-right text-xs text-[#737373]">
                  {new Date(g.created_at).toLocaleDateString('pt-BR')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-amber-200">
        <strong className="block mb-1">Como criar um grant (manual, por enquanto):</strong>
        <code className="block text-[11px] font-mono bg-black/40 rounded p-2 mt-1 overflow-x-auto">
          insert into admin_grants (email, user_id, grant_type, expires_at, notes, created_by_admin)<br />
          values (&apos;user@ex.com&apos;, &apos;&lt;uuid&gt;&apos;, &apos;partner&apos;, null, &apos;Notas…&apos;, &apos;admin-manual&apos;);
        </code>
        <p className="mt-2">
          Tipos disponíveis: <code>free</code>, <code>trial</code>, <code>partner</code>.
          Deixe <code>expires_at</code> como <code>null</code> para grant permanente.
        </p>
      </div>
    </div>
  )
}
