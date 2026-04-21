import ContractsClient from './contracts-client'
import { CONTRACT_TEMPLATES } from '@/lib/data/contract-templates'

export const metadata = { title: 'Contratos — Lumora Finance' }

// ─── Contratos V1 — templates de arranque ─────────────────────────────────────
//
// V1 entrega os 9 templates base (foto/vídeo casamento, institucional, moda,
// book, evento, freelance B2B) como texto markdown pra copiar e adaptar. SEM
// merge automático de dados do orçamento ainda — isso entra na V2.
//
// A aba serve pra (1) desbloquear quem precisa de contrato HOJE, (2) manter
// o usuário dentro do Lumora em vez de buscar template no Google, (3) coletar
// feedback sobre quais templates fazem mais sentido expandir.
//
// DISCLAIMER obrigatório: texto gerado por IA, não substitui advogado. Exibido
// em destaque no topo da página e em cada template aberto.
export default function ContractsPage() {
  return <ContractsClient templates={CONTRACT_TEMPLATES} />
}
