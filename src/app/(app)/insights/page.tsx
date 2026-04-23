import Link from 'next/link'
import { listPublishedPosts } from '@/lib/insights/actions'
import type { InsightPost } from '@/lib/insights/types'

export const metadata = { title: 'Insights — Lumora Finance' }
export const dynamic = 'force-dynamic'

const GRADIENT_POOL = [
  'from-[#D4A853]/20 to-[#1c1c1c]',
  'from-amber-900/20 to-[#1c1c1c]',
  'from-blue-900/20 to-[#1c1c1c]',
  'from-rose-900/20 to-[#1c1c1c]',
  'from-emerald-900/20 to-[#1c1c1c]',
  'from-purple-900/20 to-[#1c1c1c]',
]

function pickGradient(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return GRADIENT_POOL[h % GRADIENT_POOL.length]
}

export default async function InsightsPage() {
  const posts = await listPublishedPosts()

  const categories = ['Todos', ...Array.from(new Set(posts.map(p => p.category)))]
  const featured = posts[0]
  const grid = posts.slice(1)

  return (
    <div className="min-h-full p-6 md:p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium text-[#D4A853] uppercase tracking-widest">
            Exclusivo Lumora
          </span>
        </div>
        <h1 className="text-2xl font-bold text-white">Insights</h1>
        <p className="text-[#a3a3a3] text-sm mt-1">
          Artigos e guias para crescer sua operação de fotografia e audiovisual.
        </p>
      </div>

      {/* Empty state */}
      {posts.length === 0 && (
        <div className="rounded-2xl border border-dashed border-[#2a2a2a] bg-[#0d0d0d] p-10 text-center">
          <div className="text-4xl mb-3">📝</div>
          <h2 className="text-lg font-semibold text-white mb-1">Conteúdos a caminho</h2>
          <p className="text-sm text-[#a3a3a3] max-w-sm mx-auto">
            Estamos escrevendo os primeiros artigos sobre precificação, margem e operação.
            Volte em breve — tudo estará aqui quando publicarmos.
          </p>
        </div>
      )}

      {/* Categorias */}
      {posts.length > 0 && categories.length > 1 && (
        <div className="flex gap-2 mb-8 flex-wrap">
          {categories.map((cat) => (
            <button
              key={cat}
              className={`px-3 py-1.5 rounded-full text-sm transition-colors
                ${cat === 'Todos'
                  ? 'bg-[#D4A853]/10 text-[#D4A853] border border-[#D4A853]/20'
                  : 'bg-[#141414] text-[#a3a3a3] border border-[#2a2a2a] hover:border-[#3a3a3a] hover:text-white'
                }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Destaque */}
      {featured && <Featured post={featured} />}

      {/* Grid */}
      {grid.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {grid.map((card) => (
            <Link key={card.id} href={`/insights/${card.slug}`}>
              <div className={`
                relative rounded-xl border border-[#2a2a2a] overflow-hidden
                bg-gradient-to-b ${pickGradient(card.id)}
                hover:border-[#3a3a3a] transition-all group cursor-pointer h-full
              `}>
                {card.cover_image_url && (
                  <div className="aspect-[16/8] overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={card.cover_image_url}
                      alt=""
                      className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform"
                    />
                  </div>
                )}
                <div className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-[#D4A853] font-medium">{card.category}</span>
                  </div>
                  <h3 className="text-sm font-semibold text-white mb-2 leading-snug group-hover:text-[#E8C47A] transition-colors">
                    {card.title}
                  </h3>
                  {card.excerpt && (
                    <p className="text-xs text-[#525252] leading-relaxed">
                      {card.excerpt}
                    </p>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function Featured({ post }: { post: InsightPost }) {
  return (
    <Link href={`/insights/${post.slug}`}>
      <div className="relative rounded-2xl overflow-hidden border border-[#2a2a2a] mb-8 cursor-pointer group">
        <div className="bg-gradient-to-r from-[#D4A853]/15 via-[#141414] to-[#141414] p-8 md:p-10">
          <span className="text-xs font-medium text-[#D4A853] uppercase tracking-widest">
            Em destaque · {post.category}
          </span>
          <h2 className="text-xl md:text-2xl font-bold text-white mt-2 mb-3 max-w-lg group-hover:text-[#E8C47A] transition-colors">
            {post.title}
          </h2>
          {post.excerpt && (
            <p className="text-[#a3a3a3] text-sm max-w-md">{post.excerpt}</p>
          )}
        </div>
      </div>
    </Link>
  )
}
