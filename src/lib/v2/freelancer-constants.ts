/**
 * EPIC-21 — Constantes do cadastro de freelancer audiovisual.
 *
 * Listas curated cobrindo o mercado audiovisual brasileiro.
 * Adições futuras via release (não há tabela DB pra simplicidade).
 */

export const FUNCOES_PRINCIPAIS: { value: string; label: string; icon: string }[] = [
  { value: 'camera_op',   label: 'Operador de Câmera',     icon: '🎥' },
  { value: 'dop',         label: 'Diretor de Foto (DoP)',  icon: '👁️' },
  { value: 'assistant',   label: 'Assistente',             icon: '🛠️' },
  { value: 'editor',      label: 'Editor',                 icon: '✂️' },
  { value: 'colorist',    label: 'Colorista',              icon: '🎨' },
  { value: 'drone_pilot', label: 'Drone Pilot',            icon: '🚁' },
  { value: 'gaffer',      label: 'Gaffer (Iluminação)',    icon: '💡' },
  { value: 'sound',       label: 'Som Direto',             icon: '🎙️' },
  { value: 'producer',    label: 'Produtor(a)',            icon: '📋' },
  { value: 'director',    label: 'Diretor(a)',             icon: '🎬' },
  { value: 'makeup',      label: 'Maquiagem',              icon: '💄' },
  { value: 'styling',     label: 'Figurino',               icon: '👔' },
  { value: 'driver',      label: 'Motorista',              icon: '🚗' },
  { value: 'catering',    label: 'Catering',               icon: '🍽️' },
  { value: 'other',       label: 'Outros',                 icon: '🔧' },
]

export const RESTRICOES_ALIMENTARES: { value: string; label: string }[] = [
  { value: 'sem_restricao', label: 'Sem restrição' },
  { value: 'vegetariano',   label: 'Vegetariano' },
  { value: 'vegano',        label: 'Vegano' },
  { value: 'lactose',       label: 'Intolerância à lactose' },
  { value: 'gluten',        label: 'Intolerância ao glúten' },
  { value: 'kosher',        label: 'Kosher' },
  { value: 'halal',         label: 'Halal' },
  { value: 'outro',         label: 'Outro (descrever)' },
]

export const DISPONIBILIDADES: { value: string; label: string }[] = [
  { value: 'weekdays',    label: 'Dias úteis' },
  { value: 'weekends',    label: 'Fim de semana' },
  { value: 'flex',        label: 'Flexível' },
  { value: 'unavailable', label: 'Indisponível no momento' },
]

export function funcaoLabel(value: string | null | undefined): { icon: string; label: string } {
  const f = FUNCOES_PRINCIPAIS.find((x) => x.value === value)
  return f ?? { icon: '🔧', label: value ?? '—' }
}

export function disponibilidadeLabel(value: string | null | undefined): string {
  if (!value) return '—'
  return DISPONIBILIDADES.find((x) => x.value === value)?.label ?? value
}

export function restricaoLabel(value: string | null | undefined): string {
  if (!value) return '—'
  return RESTRICOES_ALIMENTARES.find((x) => x.value === value)?.label ?? value
}

export const UFS = [
  'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI',
  'PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO',
]
