'use client'

import { useState, useTransition } from 'react'
import { createCheckoutSession } from './actions'
import type { Plan, BillingPeriod } from '@/lib/stripe/products'

interface Props {
  email: string
  canceled: boolean
}

export default function EscolherPlanoClient({ email, canceled }: Props) {
  const [billing, setBilling] = useState<BillingPeriod>('monthly')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null)

  function handleSelect(plan: Plan) {
    setError(null)
    setSelectedPlan(plan)
    startTransition(async () => {
      const res = await createCheckoutSession({ plan, billing })
      if (res.ok && res.url) {
        window.location.href = res.url
      } else {
        setError(res.error ?? 'unknown_error')
        setSelectedPlan(null)
      }
    })
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white py-12 px-6">
      <div className="max-w-5xl mx-auto">
        {/* Hero */}
        <div className="text-center mb-10">
          <h1 className="text-3xl md:text-4xl font-bold mb-3">
            Escolha seu plano
          </h1>
          <p className="text-[#a3a3a3] text-lg">
            7 dias grátis. Sem cobrança hoje. Cancele quando quiser.
          </p>
          <p className="text-[#737373] text-sm mt-1">
            Conta: <span className="text-[#a3a3a3]">{email}</span>
          </p>
        </div>

        {/* Banner cancelamento */}
        {canceled && (
          <div className="mb-6 px-4 py-3 rounded-lg border border-[#D4A853]/30 bg-[#D4A853]/5 text-[#D4A853] text-sm text-center">
            Tudo bem, você não escolheu nenhum plano. Pode tentar de novo quando quiser.
          </div>
        )}

        {/* Toggle Mensal/Anual */}
        <div className="flex justify-center mb-10">
          <div className="inline-flex rounded-lg border border-[#1a1a1a] bg-[#0d0d0d] p-1">
            <button
              type="button"
              onClick={() => setBilling('monthly')}
              className={`px-5 py-2 rounded-md text-sm font-medium transition-colors ${
                billing === 'monthly'
                  ? 'bg-[#D4A853] text-black'
                  : 'text-[#a3a3a3] hover:text-white'
              }`}
            >
              Mensal
            </button>
            <button
              type="button"
              onClick={() => setBilling('yearly')}
              className={`px-5 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
                billing === 'yearly'
                  ? 'bg-[#D4A853] text-black'
                  : 'text-[#a3a3a3] hover:text-white'
              }`}
            >
              Anual
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded ${
                  billing === 'yearly'
                    ? 'bg-black/20 text-black'
                    : 'bg-emerald-500/20 text-emerald-400'
                }`}
              >
                economiza 33%
              </span>
            </button>
          </div>
        </div>

        {/* 2 Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <PlanCard
            plan="creator"
            title="Creator"
            subtitle="Filmmaker solo, fotógrafo, freelancer"
            priceMonthly="R$ 49,90"
            priceYearly="R$ 399"
            yearlyEquivalent="R$ 33/mês"
            billing={billing}
            features={[
              { text: 'Até 2 usuários no workspace', positive: true },
              { text: 'Orçamentos ilimitados', positive: true },
              { text: '100 créditos de IA por mês', positive: true },
              { text: 'Financeiro completo', positive: true },
              { text: 'CRM, Marketing, Agenda', positive: false },
              { text: 'Perfil público da produtora', positive: false },
            ]}
            onSelect={() => handleSelect('creator')}
            disabled={pending}
            loading={pending && selectedPlan === 'creator'}
          />

          <PlanCard
            plan="enterprise"
            title="Enterprise"
            subtitle="Pequena ou média produtora"
            priceMonthly="R$ 99"
            priceYearly="R$ 799"
            yearlyEquivalent="R$ 66/mês"
            billing={billing}
            recommended
            features={[
              { text: '5 usuários (+R$ 19,90/usuário extra)', positive: true },
              { text: 'Tudo do plano Creator', positive: true },
              { text: '300 créditos de IA por mês', positive: true },
              { text: 'CRM com pipeline de leads', positive: true },
              { text: 'Marketing — captação pública', positive: true },
              { text: 'Agenda multi-equipe', positive: true },
              { text: '"Sua Produtora" — perfil público', positive: true },
            ]}
            onSelect={() => handleSelect('enterprise')}
            disabled={pending}
            loading={pending && selectedPlan === 'enterprise'}
          />
        </div>

        {/* Erro */}
        {error && (
          <div className="mt-6 px-4 py-3 rounded-lg border border-red-500/30 bg-red-500/5 text-red-400 text-sm text-center">
            Não foi possível abrir o checkout: {humanizeError(error)}
          </div>
        )}

        {/* Reassurances */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4 text-center text-xs text-[#737373]">
          <div className="flex flex-col items-center gap-1">
            <span className="text-[#D4A853]">✓</span>
            Cartão é só autorizado durante os 7 dias grátis
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-[#D4A853]">✓</span>
            Cancele em 1 clique nas Configurações
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-[#D4A853]">✓</span>
            Mantém acesso até o fim do período pago
          </div>
        </div>
      </div>
    </div>
  )
}

interface PlanCardProps {
  plan: Plan
  title: string
  subtitle: string
  priceMonthly: string
  priceYearly: string
  yearlyEquivalent: string
  billing: BillingPeriod
  features: { text: string; positive: boolean }[]
  recommended?: boolean
  onSelect: () => void
  disabled: boolean
  loading: boolean
}

function PlanCard({
  title,
  subtitle,
  priceMonthly,
  priceYearly,
  yearlyEquivalent,
  billing,
  features,
  recommended,
  onSelect,
  disabled,
  loading,
}: PlanCardProps) {
  const price = billing === 'monthly' ? priceMonthly : priceYearly
  const period = billing === 'monthly' ? '/mês' : '/ano'

  return (
    <div
      className={`relative rounded-xl p-6 md:p-8 border transition-colors ${
        recommended
          ? 'border-[#D4A853] bg-gradient-to-br from-[#D4A853]/10 to-[#0d0d0d]'
          : 'border-[#1a1a1a] bg-[#0d0d0d]'
      }`}
    >
      {recommended && (
        <div className="absolute -top-3 left-6 inline-block bg-[#D4A853] text-black text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full">
          Mais escolhido
        </div>
      )}

      <h2 className="text-2xl font-bold">{title}</h2>
      <p className="text-sm text-[#a3a3a3] mt-1 mb-6">{subtitle}</p>

      <div className="mb-6">
        <div className="flex items-baseline gap-1">
          <span className="text-4xl font-bold">{price}</span>
          <span className="text-[#a3a3a3] text-sm">{period}</span>
        </div>
        {billing === 'yearly' && (
          <div className="text-xs text-[#737373] mt-1">
            equivale a {yearlyEquivalent}
          </div>
        )}
      </div>

      <button
        disabled={disabled}
        onClick={onSelect}
        className={`w-full font-semibold py-3 rounded-md transition-colors ${
          recommended
            ? 'bg-[#D4A853] text-black hover:bg-[#e0b95f] disabled:opacity-50'
            : 'bg-white text-black hover:bg-[#e5e5e5] disabled:opacity-50'
        }`}
      >
        {loading ? 'Abrindo checkout…' : 'Começar 7 dias grátis'}
      </button>

      <ul className="mt-6 space-y-2 text-sm">
        {features.map((f) => (
          <li
            key={f.text}
            className={`flex items-start gap-2 ${
              f.positive ? 'text-white' : 'text-[#525252] line-through'
            }`}
          >
            <span className={f.positive ? 'text-[#D4A853]' : 'text-[#525252]'}>
              {f.positive ? '✓' : '×'}
            </span>
            <span>{f.text}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function humanizeError(code: string): string {
  switch (code) {
    case 'workspace_not_found':
      return 'workspace ainda não foi criado. Recarregue e tente novamente.'
    case 'already_subscribed':
      return 'você já tem uma assinatura ativa.'
    case 'not_authenticated':
      return 'sessão expirou. Faça login novamente.'
    case 'no_checkout_url':
      return 'erro ao gerar URL de pagamento. Tente novamente.'
    default:
      return 'erro ao processar. Tente novamente em alguns segundos.'
  }
}
