// ─── isDraftFreelance ───────────────────────────────────────────────────────
//
// Um freelance é considerado "rascunho" quando:
//   · não tem receita (revenue_total === 0)
//   · não tem custo   (cost_total === 0)
//   · o título é o default gerado automaticamente na criação
//
// Reconhecemos AMBOS os defaults — legado ('Job sem título') e novo
// ('Freelance sem título') — para não quebrar rascunhos antigos quando
// o default for trocado no Deploy 3.
//
// NÃO olhamos para `status` — um rascunho pode ser criado direto em
// `in_progress`. Só deixamos de ser rascunho quando o usuário insere
// algum conteúdo real (título, serviço ou custo).

import type { Job } from '@/types/job'

export const DEFAULT_FREELANCE_TITLES: readonly string[] = [
  'Freelance sem título',
  'Job sem título',
] as const

export function isDefaultTitle(title: string | null | undefined): boolean {
  if (!title) return true
  return DEFAULT_FREELANCE_TITLES.includes(title.trim())
}

export function isDraftFreelance(job: Job): boolean {
  const hasRevenue = Number(job.revenue_total) > 0
  const hasCost    = Number(job.cost_total)    > 0
  return !hasRevenue && !hasCost && isDefaultTitle(job.title)
}
