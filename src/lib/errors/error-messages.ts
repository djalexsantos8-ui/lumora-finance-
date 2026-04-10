export const ERROR_MESSAGES = {
  // ── Auth ──────────────────────────────────────────────────────────────────────
  UNAUTHORIZED:                    'Você não tem permissão.',
  WORKSPACE_NOT_FOUND:             'Workspace não encontrado.',

  // ── Jobs ─────────────────────────────────────────────────────────────────────
  JOB_NOT_FOUND:                   'Job não encontrado.',
  JOB_CREATE_FAILED:               'Erro ao criar job. Tente novamente.',
  JOB_UPDATE_FAILED:               'Erro ao atualizar job.',
  JOB_DELETE_FAILED:               'Erro ao excluir job.',
  JOB_STATUS_UPDATE_FAILED:        'Erro ao atualizar status do job.',

  // ── Job items ─────────────────────────────────────────────────────────────────
  JOB_ITEM_CREATE_FAILED:          'Erro ao adicionar item.',
  JOB_ITEM_UPDATE_FAILED:          'Erro ao atualizar item.',
  JOB_ITEM_DELETE_FAILED:          'Erro ao remover item.',

  // ── Payments ──────────────────────────────────────────────────────────────────
  PAYMENT_ADD_FAILED:              'Erro ao registrar pagamento.',
  PAYMENT_DELETE_FAILED:           'Erro ao remover pagamento.',

  // ── Budgets ───────────────────────────────────────────────────────────────────
  BUDGET_NOT_FOUND:                'Orçamento não encontrado.',
  BUDGET_CREATE_FAILED:            'Erro ao criar orçamento. Tente novamente.',
  BUDGET_UPDATE_FAILED:            'Erro ao atualizar orçamento.',
  BUDGET_DELETE_FAILED:            'Erro ao excluir orçamento.',

  // ── Budget items ──────────────────────────────────────────────────────────────
  BUDGET_ITEM_CREATE_FAILED:       'Erro ao adicionar item.',
  BUDGET_ITEM_UPDATE_FAILED:       'Erro ao atualizar item.',
  BUDGET_ITEM_DELETE_FAILED:       'Erro ao remover item.',

  // ── Expenses ──────────────────────────────────────────────────────────────────
  EXPENSE_CREATE_FAILED:           'Erro ao criar despesa.',
  EXPENSE_UPDATE_FAILED:           'Erro ao atualizar despesa.',
  EXPENSE_DELETE_FAILED:           'Erro ao excluir despesa.',
  EXPENSE_PAY_FAILED:              'Erro ao registrar pagamento da despesa.',
  EXPENSE_INSTALLMENTS_NOT_FOUND:  'Parcelas não encontradas.',
  EXPENSE_SETTLE_FAILED:           'Erro ao quitar parcelas.',

  // ── Fixed costs ───────────────────────────────────────────────────────────────
  FIXED_COST_CREATE_FAILED:        'Erro ao criar custo recorrente.',
  FIXED_COST_UPDATE_FAILED:        'Erro ao atualizar custo fixo.',
  FIXED_COST_DELETE_FAILED:        'Erro ao excluir custo fixo.',
  FIXED_COST_TOGGLE_FAILED:        'Erro ao alterar status do custo fixo.',
  FIXED_COST_PAY_FAILED:           'Erro ao registrar pagamento.',
  FIXED_COST_UNPAY_FAILED:         'Erro ao desfazer pagamento.',
  FIXED_COST_END_FAILED:           'Erro ao encerrar custo recorrente.',
  INSTALLMENT_CREATE_FAILED:       'Erro ao criar parcelas.',
  INSTALLMENT_DELETE_FAILED:       'Erro ao excluir parcelas.',

  // ── Freelancers ───────────────────────────────────────────────────────────────
  FREELANCER_CREATE_FAILED:        'Erro ao criar profissional.',
  FREELANCER_UPDATE_FAILED:        'Erro ao atualizar profissional.',
  FREELANCER_DELETE_FAILED:        'Erro ao remover profissional.',

  // ── Workspace settings ────────────────────────────────────────────────────────
  SETTINGS_SAVE_FAILED:            'Erro ao salvar configurações.',

  // ── Generic ───────────────────────────────────────────────────────────────────
  UNKNOWN_ERROR:                   'Erro inesperado.',
} as const

export type ErrorCode = keyof typeof ERROR_MESSAGES
