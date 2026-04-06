'use client'

import { useState } from 'react'

interface CheckoutButtonProps {
  plan: 'monthly' | 'yearly'
  label: string
  price: string
  description: string
  highlight?: boolean
}

export default function CheckoutButton({
  plan,
  label,
  price,
  description,
  highlight = false,
}: CheckoutButtonProps) {
  const [loading, setLoading] = useState(false)

  async function handleCheckout() {
    setLoading(true)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })

      const data = await res.json()

      if (!res.ok || !data.url) {
        console.error('Erro ao criar sessão de checkout:', data.error)
        setLoading(false)
        return
      }

      window.location.href = data.url
    } catch (err) {
      console.error('Erro inesperado:', err)
      setLoading(false)
    }
  }

  if (highlight) {
    return (
      <button
        onClick={handleCheckout}
        disabled={loading}
        className="w-full bg-[#D4A853] hover:bg-[#E8C47A] disabled:opacity-60 disabled:cursor-not-allowed text-[#0a0a0a] font-semibold rounded-xl px-4 py-4 transition-colors text-left relative"
      >
        <div className="absolute top-2 right-3">
          <span className="text-xs bg-[#0a0a0a]/20 text-[#0a0a0a] font-semibold px-2 py-0.5 rounded-full">
            Popular
          </span>
        </div>
        <div className="text-sm font-semibold">{label}</div>
        <div className="text-lg font-bold">{price}</div>
        <div className="text-xs opacity-70">{description}</div>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-[#D4A853]/80">
            <svg className="animate-spin w-5 h-5 text-[#0a0a0a]" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        )}
      </button>
    )
  }

  return (
    <button
      onClick={handleCheckout}
      disabled={loading}
      className="w-full bg-[#1c1c1c] hover:bg-[#262626] disabled:opacity-60 disabled:cursor-not-allowed border border-[#2a2a2a] hover:border-[#3a3a3a] text-white font-semibold rounded-xl px-4 py-4 transition-colors text-left relative"
    >
      <div className="text-sm font-semibold">{label}</div>
      <div className="text-lg font-bold">{price}</div>
      <div className="text-xs text-[#a3a3a3]">{description}</div>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-[#1c1c1c]/80">
          <svg className="animate-spin w-5 h-5 text-white" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      )}
    </button>
  )
}
