/**
 * Slugify simples pt-BR: remove acentos, baixa caixa, troca não-alfanum por '-',
 * colapsa duplicados, corta limites. Idempotente.
 */
export function slugify(raw: string): string {
  if (!raw) return ''
  const nfd = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return nfd
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}
