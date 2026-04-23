import Link from 'next/link'

export const metadata = { title: 'Insights — Lumora Finance' }

interface InsightCard {
  slug: string
  category: string
  title: string
  description: string
  is_locked: boolean
  gradient: string
}

const insightCards: InsightCard[] = [
  {
    slug: 'precificacao-diaria',
    category: 'Precificação',
    title: 'Como precificar sua diária sem se desvalorizar',
    description: 'A fórmula que produtoras usam para definir valor de mercado.',
    is_locked: true,
    gradient: 'from-[#D4A853]/20 to-[#1c1c1c]',
  },
  {
    slug: 'margem-de-lucro',
    category: 'Precificação',
    title: 'Margem de lucro: qual o percentual ideal para filmmakers',
    description: 'Por que cobrar mais do que seus custos é obrigação, não ganância.',
    is_locked: true,
    gradient: 'from-amber-900/20 to-[#1c1c1c]',
  },
  {
    slug: 'orcamento-profissional',
    category: 'Vendas',
    title: 'Por que um orçamento bem apresentado fecha mais contratos',
    description: 'Vender é sobre percepção de valor. Veja como se posicionar.',
    is_locked: true,
    gradient: 'from-blue-900/20 to-[#1c1c1c]',
  },
  {
    slug: 'operacao-producao',
    category: 'Operação',
    title: 'Os custos invisíveis de uma produção que destroem sua margem',
    description: 'O que você esquece de cobrar e como parar de trabalhar de graça.',
    is_locked: true,
    gradient: 'from-rose-900/20 to-[#1c1c1c]',
  },
  {
    slug: 'fluxo-caixa',
    category: 'Financeiro',
    title: 'Fluxo de caixa para freelancers: o básico que ninguém ensina',
    description: 'Como sobreviver nos meses vazios sem entrar em pânico.',
    is_locked: true,
    gradient: 'from-emerald-900/20 to-[#1c1c1c]',
  },
  {
    slug: 'clientes-recorrentes',
    category: 'Vendas',
    title: 'Como transformar um job em um cliente recorrente',
    description: 'A estratégia de relacionamento que multiplica seu faturamento.',
    is_locked: true,
    gradient: 'from-purple-900/20 to-[#1c1c1c]',
  },
]

const categories = ['Todos', 'Precificação', 'Vendas', 'Operação', 'Financeiro']

export default function InsightsPage() {
  return (
    <div className="min-h-full p-6 md:p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium text-[#D4A853] uppercase tracking-widest">
            Exclusivo Lumora
          </span>
        </div>
        <h1 className="text-2xl font-bold text-white">Insights</h1>
        <p className="text-[#a3a3a3] text-sm mt-1">
          O que toda produtora precisa saber para crescer.
        </p>
      </div>

      {/* Categorias */}
      <div className="flex gap-2 mb-8 flex-wrap">
        {categories.map((cat) => (
          <button
            key={cat}
            className={`px-3 py-1.5 rounded-full text-sm transition-colors
              ${cat === 'Todos'
                ? 'bg-[#D4A853]/10 text-[#D4A853] border border-[#D4A853]/20'
                : 'bg-[#141414] text-[#a3a3a3] border border-[#2a2a2a] hover:border-[#3a3a3a] hover:text-white'
              }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Destaque */}
      <Link href="/insights/precificacao-diaria">
        <div className="relative rounded-2xl overflow-hidden border border-[#2a2a2a] mb-8 cursor-pointer group">
          <div className="bg-gradient-to-r from-[#D4A853]/15 via-[#141414] to-[#141414] p-8 md:p-10">
            <span className="text-xs font-medium text-[#D4A853] uppercase tracking-widest">
              Em destaque · Precificação
            </span>
            <h2 className="text-xl md:text-2xl font-bold text-white mt-2 mb-3 max-w-lg group-hover:text-[#E8C47A] transition-colors">
              Como precificar sua diária sem se desvalorizar
            </h2>
            <p className="text-[#a3a3a3] text-sm max-w-md">
              A fórmula que produtoras usam para definir valor de mercado e parar de competir por preço.
            </p>
            <div className="flex items-center gap-2 mt-6">
              <span className="inline-flex items-center gap-1.5 text-xs text-[#525252]">
                <svg className="w-3.5 h-3.5 text-[#D4A853]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Conteúdo exclusivo · incluso no plano
              </span>
            </div>
          </div>
        </div>
      </Link>

      {/* Grid de cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {insightCards.map((card) => (
          <Link key={card.slug} href={`/insights/${card.slug}`}>
            <div className={`
              relative rounded-xl border border-[#2a2a2a] overflow-hidden
              bg-gradient-to-b ${card.gradient}
              hover:border-[#3a3a3a] transition-all group cursor-pointer h-full
            `}>
              <div className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-[#D4A853] font-medium">{card.category}</span>
                  {card.is_locked && (
                    <svg className="w-3.5 h-3.5 text-[#525252]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  )}
                </div>
                <h3 className="text-sm font-semibold text-white mb-2 leading-snug group-hover:text-[#E8C47A] transition-colors">
                  {card.title}
                </h3>
                <p className="text-xs text-[#525252] leading-relaxed">
                  {card.description}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
