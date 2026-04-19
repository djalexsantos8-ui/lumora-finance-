// ─── Normalização de nome de cliente ─────────────────────────────────────────
//
// Regra única usada em toda a aplicação:
//   · trim
//   · lowercase
//   · remove acentos/diacríticos (NFD + strip combining marks)
//   · colapsa espaços múltiplos
//
// Produz a string usada na coluna clients.name_normalized e na busca fuzzy.
//
// Exemplos:
//   "  João  "     → "joao"
//   "JOÃO"         → "joao"
//   "Ana & Pedro"  → "ana & pedro"
//   "Maria   Eça"  → "maria eca"

export function normalizeName(name: string): string {
  return (name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // combining marks
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * Retorna o nome "display" pronto para persistir:
 * trim + colapso de espaços, mantendo caixa original.
 */
export function cleanName(name: string): string {
  return (name ?? '').trim().replace(/\s+/g, ' ')
}

// ─── Validação de nome de cliente (frontend + backend) ──────────────────────
//
// Regra única usada no quickCreateClient, createClientFull e no ClientField.
// Evita lixo como "a", "1", "12", ".", "-" no banco.
//
// Critério:
//   · Após cleanName: mínimo 2 caracteres
//   · Pelo menos 2 caracteres alfabéticos Unicode (\p{L})
//
// Passa: "Ana", "XP", "SVN", "João", "Alex", "R&R", "A. Silva"
// Bloqueia: "a", "1", "12", "123", ".", "-", "_", "a1", "  "

export type ClientNameInvalidReason =
  | 'empty'
  | 'too_short'
  | 'not_enough_letters'

export interface ClientNameValidation {
  valid:    boolean
  cleaned:  string
  reason?:  ClientNameInvalidReason
  message?: string
}

export function validateClientName(raw: string): ClientNameValidation {
  const cleaned = cleanName(raw)

  if (!cleaned) {
    return {
      valid:   false,
      cleaned,
      reason:  'empty',
      message: 'Digite um nome.',
    }
  }

  if (cleaned.length < 2) {
    return {
      valid:   false,
      cleaned,
      reason:  'too_short',
      message: 'Nome muito curto — use pelo menos 2 caracteres.',
    }
  }

  const letters = cleaned.match(/\p{L}/gu)
  if (!letters || letters.length < 2) {
    return {
      valid:   false,
      cleaned,
      reason:  'not_enough_letters',
      message: 'Use pelo menos 2 letras no nome.',
    }
  }

  return { valid: true, cleaned }
}
