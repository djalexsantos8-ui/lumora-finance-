'use client'

import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'

export default function AcceptInviteButton({
  token, workspaceName,
}: {
  token:         string
  workspaceName: string
}) {
  const router = useRouter()
  const [pending, startTx] = useTransition()
  const [error, setError]  = useState<string | null>(null)

  async function handleAccept() {
    setError(null)
    startTx(async () => {
      const sb = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      )
      const { data, error: rpcError } = await sb.rpc('accept_invite', { p_token: token })
      if (rpcError) {
        setError(rpcError.message)
        return
      }
      const result = data as { ok: boolean; error?: string }
      if (!result.ok) {
        const errMap: Record<string, string> = {
          unauthorized:        'Você precisa estar logado.',
          invite_not_found:    'Convite não encontrado.',
          already_accepted:    'Este convite já foi aceito.',
          revoked:             'Este convite foi revogado.',
          expired:             'Convite expirado — peça um novo.',
          email_mismatch:      'Email do convite não bate com sua conta.',
          seat_limit_reached:  'Workspace está cheio. Owner precisa fazer upgrade.',
        }
        setError(errMap[result.error ?? ''] ?? `Erro: ${result.error}`)
        return
      }
      // Sucesso — redireciona pro dashboard V2
      router.push('/v2?welcome=1')
    })
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleAccept}
        disabled={pending}
        className="rounded-md bg-[#D4A853] px-6 py-3 text-sm font-semibold text-black hover:bg-[#e0b95f] disabled:opacity-50"
      >
        {pending ? 'Aceitando…' : `Aceitar convite e entrar em ${workspaceName}`}
      </button>
      {error ? (
        <p className="mt-3 text-xs text-red-400">{error}</p>
      ) : null}
    </div>
  )
}
