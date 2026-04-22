import { createAdminClient } from '@/lib/supabase/server'
import { checkAdmin } from '@/lib/auth/is-admin'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

async function loadCoupons() {
  const supabase = createAdminClient()

  const [coupons, usages, affiliates] = await Promise.all([
    supabase
      .from('coupon_codes')
      .select('*')
      .order('created_at', { ascending: false }),
    supabase.from('coupon_usages').select('coupon_id'),
    supabase.from('affiliates').select('id, name, email, is_active'),
  ])

  const usageCount = new Map<string, number>()
  for (const u of usages.data ?? []) {
    usageCount.set(u.coupon_id, (usageCount.get(u.coupon_id) ?? 0) + 1)
  }

  const affById = new Map((affiliates.data ?? []).map(a => [a.id, a]))

  return {
    rows: (coupons.data ?? []).map(c => ({
      ...c,
      usages:    usageCount.get(c.id) ?? 0,
      affiliate: c.affiliate_id ? affById.get(c.affiliate_id) : null,
    })),
    affiliatesCount: (affiliates.data ?? []).length,
  }
}

function describeDiscount(c: {
  discount_type: string
  discount_value: number
  duration: string
  duration_months: number | null
}) {
  const value =
    c.discount_type === 'percentage'
      ? `${c.discount_value}%`
      : c.discount_type === 'free_months'
        ? `${c.discount_value} mês${Number(c.discount_value) === 1 ? '' : 'es'} grátis`
        : `R$${c.discount_value}`

  const dur =
    c.duration === 'once'      ? 'uma vez' :
    c.duration === 'forever'   ? 'sempre' :
    c.duration === 'repeating' ? `${c.duration_months ?? '?'} meses` :
                                  c.duration

  return `${value} · ${dur}`
}

export default async function AdminCouponsPage() {
  const check = await checkAdmin()
  if (!check.isAdmin) redirect('/dashboard')

  const { rows, affiliatesCount } = await loadCoupons()

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[#D4A853] font-semibold mb-1">
            Cupons & Promotion Codes
          </p>
          <h1 className="text-2xl font-bold">Cupons cadastrados</h1>
          <p className="text-sm text-[#737373] mt-1">
            {rows.length} cupom{rows.length === 1 ? '' : 's'} · {affiliatesCount} influencer{affiliatesCount === 1 ? '' : 's'} cadastrado{affiliatesCount === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-amber-200">
        <strong className="block mb-1">CRUD em breve.</strong>
        Esta v1 é read-only. Para criar novos cupons, use o dashboard do Stripe
        (Products → Coupons + Promotion codes) e depois rode um INSERT em
        <code className="mx-1 px-1 bg-black/40 rounded">coupon_codes</code>
        com o <code className="mx-1 px-1 bg-black/40 rounded">stripe_coupon_id</code>.
        A sincronização automática fica na próxima rodada.
      </div>

      <div className="rounded-lg border border-[#1a1a1a] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#111] text-[10px] uppercase tracking-wider text-[#737373]">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium">Código</th>
              <th className="text-left px-4 py-2.5 font-medium">Desconto</th>
              <th className="text-left px-4 py-2.5 font-medium">Validade</th>
              <th className="text-right px-4 py-2.5 font-medium">Usos</th>
              <th className="text-left px-4 py-2.5 font-medium">Influencer</th>
              <th className="text-center px-4 py-2.5 font-medium">Status</th>
              <th className="text-left px-4 py-2.5 font-medium">Stripe</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-[#525252] text-sm">
                  Nenhum cupom cadastrado ainda.
                </td>
              </tr>
            )}
            {rows.map(c => (
              <tr key={c.id} className="border-t border-[#1a1a1a] hover:bg-[#0d0d0d]">
                <td className="px-4 py-3 font-mono text-xs">{c.code}</td>
                <td className="px-4 py-3">{describeDiscount(c)}</td>
                <td className="px-4 py-3 text-xs text-[#a3a3a3]">
                  {c.expires_at
                    ? `até ${new Date(c.expires_at).toLocaleDateString('pt-BR')}`
                    : 'sem validade'}
                  {c.max_uses && (
                    <div className="text-[10px] text-[#525252]">
                      {c.use_count}/{c.max_uses} usos permitidos
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-xs tabular-nums">
                  {c.usages}
                </td>
                <td className="px-4 py-3 text-xs">
                  {c.affiliate ? (
                    <span>
                      {c.affiliate.name}
                      {!c.affiliate.is_active && (
                        <span className="ml-1 text-[#525252]">(inativo)</span>
                      )}
                    </span>
                  ) : (
                    <span className="text-[#525252]">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  {c.is_active ? (
                    <span className="text-[10px] uppercase tracking-wider bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded">
                      Ativo
                    </span>
                  ) : (
                    <span className="text-[10px] uppercase tracking-wider bg-[#2a2a2a] text-[#737373] px-2 py-0.5 rounded">
                      Inativo
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs font-mono text-[#737373]">
                  {c.stripe_coupon_id ? (
                    <span title={c.stripe_coupon_id}>
                      {c.stripe_coupon_id.slice(0, 10)}…
                    </span>
                  ) : (
                    <span className="text-red-400" title="Cupom local sem par no Stripe">
                      sem sync
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
