'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback?type=recovery`,
    })

    if (error) {
      setError('Erro ao enviar e-mail. Tente novamente.')
      setLoading(false)
      return
    }

    setSent(true)
    setLoading(false)
  }

  if (sent) {
    return (
      <div className="text-center">
        <div className="text-4xl mb-4">✉️</div>
        <h2 className="text-xl font-semibold text-white mb-2">E-mail enviado</h2>
        <p className="text-[#a3a3a3] text-sm">
          Se esse e-mail estiver cadastrado, você receberá um link para redefinir sua senha.
        </p>
        <Link
          href="/login"
          className="inline-block mt-6 text-sm text-[#D4A853] hover:text-[#E8C47A] transition-colors"
        >
          ← Voltar para o login
        </Link>
      </div>
    )
  }

  return (
    <>
      <h2 className="text-xl font-semibold text-white mb-1">Esqueceu a senha?</h2>
      <p className="text-[#a3a3a3] text-sm mb-6">
        Digite seu e-mail e enviaremos um link para redefinir sua senha.
      </p>

      <form onSubmit={handleReset} className="space-y-4">
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

        {error && (
          <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-4 py-2.5">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[#D4A853] hover:bg-[#E8C47A] disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors"
        >
          {loading ? 'Enviando...' : 'Enviar link de recuperação'}
        </button>
      </form>

      <div className="text-center mt-6">
        <Link
          href="/login"
          className="text-sm text-[#a3a3a3] hover:text-[#D4A853] transition-colors"
        >
          ← Voltar para o login
        </Link>
      </div>
    </>
  )
}
