// ─── Dashboard Executivo · Helpers de Tom ────────────────────────────────────
//
// Mapeia Tom (positivo/atencao/critico) → classes Tailwind.
// Single source of truth pra cor — UI nunca decide cor por cenário, só consulta.
//
// Paleta alinhada com dashboard legado (#141414 / #2a2a2a / gold #D4A853).

import type { Tom } from '@/lib/dashboard/narrativa/types'

export interface TomClasses {
  /** Borda sutil do card (1px) */
  border:     string
  /** Background suave — tinge o card sem gritar */
  bgSoft:     string
  /** Background sólido — usado em pills/badges */
  bgSolid:    string
  /** Texto colorido pra tese/número em destaque */
  text:       string
  /** Texto sobre bg sólido (pill) */
  textOnBg:   string
  /** Barra lateral de accent (4px) */
  accent:     string
  /** Dot de 8px pra lista (antes do item) */
  dot:        string
  /** Label ("Tudo bem" / "Atenção" / "Crítico") */
  label:      string
}

export const TOM_STYLE: Record<Tom, TomClasses> = {
  positivo: {
    border:   'border-emerald-500/30',
    bgSoft:   'bg-emerald-500/5',
    bgSolid:  'bg-emerald-500/15',
    text:     'text-emerald-400',
    textOnBg: 'text-emerald-300',
    accent:   'bg-emerald-500',
    dot:      'bg-emerald-400',
    label:    'Saudável',
  },
  atencao: {
    border:   'border-[#D4A853]/40',
    bgSoft:   'bg-[#D4A853]/5',
    bgSolid:  'bg-[#D4A853]/15',
    text:     'text-[#D4A853]',
    textOnBg: 'text-[#E5B96A]',
    accent:   'bg-[#D4A853]',
    dot:      'bg-[#D4A853]',
    label:    'Atenção',
  },
  critico: {
    border:   'border-red-500/40',
    bgSoft:   'bg-red-500/5',
    bgSolid:  'bg-red-500/15',
    text:     'text-red-400',
    textOnBg: 'text-red-300',
    accent:   'bg-red-500',
    dot:      'bg-red-400',
    label:    'Crítico',
  },
}

/** Helper curto pra componente pegar só o que precisa. */
export function tomStyle(tom: Tom): TomClasses {
  return TOM_STYLE[tom]
}
