import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import RecurringList from './recurring-list'
import { NewRecurringButton } from './new-recurring-button'
import type { RecurringRevenue } from '@/types/recurring-revenue'

export const metadata = { title: 'Receita Recorrente — Lumora Finance' }

export default async function ReceitasRecorrentesPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()
  if (!member) redirect('/dashboard')

  const { data: items, error: rrErr } = await supabase
    .from('recurring_revenue')
    .select('*')
    .eq('workspace_id', member.workspace_id)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })

  const tableMissing =
    rrErr?.code === '42P01' ||
    rrErr?.message?.includes('relation "public.recurring_revenue" does not exist') ||
    rrErr?.message?.includes('recurring_revenue" does not exist')

  const list = tableMissing ? [] : ((items ?? []) as RecurringRevenue[])

  return (
    <div className="min-h-full p-6 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Receita Recorrente</h1>
          <p className="text-[#a3a3a3] text-sm mt-0.5">
            {list.length === 0
              ? 'Nenhum contrato recorrente cadastrado'
              : `${list.length} contrato${list.length !== 1 ? 's' : ''} ativo${list.length !== 1 ? 's' : ''} / cadastrado${list.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <NewRecurringButton />
      </div>

      {tableMissing ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6">
          <h3 className="text-amber-300 font-semibold text-sm mb-1">Migração pendente</h3>
          <p className="text-[#a3a3a3] text-sm">
            A tabela <code className="text-white">recurring_revenue</code> ainda não foi criada no Supabase. Aplique a migration
            <code className="text-white"> 20260421021500_recurring_revenue.sql</code> (SQL Editor do Supabase) para cadastrar contratos recorrentes.
            Veja <code className="text-white">SETUP-MIGRATIONS.md</code> no repositório para o passo a passo.
          </p>
        </div>
      ) : (
        <RecurringList items={list} />
      )}
    </div>
  )
}
