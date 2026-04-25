'use client'

import { Suspense, useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import Script from 'next/script'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// ─── Google Identity Services typing ─────────────────────────────────────────

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: GsiInitConfig) => void
          renderButton: (parent: HTMLElement, opts: GsiButtonOptions) => void
          prompt: (notification?: (n: GsiPromptNotification) => void) => void
          cancel: () => void
          disableAutoSelect: () => void
        }
      }
    }
  }
}

type GsiCredentialResponse = { credential: string; select_by?: string }

type GsiInitConfig = {
  client_id: string
  callback: (response: GsiCredentialResponse) => void
  nonce?: string
  use_fedcm_for_prompt?: boolean
  ux_mode?: 'popup' | 'redirect'
  itp_support?: boolean
  auto_select?: boolean
  context?: 'signin' | 'signup' | 'use'
}

type GsiButtonOptions = {
  type?: 'standard' | 'icon'
  theme?: 'outline' | 'filled_blue' | 'filled_black'
  size?: 'large' | 'medium' | 'small'
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin'
  shape?: 'rectangular' | 'pill' | 'circle' | 'square'
  logo_alignment?: 'left' | 'center'
  width?: number | string
  locale?: string
}

type GsiPromptNotification = {
  isNotDisplayed: () => boolean
  isSkippedMoment: () => boolean
  isDismissedMoment: () => boolean
  getNotDisplayedReason: () => string
  getSkippedReason: () => string
  getDismissedReason: () => string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function generateNonce(): Promise<[string, string]> {
  const nonce = crypto.randomUUID()
  const data = new TextEncoder().encode(nonce)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashedNonce = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  return [nonce, hashedNonce]
}

// ─── Page wrapper ────────────────────────────────────────────────────────────

export default function LoginPage() {
  return (
    <Suspense fallback={<p className="text-sm text-[#a3a3a3]">Carregando…</p>}>
      <LoginForm />
    </Suspense>
  )
}

// ─── LoginForm ───────────────────────────────────────────────────────────────
//
// Histórico de bugs corrigidos aqui (Deploy H.5 2026-04-25):
//   1. `gsiReady` era useRef → React não re-renderizava quando GSI carregava.
//      Botão fallback ficava grudado em cima do botão GSI. Trocado pra useState.
//   2. setupGsi era recriado a cada render (dependia de handleGsiCredential que
//      dependia de router) → useEffect re-rodava infinito → re-init do GSI →
//      iframe duplicado → erro "Erro inesperado" do global-error boundary.
//      Solução: callback estável via ref + setupGsi com deps vazias.
//   3. router.push após signInWithIdToken corria contra o GSI ainda mid-cleanup.
//      Adicionado try/catch + flag mountedRef pra abortar setState após unmount.

function LoginForm() {
  const router       = useRouter()
  const searchParams = useSearchParams()

  const [email, setEmail]               = useState('')
  const [password, setPassword]         = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading]           = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError]               = useState(
    searchParams.get('error') === 'auth' ? 'Falha na autenticação. Tente novamente.' : ''
  )

  // useState aqui (não useRef!) pra disparar re-render quando GSI carrega.
  const [gsiReady, setGsiReady] = useState(false)

  // Refs estáveis pra evitar re-init do GSI a cada render
  const nonceRef           = useRef<string | null>(null)
  const setupDoneRef       = useRef(false)
  const mountedRef         = useRef(true)
  const buttonContainerRef = useRef<HTMLDivElement>(null)
  // Stable callback ref — evita que setupGsi dependa de funções que mudam
  // identidade (router, etc)
  const credentialCallbackRef = useRef<(r: GsiCredentialResponse) => void>(() => {})

  // ─── Email/senha ───────────────────────────────────────────────────────────
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('E-mail ou senha incorretos.')
      setLoading(false)
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  // ─── Google Identity Services callback ─────────────────────────────────────
  //
  // Cuidados:
  //   · só chama setState se o componente ainda está montado (mountedRef).
  //   · qualquer throw dentro do callback do Google quebra o page tree (Next
  //     router não captura erros de listeners externos), então embrulha tudo
  //     em try/catch e degrada via setError.
  useEffect(() => {
    credentialCallbackRef.current = async (response: GsiCredentialResponse) => {
      if (!mountedRef.current) return
      setGoogleLoading(true)
      setError('')
      try {
        const supabase = createClient()
        const { error } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: response.credential,
          nonce: nonceRef.current ?? undefined,
        })
        if (!mountedRef.current) return
        if (error) {
          setError(`Não foi possível entrar com Google: ${error.message}`)
          setGoogleLoading(false)
          return
        }
        // Primeiro refresh para invalidar cache server-side, depois push
        router.refresh()
        router.push('/dashboard')
      } catch (e) {
        if (!mountedRef.current) return
        setError('Erro inesperado no login com Google. Tente novamente.')
        setGoogleLoading(false)
        // eslint-disable-next-line no-console
        console.error('[login] GSI credential error', e)
      }
    }
  }, [router])

  // ─── Setup GSI — roda UMA VEZ quando o script carrega ──────────────────────
  const setupGsi = useCallback(async () => {
    if (setupDoneRef.current) return
    if (typeof window === 'undefined' || !window.google?.accounts?.id) return

    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
    if (!clientId) {
      // eslint-disable-next-line no-console
      console.warn('[login] NEXT_PUBLIC_GOOGLE_CLIENT_ID não configurada — fallback para signInWithOAuth.')
      return
    }

    try {
      const [nonce, hashed] = await generateNonce()
      if (!mountedRef.current) return
      nonceRef.current = nonce

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (r) => credentialCallbackRef.current(r),
        nonce: hashed,
        use_fedcm_for_prompt: true,
        auto_select: false,
        context: 'signin',
        ux_mode: 'popup',
      })

      const container = buttonContainerRef.current
      if (container && mountedRef.current) {
        container.innerHTML = ''
        window.google.accounts.id.renderButton(container, {
          type: 'standard',
          theme: 'filled_black',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          logo_alignment: 'left',
          width: 380,
          locale: 'pt-BR',
        })
      }

      setupDoneRef.current = true
      if (mountedRef.current) setGsiReady(true)
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[login] GSI setup error', e)
      // Não setError — deixa o fallback button visível e usável
    }
  }, [])

  // Roda setup ao mount + retry curto caso o script ainda esteja carregando.
  useEffect(() => {
    mountedRef.current = true
    void setupGsi()

    let attempts = 0
    const id = window.setInterval(() => {
      if (setupDoneRef.current || attempts > 30) {
        window.clearInterval(id)
        return
      }
      attempts++
      void setupGsi()
    }, 100)

    return () => {
      mountedRef.current = false
      window.clearInterval(id)
      // Best-effort cleanup — Google library tolera chamadas após unmount, mas
      // queremos parar qualquer auto-prompt pendente.
      try {
        window.google?.accounts.id.cancel()
      } catch { /* noop */ }
    }
  }, [setupGsi])

  // ─── Fallback OAuth flow (signInWithOAuth via Supabase) ────────────────────
  async function handleGoogleFallback() {
    setGoogleLoading(true)
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback`,
        queryParams: { prompt: 'select_account' },
      },
    })
    if (error) {
      setError('Não foi possível iniciar o login com Google.')
      setGoogleLoading(false)
    }
  }

  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={() => { void setupGsi() }}
      />

      <h2 className="text-xl font-semibold text-white mb-1">Bem-vindo de volta</h2>
      <p className="text-[#a3a3a3] text-sm mb-6">Entre na sua conta para continuar</p>

      {/* Container onde GSI renderiza o botão oficial Google. Quando GSI fica
          ready, o fallback abaixo desaparece e o iframe Google ocupa o espaço. */}
      <div className="w-full flex justify-center min-h-[44px]" ref={buttonContainerRef}>
        {!gsiReady && !googleLoading && (
          // Fallback funcional enquanto o GSI carrega (ou se nunca carregar).
          // Quando clicado antes do GSI estar pronto, cai no signInWithOAuth
          // antigo (que vai mostrar "supabase.co" no consent — só pra não
          // travar o usuário).
          <button
            type="button"
            onClick={handleGoogleFallback}
            disabled={loading}
            aria-label="Continuar com Google"
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-[#f5f5f5] disabled:opacity-60 disabled:cursor-not-allowed text-[#1a1a1a] font-medium rounded-lg px-4 py-2.5 text-sm transition-colors border border-[#2a2a2a]"
          >
            <svg className="w-4 h-4" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            Continuar com Google
          </button>
        )}
      </div>

      {googleLoading && (
        <p className="text-xs text-[#737373] text-center mt-2">Conectando…</p>
      )}

      <div className="flex items-center gap-3 my-5" aria-hidden="true">
        <div className="flex-1 h-px bg-[#2a2a2a]" />
        <span className="text-xs text-[#525252]">ou</span>
        <div className="flex-1 h-px bg-[#2a2a2a]" />
      </div>

      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label htmlFor="login-email" className="block text-sm text-[#a3a3a3] mb-1.5">E-mail</label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seu@email.com"
            required
            autoComplete="email"
            className="w-full bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg px-4 py-2.5 text-white text-sm placeholder-[#525252] focus:outline-none focus:border-[#D4A853] transition-colors"
          />
        </div>

        <div>
          <label htmlFor="login-password" className="block text-sm text-[#a3a3a3] mb-1.5">Senha</label>
          <div className="relative">
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              className="w-full bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg px-4 py-2.5 pr-11 text-white text-sm placeholder-[#525252] focus:outline-none focus:border-[#D4A853] transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              aria-pressed={showPassword}
              tabIndex={-1}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-[#737373] hover:text-[#D4A853] transition-colors"
            >
              {showPassword ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M3 3l18 18M10.58 10.58a2 2 0 002.83 2.83M9.88 5.09A9.77 9.77 0 0112 5c5 0 9.27 3.11 10.5 7.5a11.72 11.72 0 01-4.17 5.58M6.1 6.1C3.96 7.64 2.32 9.9 1.5 12.5 2.73 16.89 7 20 12 20c1.77 0 3.44-.39 4.95-1.09" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z" />
                  <circle cx="12" cy="12" r="3" strokeWidth={1.5} />
                </svg>
              )}
            </button>
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-4 py-2.5">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || googleLoading}
          className="w-full bg-[#D4A853] hover:bg-[#E8C47A] disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors"
        >
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>

      <div className="mt-6 space-y-3 text-center">
        <Link
          href="/forgot-password"
          className="block text-sm text-[#a3a3a3] hover:text-[#D4A853] transition-colors"
        >
          Esqueceu a senha?
        </Link>

        <p className="text-sm text-[#525252]">
          Não tem conta?{' '}
          <Link href="/signup" className="text-[#D4A853] hover:text-[#E8C47A] transition-colors">
            Cadastre-se grátis
          </Link>
        </p>
      </div>
    </>
  )
}
