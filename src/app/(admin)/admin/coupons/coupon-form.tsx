'use client'

import { useState, useTransition } from 'react'
import { createCouponAction, createAffiliateAction } from './actions'

type Affiliate = { id: string; name: string; email: string; is_active: boolean }

export default function CouponForm({ affiliates }: { affiliates: Affiliate[] }) {
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [open, setOpen] = useState(false)

  const [code, setCode] = useState('')
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage')
  const [discountValue, setDiscountValue] = useState('20')
  const [duration, setDuration] = useState<'once' | 'repeating' | 'forever'>('once')
  const [durationMonths, setDurationMonths] = useState('3')
  const [maxUses, setMaxUses] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [affiliateId, setAffiliateId] = useState('')

  const [newAffOpen, setNewAffOpen] = useState(false)
  const [affName, setAffName] = useState('')
  const [affEmail, setAffEmail] = useState('')

  async function submit() {
    setMsg(null)
    const payload = {
      code,
      discount_type: discountType,
      discount_value: Number(discountValue),
      duration,
      duration_months: duration === 'repeating' ? Number(durationMonths) : null,
      max_uses: maxUses ? Number(maxUses) : null,
      expires_at: expiresAt ? new Date(expiresAt + 'T23:59:59').toISOString() : null,
      affiliate_id: affiliateId || null,
    }

    startTransition(async () => {
      const res = await createCouponAction(payload)
      if (res.ok) {
        setMsg({ kind: 'ok', text: res.message ?? 'Criado' })
        setCode(''); setDiscountValue('20'); setMaxUses(''); setExpiresAt(''); setAffiliateId('')
        setOpen(false)
      } else {
        setMsg({ kind: 'err', text: res.error })
      }
    })
  }

  async function submitAffiliate() {
    setMsg(null)
    if (!affName || !affEmail) {
      setMsg({ kind: 'err', text: 'Nome e email obrigatórios' })
      return
    }
    startTransition(async () => {
      const res = await createAffiliateAction({ name: affName, email: affEmail })
      if (res.ok) {
        setMsg({ kind: 'ok', text: res.message ?? 'Influencer criado' })
        setAffName(''); setAffEmail(''); setNewAffOpen(false)
        if ('id' in res && res.id) setAffiliateId(res.id)
      } else {
        setMsg({ kind: 'err', text: res.error })
      }
    })
  }

  if (!open) {
    return (
      <div className="flex items-center gap-3">
        <button
          onClick={() => setOpen(true)}
          className="text-xs font-semibold bg-[#D4A853] hover:bg-[#E8C47A] text-black px-4 py-2 rounded-lg transition-colors"
        >
          + Criar cupom
        </button>
        <button
          onClick={() => setNewAffOpen(v => !v)}
          className="text-xs font-semibold bg-[#1a1a1a] hover:bg-[#242424] border border-[#2a2a2a] text-white px-4 py-2 rounded-lg transition-colors"
        >
          + Novo influencer
        </button>
        {newAffOpen && (
          <div className="flex items-center gap-2">
            <input
              value={affName}
              onChange={e => setAffName(e.target.value)}
              placeholder="Nome"
              className="bg-[#0a0a0a] border border-[#2a2a2a] rounded px-2 py-1 text-xs text-white w-32"
            />
            <input
              value={affEmail}
              onChange={e => setAffEmail(e.target.value)}
              placeholder="email"
              className="bg-[#0a0a0a] border border-[#2a2a2a] rounded px-2 py-1 text-xs text-white w-40"
            />
            <button
              onClick={submitAffiliate}
              disabled={pending}
              className="text-xs bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded disabled:opacity-50"
            >
              Salvar
            </button>
          </div>
        )}
        {msg && (
          <span className={`text-xs ${msg.kind === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>
            {msg.text}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-[#2a2a2a] bg-[#0d0d0d] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Novo cupom</h3>
        <button
          onClick={() => { setOpen(false); setMsg(null) }}
          className="text-xs text-[#737373] hover:text-white"
        >
          cancelar
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-[#737373]">Código</span>
          <input
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            placeholder="LUMORA20"
            className="mt-1 w-full bg-[#050505] border border-[#2a2a2a] rounded px-2 py-1.5 text-sm text-white font-mono"
          />
        </label>

        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-[#737373]">Influencer (opcional)</span>
          <select
            value={affiliateId}
            onChange={e => setAffiliateId(e.target.value)}
            className="mt-1 w-full bg-[#050505] border border-[#2a2a2a] rounded px-2 py-1.5 text-sm text-white"
          >
            <option value="">—</option>
            {affiliates.map(a => (
              <option key={a.id} value={a.id}>
                {a.name} {!a.is_active && '(inativo)'}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-[#737373]">Tipo</span>
          <select
            value={discountType}
            onChange={e => setDiscountType(e.target.value as 'percentage' | 'fixed')}
            className="mt-1 w-full bg-[#050505] border border-[#2a2a2a] rounded px-2 py-1.5 text-sm text-white"
          >
            <option value="percentage">Porcentagem</option>
            <option value="fixed">Valor fixo (R$)</option>
          </select>
        </label>

        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-[#737373]">
            {discountType === 'percentage' ? 'Desconto (%)' : 'Desconto (R$)'}
          </span>
          <input
            type="number"
            min="1"
            value={discountValue}
            onChange={e => setDiscountValue(e.target.value)}
            className="mt-1 w-full bg-[#050505] border border-[#2a2a2a] rounded px-2 py-1.5 text-sm text-white"
          />
        </label>

        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-[#737373]">Duração</span>
          <select
            value={duration}
            onChange={e => setDuration(e.target.value as 'once' | 'repeating' | 'forever')}
            className="mt-1 w-full bg-[#050505] border border-[#2a2a2a] rounded px-2 py-1.5 text-sm text-white"
          >
            <option value="once">Uma cobrança</option>
            <option value="repeating">N meses</option>
            <option value="forever">Sempre</option>
          </select>
        </label>

        {duration === 'repeating' && (
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-[#737373]">Meses</span>
            <input
              type="number"
              min="1"
              value={durationMonths}
              onChange={e => setDurationMonths(e.target.value)}
              className="mt-1 w-full bg-[#050505] border border-[#2a2a2a] rounded px-2 py-1.5 text-sm text-white"
            />
          </label>
        )}

        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-[#737373]">Limite de usos (opcional)</span>
          <input
            type="number"
            min="1"
            value={maxUses}
            onChange={e => setMaxUses(e.target.value)}
            placeholder="sem limite"
            className="mt-1 w-full bg-[#050505] border border-[#2a2a2a] rounded px-2 py-1.5 text-sm text-white"
          />
        </label>

        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-[#737373]">Expira em (opcional)</span>
          <input
            type="date"
            value={expiresAt}
            onChange={e => setExpiresAt(e.target.value)}
            className="mt-1 w-full bg-[#050505] border border-[#2a2a2a] rounded px-2 py-1.5 text-sm text-white"
          />
        </label>
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        {msg && (
          <span className={`text-xs mr-auto ${msg.kind === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>
            {msg.text}
          </span>
        )}
        <button
          onClick={submit}
          disabled={pending || !code || !discountValue}
          className="text-xs font-semibold bg-[#D4A853] hover:bg-[#E8C47A] disabled:opacity-50 text-black px-4 py-1.5 rounded transition-colors"
        >
          {pending ? 'Salvando…' : 'Criar cupom + promo code'}
        </button>
      </div>

      <p className="text-[11px] text-[#525252]">
        Cria cupom no Stripe, gera promotion code com o mesmo código e persiste localmente.
        Usuário pode aplicar no checkout.
      </p>
    </div>
  )
}
