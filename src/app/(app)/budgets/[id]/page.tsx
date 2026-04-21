import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import BudgetEditor from './budget-editor'
import { ContractEntryPoint } from '@/components/contracts/contract-entry-point'
import { listContractsByOrigin } from '@/lib/actions/contracts'
import type { Budget, BudgetItem } from '@/types/budget'
import type { Freelancer } from '@/types/freelancer'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from('budgets')
    .select('title')
    .eq('id', id)
    .single()
  return { title: `${data?.title ?? 'Orçamento'} — Lumora Finance` }
}

export default async function BudgetPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // PERFORMANCE: as 3 queries (budget, items, freelancers) eram SEQUENCIAIS
  // e somavam ~1s em produção. Agora rodam em PARALELO via Promise.all.
  // `freelancers` não depende de `budget.workspace_id` porque a RLS já filtra
  // pelo workspace do usuário logado — basta não passar o filtro explícito.
  const [budgetRes, itemsRes, freelancersRes] = await Promise.all([
    supabase
      .from('budgets')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single(),
    supabase
      .from('budget_items')
      .select('*')
      .eq('budget_id', id)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase
      .from('freelancers')
      .select('id, name, role, daily_rate, currency, workspace_id')
      .is('deleted_at', null)
      .order('name', { ascending: true }),
  ])

  const { data: budget, error } = budgetRes
  if (error || !budget) notFound()

  const items = itemsRes.data
  // Garante que só passa freelancers do MESMO workspace do orçamento
  // (a RLS filtra pelo workspace do usuário, mas o budget pode ser de
  // um workspace diferente se o usuário tiver múltiplos — defensivo).
  const freelancers = (freelancersRes.data ?? []).filter(
    f => f.workspace_id === budget.workspace_id
  )

  // Contratos já vinculados a este orçamento (vínculo reverso)
  const contractsRes = await listContractsByOrigin('budget', budget.id)
  const linkedContracts = contractsRes.success ? contractsRes.data : []

  return (
    <>
      <BudgetEditor
        budget={budget as Budget}
        items={(items ?? []) as BudgetItem[]}
        freelancers={freelancers as Freelancer[]}
      />
      <div className="max-w-5xl mx-auto px-6 md:px-8 pb-10">
        <ContractEntryPoint
          originKind="budget"
          originId={budget.id}
          contracts={linkedContracts}
        />
      </div>
    </>
  )
}
