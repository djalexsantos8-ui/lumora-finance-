import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Cliente Supabase para uso exclusivo no middleware Next.js
export async function updateSession(request: NextRequest) {
  // ─── Canonical domain redirect (Deploy H.5 2026-04-25) ─────────────────────
  // Tudo que vier no domínio antigo `lumora-finance.vercel.app` é redirecio-
  // nado 301 pra `https://lumorafinance.com.br${pathname}${search}`. Motivo:
  //   · Branding (a vitrine é o domínio próprio)
  //   · GSI / Google OAuth — autorizamos JS Origins só nos domínios próprios.
  //     Se o usuário entrar pelo .vercel.app, o login com Google quebra com
  //     `Erro 400: origin_mismatch`.
  // Pulamos /api/* e /_next/* pra não quebrar webhooks/healthchecks.
  const host = request.headers.get('host') ?? ''
  const path = request.nextUrl.pathname
  if (
    host.includes('lumora-finance.vercel.app') &&
    !path.startsWith('/api/') &&
    !path.startsWith('/_next/')
  ) {
    const url = new URL(request.url)
    url.host = 'lumorafinance.com.br'
    url.protocol = 'https:'
    url.port = ''
    return NextResponse.redirect(url.toString(), 301)
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Renova a sessão do usuário (obrigatório para manter auth funcional)
  const { data: { user } } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  // ─── V2 dogfooding gate (EPIC-12) ──────────────────────────────────────────
  // Rotas /v2/* só pra admins enquanto V2 está em construção.
  // Quando feature flag `v2_public_release=true`, libera pra todos.
  // Defesa em profundidade: app/v2/layout.tsx ainda valida server-side.
  if (pathname.startsWith('/v2/') || pathname === '/v2') {
    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    // Check feature flag pública primeiro (cache 60s)
    const { data: publicFlag } = await supabase
      .from('feature_flags_global')
      .select('enabled')
      .eq('flag_key', 'v2_public_release')
      .maybeSingle()

    if (!publicFlag?.enabled) {
      // Modo dogfooding: precisa admin_grant ativo
      const nowIso = new Date().toISOString()
      const { data: grant } = await supabase
        .from('admin_grants')
        .select('id')
        .eq('user_id', user.id)
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
        .limit(1)
        .maybeSingle()

      if (!grant) {
        const url = new URL('/', request.url)
        url.searchParams.set('v2_blocked', '1')
        return NextResponse.redirect(url)
      }
    }
    // V2 allowed: passa adiante
  }

  // ─── Auth callback bypass (Deploy H.4 2026-04-24) ──────────────────────────
  // A rota `/api/auth/*` (OAuth callback, password recovery) TEM que passar
  // direto sem qualquer redirect de auth/subscription. Caso contrário:
  //
  //   1. Usuário clica "Login com Google"
  //   2. Google redireciona para /api/auth/callback?code=xxx
  //   3. Middleware chama auth.getUser() → null (code ainda não foi trocado)
  //   4. Middleware faz redirect 307 para /login
  //   5. O ?code= é descartado → exchangeCodeForSession nunca roda
  //   6. Usuário volta pro login → redirect loop
  //
  // Idem para recovery: se o usuário já tiver sessão antiga, sem bypass o
  // middleware manda pro /dashboard ANTES do handler trocar o código pela
  // nova sessão (da recuperação). Bypass total resolve ambos.
  if (pathname.startsWith('/api/auth')) {
    return supabaseResponse
  }

  // Rotas públicas (não exigem login)
  // /aceitar-convite/* permite landing pública com login redirect interno
  const publicRoutes = ['/login', '/signup', '/forgot-password', '/aceitar-convite']
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route))

  // Rotas excluídas do subscription guard (acessíveis mesmo com acesso bloqueado)
  const bypassRoutes = ['/upgrade', '/api/stripe', '/api/auth', '/aceitar-convite']
  const isBypassRoute = bypassRoutes.some(route => pathname.startsWith(route))

  // Rota raiz redireciona para login ou dashboard
  if (pathname === '/') {
    if (user) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Usuário não logado tentando acessar rota protegida
  if (!user && !isPublicRoute) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Usuário logado tentando acessar rota de auth
  // (mas /aceitar-convite/* deve passar mesmo logado pra renderizar o aceite)
  if (user && isPublicRoute && !pathname.startsWith('/aceitar-convite')) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // ─── EPIC-11: Paywall direcionado por feature ─────────────────────────────
  // Antes do guard genérico de subscription, intercepta rotas premium e
  // redireciona pra `/upgrade?feature=X&from=Y` se workspace V2 não tem o
  // plano necessário. V1 puro (sem subscriptions_v2) NÃO sofre paywall —
  // mantém comportamento legacy. Trial = acesso total.
  if (user && !isPublicRoute && !isBypassRoute) {
    const featureKey = matchFeatureRoute(pathname)
    if (featureKey) {
      const { data: subV2 } = await supabase
        .from('subscriptions_v2')
        .select('plan, status')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      // Só aplica gate se há subscription V2. V1 puro segue para subscription guard abaixo.
      if (subV2) {
        const allowed = await isFeatureAllowed(supabase, subV2, featureKey)
        if (!allowed) {
          const url = new URL('/upgrade', request.url)
          url.searchParams.set('feature', featureKey)
          url.searchParams.set('from', pathname)
          return NextResponse.redirect(url)
        }
      }
    }
  }

  // Access guard: verifica admin_grant OU subscription ativa
  if (user && !isPublicRoute && !isBypassRoute) {

    // 1. Verificar admin_grant ativo (override manual — bypassa subscription)
    const now = new Date().toISOString()
    const { data: grant } = await supabase
      .from('admin_grants')
      .select('id, expires_at')
      .eq('user_id', user.id)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .limit(1)
      .maybeSingle()

    if (grant) {
      // Grant ativo encontrado — acesso liberado independente da subscription
      return supabaseResponse
    }

    // 2. Verificar status da subscription
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('status, trial_ends_at')
      .eq('user_id', user.id)
      .single()

    if (!subscription) {
      return NextResponse.redirect(new URL('/upgrade', request.url))
    }

    // active passa direto
    if (subscription.status === 'active') {
      return supabaseResponse
    }

    // trialing: só passa se trial_ends_at ainda está no futuro
    if (subscription.status === 'trialing') {
      const trialEnds = subscription.trial_ends_at
        ? new Date(subscription.trial_ends_at).getTime()
        : 0
      if (trialEnds > Date.now()) {
        return supabaseResponse
      }
      // trial expirou — bloqueia com flag pra página /upgrade saber
      const url = new URL('/upgrade', request.url)
      url.searchParams.set('reason', 'trial_expired')
      return NextResponse.redirect(url)
    }

    // paused, past_due, canceled, incomplete, etc → /upgrade
    return NextResponse.redirect(new URL('/upgrade', request.url))
  }

  return supabaseResponse
}

// ─── EPIC-11 helpers ─────────────────────────────────────────────────────────
// Mapeamento de prefixo de URL → feature_key (consultado em feature_gates).
// Quando uma dessas rotas vira realidade, o middleware automaticamente bloqueia.
const FEATURE_ROUTES: Record<string, string> = {
  '/crm':           'crm',
  '/marketing':     'marketing',
  '/agenda':        'agenda',
  '/sua-produtora': 'sua_produtora',
}

const PLAN_RANK_MW: Record<string, number> = { creator: 1, enterprise: 2 }

function matchFeatureRoute(path: string): string | null {
  for (const [prefix, key] of Object.entries(FEATURE_ROUTES)) {
    if (path === prefix || path.startsWith(prefix + '/')) return key
  }
  return null
}

/**
 * Versão middleware-compatible da regra de hasFeature. Lê feature_gates direto
 * via supabase client (sem unstable_cache — Edge runtime). Pequeno custo extra
 * compensado por: (a) só roda em rotas premium, (b) não há outra opção em Edge.
 */
async function isFeatureAllowed(
  supabase: ReturnType<typeof createServerClient>,
  sub: { plan: string | null; status: string | null },
  featureKey: string
): Promise<boolean> {
  if (sub.status === 'trialing') return true
  if (
    sub.status === 'past_due' ||
    sub.status === 'unpaid' ||
    sub.status === 'canceled' ||
    sub.status === 'incomplete_expired'
  ) {
    return false
  }
  if (sub.status !== 'active' || !sub.plan) return false

  const { data: gate } = await supabase
    .from('feature_gates')
    .select('min_plan')
    .eq('feature_key', featureKey)
    .maybeSingle()
  if (!gate) return true

  const minPlan = (gate as { min_plan: string }).min_plan
  return (PLAN_RANK_MW[sub.plan] ?? 0) >= (PLAN_RANK_MW[minPlan] ?? 99)
}
