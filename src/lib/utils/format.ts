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

// Formata valor monetário com moeda
export function formatCurrency(value: number | null, currency = 'BRL'): string {
  if (value === null || value === undefined) return '—'
  try {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${currency} ${value.toFixed(2)}`
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
]

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
