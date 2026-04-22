import type { FreelancerRole } from '@/types/freelancer'

// ─── Datas ────────────────────────────────────────────────────────────────────

/** Retorna a data de hoje como string YYYY-MM-DD no fuso local (sem bug de UTC). */
export function todayISO(): string {
  return new Date().toLocaleDateString('en-CA')
}

/** Formata ISO YYYY-MM-DD → DD/MM/YYYY. Retorna '—' para valores nulos. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

/** Formata ISO YYYY-MM-DD → DD/Mês abreviado (ex: 15/Abr). */
export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [, m, d] = iso.split('-')
  const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${d}/${months[parseInt(m, 10) - 1]}`
}

const MONTHS_LOWER = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']

/** Formata ISO YYYY-MM-DD → "10 abr" (minúsculo, sem barra). Retorna '' para nulos. */
function shortDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const [, m, d] = iso.split('-')
  return `${parseInt(d, 10)} ${MONTHS_LOWER[parseInt(m, 10) - 1]}`
}

/**
 * Formata a data de exibição de um job nos cards da listagem.
 *
 * - Job simples (is_multi_day = false): "10 abr"
 * - Job multi-day com fim:              "10 abr → 15 abr"
 * - Job multi-day sem fim (aberto):     "desde 10 abr"
 * - Sem data: ""
 */
export function formatJobDateRange(job: {
  is_multi_day:   boolean
  job_date:       string | null
  job_date_start: string | null
  job_date_end:   string | null
}): string {
  if (!job.is_multi_day) {
    return shortDate(job.job_date)
  }

  const start = shortDate(job.job_date_start)
  if (!start) return ''

  if (job.job_date_end) {
    const end = shortDate(job.job_date_end)
    return `${start} → ${end}`
  }

  return `desde ${start}`
}

// ─── Moeda ────────────────────────────────────────────────────────────────────

/**
 * Moedas sem casas decimais (ISO 4217 "minor unit = 0").
 * JPY (iene) é o caso mais comum no nosso produto. Outros exemplos:
 * KRW, VND, CLP, ISK, HUF (parcialmente). Lista conservadora por ora.
 */
const ZERO_DECIMAL_CURRENCIES = new Set<string>([
  'JPY', // Iene japonês
])

/**
 * Retorna quantas casas decimais uma moeda usa.
 * Default: 2. JPY: 0. Centraliza a regra para evitar hardcode de `toFixed(2)`
 * ou `minimumFractionDigits: 2` espalhado pelo código.
 */
export function getCurrencyDecimals(currency: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency) ? 0 : 2
}

/**
 * Coerce para number defensivo. PostgREST retorna `numeric` como STRING
 * ("1900.00"), então qualquer cálculo que use `budget.total` direto pode
 * falhar silenciosamente. Use isso onde precisar operar com valores numéricos
 * de linhas do banco.
 *
 * Retorna 0 (não NaN) pra não quebrar cadeias com `.toFixed()`, ">", etc.
 */
export function toNumberSafe(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

// Formata valor monetário com moeda. Respeita moedas sem centavos (JPY).
// Aceita number | string | null — PostgREST retorna numeric como string.
export function formatCurrency(
  value: number | string | null | undefined,
  currency = 'BRL',
): string {
  if (value === null || value === undefined || value === '') return '—'
  const num = toNumberSafe(value)
  const cur = (currency && typeof currency === 'string' ? currency : 'BRL').toUpperCase()
  const digits = getCurrencyDecimals(cur)
  try {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: cur,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(num)
  } catch {
    // Fallback: símbolo + valor formatado sem Intl. Nunca chama .toFixed
    // em string (evita TypeError com numeric strings do Supabase).
    return `${cur} ${num.toFixed(digits)}`
  }
}

// Rótulos PT-BR para as funções do audiovisual
export const FREELANCER_ROLE_LABELS: Record<FreelancerRole, string> = {
  cinematographer: 'Cinegrafista',
  photographer: 'Fotógrafo(a)',
  editor: 'Editor(a)',
  colorist: 'Colorista',
  art_director: 'Diretor(a) de Arte',
  producer: 'Produtor(a)',
  production_assistant: 'Assistente de Produção',
  motion_designer: 'Motion Designer',
  sound_designer: 'Sound Designer',
  drone_pilot: 'Piloto de Drone',
  camera_assistant: 'Assistente de Câmera',
  gaffer: 'Iluminador / Gaffer',
  other: 'Outro',
}

export const FREELANCER_ROLES = Object.entries(FREELANCER_ROLE_LABELS) as [
  FreelancerRole,
  string,
][]

// Moedas suportadas
export const SUPPORTED_CURRENCIES = [
  { code: 'BRL', label: 'R$ — Real Brasileiro' },
  { code: 'USD', label: '$ — Dólar Americano' },
  { code: 'EUR', label: '€ — Euro' },
  { code: 'PYG', label: '₲ — Guarani' },
  { code: 'JPY', label: '¥ — Iene Japonês' },
  { code: 'CNY', label: 'CN¥ — Yuan Chinês' },
]

/**
 * Símbolo curto de cada moeda — usado como prefixo em inputs e ícones.
 * NOTA: JPY e CNY compartilham o símbolo "¥". Em contextos ambíguos (ex:
 * dashboard com múltiplas moedas), preferimos mostrar o código ISO ao lado.
 */
export const CURRENCY_SYMBOLS: Record<string, string> = {
  BRL: 'R$',
  USD: 'US$',
  EUR: '€',
  GBP: '£',
  PYG: '₲',
  JPY: '¥',
  CNY: 'CN¥',
}

/** Retorna o símbolo curto; fallback para o próprio código ISO. */
export function getCurrencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency] ?? currency
}

// ─── Budget ──────────────────────────────────────────────────────────────────

export const BUDGET_STATUS_LABELS: Record<string, string> = {
  draft:    'Rascunho',
  sent:     'Enviado',
  approved: 'Aprovado',
  rejected: 'Rejeitado',
  expired:  'Expirado',
}

/**
 * Ações de status do orçamento, classificadas por intenção visual.
 *
 * `primary` → botão destacado (ação positiva de avanço)
 * `secondary` → botão discreto (ação negativa ou reversão)
 *
 * A tela de edição do orçamento usa essa lista para renderizar botões
 * VISÍVEIS no header — nada mais escondido em menu "…".
 */
export type BudgetAction = {
  label:   string
  next:    string
  variant: 'primary' | 'secondary'
}

export const BUDGET_STATUS_NEXT_ACTIONS: Record<string, BudgetAction[]> = {
  draft:    [
    { label: 'Marcar como Enviado', next: 'sent',     variant: 'primary'   },
  ],
  sent:     [
    { label: 'Aprovar',             next: 'approved', variant: 'primary'   },
    { label: 'Rejeitar',            next: 'rejected', variant: 'secondary' },
  ],
  approved: [
    { label: 'Reabrir como Rascunho', next: 'draft',  variant: 'secondary' },
  ],
  rejected: [
    { label: 'Reabrir como Rascunho', next: 'draft',  variant: 'primary'   },
  ],
  expired:  [
    { label: 'Reabrir como Rascunho', next: 'draft',  variant: 'primary'   },
  ],
}

export const BUDGET_ITEM_CATEGORY_LABELS: Record<string, string> = {
  team:          'Equipe',
  food:          'Alimentação',
  transport:     'Transporte',
  accommodation: 'Hospedagem',
  equipment:     'Equipamentos',
  own_work:      'Trabalho Próprio',
  other:         'Outros',
}

export const BUDGET_ITEM_CATEGORIES = [
  ['team',          'Equipe'],
  ['equipment',     'Equipamentos'],
  ['transport',     'Transporte'],
  ['accommodation', 'Hospedagem'],
  ['food',          'Alimentação'],
  ['own_work',      'Trabalho Próprio'],
  ['other',         'Outros'],
] as const
