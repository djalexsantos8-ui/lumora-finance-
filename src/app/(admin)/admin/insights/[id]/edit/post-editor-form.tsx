'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { updatePost, deletePost } from '@/lib/insights/actions'
import { slugify } from '@/lib/insights/slugify'
import { RenderMarkdown } from '@/lib/insights/render-markdown'
import type { InsightPost, InsightPostStatus } from '@/lib/insights/types'

const CATEGORIES = ['Geral', 'Precificação', 'Vendas', 'Operação', 'Financeiro', 'Produtividade']

const STATUS_OPTIONS: { value: InsightPostStatus; label: string; hint: string }[] = [
  { value: 'draft',     label: 'Rascunho',  hint: 'Só admins veem' },
  { value: 'published', label: 'Publicado', hint: 'Visível em /insights' },
  { value: 'archived',  label: 'Arquivado', hint: 'Escondido (mantém URL)' },
]

export default function PostEditorForm({ post }: { post: InsightPost }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [title, setTitle]           = useState(post.title)
  const [slug, setSlug]             = useState(post.slug)
  const [category, setCategory]     = useState(post.category)
  const [excerpt, setExcerpt]       = useState(post.excerpt ?? '')
  const [body, setBody]             = useState(post.body_markdown)
  const [cover, setCover]           = useState(post.cover_image_url ?? '')
  const [status, setStatus]         = useState<InsightPostStatus>(post.status)
  const [preview, setPreview]       = useState(false)
  const [slugTouched, setSlugTouched] = useState(true)
  const [message, setMessage]       = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  function handleTitleChange(v: string) {
    setTitle(v)
    if (!slugTouched) setSlug(slugify(v))
  }

  function handleSave(nextStatus?: InsightPostStatus) {
    setMessage(null)
    const payload = {
      title:           title.trim() || 'Sem título',
      slug:            slugify(slug || title),
      category:        category.trim() || 'Geral',
      excerpt:         excerpt.trim() || null,
      body_markdown:   body,
      cover_image_url: cover.trim() || null,
      status:          nextStatus ?? status,
    }
    startTransition(async () => {
      const res = await updatePost(post.id, payload)
      if (res.ok) {
        setStatus(payload.status)
        setMessage({ kind: 'ok', text: 'Salvo.' })
        router.refresh()
      } else {
        setMessage({ kind: 'err', text: res.error })
      }
    })
  }

  function handleDelete() {
    if (!confirm('Apagar este post? Essa ação não pode ser desfeita.')) return
    startTransition(async () => {
      const res = await deletePost(post.id)
      if (res.ok) router.push('/admin/insights')
      else setMessage({ kind: 'err', text: res.error ?? 'Falha ao apagar.' })
    })
  }

  const publicUrl = status === 'published' ? `/insights/${slugify(slug)}` : null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <Link href="/admin/insights" className="text-xs text-[#737373] hover:text-white">← Voltar</Link>
          <h1 className="text-xl font-bold text-white mt-1">{title || 'Sem título'}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPreview(p => !p)}
            className="text-xs font-medium text-[#a3a3a3] hover:text-white border border-[#2a2a2a] hover:border-[#3a3a3a] px-3 py-2 rounded-lg"
          >
            {preview ? '← Editar' : 'Preview →'}
          </button>
          {publicUrl && (
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-[#a3a3a3] hover:text-white border border-[#2a2a2a] hover:border-[#3a3a3a] px-3 py-2 rounded-lg"
            >
              Abrir no site ↗
            </a>
          )}
          <button
            type="button"
            onClick={() => handleSave()}
            disabled={pending}
            className="text-xs font-semibold bg-[#1f1f1f] hover:bg-[#2a2a2a] text-white border border-[#2a2a2a] px-4 py-2 rounded-lg disabled:opacity-50"
          >
            Salvar
          </button>
          {status !== 'published' ? (
            <button
              type="button"
              onClick={() => handleSave('published')}
              disabled={pending}
              className="text-xs font-semibold bg-[#D4A853] hover:bg-[#E8C47A] text-[#0a0a0a] px-4 py-2 rounded-lg disabled:opacity-50"
            >
              Publicar
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleSave('draft')}
              disabled={pending}
              className="text-xs font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 px-4 py-2 rounded-lg disabled:opacity-50"
            >
              Despublicar
            </button>
          )}
        </div>
      </div>

      {message && (
        <div className={`rounded-lg px-4 py-2.5 text-sm border ${
          message.kind === 'ok'
            ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
            : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
        }`}>
          {message.text}
        </div>
      )}

      {preview ? (
        <div className="rounded-xl border border-[#1f1f1f] bg-[#0d0d0d] p-8">
          {cover && (
            <img
              src={cover}
              alt=""
              className="w-full h-56 object-cover rounded-lg mb-6 border border-[#2a2a2a]"
            />
          )}
          <div className="text-xs uppercase tracking-widest text-[#D4A853] mb-2">{category}</div>
          <h1 className="text-3xl font-bold text-white mb-2">{title || 'Sem título'}</h1>
          {excerpt && <p className="text-[#a3a3a3] mb-6">{excerpt}</p>}
          <RenderMarkdown>{body}</RenderMarkdown>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Corpo principal */}
          <div className="lg:col-span-2 space-y-4">
            <Field label="Título">
              <input
                value={title}
                onChange={e => handleTitleChange(e.target.value)}
                className="w-full bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#D4A853]"
              />
            </Field>

            <Field label="Resumo (excerpt)" hint="Aparece no card em /insights. 1–2 linhas.">
              <textarea
                value={excerpt}
                onChange={e => setExcerpt(e.target.value)}
                rows={2}
                className="w-full bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#D4A853] resize-none"
              />
            </Field>

            <Field
              label="Corpo (Markdown)"
              hint="Suporta # cabeçalhos, **negrito**, *itálico*, [links](url), listas com - e blocos > citação."
            >
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                rows={22}
                className="w-full bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-4 py-3 text-white text-sm font-mono focus:outline-none focus:border-[#D4A853]"
                spellCheck={false}
              />
            </Field>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <div className="rounded-xl border border-[#1f1f1f] bg-[#0d0d0d] p-4 space-y-4">
              <Field label="Status">
                <div className="space-y-1.5">
                  {STATUS_OPTIONS.map(opt => (
                    <label
                      key={opt.value}
                      className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                        status === opt.value
                          ? 'border-[#D4A853]/50 bg-[#D4A853]/5'
                          : 'border-[#2a2a2a] hover:border-[#3a3a3a]'
                      }`}
                    >
                      <input
                        type="radio"
                        name="status"
                        checked={status === opt.value}
                        onChange={() => setStatus(opt.value)}
                        className="mt-0.5 accent-[#D4A853]"
                      />
                      <div>
                        <div className="text-sm font-medium text-white">{opt.label}</div>
                        <div className="text-[11px] text-[#737373]">{opt.hint}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </Field>

              <Field label="Categoria">
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#D4A853]"
                >
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>

              <Field label="Slug (URL)" hint="/insights/<slug>">
                <input
                  value={slug}
                  onChange={e => { setSlugTouched(true); setSlug(e.target.value) }}
                  onBlur={e => setSlug(slugify(e.target.value))}
                  className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-[#D4A853]"
                />
              </Field>

              <Field label="Imagem de capa (URL)" hint="Opcional. Hotlink ou Supabase Storage.">
                <input
                  value={cover}
                  onChange={e => setCover(e.target.value)}
                  placeholder="https://..."
                  className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#D4A853]"
                />
              </Field>
            </div>

            <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
              <h3 className="text-sm font-semibold text-rose-300 mb-1">Danger zone</h3>
              <p className="text-[11px] text-rose-200/70 mb-3">Apagar é irreversível — RLS hard delete.</p>
              <button
                type="button"
                onClick={handleDelete}
                disabled={pending}
                className="text-xs font-semibold text-rose-200 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 px-3 py-2 rounded-lg disabled:opacity-50"
              >
                Apagar post
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[#a3a3a3] mb-1.5">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-[#525252]">{hint}</p>}
    </div>
  )
}
