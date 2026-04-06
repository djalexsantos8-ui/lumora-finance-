import Link from 'next/link'

export const metadata = { title: 'Insights — Lumora Finance' }

export default function InsightDetailPage() {
  return (
    <div className="min-h-full flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        {/* Ícone de cadeado */}
        <div className="w-16 h-16 rounded-2xl bg-[#141414] border border-[#2a2a2a] flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-[#D4A853]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>

        <span className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full border bg-[#D4A853]/10 text-[#D4A853] border-[#D4A853]/20 mb-4">
          Conteúdo Exclusivo Lumora
        </span>

        <h1 className="text-xl font-semibold text-white mb-3">Em breve</h1>

        <p className="text-[#a3a3a3] text-sm leading-relaxed mb-8">
          Em breve você terá acesso a conteúdos exclusivos da Lumora para melhorar
          sua precificação, operação e faturamento.
        </p>

        <Link
          href="/insights"
          className="inline-flex items-center gap-2 text-sm text-[#a3a3a3] hover:text-white transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
          </svg>
          Voltar para Insights
        </Link>
      </div>
    </div>
  )
}
