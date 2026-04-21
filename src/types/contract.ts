// ─── Contratos — tipos centrais (migration 20260421130000) ──────────────────
//
// Contract = documento jurídico gerado a partir de uma entidade operacional
// (orçamento, freelance, pedido, receita recorrente) ou standalone. Guarda
// snapshot textual final + metadata do contexto usado na geração.

import type { Client } from './client'

export type ContractType =
  | 'wedding_photo'
  | 'wedding_video'
  | 'institutional_video'
  | 'institutional_photo'
  | 'fashion_photo'
  | 'book_photo'
  | 'event_photo'
  | 'event_video'
  | 'freelance_b2b'
  | 'recurring_services'

export type ContractOriginKind =
  | 'budget'
  | 'freelance'
  | 'order'
  | 'recurring'
  | 'standalone'

export type ContractStatus =
  | 'draft'       // rascunho — dados faltando ou pendentes
  | 'generated'   // gerado — todos os placeholders resolvidos
  | 'reviewed'    // revisado — usuário confirmou o texto
  | 'signed'      // assinado (marcação manual por ora)
  | 'cancelled'   // cancelado

// ─── Registro persistido ────────────────────────────────────────────────────

export interface Contract {
  id:               string
  workspace_id:     string
  created_by:       string
  contract_type:    ContractType
  title:            string
  origin_kind:      ContractOriginKind | null
  origin_id:        string | null
  client_id:        string | null
  status:           ContractStatus
  rendered_content: string | null
  metadata:         ContractMetadata
  notes_internal:   string | null
  generated_at:     string | null
  deleted_at:       string | null
  created_at:       string
  updated_at:       string
  // Join opcional
  client?:          Client | null
}

// ─── Metadata (JSONB) ───────────────────────────────────────────────────────
//
// Estrutura do snapshot: valores usados para renderizar + campos faltantes +
// overrides manuais. Permite regenerar o contrato sem refazer todo o fluxo.

export interface ContractMetadata {
  /** Versão do schema de metadata (para migração futura) */
  version?: 1
  /** Valores resolvidos (chave = placeholder, valor = string interpolada) */
  values?: Record<string, string>
  /** Placeholders ainda não preenchidos */
  missing?: string[]
  /** Overrides do usuário (têm precedência sobre resolver automático) */
  overrides?: Record<string, string>
  /** Origem snapshotada (para debug/auditoria) */
  origin_snapshot?: {
    kind:  ContractOriginKind | null
    id:    string | null
    label: string | null
  }
}

// ─── Contexto para renderização ─────────────────────────────────────────────
//
// Montado pelo resolver a partir das fontes (cliente, workspace, origem).
// Não é persistido — é só o input para o renderer.

export interface ContractContext {
  contractType: ContractType
  /** Todos os valores conhecidos — chave = placeholder do template */
  values: Record<string, string>
  /** Origem ou informação de rastreio (UI mostra "vindo de…") */
  sourceLabels: Record<string, string>
  /** Placeholders esperados pelo template que ainda não têm valor */
  missing: string[]
}

// ─── Resultado do render ────────────────────────────────────────────────────

export interface RenderedContract {
  markdown: string
  missing: string[]
  /** Placeholders que continuaram como {{…}} porque valor veio vazio */
  unresolved: string[]
}

// ─── Catálogo (metadata do tipo) ────────────────────────────────────────────

export interface ContractTypeMeta {
  id:       ContractType
  title:    string
  audience: 'pf' | 'pj' | 'any'
  summary:  string
  /** Placeholders obrigatórios (sem eles, contrato não é "generated") */
  required: string[]
  /** Todos os placeholders que o template usa */
  placeholders: string[]
  /** Origens que naturalmente sugerem este tipo */
  suggestedOrigins: ContractOriginKind[]
}

// ─── Retornos das Server Actions ────────────────────────────────────────────

export type ContractActionResult =
  | { success: true; data: Contract }
  | { success: false; message: string }

export type ContractListResult =
  | { success: true; data: Contract[] }
  | { success: false; message: string }
