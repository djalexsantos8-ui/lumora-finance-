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
  | 'subscription'
  | 'internet'
  | 'phone'
  | 'equipment'
  | 'workspace'
  | 'housing'
  | 'transport'
  | 'taxes'
  | 'services'
  | 'other'

export const FIXED_COST_CATEGORY_LABELS: Record<FixedCostCategory, string> = {
  software:     'Software',
  subscription: 'Assinaturas',
  internet:     'Internet',
  phone:        'Telefonia',
  equipment:    'Equipamentos',
  workspace:    'Espaço',
  housing:      'Moradia',
  transport:    'Transporte',
  taxes:        'Impostos',
  services:     'Serviços',
  other:        'Outros',
}

export const FIXED_COST_CATEGORIES = Object.entries(
  FIXED_COST_CATEGORY_LABELS
) as [FixedCostCategory, string][]

// ─── Despesa variável ─────────────────────────────────────────────────────────

export interface Expense {
  id:                  string
  workspace_id:        string
  /**
   * Vínculo opcional com um job (migration 008 tornou nullable).
   *   · null → despesa geral (aparece em /expenses)
   *   · uuid → despesa operacional DESTE job (aparece no detalhe do freelance)
   */
  job_id:              string | null
  /**
   * Vínculo opcional com um order/pedido (migration 20260422050000).
   *   · null → despesa sem pedido associado
   *   · uuid → despesa operacional DESTE pedido
   */
  order_id:            string | null
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
  // Multimoeda (migration 011)
  exchange_rate:       number | null   // 1 moeda = X BRL, fixado na criação
  amount_brl:          number | null   // valor final em BRL (com ou sem IOF)
  iof_applied:         boolean
  iof_amount:          number | null   // valor do IOF em BRL
  // Quitação (migration 013)
  discount_amount:     number | null   // desconto aplicado na última parcela ao quitar antecipado
  deleted_at:          string | null
  created_at:          string
}

// ─── Custo fixo recorrente ────────────────────────────────────────────────────

export interface FixedCost {
  id:                    string
  workspace_id:          string
  description:           string
  category:              FixedCostCategory
  amount:                number
  currency:              string
  billing_day:           number        // 1–31 (legado)
  is_active:             boolean
  is_deductible:         boolean
  notes:                 string | null
  // Tipo (migration 015)
  is_recurring:          boolean       // recorrente sem fim definido
  is_installment:        boolean       // parcelado com N parcelas
  // Parcelamento (migration 015)
  installments_total:    number | null
  installment_index:     number | null
  parent_fixed_cost_id:  string | null
  // Período (migration 015)
  start_date:            string | null  // YYYY-MM-DD
  end_date:              string | null  // YYYY-MM-DD — null = sem fim
  // Multimoeda (migration 015)
  exchange_rate:         number | null
  amount_brl:            number | null
  iof_applied:           boolean
  iof_amount:            number | null
  // Pagamento parcelas (migration 015)
  is_paid:               boolean
  paid_at:               string | null
  paid_amount:           number | null
  discount_amount:       number | null
  // Pagamento mensal recorrente (migration 018)
  last_paid_date:        string | null  // YYYY-MM-DD — último pagamento mensal
  deleted_at:            string | null
  created_at:            string
}

// ─── Tipos de retorno das Server Actions ──────────────────────────────────────

export type ExpenseActionResult =
  | { success: true; data?: Expense }
  | { success: false; message: string }

export type FixedCostActionResult =
  | { success: true; data?: FixedCost }
  | { success: false; message: string }
