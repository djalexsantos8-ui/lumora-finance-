import type { FreelancerRole } from '@/types/freelancer'

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
