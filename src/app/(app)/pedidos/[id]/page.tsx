import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import OrderEditor from './order-editor'
import { listOrderItems, listOrderCostItems } from '@/lib/actions/order-items'
import { listOrderFiles } from '@/lib/actions/order-files'
import type { Order, OrderItem, OrderCostItem, OrderFile } from '@/types/order'

export const metadata = { title: 'Pedido — Lumora Finance' }

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
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

  const { data: order } = await supabase
    .from('orders')
    .select('*')
    .eq('id', id)
    .eq('workspace_id', member.workspace_id)
    .is('deleted_at', null)
    .maybeSingle()

  if (!order) notFound()

  // Fetch related data in parallel — gracefully degrade if migration pending
  const [itemsRes, costsRes, filesRes] = await Promise.all([
    listOrderItems(id),
    listOrderCostItems(id),
    listOrderFiles(id),
  ])

  return (
    <OrderEditor
      order={order as Order}
      items={itemsRes.items as OrderItem[]}
      costItems={costsRes.items as OrderCostItem[]}
      files={filesRes.files as OrderFile[]}
      itemsTableMissing={itemsRes.tableMissing}
      costsTableMissing={costsRes.tableMissing}
      filesTableMissing={filesRes.tableMissing}
    />
  )
}
