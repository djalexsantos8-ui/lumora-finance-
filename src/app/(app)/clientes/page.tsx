// ─── Clientes · Listagem + edição (Fase 6) ──────────────────────────────────
//
// IMPORTANTE: NÃO exige cadastro manual. Clientes nascem via jobs.
// Esta página serve para:
//   · ver todos os clientes estruturados do workspace
//   · enriquecer ficha (telefone, instagram, email, documento, notas)
//   · renomear ou remover (soft delete)
//
// Histórico de jobs do cliente aparece como placeholder por enquanto.

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ClientesClient } from './clientes-client'
import type { Client } from '@/types/client'

export const metadata = { title: 'Clientes — Lumora Finance' }

export default async function ClientesPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  if (!member) redirect('/dashboard')

  const { data: clients } = await supabase
    .from('clients')
    .select('*')
    .eq('workspace_id', member.workspace_id)
    .is('deleted_at', null)
    .order('name', { ascending: true })

  return (
    <div className="min-h-full p-6 md:p-8">
      <div className="flex items-end justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-white">Clientes</h1>
          <p className="text-xs text-[#737373] mt-1">
            Clientes são criados automaticamente quando você cadastra um job.
            Aqui você pode enriquecer a ficha.
          </p>
        </div>
        <a
          href="/clientes/origem"
          className="text-xs font-semibold text-[#D4A853] hover:text-[#E8C47A] bg-[#D4A853]/10 hover:bg-[#D4A853]/20 border border-[#D4A853]/30 px-3 py-1.5 rounded-lg transition-colors"
        >
          Ver origem dos clientes →
        </a>
      </div>

      <ClientesClient initialClients={(clients ?? []) as Client[]} />
    </div>
  )
}
