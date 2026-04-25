'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// Wrapper com Suspense — useSearchParams exige em Client Components no
// Next 15/16 durante o prerender. Se não envolver, build quebra com
// "missing-suspense-with-csr-bailout".
export default function LoginPage() {
  return (
    <Suspense fallback={<p className="text-sm text-[#a3a3a3]">Carregando…</p>}>
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail]             = useState('')
  const [password, setPassword]       = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading]         = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError]             = useState(
    searchParams.get('error') === 'auth' ? 'Falha na autenticação. Tente novamente.' : ''
  )

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

  // ─── Google OAuth ────────────────────────────────────────────────────────
  // Usa o mesmo callback que já existe em /api/auth/callback. Supabase gera
  // o `?code=...`, o handler troca por sessão via exchangeCodeForSession e
  // manda pro /dashboard. Se der erro (provider não configurado, redirect
  // bloqueado, etc), cai em /login?error=auth.
  async function handleGoogle() {
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
    // sucesso → browser navega pro Google, não precisa setar false
  }

  return (
    <>
      <h2 className="text-xl font-semibold text-white mb-1">Bem-vindo de volta</h2>
      <p className="text-[#a3a3a3] text-sm mb-6">Entre na sua conta para continuar</p>

      {/* Google — atalho acima do form (padrão da indústria) */}
      <button
        type="button"
        onClick={handleGoogle}
        disabled={googleLoading || loading}
        aria-label="Continuar com Google"
        className="w-full flex items-center justify-center gap-3 bg-white hover:bg-[#f5f5f5] disabled:opacity-60 disabled:cursor-not-allowed text-[#1a1a1a] font-medium rounded-lg px-4 py-2.5 text-sm transition-colors border border-[#2a2a2a]"
      >
        {/* Logo Google (oficial, SVG inline multicolor) */}
        <svg className="w-4 h-4" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
        </svg>
        {googleLoading ? 'Abrindo Google…' : 'Continuar com Google'}
      </button>

      {/* Divider "ou" */}
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

        {/* Senha com toggle mostrar/ocultar */}
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
                // Eye-off
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M3 3l18 18M10.58 10.58a2 2 0 002.83 2.83M9.88 5.09A9.77 9.77 0 0112 5c5 0 9.27 3.11 10.5 7.5a11.72 11.72 0 01-4.17 5.58M6.1 6.1C3.96 7.64 2.32 9.9 1.5 12.5 2.73 16.89 7 20 12 20c1.77 0 3.44-.39 4.95-1.09" />
                </svg>
              ) : (
                // Eye
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
