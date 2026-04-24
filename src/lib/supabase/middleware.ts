import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Cliente Supabase para uso exclusivo no middleware Next.js
export async function updateSession(request: NextRequest) {
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
  const publicRoutes = ['/login', '/signup', '/forgot-password']
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route))

  // Rotas excluídas do subscription guard (acessíveis mesmo com acesso bloqueado)
  const bypassRoutes = ['/upgrade', '/api/stripe', '/api/auth']
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
  if (user && isPublicRoute) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
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
