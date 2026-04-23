import type { Client } from './client'

export type BudgetStatus = 'draft' | 'sent' | 'approved' | 'rejected' | 'expired'
export type BudgetMarginType = 'percentage' | 'fixed'
export type BudgetIntendedDestination = 'order' | 'freelance' | 'recurring'
export type BudgetItemCategory =
  | 'team'
  | 'food'
  | 'transport'
  | 'accommodation'
  | 'equipment'
  | 'own_work'
  | 'other'

export interface Budget {
  id: string
  workspace_id: string
  created_by: string
  title: string
  client_name: string
  // ─── DEPLOY A (2026-04-22): modelo canônico alinhado com orders/jobs/recurring ─
  // client_id   : FK opcional para clients(id); getOrCreateClient preenche
  //               automaticamente quando um nome é digitado. Permite contrato
  //               gerado a partir do orçamento carregar client_id real e joins
  //               com a aba /clientes.
  // segment     : segmento canônico (CLIENT_SEGMENTS). Propagado na conversão.
  // lead_source : origem do lead (LEAD_SOURCES). Propagado na conversão.
  client_id: string | null
  segment: string | null
  lead_source: string | null
  project_description: string | null
  deliverables: string | null
  event_date: string | null
  // ─── Multi-datas 2026-04-23 (migration 20260423030000) ──────────────────
  // Padrão espelhado de jobs (migration 014) — ver FreelanceDateRange.
  //   event_date      = início  (null = sem data, não é start "zerado")
  //   event_date_end  = fim     (null OR igual a event_date → single day)
  //   is_multi_day    = cache booleano, true quando end > start
  // Adapter em updateBudget recebe {date_start, date_end} e sincroniza.
  event_date_end: string | null
  is_multi_day: boolean
  valid_until: string | null
  status: BudgetStatus
  currency: string
  subtotal: number
  margin_type: BudgetMarginType
  margin_input: number
  margin_amount: number
  discount_amount: number
  total: number
  notes_internal: string | null
  // ─── Pente fino 2026-04-21: prazo + destino pretendido ──────────────────
  // payment_term: texto livre ("50% assinatura + 50% entrega", "30/60/90")
  // intended_destination: hint do fluxo ao converter — só guia UI, não trava
  payment_term: string | null
  intended_destination: BudgetIntendedDestination | null
  sent_at: string | null
  approved_at: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface BudgetItem {
  id: string
  budget_id: string
  freelancer_id: string | null
  category: BudgetItemCategory | null
  custom_category: string | null
  label: string
  quantity: number
  days: number
  unit_value: number
  total_value: number
  is_custom: boolean
  show_in_pdf: boolean
  sort_order: number
  deleted_at: string | null
  created_at: string
}

// `client` é opcional — populado quando a action tocou em client_name e
// resolveu o cadastro via getOrCreateClient. Permite o save encadeado no
// modo expandido (ClientPicker) sem endpoint novo.
export type BudgetActionResult =
  | { success: true; data?: Budget; client?: Client }
  | { success: false; message: string }

export type BudgetItemActionResult =
  | { success: true; data?: BudgetItem; budget?: Budget }
  | { success: false; message: string }
