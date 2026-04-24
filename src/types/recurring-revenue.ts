import type { Client } from './client'

export type RecurringFrequency =
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'yearly'

export type RecurringStatus = 'active' | 'paused' | 'cancelled'

export interface RecurringRevenue {
  id:                string
  workspace_id:      string
  created_by:        string

  title:             string
  client_id:         string | null
  client_name:       string | null

  segment:             string | null
  lead_source:         string | null
  project_description: string | null
  notes_internal:      string | null
  scope_summary:       string | null
  renewal_date:        string | null

  delivery_type:     string | null
  has_video:         boolean
  has_photo:         boolean
  has_social:        boolean

  currency:          string
  amount:            number

  frequency:         RecurringFrequency
  billing_day:       number | null

  next_delivery_at:  string | null
  next_billing_at:   string | null

  status:            RecurringStatus
  notes:             string | null

  started_at:        string
  cancelled_at:      string | null

  deleted_at:        string | null
  created_at:        string
  updated_at:        string
}

export type RecurringRevenueActionResult =
  | { success: true; data?: RecurringRevenue; client?: Client }
  | { success: false; message: string }

// ─── Items: serviços do contrato + repasses ao cliente ────────────────────
// Espelham order_items / order_cost_items. Cabem na mesma UX de Pedidos.

export type RecurringItemCategory =
  | 'service'
  | 'product'
  | 'team'
  | 'equipment'
  | 'other'

export type RecurringCostCategory =
  | 'equipment_rental'
  | 'team'
  | 'travel'
  | 'accommodation'
  | 'food'
  | 'software'
  | 'other'

export interface RecurringItem {
  id:           string
  recurring_id: string
  description:  string
  category:     RecurringItemCategory | null
  quantity:     number
  unit_value:   number
  total_value:  number
  sort_order:   number
  show_in_pdf:  boolean
  deleted_at:   string | null
  created_at:   string
}

export interface RecurringCostItem {
  id:              string
  recurring_id:    string
  description:     string
  category:        RecurringCostCategory | null
  custom_category: string | null
  quantity:        number
  unit_value:      number
  total_value:     number
  sort_order:      number
  show_in_pdf:     boolean
  deleted_at:      string | null
  created_at:      string
}

export type RecurringItemActionResult =
  | { success: true; data?: RecurringItem }
  | { success: false; message: string }

export type RecurringCostItemActionResult =
  | { success: true; data?: RecurringCostItem }
  | { success: false; message: string }

// ─── Invoices (Fase 4 / 2026-04-22) ────────────────────────────────────────
// Cada linha representa a cobrança de um mês/ciclo específico emitida a
// partir de uma recurring_revenue. Snapshot do título/valor/cliente é
// capturado no momento da geração (imutável quando a recorrência muda).

export type RecurringInvoiceStatus =
  | 'open'
  | 'paid'
  | 'overdue'
  | 'cancelled'

export interface RecurringRevenueInvoice {
  id:                   string
  workspace_id:         string
  recurring_revenue_id: string
  created_by:           string

  period_year:          number
  period_month:         number
  due_date:             string | null

  title:                string
  client_name:          string | null
  amount:               number
  currency:             string

  status:               RecurringInvoiceStatus
  paid_at:              string | null
  paid_amount:          number | null

  notes:                string | null

  created_at:           string
  updated_at:           string
  deleted_at:           string | null
}

export type RecurringInvoiceActionResult =
  | { success: true; data?: RecurringRevenueInvoice }
  | { success: false; message: string }
