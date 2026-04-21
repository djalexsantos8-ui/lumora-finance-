import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getContractQuery } from '@/lib/queries/contracts'
import { getContractMeta } from '@/lib/contracts/catalog'
import ContractBuilder from './contract-builder'
import type { ContractType } from '@/types/contract'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  const contract = await getContractQuery(id)
  if (!contract) return { title: 'Contrato — Lumora Finance' }
  return { title: `${contract.title} — Lumora Finance` }
}

export default async function ContractPage({ params }: Props) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const contract = await getContractQuery(id)
  if (!contract) notFound()

  // Catálogo é estático — se o tipo mudar no futuro e não existir mais no
  // catálogo, devolve meta mínimo para evitar crash do Builder.
  const meta =
    getContractMeta(contract.contract_type as ContractType) ?? {
      id:       contract.contract_type as ContractType,
      title:    contract.title || 'Contrato',
      audience: 'both' as const,
      summary:  '',
      suggestedOrigins: [],
      required:     [],
      placeholders: [],
    }

  return <ContractBuilder contract={contract} meta={meta} />
}
