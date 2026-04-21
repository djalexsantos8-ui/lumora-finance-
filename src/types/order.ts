import type { Client } from './client'

export type OrderStatus =
  | 'draft'
  | 'in_progress'
  | 'delivered'
  | 'paid'
  | 'cancelled'

export interface Order {
  id:             string
  workspace_id:   string
  created_by:     string
  title:          string
  client_id:      string | null
  client_name:    string | null
  order_date:     string        // date ISO (YYYY-MM-DD)
  delivery_date:  string | null
  currency:       string
  amount:         number
  amount_paid:    number
  status:         OrderStatus
  notes:          string | null
  deleted_at:     string | null
  created_at:     string
  updated_at:     string
}

export type OrderActionResult =
  | { success: true; data?: Order; client?: Client }
  | { success: false; message: string }
