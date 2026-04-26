import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { isV2Allowed, getV2Flags } from '@/lib/auth/v2-gate'

/**
 * Layout das rotas V2 (dogfooding).
 *
 * Defesa em profundidade — middleware (proxy.ts) já bloqueou, mas validamos
 * de novo aqui pra cobrir: route handlers que esquivem do middleware,
 * mudanças no matcher, edge cases de cookie expirado.
 *
 * Banner amarelo sempre visível durante dogfooding (até `v2_public_release=true`).
 */
export default async function V2Layout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login?next=/v2')
  }

  const allowed = await isV2Allowed(user.id)
  if (!allowed) {
    redirect('/?v2_blocked=1')
  }

  const flags = await getV2Flags()
  const isDogfooding = !flags.public_release

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {isDogfooding && <V2DevBanner />}
      <main>{children}</main>
    </div>
  )
}

function V2DevBanner() {
  return (
    <div className="sticky top-0 z-50 border-b border-[#D4A853]/30 bg-[#D4A853]/10 px-4 py-2 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-3 text-xs text-[#D4A853]">
        <span className="text-base">🚧</span>
        <span className="font-semibold">V2 (dev preview)</span>
        <span className="hidden text-[#D4A853]/70 sm:inline">
          Você está testando a versão nova. Coisas podem quebrar — me avise se algo estranho aparecer.
        </span>
        <Link
          href="/dashboard"
          className="ml-auto text-[#D4A853]/80 underline hover:text-[#D4A853]"
        >
          ← Voltar pra V1
        </Link>
      </div>
    </div>
  )
}
