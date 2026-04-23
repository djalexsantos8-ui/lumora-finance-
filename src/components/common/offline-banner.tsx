'use client'

/**
 * src/components/common/offline-banner.tsx
 *
 * Banner discreto que aparece no topo da tela quando o navegador detecta
 * perda de conexão. Some automaticamente quando volta online.
 *
 * Quando usar: em layouts onde o usuário vai ficar tempo significativo
 * e pode querer salvar dados. Não usar em páginas puramente read-only.
 *
 * Design: sticky top, cor âmbar discreta, texto curto. Não rouba a tela.
 */

import { useOnlineStatus } from '@/hooks/use-online-status'

export default function OfflineBanner() {
  const online = useOnlineStatus()
  if (online) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-[60] w-full bg-amber-500/15 border-b border-amber-500/30 text-amber-200 text-xs md:text-sm px-4 py-2 flex items-center justify-center gap-2"
    >
      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M18.364 5.636L5.636 18.364m0-12.728l12.728 12.728M12 18h.01" />
      </svg>
      <span>
        Você está offline. Alterações só serão salvas quando a conexão voltar.
      </span>
    </div>
  )
}
