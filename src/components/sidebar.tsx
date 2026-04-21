'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'

// ─── tipos ────────────────────────────────────────────────────────────────────

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
  badge?: string
}

interface NavGroup {
  id:    string
  label: string
  icon:  React.ReactNode
  items: NavItem[]
}

type NavEntry = { kind: 'item'; item: NavItem } | { kind: 'group'; group: NavGroup }

// ─── ícones (SVG paths isolados pra reduzir ruído) ────────────────────────────

const Icon = {
  dashboard: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  ),
  vendas: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  ),
  custos: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  budget: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  freelance: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
  order: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
    </svg>
  ),
  recurring: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  ),
  contracts: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  expenses: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  ),
  fixedCosts: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  clients: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  ),
  insights: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
  notifications: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  ),
  settings: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  chevron: (
    <svg className="w-3.5 h-3.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  ),
}

// ─── estrutura ────────────────────────────────────────────────────────────────
// Dashboard | Vendas (Orçamentos + Freelances + Pedidos + Receita Recorrente + Contratos)
// | Custos (Despesas + Custos Fixos) | Clientes | Insights | Notificações
const navEntries: NavEntry[] = [
  { kind: 'item',  item:  { href: '/dashboard', label: 'Dashboard', icon: Icon.dashboard } },
  {
    kind: 'group',
    group: {
      id:    'vendas',
      label: 'Vendas',
      icon:  Icon.vendas,
      items: [
        { href: '/budgets',              label: 'Orçamentos',         icon: Icon.budget },
        { href: '/freelances',           label: 'Freelances',         icon: Icon.freelance },
        { href: '/pedidos',              label: 'Pedidos',            icon: Icon.order },
        { href: '/receitas-recorrentes', label: 'Receita Recorrente', icon: Icon.recurring },
        { href: '/contracts',            label: 'Contratos',          icon: Icon.contracts, badge: 'Em breve' },
      ],
    },
  },
  {
    kind: 'group',
    group: {
      id:    'custos',
      label: 'Custos',
      icon:  Icon.custos,
      items: [
        { href: '/expenses',    label: 'Despesas',     icon: Icon.expenses },
        { href: '/fixed-costs', label: 'Custos Fixos', icon: Icon.fixedCosts },
      ],
    },
  },
  { kind: 'item', item: { href: '/clientes',      label: 'Clientes',      icon: Icon.clients } },
  { kind: 'item', item: { href: '/insights',      label: 'Insights',      icon: Icon.insights } },
  { kind: 'item', item: { href: '/notifications', label: 'Notificações',  icon: Icon.notifications } },
]

const bottomItems: NavItem[] = [
  { href: '/settings', label: 'Configurações', icon: Icon.settings },
]

// ─── helper: group está aberto quando algum item dele é a rota ativa ──────────
function groupContainsActive(group: NavGroup, pathname: string): boolean {
  return group.items.some(it =>
    it.href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(it.href)
  )
}

// ─── componente ──────────────────────────────────────────────────────────────

interface SidebarProps {
  userEmail: string
}

export default function Sidebar({ userEmail }: SidebarProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  // Estado "quais grupos estão abertos". Inicializa expandindo o grupo que
  // contém a rota ativa — o usuário sempre vê o contexto dele sem precisar
  // clicar. Demais grupos começam fechados pra reduzir ruído visual.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    for (const entry of navEntries) {
      if (entry.kind === 'group') {
        initial[entry.group.id] = groupContainsActive(entry.group, pathname)
      }
    }
    return initial
  })

  // Ao navegar para rota dentro de um grupo fechado, abre aquele grupo.
  // Preserva os demais (não fecha o que o usuário abriu manualmente).
  useEffect(() => {
    setOpenGroups(prev => {
      const next = { ...prev }
      let changed = false
      for (const entry of navEntries) {
        if (entry.kind === 'group' && groupContainsActive(entry.group, pathname) && !prev[entry.group.id]) {
          next[entry.group.id] = true
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [pathname])

  function toggleGroup(id: string) {
    setOpenGroups(prev => ({ ...prev, [id]: !prev[id] }))
  }

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  return (
    <aside
      className={`
        flex flex-col bg-[#0d0d0d] border-r border-[#1a1a1a]
        transition-all duration-200 shrink-0
        ${collapsed ? 'w-16' : 'w-56'}
      `}
    >
      {/* Logo */}
      <div className={`flex items-center border-b border-[#1a1a1a] h-16 ${collapsed ? 'justify-center px-0' : 'px-4'}`}>
        {collapsed ? (
          <span className="text-[#D4A853] font-bold text-lg">L</span>
        ) : (
          <span className="text-sm font-bold tracking-tight text-white">
            LUMORA <span className="text-[#D4A853]">FINANCE</span>
          </span>
        )}
      </div>

      {/* Nav principal */}
      <nav className="flex-1 py-4 space-y-0.5 px-2 overflow-y-auto">
        {navEntries.map((entry, idx) =>
          entry.kind === 'item' ? (
            <SidebarLink
              key={entry.item.href}
              item={entry.item}
              active={isActive(entry.item.href)}
              collapsed={collapsed}
            />
          ) : (
            <SidebarGroup
              key={entry.group.id + idx}
              group={entry.group}
              open={!!openGroups[entry.group.id]}
              collapsed={collapsed}
              isActive={isActive}
              onToggle={() => toggleGroup(entry.group.id)}
            />
          )
        )}
      </nav>

      {/* Bottom: settings + colapso */}
      <div className="py-4 px-2 border-t border-[#1a1a1a] space-y-0.5">
        {bottomItems.map(item => (
          <SidebarLink
            key={item.href}
            item={item}
            active={isActive(item.href)}
            collapsed={collapsed}
          />
        ))}

        {!collapsed && (
          <div className="pt-2 px-3">
            <p className="text-[#525252] text-xs truncate" title={userEmail}>
              {userEmail}
            </p>
          </div>
        )}

        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[#525252] hover:text-white hover:bg-[#1a1a1a] transition-colors text-sm mt-1"
          title={collapsed ? 'Expandir menu' : 'Recolher menu'}
        >
          <svg
            className={`w-4 h-4 transition-transform ${collapsed ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
          {!collapsed && <span className="text-xs">Recolher</span>}
        </button>
      </div>
    </aside>
  )
}

// ─── subcomponentes ───────────────────────────────────────────────────────────

function SidebarLink({
  item,
  active,
  collapsed,
  indented = false,
}: {
  item:      NavItem
  active:    boolean
  collapsed: boolean
  indented?: boolean
}) {
  return (
    <Link
      href={item.href}
      className={`
        flex items-center gap-3 rounded-lg text-sm
        transition-colors group relative
        ${collapsed ? 'px-3 py-2.5' : indented ? 'pl-9 pr-3 py-2' : 'px-3 py-2.5'}
        ${active
          ? 'bg-[#D4A853]/10 text-[#D4A853]'
          : 'text-[#a3a3a3] hover:bg-[#1a1a1a] hover:text-white'
        }
      `}
    >
      <span className={`shrink-0 ${indented && !collapsed ? 'hidden' : ''}`}>{item.icon}</span>
      {!collapsed && (
        <>
          <span className="flex-1 truncate">{item.label}</span>
          {item.badge && (
            <span className="text-[10px] bg-[#262626] text-[#525252] px-1.5 py-0.5 rounded-full shrink-0">
              {item.badge}
            </span>
          )}
        </>
      )}
      {collapsed && (
        <div className="absolute left-full ml-2 px-2 py-1 bg-[#1c1c1c] border border-[#2a2a2a] text-white text-xs rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-50 transition-opacity">
          {item.label}
        </div>
      )}
    </Link>
  )
}

function SidebarGroup({
  group,
  open,
  collapsed,
  isActive,
  onToggle,
}: {
  group:     NavGroup
  open:      boolean
  collapsed: boolean
  isActive:  (href: string) => boolean
  onToggle:  () => void
}) {
  // Modo collapsed: não há espaço pro cabeçalho do grupo — renderiza cada
  // item como ícone solo (sem agrupamento visual), mantendo a árvore plana
  // mas preservando a ordem correta. Tooltips já são tratados em SidebarLink.
  if (collapsed) {
    return (
      <>
        {group.items.map(it => (
          <SidebarLink
            key={it.href}
            item={it}
            active={isActive(it.href)}
            collapsed
          />
        ))}
      </>
    )
  }

  const anyActive = group.items.some(it => isActive(it.href))

  return (
    <div className="space-y-0.5">
      <button
        type="button"
        onClick={onToggle}
        className={`
          w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm
          transition-colors
          ${anyActive ? 'text-white' : 'text-[#a3a3a3] hover:text-white hover:bg-[#1a1a1a]'}
        `}
      >
        <span className="shrink-0">{group.icon}</span>
        <span className="flex-1 text-left truncate font-medium">{group.label}</span>
        <span className={`transition-transform text-[#525252] ${open ? '' : '-rotate-90'}`}>
          {Icon.chevron}
        </span>
      </button>
      {open && (
        <div className="ml-2 pl-2 border-l border-[#1a1a1a] space-y-0.5">
          {group.items.map(it => (
            <SidebarLink
              key={it.href}
              item={it}
              active={isActive(it.href)}
              collapsed={false}
              indented
            />
          ))}
        </div>
      )}
    </div>
  )
}
