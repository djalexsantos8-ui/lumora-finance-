/**
 * Canonical list of client segments for creative service businesses.
 *
 * Used across budgets, orders, freelances, recurring revenue.
 * Single source of truth.
 *
 * Organized by vertical to help users pick.
 */

export const CLIENT_SEGMENTS = [
  // Eventos & pessoas
  'Casamento',
  'Ensaio / família',
  'Aniversário / festa',
  'Formatura',
  'Evento corporativo',
  'Evento cultural',
  'Evento esportivo',
  'Religioso',

  // Marcas & comércio
  'E-commerce',
  'Varejo / loja',
  'Moda',
  'Beleza',
  'Estética',
  'Cosmético',

  // Gastronomia & hotelaria
  'Restaurante',
  'Bar',
  'Gastronomia',
  'Hotel / pousada',

  // Saúde
  'Clínica',
  'Médico / dentista',
  'Wellness',

  // Imóveis & arquitetura
  'Imobiliário',
  'Construtora',
  'Arquitetura',
  'Interior design',
  'Paisagismo',

  // Pessoa & branding
  'Marca pessoal',
  'Influencer',
  'Artista / músico',
  'Autor / infoprodutor',

  // B2B / tech
  'Agência',
  'Produtora',
  'Startup',
  'SaaS / tech',
  'Mercado Financeiro',
  'Industrial',
  'Automotivo',

  // Educação & institucional
  'Educação',
  'Escola / curso',
  'ONG / institucional',
  'Governo',

  // Outros
  'Esporte / fitness',
  'Turismo',
  'Agro',
  'Outro',
] as const

export type ClientSegment = (typeof CLIENT_SEGMENTS)[number]
