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

  const { data: orders } = await supabase
    .from('orders')
    .select('*')
    .eq('workspace_id', member.workspace_id)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })

  const list = (orders ?? []) as Order[]

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

      <PedidosList orders={list} />
    </div>
  )
}
