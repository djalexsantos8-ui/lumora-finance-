import Link from 'next/link'
import {
  computePlanState,
  formatNextCharge,
  type PlanState,
} from '@/lib/billing/plan-state'

interface Props {
  /**
   * Plan state já computado (geralmente vindo do layout via getPlanStateForUser).
   * Passar diretamente evita query duplicada quando o layout já fez.
   */
  state: PlanState | null
  /** Sidebar collapsed = só ícone. */
  collapsed?: boolean
}

/**
 * Indicador de plano/trial — fica acima de "Configurações" na sidebar.
 *
 * Estados visuais:
 *   - trial (>2d):   dourado · "Trial: X dias"
 *   - trial-warn:    âmbar   · "⚠ Trial vence em Xd"
 *   - creator:       cinza   · "Creator · próx. cobrança DD/MMM"
 *   - enterprise:    roxo    · "Enterprise · próx. cobrança DD/MMM"
 *   - past-due:      vermelho · "Pagamento pendente"
 *   - no-sub / null: não renderiza (V1 user puro ou ainda não assinou V2)
 *
 * Click leva pra /configuracoes/assinatura.
 *
 * Server Component — sem polling. Re-renderiza a cada navegação do Next 16.
 */
export default function PlanIndicator({ state, collapsed = false }: Props) {
  if (!state || state.kind === 'no-sub') return null

  const styles = stylesFor(state.kind)
  const icon = iconFor(state.kind)
  const title = titleFor(state)
  const subtitle = subtitleFor(state)

  if (collapsed) {
    return (
      <Link
        href="/settings"
        className={`group relative flex items-center justify-center mx-3 px-2 py-2 rounded-lg border ${styles.container}`}
        title={`${title} — ${subtitle}`}
      >
        <span className="text-base">{icon}</span>
        <span className="absolute left-full ml-2 px-2 py-1 bg-[#1c1c1c] border border-[#2a2a2a] text-white text-xs rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-50 transition-opacity">
          {title}
        </span>
      </Link>
    )
  }

  return (
    <Link
      href="/settings"
      className={`mx-3 mb-1 px-3 py-2 rounded-lg border block transition-colors ${styles.container}`}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className={`text-xs font-semibold truncate ${styles.title}`}>{title}</div>
          <div className={`text-[10px] truncate ${styles.subtitle}`}>{subtitle}</div>
        </div>
      </div>
    </Link>
  )
}

function stylesFor(kind: PlanState['kind']) {
  switch (kind) {
    case 'trial':
      return {
        container: 'border-[#D4A853]/30 bg-[#D4A853]/5 hover:bg-[#D4A853]/10',
        title: 'text-[#D4A853]',
        subtitle: 'text-[#D4A853]/70',
      }
    case 'trial-warn':
      return {
        container: 'border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/15',
        title: 'text-amber-300',
        subtitle: 'text-amber-300/70',
      }
    case 'creator':
      return {
        container: 'border-[#1a1a1a] bg-[#0d0d0d] hover:bg-[#161616]',
        title: 'text-[#a3a3a3]',
        subtitle: 'text-[#525252]',
      }
    case 'enterprise':
      return {
        container: 'border-violet-500/30 bg-violet-500/10 hover:bg-violet-500/15',
        title: 'text-violet-300',
        subtitle: 'text-violet-300/70',
      }
    case 'past-due':
      return {
        container: 'border-red-500/40 bg-red-500/10 hover:bg-red-500/15',
        title: 'text-red-300',
        subtitle: 'text-red-300/70',
      }
    default:
      return {
        container: 'border-[#1a1a1a] bg-[#0d0d0d] hover:bg-[#161616]',
        title: 'text-[#525252]',
        subtitle: 'text-[#525252]',
      }
  }
}

function iconFor(kind: PlanState['kind']): string {
  switch (kind) {
    case 'trial':
      return '✨'
    case 'trial-warn':
      return '⚠️'
    case 'creator':
      return '⭐'
    case 'enterprise':
      return '💎'
    case 'past-due':
      return '🔴'
    default:
      return '⭐'
  }
}

function titleFor(state: PlanState): string {
  switch (state.kind) {
    case 'trial':
      return `Trial: ${state.daysLeft} ${state.daysLeft === 1 ? 'dia' : 'dias'}`
    case 'trial-warn':
      return `Trial vence em ${state.daysLeft}d`
    case 'creator':
      return 'Creator'
    case 'enterprise':
      return 'Enterprise'
    case 'past-due':
      return 'Pagamento pendente'
    default:
      return 'Sem plano'
  }
}

function subtitleFor(state: PlanState): string {
  switch (state.kind) {
    case 'trial':
    case 'trial-warn':
      return `até ${formatNextCharge(state.endsAt)}`
    case 'creator':
    case 'enterprise':
      return state.nextChargeAt
        ? `próx. cobrança ${formatNextCharge(state.nextChargeAt)}`
        : 'gerenciar plano'
    case 'past-due':
      return 'atualizar pagamento'
    default:
      return 'escolha um plano'
  }
}
