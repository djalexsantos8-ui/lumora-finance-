'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { APP_FOOTER_LABEL } from '@/lib/app-version'

interface Props {
  email: string
  grantType: 'free' | 'trial' | 'partner'
  children: React.ReactNode
}

const NAV = [
  { href: '/admin',             label: 'Visão geral' },
  { href: '/admin/users',       label: 'Usuários' },
  { href: '/admin/ai-credits',  label: 'Créditos de IA' },
  { href: '/admin/feedback',    label: 'Feedback' },
  { href: '/admin/insights',    label: 'Insights' },
  { href: '/admin/coupons',     label: 'Cupons' },
  { href: '/admin/grants',      label: 'Grants de acesso' },
] as const

export default function AdminShell({ email, grantType, children }: Props) {
  const pathname = usePathname()

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col">
      {/* Header */}
      <header className="border-b border-[#1a1a1a] bg-[#0d0d0d]">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="text-sm font-bold tracking-tight">
              LUMORA <span className="text-[#D4A853]">ADMIN</span>
            </Link>
            <span className="text-[10px] uppercase tracking-wider bg-[#D4A853]/10 text-[#D4A853] px-2 py-0.5 rounded">
              {grantType}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-[#737373]" title={email}>{email}</span>
            <Link
              href="/dashboard"
              className="text-xs text-[#a3a3a3] hover:text-white transition-colors"
            >
              Voltar ao app →
            </Link>
          </div>
        </div>
        {/* Nav */}
        <nav className="max-w-6xl mx-auto px-6 flex items-center gap-1 -mb-px">
          {NAV.map(item => {
            const active = item.href === '/admin'
              ? pathname === '/admin'
              : pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`
                  px-4 py-2.5 text-xs font-medium rounded-t-md border-b-2
                  transition-colors
                  ${active
                    ? 'text-[#D4A853] border-[#D4A853]'
                    : 'text-[#a3a3a3] border-transparent hover:text-white hover:border-[#2a2a2a]'}
                `}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8">
        {children}
      </main>

      <footer className="border-t border-[#1a1a1a] py-4 text-center text-[10px] uppercase tracking-wider text-[#525252] space-y-1">
        <div>Área restrita · acesso gerenciado por admin_grants</div>
        <div className="normal-case tracking-wide text-[#3f3f46]">{APP_FOOTER_LABEL}</div>
      </footer>
    </div>
  )
}
