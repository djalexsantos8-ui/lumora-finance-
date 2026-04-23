import Link from 'next/link'
import { listPostsForAdmin, createDraftPost } from '@/lib/insights/actions'

export const dynamic = 'force-dynamic'

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  draft:     { label: 'rascunho',   cls: 'bg-[#1f1f1f] text-[#a3a3a3] border-[#2a2a2a]' },
  published: { label: 'publicado',  cls: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' },
  archived:  { label: 'arquivado',  cls: 'bg-rose-500/10 text-rose-300 border-rose-500/30' },
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default async function AdminInsightsListPage() {
  const posts = await listPostsForAdmin()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Insights</h1>
          <p className="text-sm text-[#a3a3a3] mt-0.5">Artigos educacionais visíveis em /insights pra todos os usuários.</p>
        </div>
        <form action={createDraftPost}>
          <button
            type="submit"
            className="bg-[#D4A853] hover:bg-[#E8C47A] text-[#0a0a0a] font-semibold text-sm px-4 py-2 rounded-xl transition-colors"
          >
            + Novo insight
          </button>
        </form>
      </div>

      {posts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#2a2a2a] p-10 text-center">
          <p className="text-sm text-[#a3a3a3]">Nenhum post ainda. Clique em <span className="text-white font-medium">+ Novo insight</span> pra começar.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-[#1f1f1f] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#0d0d0d] text-[11px] uppercase tracking-wider text-[#737373]">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Título</th>
                <th className="text-left px-4 py-3 font-medium">Categoria</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Atualizado</th>
                <th className="text-left px-4 py-3 font-medium">Publicado</th>
                <th className="text-right px-4 py-3 font-medium w-px">&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              {posts.map(p => {
                const badge = STATUS_BADGE[p.status] ?? STATUS_BADGE.draft
                return (
                  <tr key={p.id} className="border-t border-[#1a1a1a] hover:bg-[#0d0d0d]/60 transition-colors">
                    <td className="px-4 py-3">
                      <div className="text-white font-medium">{p.title || '—'}</div>
                      <div className="text-xs text-[#525252] mt-0.5 font-mono">{p.slug}</div>
                    </td>
                    <td className="px-4 py-3 text-[#a3a3a3]">{p.category}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] uppercase tracking-wider ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#a3a3a3] text-xs tabular-nums">{formatDate(p.updated_at)}</td>
                    <td className="px-4 py-3 text-[#a3a3a3] text-xs tabular-nums">{formatDate(p.published_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/insights/${p.id}/edit`}
                        className="text-xs text-[#D4A853] hover:text-[#E8C47A] font-medium"
                      >
                        Editar →
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
