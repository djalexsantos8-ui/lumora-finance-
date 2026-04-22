'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const CURRENCIES = [
  { code: 'BRL', label: 'Real Brasileiro (R$)' },
  { code: 'USD', label: 'Dólar Americano ($)' },
  { code: 'EUR', label: 'Euro (€)' },
  { code: 'PYG', label: 'Guarani Paraguaio (₲)' },
  { code: 'JPY', label: 'Iene Japonês (¥)' },
  { code: 'CNY', label: 'Yuan Chinês (CN¥)' },
]

export default function SignupPage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [currency, setCurrency] = useState('BRL')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    if (!termsAccepted) {
      setError('Você precisa aceitar os termos para continuar.')
      return
    }
    if (password.length < 8) {
      setError('A senha deve ter pelo menos 8 caracteres.')
      return
    }

    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          primary_currency: currency,
        },
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback`,
      },
    })

    if (error) {
      setError(error.message === 'User already registered'
        ? 'Este e-mail já está cadastrado.'
        : 'Erro ao criar conta. Tente novamente.'
      )
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)
  }

  if (success) {
    return (
      <div className="text-center">
        <div className="text-4xl mb-4">📬</div>
        <h2 className="text-xl font-semibold text-white mb-2">Verifique seu e-mail</h2>
        <p className="text-[#a3a3a3] text-sm">
          Enviamos um link de confirmação para{' '}
          <span className="text-white font-medium">{email}</span>.
          <br />
          Clique no link para ativar sua conta.
        </p>
        <p className="text-[#525252] text-xs mt-4">
          Não recebeu? Verifique a pasta de spam.
        </p>
      </div>
    )
  }

  return (
    <>
      <h2 className="text-xl font-semibold text-white mb-1">Crie sua conta</h2>
      <p className="text-[#a3a3a3] text-sm mb-6">7 dias grátis, sem cartão de crédito</p>

      <form onSubmit={handleSignup} className="space-y-4">
        <div>
          <label className="block text-sm text-[#a3a3a3] mb-1.5">Nome completo</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Seu nome"
            required
            className="w-full bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg px-4 py-2.5 text-white text-sm placeholder-[#525252] focus:outline-none focus:border-[#D4A853] transition-colors"
          />
        </div>

        <div>
          <label className="block text-sm text-[#a3a3a3] mb-1.5">E-mail</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seu@email.com"
            required
            className="w-full bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg px-4 py-2.5 text-white text-sm placeholder-[#525252] focus:outline-none focus:border-[#D4A853] transition-colors"
          />
        </div>

        <div>
          <label className="block text-sm text-[#a3a3a3] mb-1.5">Senha</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mínimo 8 caracteres"
            required
            className="w-full bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg px-4 py-2.5 text-white text-sm placeholder-[#525252] focus:outline-none focus:border-[#D4A853] transition-colors"
          />
        </div>

        <div>
          <label className="block text-sm text-[#a3a3a3] mb-1.5">Moeda principal</label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="w-full bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#D4A853] transition-colors"
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code} className="bg-[#1c1c1c]">
                {c.label}
              </option>
            ))}
          </select>
        </div>

        {/* Aceite de Termos — LGPD */}
        <div className="flex items-start gap-3 bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg p-4">
          <input
            id="terms"
            type="checkbox"
            checked={termsAccepted}
            onChange={(e) => setTermsAccepted(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-[#D4A853] cursor-pointer flex-shrink-0"
          />
          <label htmlFor="terms" className="text-xs text-[#a3a3a3] cursor-pointer leading-relaxed">
            Li e aceito os{' '}
            <span className="text-[#D4A853]">Termos de Uso</span> e a{' '}
            <span className="text-[#D4A853]">Política de Privacidade</span>.
            Seus dados financeiros são privados e não serão acessados pela Lumora Finance.
            Estamos em conformidade com a LGPD.
          </label>
        </div>

        {error && (
          <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-4 py-2.5">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || !termsAccepted}
          className="w-full bg-[#D4A853] hover:bg-[#E8C47A] disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors"
        >
          {loading ? 'Criando conta...' : 'Criar conta grátis'}
        </button>
      </form>

      <p className="text-center text-sm text-[#525252] mt-6">
        Já tem conta?{' '}
        <Link href="/login" className="text-[#D4A853] hover:text-[#E8C47A] transition-colors">
          Entrar
        </Link>
      </p>
    </>
  )
}
