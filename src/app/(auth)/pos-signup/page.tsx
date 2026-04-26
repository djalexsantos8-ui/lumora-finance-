import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ session_id?: string }>
}

/**
 * Callback do Stripe Checkout success_url.
 *
 * O Stripe redireciona pra cá com session_id após cartão validado.
 * O webhook (EPIC-08) processa o evento `customer.subscription.created`
 * em paralelo — pode chegar ANTES ou DEPOIS deste request.
 *
 * Estratégia: polling curto (até 5s, 250ms intervalo) buscando subscription_v2
 * pra mostrar o plan correto. Se webhook ainda não chegou, mostra estado
 * genérico de boas-vindas (UX não bloqueia).
 */
export default async function PosSignupPage({ searchParams }: PageProps) {
  const params = await searchParams
  if (!params.session_id) redirect('/escolher-plano')

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Polling curto pra esperar webhook processar
  const admin = createAdminClient()
  const startedAt = Date.now()
  let sub: { plan: string; trial_end_at: string | null; status: string } | null = null

  while (Date.now() - startedAt < 5000) {
    const { data } = await admin
      .from('subscriptions_v2')
      .select('plan, trial_end_at, status')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ plan: string; trial_end_at: string | null; status: string }>()
    if (data) {
      sub = data
      break
    }
    await new Promise((r) => setTimeout(r, 250))
  }

  const planLabel = sub?.plan === 'enterprise' ? 'Enterprise' : sub?.plan === 'creator' ? 'Creator' : 'Lumora'
  const trialEnds = sub?.trial_end_at
    ? new Date(sub.trial_end_at).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'long',
      })
    : null

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] text-white px-6">
      <div className="max-w-md w-full text-center">
        <div className="text-6xl mb-6">🎉</div>

        <h1 className="text-3xl font-bold mb-3">
          Você está dentro do plano {planLabel}
        </h1>

        <p className="text-[#a3a3a3] leading-relaxed mb-8">
          Trial de 7 dias começou agora.
          {trialEnds && (
            <>
              {' '}Sem cobrança até <span className="text-white">{trialEnds}</span>.
            </>
          )}
          <br />
          Pode cancelar nas Configurações a qualquer momento — você mantém
          acesso até o fim do período pago.
        </p>

        <Link
          href="/dashboard"
          className="inline-block bg-[#D4A853] text-black font-semibold px-8 py-3 rounded-md hover:bg-[#e0b95f] transition-colors"
        >
          Ir pro dashboard →
        </Link>

        {!sub && (
          <p className="mt-8 text-xs text-[#525252]">
            Estamos finalizando os detalhes da sua conta. Se algo parecer
            estranho, recarregue a página em alguns segundos.
          </p>
        )}
      </div>
    </div>
  )
}
