import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'

/**
 * EPIC-22 — Tipos de projeto curated (17 do audiovisual brasileiro).
 *
 * Sistema-wide (sem workspace_id). Cache de 1h via unstable_cache —
 * raramente muda (alteração só via migration).
 */

export interface ProjectType {
  code:        string
  label:       string
  description: string
  icon:        string
  sort_order:  number
  active:      boolean
}

export const getProjectTypes = unstable_cache(
  async (): Promise<ProjectType[]> => {
    try {
      const sb = createAdminClient()
      const { data } = await sb
        .from('project_types')
        .select('code, label, description, icon, sort_order, active')
        .eq('active', true)
        .order('sort_order')
      return (data ?? []) as ProjectType[]
    } catch {
      return []
    }
  },
  ['project-types'],
  { revalidate: 3600, tags: ['project-types'] }
)

export async function getProjectTypeByCode(code: string | null | undefined): Promise<ProjectType | null> {
  if (!code) return null
  const all = await getProjectTypes()
  return all.find((t) => t.code === code) ?? null
}

/** Resolve display string: label do tipo (com ícone) ou texto livre se "outro". */
export function projectTypeDisplay(
  code: string | null | undefined,
  other: string | null | undefined,
  types: ProjectType[]
): { icon: string; label: string } | null {
  if (!code) return null
  const t = types.find((x) => x.code === code)
  if (!t) return null
  if (code === 'outro' && other?.trim()) {
    return { icon: t.icon, label: other.trim() }
  }
  return { icon: t.icon, label: t.label }
}
