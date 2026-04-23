/**
 * src/lib/utils/masks.ts
 *
 * Máscaras de formulário usadas em inputs controlados. Todas seguem o
 * mesmo padrão:
 *
 *   1. Aceitam texto bruto (inclusive colado já formatado com pontuação)
 *   2. Normalizam para dígitos
 *   3. Retornam string formatada ou vazia
 *   4. São idempotentes: `mask(mask(x)) === mask(x)`
 *
 * Padrão de uso no onChange:
 *
 *   <input value={cnpj} onChange={e => setCnpj(maskCNPJ(e.target.value))} />
 *
 * NÃO validam matematicamente (digito verificador) — apenas formatam.
 * Validação real mora em libs dedicadas se precisar.
 */

// ─── helpers ─────────────────────────────────────────────────────────────────

function onlyDigits(raw: string): string {
  return raw.replace(/\D+/g, '')
}

// ─── CPF / CNPJ ──────────────────────────────────────────────────────────────

/** Formata CPF: 000.000.000-00 (11 dígitos). Aceita texto colado. */
export function maskCPF(raw: string): string {
  const d = onlyDigits(raw).slice(0, 11)
  if (d.length <= 3)  return d
  if (d.length <= 6)  return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9)  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`
}

/** Formata CNPJ: 00.000.000/0000-00 (14 dígitos). Aceita texto colado. */
export function maskCNPJ(raw: string): string {
  const d = onlyDigits(raw).slice(0, 14)
  if (d.length <= 2)  return d
  if (d.length <= 5)  return `${d.slice(0, 2)}.${d.slice(2)}`
  if (d.length <= 8)  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`
}

/**
 * Auto-detecta CPF ou CNPJ pelo número de dígitos. Útil em campos "documento"
 * que aceitam qualquer um dos dois.
 */
export function maskCPForCNPJ(raw: string): string {
  const d = onlyDigits(raw)
  return d.length > 11 ? maskCNPJ(raw) : maskCPF(raw)
}

// ─── Telefone BR ─────────────────────────────────────────────────────────────

/**
 * Formata telefone brasileiro:
 *  · 10 dígitos → (11) 1234-5678  (fixo)
 *  · 11 dígitos → (11) 91234-5678 (celular, 9 na frente)
 * Aceita até 11 dígitos. Texto adicional é descartado.
 */
export function maskPhoneBR(raw: string): string {
  const d = onlyDigits(raw).slice(0, 11)
  if (d.length === 0) return ''
  if (d.length <= 2)  return `(${d}`
  if (d.length <= 6)  return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

// ─── CEP ─────────────────────────────────────────────────────────────────────

/** Formata CEP brasileiro: 00000-000 (8 dígitos). */
export function maskCEP(raw: string): string {
  const d = onlyDigits(raw).slice(0, 8)
  if (d.length <= 5) return d
  return `${d.slice(0, 5)}-${d.slice(5)}`
}

// ─── UF ──────────────────────────────────────────────────────────────────────

/** Sigla de estado em 2 letras maiúsculas. Ex: 'sp' → 'SP'. */
export function maskUF(raw: string): string {
  return raw.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase()
}

// ─── dígitos puros ───────────────────────────────────────────────────────────

/** Exporta o helper interno para casos onde você quer só os dígitos. */
export function stripMask(raw: string): string {
  return onlyDigits(raw)
}
