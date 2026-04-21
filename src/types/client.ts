// ─── Cliente (modelo estruturado — migration 020) ────────────────────────────
//
// Cliente nasce automaticamente a partir de jobs/orçamentos.
// NÃO é cadastro obrigatório. Campos extras (phone, instagram, email, etc.)
// são opcionais — só são preenchidos se o usuário quiser enriquecer a ficha.

export type ClientPersonType = 'pf' | 'pj'

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
  // ─── campos expandidos (migration clients_expanded_fields) ───
  // Todos opcionais. Usuário só preenche quando quer emitir contrato
  // ou enriquecer a ficha para inteligência comercial.
  person_type:        ClientPersonType | null
  legal_name:         string | null
  trade_name:         string | null
  document_cpf:       string | null
  document_cnpj:      string | null
  address_line:       string | null
  address_city:       string | null
  address_state:      string | null
  address_zip:        string | null
  segment:            string | null
  lead_source:        string | null
  payment_condition:  string | null
  responsible_name:   string | null
  responsible_role:   string | null
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
