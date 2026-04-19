// ─── Cliente (modelo estruturado — migration 020) ────────────────────────────
//
// Cliente nasce automaticamente a partir de jobs/orçamentos.
// NÃO é cadastro obrigatório. Campos extras (phone, instagram, email, etc.)
// são opcionais — só são preenchidos se o usuário quiser enriquecer a ficha.

export interface Client {
  id:              string
  workspace_id:    string
  name:            string
  name_normalized: string
  phone:           string | null
  instagram:       string | null
  email:           string | null
  document:        string | null
  notes:           string | null
  created_at:      string
  updated_at:      string
  deleted_at:      string | null
}

// ─── Item resumido (para autocomplete) ───────────────────────────────────────

export interface ClientSearchItem {
  id:              string
  name:            string
  name_normalized: string
}

// ─── Retornos das Server Actions ─────────────────────────────────────────────

export type ClientActionResult =
  | { success: true;  data: Client }
  | { success: false; message: string }

export type ClientListResult =
  | { success: true;  data: Client[] }
  | { success: false; message: string }

export type ClientSearchResult =
  | { success: true;  data: ClientSearchItem[] }
  | { success: false; message: string }
