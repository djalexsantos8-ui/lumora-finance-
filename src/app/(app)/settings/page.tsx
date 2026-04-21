import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SettingsForm from './settings-form'
import type { WorkspaceSettings } from '@/types/workspace-settings'

export const metadata = { title: 'Configurações — Lumora Finance' }

export default async function SettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Busca workspace ativo
  const { data: member } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  if (!member) redirect('/dashboard')

  // Busca configurações (pode não existir ainda)
  const { data: settings } = await supabase
    .from('workspace_settings')
    .select('*')
    .eq('workspace_id', member.workspace_id)
    .maybeSingle()

  return (
    <div className="min-h-full p-6 md:p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Configurações</h1>
        <p className="text-[#a3a3a3] text-sm mt-0.5">
          Identidade, empresa e notificações do seu workspace
        </p>
      </div>

      <SettingsForm
        settings={settings as WorkspaceSettings | null}
        workspaceId={member.workspace_id}
      />
    </div>
  )
}
