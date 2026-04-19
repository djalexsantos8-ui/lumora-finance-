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
