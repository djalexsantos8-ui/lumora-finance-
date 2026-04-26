import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { fmtBRL } from '@/lib/v2/budget-calc'

export const dynamic = 'force-dynamic'

/**
 * Lista de orçamentos V2 do workspace ativo.
 *
 * Auth + isV2Allowed já garantido pelo layout em src/app/v2/layout.tsx.
 */
export default async function BudgetsV2ListPage() {
  const supabase = await createClient()

  const { data: budgets } = await supabase
    .from('budgets_v2')
    .select('id, number, name, status, total, total_cost, start_date, created_at, client_id')
    .order('created_at', { ascending: false })
    .limit(100)

  const list = budgets ?? []

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Orçamentos</h1>
          <p className="text-sm text-[#737373]">
            Custo separado de Valor — você vê o lucro real enquanto monta.
          </p>
        </div>
        <Link
          href="/v2/budgets/new"
          className="inline-flex items-center gap-2 rounded-md bg-[#D4A853] px-4 py-2 text-sm font-semibold text-black hover:bg-[#e0b95f] transition-colors"
        >
          + Novo orçamento
        </Link>
      </div>

      {list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#2a2a2a] bg-[#0d0d0d] p-12 text-center">
          <div className="mb-3 text-5xl">📋</div>
          <h2 className="mb-2 text-lg font-semibold text-white">Nenhum orçamento ainda</h2>
          <p className="mx-auto mb-6 max-w-md text-sm text-[#737373]">
            Cada orçamento V2 separa custo (o que você paga) de valor (o que cobra),
            e calcula sua margem em tempo real.
          </p>
          <Link
            href="/v2/budgets/new"
            className="inline-flex items-center gap-2 rounded-md bg-[#D4A853] px-4 py-2 text-sm font-semibold text-black hover:bg-[#e0b95f] transition-colors"
          >
            Criar o primeiro orçamento →
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#1f1f1f] bg-[#0d0d0d]">
          <table className="w-full text-sm">
            <thead className="border-b border-[#1f1f1f] bg-[#111] text-xs uppercase tracking-wider text-[#737373]">
              <tr>
                <th className="px-4 py-3 text-left">Número</th>
                <th className="px-4 py-3 text-left">Nome</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">Custo</th>
                <th className="px-4 py-3 text-right">Valor</th>
                <th className="px-4 py-3 text-right">Margem</th>
              </tr>
            </thead>
            <tbody>
              {list.map((b) => {
                const cost   = Number(b.total_cost ?? 0)
                const total  = Number(b.total ?? 0)
                const margin = total - cost
                const pct    = total > 0 ? (margin / total) * 100 : 0
                return (
                  <tr key={b.id} className="border-b border-[#1f1f1f] last:border-0 hover:bg-[#111]">
                    <td className="px-4 py-3">
                      <Link
                        href={`/v2/budgets/${b.id}`}
                        className="font-mono text-xs text-[#D4A853] hover:underline"
                      >
                        {b.number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-white">
                      <Link href={`/v2/budgets/${b.id}`} className="hover:underline">
                        {b.name || 'Sem nome'}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={b.status} />
                    </td>
                    <td className="px-4 py-3 text-right text-amber-400">{fmtBRL(cost)}</td>
                    <td className="px-4 py-3 text-right text-blue-400">{fmtBRL(total)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={margin >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                        {fmtBRL(margin)}
                      </span>
                      <span className="ml-1 text-xs text-[#525252]">
                        ({pct.toFixed(0)}%)
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    draft:     { label: 'Rascunho',  cls: 'bg-[#1f1f1f] text-[#a3a3a3] border-[#2a2a2a]' },
    sent:      { label: 'Enviado',   cls: 'bg-blue-500/10 text-blue-300 border-blue-500/30' },
    approved:  { label: 'Aprovado',  cls: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' },
    rejected:  { label: 'Recusado',  cls: 'bg-red-500/10 text-red-300 border-red-500/30' },
    converted: { label: 'Virou job', cls: 'bg-violet-500/10 text-violet-300 border-violet-500/30' },
    expired:   { label: 'Vencido',   cls: 'bg-amber-500/10 text-amber-300 border-amber-500/30' },
    archived:  { label: 'Arquivado', cls: 'bg-[#1f1f1f] text-[#525252] border-[#2a2a2a]' },
  }
  const s = map[status] ?? map.draft
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${s.cls}`}>
      {s.label}
    </span>
  )
}
