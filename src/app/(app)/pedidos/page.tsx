import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PedidosList from './pedidos-list'
import { NewOrderButton } from './new-order-button'
import type { Order } from '@/types/order'

export const metadata = { title: 'Pedidos — Lumora Finance' }

// Server component — auth + fetch + render. Toda UX de seleção em massa
// + criação mora no client.
export default async function PedidosPage() {
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

  const { data: orders, error: ordersErr } = await supabase
    .from('orders')
    .select('*')
    .eq('workspace_id', member.workspace_id)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })

  // Tabela ainda não criada (migration 20260421021456_orders.sql pendente).
  // Renderiza estado vazio com mensagem em vez de crashar a página.
  const tableMissing =
    ordersErr?.code === '42P01' ||
    ordersErr?.message?.includes('relation "public.orders" does not exist') ||
    ordersErr?.message?.includes('orders" does not exist')

  const list = tableMissing ? [] : ((orders ?? []) as Order[])

  return (
    <div className="min-h-full p-6 md:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Pedidos</h1>
          <p className="text-[#a3a3a3] text-sm mt-0.5">
            {list.length === 0
              ? 'Nenhum pedido criado ainda'
              : `${list.length} pedido${list.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <NewOrderButton />
      </div>

      {tableMissing ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6">
          <h3 className="text-amber-300 font-semibold text-sm mb-1">Migração pendente</h3>
          <p className="text-[#a3a3a3] text-sm">
            A tabela <code className="text-white">orders</code> ainda não foi criada no Supabase. Aplique a migration
            <code className="text-white"> 20260421021456_orders.sql</code> (SQL Editor do Supabase) para usar os pedidos.
            Veja <code className="text-white">SETUP-MIGRATIONS.md</code> no repositório para o passo a passo.
          </p>
        </div>
      ) : (
        <PedidosList orders={list} />
      )}
    </div>
  )
}
