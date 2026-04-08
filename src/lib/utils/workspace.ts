import { createClient } from '@/lib/supabase/server'

export async function getWorkspaceId(userId: string): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()
  return data?.workspace_id ?? null
}
