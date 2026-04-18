import { isJobPending } from '@/types/job'
import type { Job } from '@/types/job'

// ─── Estado conceitual do job ─────────────────────────────────────────────────
//
// O banco persiste: in_progress | delivered | pending_payment | paid | cancelled
//
// Problema: `in_progress` cobre dois momentos opostos:
//   - job agendado (data futura)  → usuário ainda não fez nada de errado
//   - job aconteceu sem registro  → usuário precisa atualizar o status
//
// Esta camada de domínio resolve essa ambiguidade sem tocar no banco.
//
// Mapeamento:
//   in_progress + data futura   → scheduled    (cinza   — nada a fazer agora)
//   in_progress + data chegada  → in_progress  (azul    — precisa atualizar)
//   delivered | pending_payment → delivered    (âmbar   — aguardando cobrança)
//   paid                        → completed    (verde   — finalizado)
//   cancelled                   → cancelled    (cinza   — encerrado)

export type JobState =
  | 'scheduled'
  | 'in_progress'
  | 'delivered'
  | 'completed'
  | 'cancelled'

export interface JobStateResult {
  state: JobState
  label: string
  /** Cor semântica para o badge — mapeada para classes CSS no componente. */
  color: 'gray' | 'blue' | 'amber' | 'green'
}

// Tabela estática — um único lugar para mudar label/cor de cada estado
const STATE_CONFIG: Record<JobState, Omit<JobStateResult, 'state'>> = {
  scheduled:   { label: 'Agendado',     color: 'gray'  },
  in_progress: { label: 'Em andamento', color: 'blue'  },
  delivered:   { label: 'Entregue',     color: 'amber' },
  completed:   { label: 'Concluído',    color: 'green' },
  cancelled:   { label: 'Cancelado',    color: 'gray'  },
}

/**
 * Deriva o estado conceitual do job para exibição na UI.
 *
 * A única "lógica" aqui é resolver `in_progress` → scheduled | in_progress
 * via isJobPending(). Todo o resto é mapeamento direto do status do banco.
 *
 * @param today  YYYY-MM-DD no fuso local (use todayISO() ou state computado no mount).
 *               Passado explicitamente para consistência entre servidor e cliente,
 *               e para facilitar testes.
 *
 * @example
 * // Job agendado para amanhã
 * getJobState({ status: 'in_progress', is_multi_day: false, job_date: '2026-04-10', ... }, '2026-04-09')
 * // → { state: 'scheduled', label: 'Agendado', color: 'gray' }
 *
 * // Job de ontem sem atualização
 * getJobState({ status: 'in_progress', is_multi_day: false, job_date: '2026-04-08', ... }, '2026-04-09')
 * // → { state: 'in_progress', label: 'Em andamento', color: 'blue' }
 *
 * // Job entregue, aguardando pagamento
 * getJobState({ status: 'delivered', ... }, '2026-04-09')
 * // → { state: 'delivered', label: 'Entregue', color: 'amber' }
 *
 * // Job pago
 * getJobState({ status: 'paid', ... }, '2026-04-09')
 * // → { state: 'completed', label: 'Concluído', color: 'green' }
 */
export function getJobState(
  job: Pick<Job, 'status' | 'is_multi_day' | 'job_date' | 'job_date_start'>,
  today: string
): JobStateResult {
  const { status } = job

  // Estados terminais — o status do banco é definitivo, datas não importam
  if (status === 'cancelled') return { state: 'cancelled', ...STATE_CONFIG.cancelled }
  if (status === 'paid')      return { state: 'completed', ...STATE_CONFIG.completed }

  // delivered + pending_payment colapsam: ambos significam "job feito, pagamento pendente"
  // A distinção granular fica na tela de detalhe, não no card
  if (status === 'delivered' || status === 'pending_payment') {
    return { state: 'delivered', ...STATE_CONFIG.delivered }
  }

  // in_progress: a data decide se o job já aconteceu ou ainda não
  // isJobPending() retorna true  → job aconteceu / está acontecendo → em andamento
  // isJobPending() retorna false → job ainda não aconteceu (ou sem data) → agendado
  if (isJobPending(job, today)) {
    return { state: 'in_progress', ...STATE_CONFIG.in_progress }
  }

  return { state: 'scheduled', ...STATE_CONFIG.scheduled }
}
