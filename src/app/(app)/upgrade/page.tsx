import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CheckoutButton from './checkout-button'
import { PLANS, TRIAL_DAYS } from '@/lib/stripe/pricing'
import { FooterCopyright } from '@/components/layout/footer-copyright'

export const dynamic = 'force-dynamic'

type UpgradeSearchParams = Promise<{ reason?: string }>

export default async function UpgradePage({
  searchParams,
}: {
  searchParams: UpgradeSearchParams
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const params = await searchParams
  const reason = params.reason ?? ''

  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('status, plan, trial_ends_at, current_period_end')
    .eq('user_id', user.id)
    .single()

  const status = subscription?.status
  const trialEndsAt = subscription?.trial_ends_at
    ? new Date(subscription.trial_ends_at)
    : null
  const now = Date.now()

  // Estados úteis pra UI
  const isPaused   = status === 'paused'
  const isPastDue  = status === 'past_due'
  const isActive   = status === 'active'
  const isTrialing = status === 'trialing'
  const trialExpired =
    isTrialing && trialEndsAt !== null && trialEndsAt.getTime() < now
  const trialStillActive =
    isTrialing && trialEndsAt !== null && trialEndsAt.getTime() > now

  // Usuário realmente ativo vai pro dashboard
  if (isActive) {
    redirect('/dashboard')
  }

  // Trial ainda válido e veio aqui sem flag de expiração → volta pro app
  if (trialStillActive && reason !== 'trial_expired') {
    redirect('/dashboard')
  }

  const daysLeft =
    trialStillActive && trialEndsAt
      ? Math.max(0, Math.ceil((trialEndsAt.getTime() - now) / (1000 * 60 * 60 * 24)))
      : 0

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-white">
            LUMORA <span className="text-[#D4A853]">FINANCE</span>
          </h1>
        </div>

        <div className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-8">
          {/* Ícone de status */}
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 rounded-full bg-[#1c1c1c] border border-[#2a2a2a] flex items-center justify-center">
              {trialExpired || isPaused ? (
                <svg className="w-8 h-8 text-[#f59e0b]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : isPastDue ? (
                <svg className="w-8 h-8 text-[#ef4444]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
              ) : (
                <svg className="w-8 h-8 text-[#D4A853]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </div>
          </div>

          {/* Mensagem de status */}
          {trialExpired ? (
            <>
              <h2 className="text-xl font-semibold text-white text-center mb-2">
                Seu período de teste terminou
              </h2>
              <p className="text-[#a3a3a3] text-sm text-center mb-6">
                Você usou os {TRIAL_DAYS} dias de teste grátis. Para continuar
                com acesso completo, escolha um plano e cadastre seu cartão.
                Seus dados estão preservados.
              </p>
            </>
          ) : isPaused ? (
            <>
              <h2 className="text-xl font-semibold text-white text-center mb-2">
                Seu acesso está pausado
              </h2>
              <p className="text-[#a3a3a3] text-sm text-center mb-6">
                Adicione um método de pagamento para retomar o acesso.
              </p>
            </>
          ) : isPastDue ? (
            <>
              <h2 className="text-xl font-semibold text-white text-center mb-2">
                Pagamento pendente
              </h2>
              <p className="text-[#a3a3a3] text-sm text-center mb-6">
                Atualize seu método de pagamento para recuperar o acesso.
              </p>
            </>
          ) : trialStillActive ? (
            <>
              <h2 className="text-xl font-semibold text-white text-center mb-2">
                Garanta sua assinatura
              </h2>
              <p className="text-[#a3a3a3] text-sm text-center mb-6">
                Ainda faltam {daysLeft} {daysLeft === 1 ? 'dia' : 'dias'} de
                teste. Assine agora para continuar sem interrupção quando o
                teste terminar.
              </p>
            </>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-white text-center mb-2">
                Escolha seu plano
              </h2>
              <p className="text-[#a3a3a3] text-sm text-center mb-6">
                {TRIAL_DAYS} dias grátis, sem cartão de crédito. Cancele quando quiser.
              </p>
            </>
          )}

          {/* Garantia de dados */}
          <div className="bg-[#1c1c1c] border border-[#2a2a2a] rounded-xl p-4 mb-6">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-[#22c55e] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-white">Seus dados estão seguros</p>
                <p className="text-xs text-[#a3a3a3] mt-0.5">
                  Todos os jobs, clientes e histórico financeiro foram preservados.
                  Retome o acesso a qualquer momento.
                </p>
              </div>
            </div>
          </div>

          {/* Planos */}
          <div className="space-y-3 mb-6">
            <CheckoutButton
              plan="monthly"
              label={PLANS.monthly.label}
              price={PLANS.monthly.priceLabel}
              description={PLANS.monthly.description}
            />
            <CheckoutButton
              plan="yearly"
              label={PLANS.yearly.label}
              price={PLANS.yearly.priceLabel}
              description={PLANS.yearly.description}
              highlight
            />
          </div>

          {/* Benefícios */}
          <div className="space-y-2 mb-6">
            {[
              'Jobs, clientes e histórico ilimitados',
              'Controle de despesas e custos fixos',
              'Orçamentos, contratos e PDFs',
              'Dashboard executivo com narrativa',
              'Suporte por e-mail',
            ].map((feature) => (
              <div key={feature} className="flex items-center gap-2">
                <svg className="w-4 h-4 text-[#D4A853] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-[#a3a3a3]">{feature}</span>
              </div>
            ))}
          </div>

          <p className="text-center text-xs text-[#525252]">
            Pagamento seguro via Stripe · Cancele quando quiser
          </p>
        </div>

        <FooterCopyright variant="auth" />
      </div>
    </div>
  )
}
