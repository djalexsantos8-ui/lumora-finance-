import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPublishedPostBySlug } from '@/lib/insights/actions'
import { RenderMarkdown } from '@/lib/insights/render-markdown'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const post = await getPublishedPostBySlug(slug)
  if (!post) return { title: 'Insights — Lumora Finance' }
  return {
    title: `${post.title} — Lumora Finance`,
    description: post.excerpt ?? undefined,
  }
}

export default async function InsightDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const post = await getPublishedPostBySlug(slug)
  if (!post) notFound()

  const publishedLabel = post.published_at
    ? new Date(post.published_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    : null

  return (
    <article className="min-h-full p-6 md:p-10">
      <div className="max-w-3xl mx-auto">
        <Link
          href="/insights"
          className="inline-flex items-center gap-2 text-sm text-[#737373] hover:text-white mb-6 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
          </svg>
          Voltar para Insights
        </Link>

        {post.cover_image_url && (
          <div className="rounded-2xl overflow-hidden border border-[#2a2a2a] mb-8 aspect-[16/7]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={post.cover_image_url}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <div className="mb-8">
          <div className="text-xs font-medium text-[#D4A853] uppercase tracking-widest mb-2">
            {post.category}
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white leading-tight mb-3">
            {post.title}
          </h1>
          {post.excerpt && (
            <p className="text-lg text-[#a3a3a3] leading-relaxed">{post.excerpt}</p>
          )}
          {publishedLabel && (
            <div className="mt-4 text-xs text-[#525252] tabular-nums">Publicado em {publishedLabel}</div>
          )}
        </div>

        <RenderMarkdown>{post.body_markdown}</RenderMarkdown>
      </div>
    </article>
  )
}
