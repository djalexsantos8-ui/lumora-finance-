import { createAdminClient } from '@/lib/supabase/server'
import { checkAdmin } from '@/lib/auth/is-admin'
import { redirect } from 'next/navigation'
import CouponForm from './coupon-form'
import ToggleButton from './toggle-button'

export const dynamic = 'force-dynamic'

async function loadCoupons() {
  const supabase = createAdminClient()

  const [coupons, usages, affiliates] = await Promise.all([
    supabase
      .from('coupon_codes')
      .select('*')
      .order('created_at', { ascending: false }),
    supabase.from('coupon_usages').select('coupon_id'),
    supabase.from('affiliates').select('id, name, email, is_active').order('name'),
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
    affiliates: affiliates.data ?? [],
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

  const { rows, affiliates } = await loadCoupons()

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[#D4A853] font-semibold mb-1">
            Cupons & Promotion Codes
          </p>
          <h1 className="text-2xl font-bold">Cupons cadastrados</h1>
          <p className="text-sm text-[#737373] mt-1">
            {rows.length} cupom{rows.length === 1 ? '' : 's'} · {affiliates.length} influencer{affiliates.length === 1 ? '' : 's'} cadastrado{affiliates.length === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      <CouponForm affiliates={affiliates} />

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
              <th className="text-right px-4 py-2.5 font-medium">Ação</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-[#525252] text-sm">
                  Nenhum cupom cadastrado ainda. Use o botão acima para criar o primeiro.
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
                <td className="px-4 py-3 text-right">
                  <ToggleButton id={c.id} active={c.is_active} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-[#D4A853]/20 bg-[#D4A853]/5 p-4 text-xs text-[#D4A853]">
        <strong className="block mb-1 text-[#D4A853]">Como funciona</strong>
        <ul className="space-y-1 text-[#D4A853]/80 list-disc pl-4">
          <li>Cada cupom criado aqui vira um <code className="bg-black/40 px-1 rounded">coupon</code> + <code className="bg-black/40 px-1 rounded">promotion_code</code> no Stripe com o mesmo código.</li>
          <li>No checkout, o usuário digita o código e o desconto é aplicado automaticamente.</li>
          <li>Desativar só desliga o promotion_code (não apaga histórico de usos).</li>
          <li>Influencers são cadastrados aqui também — vincular cupom a influencer serve para rastrear quem trouxe quem.</li>
        </ul>
      </div>
    </div>
  )
}
