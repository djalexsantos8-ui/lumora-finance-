import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { isV2Allowed, getV2Flags } from '@/lib/auth/v2-gate'
import Sidebar, { type NavEntry } from '@/components/sidebar'
import PlanIndicator from '@/components/sidebar/plan-indicator'
import AppFooter from '@/components/layout/app-footer'
import { getPlanStateForUser } from '@/lib/billing/plan-state'

/**
 * Layout das rotas V2 — usa o MESMO shell visual do V1 (sidebar lateral
 * preto + dourado, footer Lumora, plan indicator) injetando uma seção
 * extra com items V2 destacados no topo da sidebar.
 *
 * Decisão: V2 não é "outro app" — é o V1 turbinado. A casca conhecida
 * fica idêntica; o que muda são as features novas dentro dela.
 *
 * Defesa em profundidade: middleware (proxy.ts) já bloqueou se user
 * não autorizado, mas validamos de novo aqui pra cobrir edge cases.
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

  if (!user) redirect('/login?next=/v2')

  const allowed = await isV2Allowed(user.id)
  if (!allowed) redirect('/?v2_blocked=1')

  // Admin grant pra mostrar atalho de admin na sidebar (mesmo padrão do V1)
  const nowIso = new Date().toISOString()
  const { data: grant } = await supabase
    .from('admin_grants')
    .select('id')
    .eq('user_id', user.id)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .limit(1)
    .maybeSingle()
  const isAdmin = Boolean(grant)

  const flags = await getV2Flags()
  const isDogfooding = !flags.public_release

  const planState = await getPlanStateForUser(user.id)

  return (
    <div className="flex h-screen bg-[#0a0a0a] overflow-hidden">
      <Sidebar
        userEmail={user.email ?? ''}
        isAdmin={isAdmin}
        planIndicator={<PlanIndicator state={planState} />}
        extraSectionLabel="Lumora · preview"
        extraEntries={V2_NAV_ENTRIES}
      />
      <main className="flex-1 overflow-y-auto flex flex-col">
        {isDogfooding && <V2DevBanner />}
        <div className="flex-1">{children}</div>
        <AppFooter />
      </main>
    </div>
  )
}

function V2DevBanner() {
  return (
    <div className="sticky top-0 z-40 border-b border-[#D4A853]/30 bg-[#D4A853]/10 px-4 py-2 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-3 text-xs text-[#D4A853]">
        <span className="text-base">🚧</span>
        <span className="font-semibold">Lumora preview</span>
        <span className="hidden text-[#D4A853]/70 sm:inline">
          Você está testando os recursos novos. Tudo aqui ainda está em validação.
        </span>
        <Link href="/dashboard" className="ml-auto text-[#D4A853]/80 underline hover:text-[#D4A853]">
          ← Voltar pra versão estável
        </Link>
      </div>
    </div>
  )
}

// ─── Nav entries da seção V2 ──────────────────────────────────────────────────
// Reutilizamos o mesmo formato/estilo da Sidebar V1. SVG paths inline pra
// evitar import client em arquivo de layout server.

const IconFinanceiro = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
)

const IconBudget = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
)

const IconFreelancer = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
)

const IconTeam = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
  </svg>
)

const IconHome = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  </svg>
)

const V2_NAV_ENTRIES: NavEntry[] = [
  { kind: 'item', item: { href: '/v2',             label: 'Dashboard preview',  icon: IconHome } },
  { kind: 'item', item: { href: '/v2/financeiro',  label: 'Financeiro',         icon: IconFinanceiro } },
  { kind: 'item', item: { href: '/v2/budgets',     label: 'Orçamentos preview', icon: IconBudget } },
  { kind: 'item', item: { href: '/v2/freelancers', label: 'Freelancers preview',icon: IconFreelancer } },
  { kind: 'item', item: { href: '/v2/equipe',      label: 'Equipe',             icon: IconTeam } },
]
