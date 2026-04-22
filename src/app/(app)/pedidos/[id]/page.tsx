import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import OrderEditor from './order-editor'
import {
  listOrderItemsQuery,
  listOrderCostItemsQuery,
  listOrderFilesQuery,
} from '@/lib/queries/orders'
import { listContractsByOriginQuery } from '@/lib/queries/contracts'
import { ContractEntryPoint } from '@/components/contracts/contract-entry-point'
import { listPaymentsByOrder } from '@/lib/actions/order-payments'
import { listOrderExpenses } from '@/lib/actions/expenses'
import type { Order, OrderItem, OrderCostItem, OrderFile, OrderPayment } from '@/types/order'
import type { Expense } from '@/types/expense'

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
  const [itemsRes, costsRes, filesRes, linkedContracts, payments, expensesRes] = await Promise.all([
    listOrderItemsQuery(id),
    listOrderCostItemsQuery(id),
    listOrderFilesQuery(id),
    listContractsByOriginQuery('order', id),
    listPaymentsByOrder(id),
    listOrderExpenses(id),
  ])

  return (
    <>
      <OrderEditor
        order={order as Order}
        items={itemsRes.items as OrderItem[]}
        costItems={costsRes.items as OrderCostItem[]}
        files={filesRes.files as OrderFile[]}
        initialPayments={payments as OrderPayment[]}
        initialOrderExpenses={(expensesRes.data ?? []) as Expense[]}
        itemsTableMissing={itemsRes.tableMissing}
        costsTableMissing={costsRes.tableMissing}
        filesTableMissing={filesRes.tableMissing}
      />
      {/* Alinhado com max-w do order-editor (max-w-4xl) */}
      <div className="max-w-4xl mx-auto px-6 md:px-8 pb-10">
        <ContractEntryPoint
          originKind="order"
          originId={id}
          contracts={linkedContracts}
        />
      </div>
    </>
  )
}
