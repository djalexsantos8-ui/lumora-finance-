// ─── Categoria de despesa variável ───────────────────────────────────────────

export type ExpenseCategory =
  | 'food'
  | 'transport'
  | 'equipment'
  | 'software'
  | 'marketing'
  | 'other'

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  food:      'Alimentação',
  transport: 'Transporte',
  equipment: 'Equipamento',
  software:  'Software',
  marketing: 'Marketing',
  other:     'Outros',
}

export const EXPENSE_CATEGORIES = Object.entries(
  EXPENSE_CATEGORY_LABELS
) as [ExpenseCategory, string][]

// ─── Categoria de custo fixo ──────────────────────────────────────────────────

export type FixedCostCategory =
  | 'software'
  | 'internet'
  | 'equipment'
  | 'workspace'
  | 'other'

export const FIXED_COST_CATEGORY_LABELS: Record<FixedCostCategory, string> = {
  software:  'Software',
  internet:  'Internet/Tel.',
  equipment: 'Equipamento',
  workspace: 'Espaço',
  other:     'Outros',
}

export const FIXED_COST_CATEGORIES = Object.entries(
  FIXED_COST_CATEGORY_LABELS
) as [FixedCostCategory, string][]

// ─── Despesa variável ─────────────────────────────────────────────────────────

export interface Expense {
  id:                  string
  workspace_id:        string
  description:         string
  category:            ExpenseCategory
  amount:              number
  currency:            string
  expense_date:        string        // YYYY-MM-DD
  is_deductible:       boolean
  notes:               string | null
  // Parcelamento (migration 007)
  is_installment:      boolean
  installments_total:  number | null
  installment_index:   number | null
  parent_expense_id:   string | null
  // Pagamento (migration 010)
  is_paid:             boolean
  paid_amount:         number | null
  paid_at:             string | null
  deleted_at:          string | null
  created_at:          string
}

// ─── Custo fixo recorrente ────────────────────────────────────────────────────

export interface FixedCost {
  id:            string
  workspace_id:  string
  description:   string
  category:      FixedCostCategory
  amount:        number
  currency:      string
  billing_day:   number        // 1–31
  is_active:     boolean
  is_deductible: boolean
  notes:         string | null
  deleted_at:    string | null
  created_at:    string
}

// ─── Tipos de retorno das Server Actions ──────────────────────────────────────

export type ExpenseActionResult =
  | { success: true; data?: Expense }
  | { success: false; error: string }

export type FixedCostActionResult =
  | { success: true; data?: FixedCost }
  | { success: false; error: string }
