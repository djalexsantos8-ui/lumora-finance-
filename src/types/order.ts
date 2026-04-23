import type { Client } from './client'

export type OrderStatus =
  | 'draft'
  | 'in_progress'
  | 'delivered'
  | 'paid'
  | 'cancelled'

export type OrderItemCategory =
  | 'service'
  | 'product'
  | 'team'
  | 'equipment'
  | 'other'

export type OrderCostCategory =
  | 'equipment_rental'
  | 'team'
  | 'travel'
  | 'accommodation'
  | 'food'
  | 'software'
  | 'other'

export interface Order {
  id:                  string
  workspace_id:        string
  created_by:          string
  title:               string
  client_id:           string | null
  client_name:         string | null
  project_description: string | null
  deliverables:        string | null
  lead_source:         string | null
  client_segment:      string | null
  notes_internal:      string | null
  payment_condition:   string | null
  order_date:          string        // date ISO (YYYY-MM-DD)
  delivery_date:       string | null
  order_date_start:    string | null
  order_date_end:      string | null
  is_multi_day:        boolean
  event_date:          string | null
  currency:            string
  amount:              number
  amount_paid:         number
  discount_amount:     number
  revenue_total:       number
  cost_total:          number
  status:              OrderStatus
  notes:               string | null
  deleted_at:          string | null
  created_at:          string
  updated_at:          string
}

export interface OrderItem {
  id:              string
  order_id:        string
  description:     string
  category:        OrderItemCategory | null
  custom_category: string | null
  quantity:        number
  unit_value:      number
  total_value:     number
  sort_order:      number
  show_in_pdf:     boolean
  deleted_at:      string | null
  created_at:      string
}

export interface OrderCostItem {
  id:          string
  order_id:    string
  description: string
  category:    OrderCostCategory | null
  quantity:    number
  unit_value:  number
  total_value: number
  sort_order:  number
  deleted_at:  string | null
  created_at:  string
}

export interface OrderFile {
  id:           string
  workspace_id: string
  order_id:     string
  uploaded_by:  string
  storage_path: string
  file_name:    string
  mime_type:    string
  size_bytes:   number
  deleted_at:   string | null
  created_at:   string
}

export type OrderActionResult =
  | { success: true; data?: Order; client?: Client }
  | { success: false; message: string }

export type OrderItemActionResult =
  | { success: true; data?: OrderItem; order?: Order }
  | { success: false; message: string }

// ─── Payments ────────────────────────────────────────────────────────────────
// Schema preexistente (status enum payment_status: previsto/pago/cancelado)

export type OrderPaymentStatus = 'previsto' | 'pago' | 'cancelado'

export interface OrderPayment {
  id:           string
  workspace_id: string
  order_id:     string
  amount:       number
  currency:     string
  due_date:     string | null
  paid_at:      string | null
  method:       string | null
  reference:    string | null
  status:       OrderPaymentStatus
  notes:        string | null
  created_by:   string | null
  created_at:   string
  updated_at:   string
  deleted_at:   string | null
}

export type OrderPaymentActionResult =
  | { success: true; data?: OrderPayment; order?: Order }
  | { success: false; message: string }
