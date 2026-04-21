// ─── TabNav · Navegação das 7 abas ──────────────────────────────────────────
//
// Pills horizontais. Ativa em gold (#D4A853), inativa em cinza.
// Scroll horizontal em mobile — não quebra linha.

'use client'

export type AbaKey =
  | 'visao_geral'
  | 'inadimplencia'
  | 'receita'
  | 'custos'
  | 'clientes'
  | 'diagnostico'
  | 'conclusao'

export const ABA_LABELS: Record<AbaKey, string> = {
  visao_geral:   'Visão Geral',
  inadimplencia: 'Inadimplência',
  receita:       'Receita',
  custos:        'Custos',
  clientes:      'Clientes',
  diagnostico:   'Diagnóstico',
  conclusao:     'Dashboard',
}

export const ABA_ORDER: AbaKey[] = [
  'visao_geral',
  'inadimplencia',
  'receita',
  'custos',
  'clientes',
  'diagnostico',
  'conclusao',
]

interface Props {
  active:   AbaKey
  onChange: (aba: AbaKey) => void
}

export function TabNav({ active, onChange }: Props) {
  return (
    <nav
      className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin"
      aria-label="Abas do dashboard executivo"
    >
      {ABA_ORDER.map((aba) => {
        const isActive = active === aba
        return (
          <button
            key={aba}
            type="button"
            onClick={() => onChange(aba)}
            className={`shrink-0 rounded-full px-4 py-2 text-xs font-medium transition-colors ${
              isActive
                ? 'bg-[#D4A853] text-[#0a0a0a]'
                : 'bg-[#141414] border border-[#2a2a2a] text-[#a3a3a3] hover:text-white hover:border-[#525252]'
            }`}
          >
            {ABA_LABELS[aba]}
          </button>
        )
      })}
    </nav>
  )
}
