'use client'

// ─── Reabrir tour (Settings) ─────────────────────────────────────────────────
//
// Botão discreto no rodapé da tela de Configurações. Permite ao usuário rever
// o tour visual do Lumora quando quiser. Chama `replayTour` action → reseta
// `onboarding_completed=false`, `onboarding_tour_at=null` — na próxima
// navegação o overlay volta a montar (começando direto no step 'tour').

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { replayTour } from '@/lib/actions/onboarding'

export function ReplayTourButton() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      const res = await replayTour()
      if (res.success) {
        // Navega pra dashboard — overlay vai aparecer por cima no próximo render.
        router.push('/dashboard')
        router.refresh()
      }
    })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="text-xs font-medium text-[#a3a3a3] hover:text-white transition-colors disabled:opacity-40 underline decoration-dotted decoration-[#525252] underline-offset-4"
    >
      {isPending ? 'Reabrindo…' : 'Rever tour de boas-vindas'}
    </button>
  )
}
