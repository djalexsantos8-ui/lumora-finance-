import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SettingsForm from './settings-form'
import { ReplayTourButton } from '@/components/onboarding/replay-tour-button'
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

      {/* Reabrir tour — discreto, fim de página. Pro usuário que pulou ou
          quer rever o passo-a-passo depois. */}
      <div className="mt-10 pt-6 border-t border-[#1f1f1f] flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-[#d4d4d4]">Ajuda</p>
          <p className="text-[11px] text-[#525252] mt-0.5">
            Reveja o tour visual das 10 abas quando quiser.
          </p>
        </div>
        <ReplayTourButton />
      </div>
    </div>
  )
}
