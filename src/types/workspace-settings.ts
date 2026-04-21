export interface WorkspaceSettings {
  id: string
  workspace_id: string
  company_name: string | null
  company_logo_url: string | null
  signature_name: string | null
  signature_title: string | null
  footer_text: string | null
  // ─── Dados contratuais da empresa (migration 20260421130000) ──────────
  // Usados pelo Contract Builder para preencher automaticamente os dados
  // da CONTRATADA. Todos opcionais — contrato exibe o que tiver.
  company_legal_name:       string | null
  company_cnpj:             string | null
  company_cpf:              string | null
  company_address_line:     string | null
  company_address_city:     string | null
  company_address_state:    string | null
  company_address_zip:      string | null
  company_email:            string | null
  company_phone:            string | null
  default_cancellation_notice_days: number | null
  default_cancellation_penalty_pct: number | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export type SettingsActionResult =
  | { success: true; data: WorkspaceSettings }
  | { success: false; message: string }
