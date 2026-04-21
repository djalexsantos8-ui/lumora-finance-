import ContractsClient from './contracts-client'
import { listContractsQuery } from '@/lib/queries/contracts'
import { CONTRACT_TYPES_LIST } from '@/lib/contracts/catalog'

export const metadata = { title: 'Contratos — Lumora Finance' }

// ─── Contratos V2 — Builder real ────────────────────────────────────────────
//
// V1 (galeria de templates) → V2 (Contract Builder integrado):
//  · contratos nascem das entidades operacionais (budget/freelance/order/recurring)
//  · dados do cliente e da empresa preenchidos automaticamente
//  · persistência em tabela contracts (snapshot + metadata)
//  · hub lista os contratos REAIS; templates são só o catálogo de tipos
//
// Esta página agora mostra:
//  1. Lista de contratos já criados (filtros por status/tipo)
//  2. Picker de tipo para criar contrato standalone
//  3. Disclaimer permanece (mas mais discreto — já tá claro no fluxo)

export default async function ContractsPage() {
  const contracts = await listContractsQuery()

  return (
    <ContractsClient
      contracts={contracts}
      catalog={CONTRACT_TYPES_LIST}
    />
  )
}
