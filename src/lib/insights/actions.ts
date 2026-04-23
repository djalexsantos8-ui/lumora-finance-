'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { checkAdmin } from '@/lib/auth/is-admin'
import { slugify } from './slugify'
import type { InsightPost, InsightPostInput } from './types'

/**
 * Cria um rascunho vazio e redireciona pro editor. Sem formulário — reduz fricção
 * (padrão "clicou, já está editando"). Só admin.
 */
export async function createDraftPost(): Promise<never> {
  const admin = await checkAdmin()
  if (!admin.isAdmin) throw new Error('unauthorized')

  const supabase = await createClient()
  const ts = Date.now()
  const { data, error } = await supabase
    .from('insights_posts')
    .insert({
      slug:          `rascunho-${ts}`,
      title:         'Novo insight (rascunho)',
      category:      'Geral',
      body_markdown: '',
      status:        'draft',
      author_email:  admin.email,
    })
    .select('id')
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? 'Falha ao criar rascunho')
  }

  revalidatePath('/admin/insights')
  redirect(`/admin/insights/${data.id}/edit`)
}

/** Update incremental. Normaliza slug. Retorna erro estruturado se slug colidir. */
export async function updatePost(
  id: string,
  input: Partial<InsightPostInput>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = await checkAdmin()
  if (!admin.isAdmin) return { ok: false, error: 'unauthorized' }

  const patch: Record<string, unknown> = { ...input }

  if (input.slug !== undefined) {
    const normalized = slugify(input.slug)
    if (!normalized) return { ok: false, error: 'Slug inválido' }
    patch.slug = normalized
  }

  // published_at: setar quando transicionar pra 'published' e estiver null
  if (input.status === 'published') {
    patch.published_at = new Date().toISOString()
  }
  if (input.status === 'draft') {
    patch.published_at = null
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('insights_posts')
    .update(patch)
    .eq('id', id)

  if (error) {
    if (error.code === '23505') return { ok: false, error: 'Já existe um post com esse slug.' }
    return { ok: false, error: error.message }
  }

  revalidatePath('/admin/insights')
  revalidatePath('/insights')
  if (input.slug) revalidatePath(`/insights/${patch.slug}`)
  return { ok: true }
}

/** Apaga post (hard delete). Só admin. */
export async function deletePost(id: string): Promise<{ ok: boolean; error?: string }> {
  const admin = await checkAdmin()
  if (!admin.isAdmin) return { ok: false, error: 'unauthorized' }

  const supabase = await createClient()
  const { error } = await supabase.from('insights_posts').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/insights')
  revalidatePath('/insights')
  return { ok: true }
}

/** Lê um post pro editor (sem filtro de status, admin vê rascunhos). */
export async function getPostForAdmin(id: string): Promise<InsightPost | null> {
  const admin = await checkAdmin()
  if (!admin.isAdmin) return null

  const supabase = await createClient()
  const { data } = await supabase
    .from('insights_posts')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  return (data as InsightPost) ?? null
}

/** Lista todos os posts (admin). */
export async function listPostsForAdmin(): Promise<InsightPost[]> {
  const admin = await checkAdmin()
  if (!admin.isAdmin) return []

  const supabase = await createClient()
  const { data } = await supabase
    .from('insights_posts')
    .select('*')
    .order('updated_at', { ascending: false })

  return (data as InsightPost[]) ?? []
}

/** Lista posts publicados (público). */
export async function listPublishedPosts(): Promise<InsightPost[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('insights_posts')
    .select('*')
    .eq('status', 'published')
    .order('published_at', { ascending: false })

  return (data as InsightPost[]) ?? []
}

/** Lê um post publicado pelo slug. Retorna null se não existir ou estiver em draft. */
export async function getPublishedPostBySlug(slug: string): Promise<InsightPost | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('insights_posts')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle()

  return (data as InsightPost) ?? null
}
