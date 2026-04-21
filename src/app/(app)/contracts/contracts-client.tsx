'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { createStandaloneContract } from '@/lib/actions/contracts'
import type { Contract, ContractStatus, ContractTypeMeta } from '@/types/contract'

// ─── Contract Hub ────────────────────────────────────────────────────────────
//
// Lista contratos persistidos + permite criar standalone a partir do catálogo.
// Contratos criados a partir de entidades (budget, job, order, recurring)
// entram aqui automaticamente.

interface Props {
  contracts: Contract[]
  catalog:   ContractTypeMeta[]
}

const STATUS_LABELS: Record<ContractStatus, { label: string; cls: string }> = {
  draft:     { label: 'Rascunho',  cls: 'bg-[#2a2a2a] text-[#a3a3a3] border-[#2a2a2a]' },
  generated: { label: 'Gerado',    cls: 'bg-[#D4A853]/10 text-[#E8C47A] border-[#D4A853]/20' },
  reviewed:  { label: 'Revisado',  cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  signed:    { label: 'Assinado',  cls: 'bg-sky-500/10 text-sky-400 border-sky-500/20' },
  cancelled: { label: 'Cancelado', cls: 'bg-red-500/10 text-red-400 border-red-500/20' },
}

const ORIGIN_LABELS: Record<string, string> = {
  budget:     'Orçamento',
  freelance:  'Freelance',
  order:      'Pedido',
  recurring:  'Recorrente',
  standalone: 'Avulso',
}

export default function ContractsClient({ contracts, catalog }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [filterStatus, setFilterStatus] = useState<ContractStatus | 'all'>('all')

  const filtered = useMemo(() => {
    if (filterStatus === 'all') return contracts
    return contracts.filter(c => c.status === filterStatus)
  }, [contracts, filterStatus])

  function handleCreateStandalone(typeId: ContractTypeMeta['id']) {
    startTransition(async () => {
      const res = await createStandaloneContract(typeId)
      if (res.success) {
        router.push(`/contracts/${res.data.id}`)
      } else {
        toast.error(res.message || 'Não foi possível criar o contrato.')
      }
    })
  }

  return (
    <div className="min-h-full">
      {/* ─── Header ────────────────────────────────────────────────────── */}
      <div className="border-b border-[#1a1a1a] px-6 md:px-8 py-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold text-white">Contratos</h1>
            <p className="text-xs text-[#a3a3a3] mt-0.5 max-w-2xl">
              Gere contratos vinculados aos seus orçamentos, freelances, pedidos e receitas recorrentes.
              Os dados do cliente e da sua empresa são preenchidos automaticamente.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="text-xs font-semibold bg-[#D4A853] hover:bg-[#E8C47A] text-[#0a0a0a] px-3.5 py-2 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Novo contrato
          </button>
        </div>
      </div>

      {/* ─── Disclaimer (discreto, já que fluxo é integrado) ──────────── */}
      <div className="mx-6 md:mx-8 mt-5 bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 flex items-start gap-2.5">
        <svg className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <p className="text-[11px] text-amber-200/90 leading-relaxed">
          Os contratos gerados aqui usam modelos padrão do mercado brasileiro como ponto de partida.
          <strong className="text-amber-300"> Revise com um advogado</strong> antes de assinar contratos de valor alto ou B2B complexo.
        </p>
      </div>

      {/* ─── Filtros ──────────────────────────────────────────────────── */}
      <div className="px-6 md:px-8 mt-5 flex items-center gap-2 flex-wrap">
        {(['all', 'draft', 'generated', 'reviewed', 'signed', 'cancelled'] as const).map(s => {
          const active = s === filterStatus
          const label = s === 'all' ? 'Todos' : STATUS_LABELS[s].label
          const count = s === 'all' ? contracts.length : contracts.filter(c => c.status === s).length
          return (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                active
                  ? 'bg-[#D4A853]/10 border-[#D4A853]/50 text-[#D4A853]'
                  : 'bg-[#0a0a0a] border-[#2a2a2a] text-[#a3a3a3] hover:text-white hover:border-[#3a3a3a]'
              }`}
            >
              {label} <span className="opacity-60">· {count}</span>
            </button>
          )
        })}
      </div>

      {/* ─── Lista de contratos ──────────────────────────────────────── */}
      <div className="p-6 md:p-8">
        {filtered.length === 0 ? (
          <EmptyState onNew={() => setPickerOpen(true)} />
        ) : (
          <div className="bg-[#141414] border border-[#2a2a2a] rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2a2a2a] text-[10px] font-semibold text-[#737373] uppercase tracking-wider">
                  <th className="text-left px-4 py-3">Contrato</th>
                  <th className="text-left px-4 py-3 hidden md:table-cell">Origem</th>
                  <th className="text-left px-4 py-3 hidden lg:table-cell">Cliente</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3 hidden md:table-cell">Criado</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr
                    key={c.id}
                    className="border-b border-[#1a1a1a] last:border-b-0 hover:bg-[#1a1a1a] cursor-pointer transition-colors"
                    onClick={() => router.push(`/contracts/${c.id}`)}
                  >
                    <td className="px-4 py-3">
                      <div className="text-sm text-white font-medium">{c.title}</div>
                      <div className="text-[11px] text-[#525252] mt-0.5">
                        {catalog.find(k => k.id === c.contract_type)?.title || c.contract_type}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-xs text-[#a3a3a3]">
                        {c.origin_kind ? ORIGIN_LABELS[c.origin_kind] : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-xs text-[#a3a3a3]">
                        {c.client?.name || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_LABELS[c.status].cls}`}>
                        {STATUS_LABELS[c.status].label}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-xs text-[#525252]">
                        {new Date(c.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── Picker modal ─────────────────────────────────────────────── */}
      {pickerOpen && (
        <TypePickerModal
          catalog={catalog}
          onClose={() => setPickerOpen(false)}
          onPick={handleCreateStandalone}
          isPending={isPending}
        />
      )}
    </div>
  )
}

// ─── Empty state ─────────────────────────────────────────────────────────

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="bg-[#141414] border border-dashed border-[#2a2a2a] rounded-2xl p-10 text-center">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#1c1c1c] border border-[#2a2a2a] mb-4">
        <svg className="w-5 h-5 text-[#525252]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>
      <h3 className="text-sm font-semibold text-white mb-1">Nenhum contrato ainda</h3>
      <p className="text-xs text-[#a3a3a3] max-w-md mx-auto leading-relaxed mb-4">
        Crie contratos a partir de um <strong>orçamento</strong>, <strong>freelance</strong>, <strong>pedido</strong> ou{' '}
        <strong>receita recorrente</strong> — o sistema preenche automaticamente o máximo que puder.
        Ou comece do zero com um modelo em branco.
      </p>
      <button
        type="button"
        onClick={onNew}
        className="text-xs font-semibold bg-[#D4A853] hover:bg-[#E8C47A] text-[#0a0a0a] px-3.5 py-2 rounded-lg transition-colors"
      >
        Criar primeiro contrato
      </button>
    </div>
  )
}

// ─── Modal: picker de tipo para criação standalone ─────────────────────

function TypePickerModal({
  catalog,
  onClose,
  onPick,
  isPending,
}: {
  catalog:   ContractTypeMeta[]
  onClose:   () => void
  onPick:    (id: ContractTypeMeta['id']) => void
  isPending: boolean
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start md:items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-[#141414] border border-[#2a2a2a] rounded-2xl w-full max-w-3xl my-8 flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-[#1a1a1a] shrink-0">
          <div>
            <h2 className="text-base font-semibold text-white">Qual tipo de contrato você precisa?</h2>
            <p className="text-xs text-[#a3a3a3] mt-0.5">
              Escolha o modelo mais próximo. Você poderá editar tudo depois.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[#525252] hover:text-white transition-colors p-1"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {catalog.map(t => (
              <button
                key={t.id}
                disabled={isPending}
                onClick={() => onPick(t.id)}
                className="text-left bg-[#0a0a0a] border border-[#2a2a2a] hover:border-[#D4A853]/40 rounded-xl p-4 transition-colors disabled:opacity-50"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="text-sm font-semibold text-white leading-snug">{t.title}</h3>
                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full border bg-[#1c1c1c] text-[#a3a3a3] border-[#2a2a2a] shrink-0">
                    {t.audience === 'any' ? 'PF/PJ' : t.audience.toUpperCase()}
                  </span>
                </div>
                <p className="text-xs text-[#a3a3a3] leading-relaxed">{t.summary}</p>
              </button>
            ))}
          </div>

          <div className="mt-4 bg-[#1c1c1c] border border-[#2a2a2a] rounded-xl p-3">
            <p className="text-[11px] text-[#a3a3a3] leading-relaxed">
              <strong className="text-white">Dica:</strong> se o contrato nasce de um orçamento, freelance, pedido ou
              receita recorrente, cria ele de dentro da entidade — você não precisa preencher nada de novo.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#1a1a1a] shrink-0">
          <Link
            href="/budgets"
            className="text-xs text-[#a3a3a3] hover:text-white transition-colors"
          >
            Ir para Orçamentos
          </Link>
        </div>
      </div>
    </div>
  )
}
