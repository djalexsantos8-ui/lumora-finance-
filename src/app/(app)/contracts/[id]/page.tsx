import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getContract } from '@/lib/actions/contracts'
import { getContractMeta } from '@/lib/contracts/catalog'
import ContractBuilder from './contract-builder'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  const res = await getContract(id)
  if (!res.success) return { title: 'Contrato — Lumora Finance' }
  return { title: `${res.data.title} — Lumora Finance` }
}

export default async function ContractPage({ params }: Props) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const res = await getContract(id)
  if (!res.success) notFound()

  const contract = res.data
  const meta = getContractMeta(contract.contract_type)

  return <ContractBuilder contract={contract} meta={meta} />
}
