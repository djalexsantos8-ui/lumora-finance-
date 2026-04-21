/**
 * Canonical list of lead sources for creative service businesses
 * (photographers, filmmakers, video producers, social media creatives).
 *
 * Used across budgets, orders, freelances, recurring revenue.
 * Single source of truth — import from here in every tag combobox.
 *
 * Ordering follows real-world frequency for the target audience.
 */

export const LEAD_SOURCES = [
  // Social & digital (maioria do volume)
  'Instagram',
  'WhatsApp',
  'TikTok',
  'YouTube',
  'LinkedIn',
  'Facebook',
  'Pinterest',
  'Behance',

  // Busca & site
  'Google',
  'Site próprio',
  'Portfolio online',

  // Relacionamento (alto valor)
  'Indicação',
  'Cliente recorrente',
  'Indicação de fornecedor',
  'Indicação de agência',
  'Ex-cliente voltou',

  // Parceria
  'Parceria com agência',
  'Parceria com produtora',
  'Parceria com cerimonial',
  'Parceria com fotógrafo',
  'Parceria com DJ',

  // Eventos & comunidade
  'Evento presencial',
  'Feira / expo',
  'Networking',
  'Grupo de WhatsApp',
  'Grupo de Telegram',
  'Comunidade online',

  // Outbound
  'E-mail frio',
  'Prospecção ativa',
  'DM fria',

  // Outros
  'Outro',
] as const

export type LeadSource = (typeof LEAD_SOURCES)[number]
