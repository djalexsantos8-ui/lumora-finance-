'use client'

/**
 * GrantForm — formulário admin para conceder créditos de IA manualmente.
 *
 * Deploy H (2026-04-23). Usa a action grantAICreditsAction, que:
 *   1) valida admin no server-side (checkAdmin)
 *   2) busca o workspace do owner pelo email
 *   3) chama a RPC grant_ai_credits (SECURITY DEFINER com is_current_user_admin)
 *
 * UX:
 *   · email + quantidade são obrigatórios
 *   · motivo é recomendado (vai no audit trail)
 *   · validade opcional (datetime-local) — default = perpétuo (null)
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { grantAICreditsAction } from '@/lib/ai/admin-actions'

type Feedback =
  | { kind: 'idle' }
  | { kind: 'success'; message: string }
  | { kind: 'error';   message: string }

const QUICK_AMOUNTS = [50, 100, 200, 500, 1000] as const

export default function GrantForm() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [email, setEmail]         = useState('')
  const [amount, setAmount]       = useState<string>('100')
  const [reason, setReason]       = useState('')
  const [expiresAt, setExpiresAt] = useState('')       // datetime-local
  const [feedback, setFeedback]   = useState<Feedback>({ kind: 'idle' })

  function resetForm() {
    setEmail('')
    setAmount('100')
    setReason('')
    setExpiresAt('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFeedback({ kind: 'idle' })

    const parsedAmount = parseInt(amount, 10)
    if (!email.trim() || !email.includes('@')) {
      setFeedback({ kind: 'error', message: 'Email inválido.' })
      return
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setFeedback({ kind: 'error', message: 'Quantidade deve ser um inteiro positivo.' })
      return
    }

    // datetime-local → ISO string (assume timezone local)
    const expiresIso = expiresAt ? new Date(expiresAt).toISOString() : null

    startTransition(async () => {
      const res = await grantAICreditsAction({
        email:     email.trim().toLowerCase(),
        amount:    parsedAmount,
        reason:    reason.trim() || undefined,
        expiresAt: expiresIso,
      })
      if (res.success) {
        setFeedback({
          kind:    'success',
          message: `+${parsedAmount} créditos concedidos a ${res.email}.`,
        })
        resetForm()
        router.refresh()
      } else {
        setFeedback({ kind: 'error', message: res.message })
      }
    })
  }

  const inputCls =
    'w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white ' +
    'placeholder:text-[#525252] focus:outline-none focus:border-[#D4A853] transition-colors'

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Email */}
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-[#737373] font-medium mb-1.5">
            Email do usuário *
          </label>
          <input
            type="email"
            required
            autoComplete="off"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="usuario@exemplo.com"
            className={inputCls}
          />
          <p className="text-[10px] text-[#525252] mt-1">
            Busca o workspace do owner. Precisa ser o email de cadastro.
          </p>
        </div>

        {/* Quantidade */}
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-[#737373] font-medium mb-1.5">
            Quantidade *
          </label>
          <input
            type="number"
            min={1}
            max={100000}
            required
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className={inputCls}
          />
          <div className="flex gap-1.5 mt-2">
            {QUICK_AMOUNTS.map(n => (
              <button
                key={n}
                type="button"
                onClick={() => setAmount(String(n))}
                className="text-[10px] px-2 py-1 rounded-md border border-[#2a2a2a] text-[#a3a3a3] hover:border-[#D4A853] hover:text-[#D4A853] transition-colors"
              >
                +{n}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Motivo */}
      <div>
        <label className="block text-[10px] uppercase tracking-wider text-[#737373] font-medium mb-1.5">
          Motivo (opcional, fica no audit trail)
        </label>
        <input
          type="text"
          maxLength={280}
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Ex: cortesia de parceria / compensação de bug / beta tester"
          className={inputCls}
        />
      </div>

      {/* Validade */}
      <div>
        <label className="block text-[10px] uppercase tracking-wider text-[#737373] font-medium mb-1.5">
          Expira em (opcional — vazio = perpétuo)
        </label>
        <input
          type="datetime-local"
          value={expiresAt}
          onChange={e => setExpiresAt(e.target.value)}
          className={inputCls}
        />
        <p className="text-[10px] text-[#525252] mt-1">
          Após esta data, os créditos não consumidos deste grant somem automaticamente.
        </p>
      </div>

      {/* Feedback */}
      {feedback.kind === 'success' && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-300">
          ✓ {feedback.message}
        </div>
      )}
      {feedback.kind === 'error' && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-300">
          ✕ {feedback.message}
        </div>
      )}

      {/* Submit */}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2 rounded-lg bg-[#D4A853] text-black text-sm font-semibold hover:bg-[#E8C47A] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {pending ? 'Concedendo…' : 'Conceder créditos'}
        </button>
      </div>
    </form>
  )
}
