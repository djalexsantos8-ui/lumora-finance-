'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { createContractFromOrigin } from '@/lib/actions/contracts'
import { CONTRACT_TYPES_LIST, suggestContractTypes } from '@/lib/contracts/catalog'
import type { Contract, ContractOriginKind, ContractStatus } from '@/types/contract'

// ─── ContractEntryPoint ─────────────────────────────────────────────────────
//
// Bloco reutilizável que vive no rodapé de cada entidade operacional
// (orçamento, freelance, pedido, receita recorrente). Responsabilidades:
//   1. Listar contratos JÁ vinculados à entidade (vínculo reverso)
//   2. Oferecer botão "Gerar contrato" que:
//        · sugere tipos com base em hints (segmento/categoria)
//        · cria via createContractFromOrigin
//        · navega direto pro Builder /contracts/[id]
//
// Padrão de uso:
//   <ContractEntryPoint
//     originKind="budget"
//     originId={budget.id}
//     contracts={linkedContracts}
//     hints={{ segment: client?.segment, category: null }}
//   />

interface Props {
  originKind: ContractOriginKind
  originId:   string
  contracts:  Contract[]
  hints?:     { segment?: string | null; category?: string | null }
  /** Compacto (sidebar) ou largo (card principal). Default: card largo. */
  compact?:   boolean
}

const STATUS_COLORS: Record<ContractStatus, string> = {
  draft:     'bg-[#2a2a2a] text-[#a3a3a3]',
  generated: 'bg-[#D4A853]/10 text-[#E8C47A]',
  reviewed:  'bg-emerald-500/10 text-emerald-400',
  signed:    'bg-sky-500/10 text-sky-400',
  cancelled: 'bg-red-500/10 text-red-400',
}

const STATUS_LABELS: Record<ContractStatus, string> = {
  draft:     'Rascunho',
  generated: 'Gerado',
  reviewed:  'Revisado',
  signed:    'Assinado',
  cancelled: 'Cancelado',
}

export function ContractEntryPoint({ originKind, originId, contracts, hints, compact }: Props) {
  const router = useRouter()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Defesa: se `contracts` vier undefined/null (por qualquer razão),
  // trata como lista vazia ao invés de quebrar o render.
  const safeContracts = Array.isArray(contracts) ? contracts : []

  const suggestedIds = useMemo(
    () => new Set(suggestContractTypes(originKind, hints)),
    [originKind, hints]
  )

  // Ordena tipos: sugeridos primeiro
  const orderedCatalog = useMemo(() => {
    return [...CONTRACT_TYPES_LIST].sort((a, b) => {
      const aS = suggestedIds.has(a.id) ? 0 : 1
      const bS = suggestedIds.has(b.id) ? 0 : 1
      if (aS !== bS) return aS - bS
      return a.title.localeCompare(b.title)
    })
  }, [suggestedIds])

  function handleCreate(typeId: string) {
    startTransition(async () => {
      const res = await createContractFromOrigin({
        contractType: typeId as never,
        originKind,
        originId,
      })
      if (res.success) {
        toast.success('Contrato criado.')
        router.push(`/contracts/${res.data.id}`)
      } else {
        toast.error(res.message || 'Erro ao criar contrato.')
      }
    })
  }

  // Fase 3 (2026-04-22): padrão visual alinhado com as outras boxes das
  // páginas de Freelance/Pedido/Receita Recorrente:
  //   · `border-[#2a2a2a]` (não `#1c1c1c`) para bater com siblings
  //   · `rounded-2xl` + `p-5` (não `rounded-xl` + `p-4`) para ritmo vertical igual
  //   · título com mesma classe das outras seções (`text-sm font-semibold text-white`)
  // `compact` continua disponível para casos onde queremos o card menor
  // (sidebar, listas densas), mantendo retrocompatibilidade.
  return (
    <section
      className={`bg-[#141414] border border-[#2a2a2a] ${
        compact ? 'rounded-xl p-3' : 'rounded-2xl p-5'
      }`}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className={compact
            ? 'text-xs font-semibold text-[#a3a3a3] uppercase tracking-wider'
            : 'text-sm font-semibold text-white'}>
            Contratos
          </h3>
          <p className="text-[10px] text-[#525252] mt-0.5">
            {safeContracts.length === 0
              ? 'Nenhum contrato vinculado ainda'
              : `${safeContracts.length} contrato${safeContracts.length !== 1 ? 's' : ''} vinculado${safeContracts.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          onClick={() => setPickerOpen(true)}
          disabled={isPending}
          className="flex items-center gap-1.5 text-xs font-semibold bg-[#D4A853]/10 hover:bg-[#D4A853]/20 text-[#E8C47A] border border-[#D4A853]/20 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Gerar contrato
        </button>
      </div>

      {/* Lista de contratos vinculados */}
      {safeContracts.length > 0 && (
        <div className="space-y-1.5">
          {safeContracts.map(c => (
            <Link
              key={c.id}
              href={`/contracts/${c.id}`}
              className="flex items-center justify-between gap-3 bg-[#0f0f0f] border border-[#1f1f1f] hover:border-[#2a2a2a] rounded-lg px-3 py-2 transition-colors group"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white truncate font-medium">
                  {c.title || 'Contrato sem título'}
                </p>
                <p className="text-[10px] text-[#525252]">
                  {c.created_at ? new Date(c.created_at).toLocaleDateString('pt-BR') : '—'}
                </p>
              </div>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLORS[c.status] ?? STATUS_COLORS.draft}`}>
                {STATUS_LABELS[c.status] ?? 'Rascunho'}
              </span>
              <svg
                className="w-3.5 h-3.5 text-[#525252] group-hover:text-[#a3a3a3] transition-colors shrink-0"
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ))}
        </div>
      )}

      {/* ── Modal de picker ───────────────────────────────────────────────── */}
      {pickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setPickerOpen(false)}
        >
          <div
            className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-5 max-w-2xl w-full max-h-[80vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">Escolha o tipo de contrato</h3>
              <button
                onClick={() => setPickerOpen(false)}
                className="text-[#737373] hover:text-white text-xl leading-none"
              >
                ×
              </button>
            </div>
            <p className="text-xs text-[#a3a3a3] mb-4">
              Os tipos sugeridos (•) foram inferidos a partir da origem.
              Dados do cliente, da empresa e da entidade serão preenchidos
              automaticamente.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {orderedCatalog.map(t => {
                const isSuggested = suggestedIds.has(t.id)
                return (
                  <button
                    key={t.id}
                    onClick={() => handleCreate(t.id)}
                    disabled={isPending}
                    className={`text-left bg-[#0f0f0f] hover:bg-[#181818] border rounded-xl p-3 transition-colors disabled:opacity-50 ${
                      isSuggested
                        ? 'border-[#D4A853]/30 hover:border-[#D4A853]/50'
                        : 'border-[#1f1f1f] hover:border-[#2a2a2a]'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {isSuggested && <span className="text-[#D4A853] text-sm leading-none">•</span>}
                      <span className="text-sm font-semibold text-white">{t.title}</span>
                      <span className="text-[9px] uppercase tracking-wider text-[#525252] ml-auto">
                        {t.audience === 'pf' ? 'PF' : t.audience === 'pj' ? 'PJ' : 'PF/PJ'}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#737373] leading-relaxed line-clamp-2">
                      {t.summary}
                    </p>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
