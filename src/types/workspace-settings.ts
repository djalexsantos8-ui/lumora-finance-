export interface WorkspaceSettings {
  id: string
  workspace_id: string
  company_name: string | null
  company_logo_url: string | null
  signature_name: string | null
  signature_title: string | null
  footer_text: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export type SettingsActionResult =
  | { success: true; data: WorkspaceSettings }
  | { success: false; error: string }
