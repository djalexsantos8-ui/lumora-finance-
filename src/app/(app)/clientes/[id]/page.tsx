// ─── /clientes/[id] — Centro operacional do cliente ─────────────────────────
//
// Página individual de cliente (criada 2026-04-23). Antes, /clientes só
// permitia edit inline na listagem. Agora cada cliente tem sua própria
// rota com ficha + histórico completo (orçamentos, pedidos, freelances,
// receitas recorrentes, contratos).
//
// Pattern: mesmo shape das páginas de entidade (budget/order/job) — SSR
// com supabase, workspace guard, Promise.all das queries relacionadas,
// client component recebe props completos.

import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import type { Client } from '@/types/client'
import type { Budget } from '@/types/budget'
import type { Order } from '@/types/order'
import type { Job } from '@/types/job'
import type { RecurringRevenue } from '@/types/recurring-revenue'
import type { Contract } from '@/types/contract'
import { ClientDetail } from './client-detail'

interface Props {
  params: Promise<{ id: string }>
}

// Hardening 2026-04-23 — mesmo motivo das outras páginas de entidade:
// force-dynamic evita RSC stale em cache na edge pós-deploy.
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function generateMetadata({ params }: Props) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data } = await supabase
      .from('clients')
      .select('name')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle()
    const name = (typeof data?.name === 'string' && data.name.trim()) || 'Cliente'
    return { title: `${name} — Clientes — Lumora Finance` }
  } catch {
    return { title: 'Cliente — Lumora Finance' }
  }
}

export default async function ClientDetailPage({ params }: Props) {
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

  const workspaceId = member.workspace_id

  // Carrega o cliente primeiro. Se não existe ou é de outro workspace,
  // 404 — não vaza a existência de registros entre workspaces.
  const { data: client, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error || !client) notFound()

  // Todas as entidades relacionadas em paralelo. Cada query protege contra
  // tabela ausente (migration pendente) retornando lista vazia.
  const [
    budgetsRes,
    ordersRes,
    jobsByIdRes,
    jobsByNameRes,
    recurringRes,
    contractsRes,
  ] = await Promise.all([
    supabase
      .from('budgets')
      .select('id, title, client_name, client_id, status, currency, total, event_date, created_at, updated_at, intended_destination')
      .eq('workspace_id', workspaceId)
      .eq('client_id', id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('orders')
      .select('id, title, client_name, client_id, status, currency, revenue_total, cost_total, created_at, updated_at')
      .eq('workspace_id', workspaceId)
      .eq('client_id', id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    // Jobs vinculados pelo FK novo (client_id)
    supabase
      .from('jobs')
      .select('id, title, client_name, client_id, status, currency, revenue_total, cost_total, job_date, job_date_start, job_date_end, created_at')
      .eq('workspace_id', workspaceId)
      .eq('client_id', id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    // Jobs LEGADOS: criados antes do FK client_id existir — guardados só com
    // client_name. Busca por nome exato; mostrados separados pra deixar claro
    // que é fallback (e pro usuário poder migrar se quiser).
    supabase
      .from('jobs')
      .select('id, title, client_name, client_id, status, currency, revenue_total, cost_total, job_date, job_date_start, job_date_end, created_at')
      .eq('workspace_id', workspaceId)
      .is('client_id', null)
      .ilike('client_name', client.name)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('recurring_revenue')
      .select('id, title, client_name, client_id, status, currency, amount, started_at, cancelled_at, created_at')
      .eq('workspace_id', workspaceId)
      .eq('client_id', id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('contracts')
      .select('id, title, status, origin_kind, origin_id, contract_type, created_at')
      .eq('workspace_id', workspaceId)
      .eq('client_id', id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
  ])

  const jobsLegacy = (jobsByNameRes.data ?? []).filter(
    j => !(jobsByIdRes.data ?? []).some(x => x.id === j.id)
  )

  return (
    <ClientDetail
      client={client as Client}
      budgets={(budgetsRes.data ?? []) as Budget[]}
      orders={(ordersRes.data ?? []) as Order[]}
      jobsById={(jobsByIdRes.data ?? []) as Job[]}
      jobsLegacy={jobsLegacy as Job[]}
      recurrings={(recurringRes.data ?? []) as unknown as RecurringRevenue[]}
      contracts={(contractsRes.data ?? []) as Contract[]}
    />
  )
}
