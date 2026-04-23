import Link from 'next/link'

/**
 * Empty state premium mostrado quando o workspace ainda não tem dados
 * suficientes pra calcular KPIs do Dashboard Executivo. Não quebra nem
 * esconde o dashboard — só mostra quando `hasEnoughDataForInsights()`
 * retorna false.
 *
 * Ação primária: criar primeiro orçamento (fluxo mais curto pra gerar receita).
 * Ações secundárias: novo freelance, registrar um custo, fazer tour de novo.
 */
export default function DashboardEmptyState({ firstName }: { firstName?: string | null }) {
  const greeting = firstName ? `Bem-vindo, ${firstName}.` : 'Bem-vindo ao Lumora Finance.'

  return (
    <div className="min-h-full p-6 md:p-10">
      <div className="max-w-4xl mx-auto">
        {/* Hero */}
        <div className="rounded-2xl border border-[#2a2a2a] bg-gradient-to-br from-[#D4A853]/10 via-[#141414] to-[#0a0a0a] p-8 md:p-10 mb-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-[#D4A853]">
              Primeiros passos
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-3">{greeting}</h1>
          <p className="text-[#a3a3a3] text-sm md:text-base max-w-xl leading-relaxed">
            Seu dashboard vai ganhar vida assim que você registrar um orçamento, um
            freelance ou um custo. Vamos começar com o que traz dinheiro mais rápido:
            um <span className="text-white font-medium">orçamento</span>.
          </p>

          <div className="flex flex-wrap items-center gap-3 mt-6">
            <Link
              href="/budgets/new"
              className="inline-flex items-center gap-2 bg-[#D4A853] hover:bg-[#E8C47A] text-[#0a0a0a] font-semibold text-sm px-4 py-2.5 rounded-xl transition-colors"
            >
              Criar primeiro orçamento
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
            <Link
              href="/freelances"
              className="inline-flex items-center text-sm font-medium text-[#a3a3a3] hover:text-white px-3 py-2.5 rounded-xl transition-colors"
            >
              Registrar freelance
            </Link>
          </div>
        </div>

        {/* Cards de próximos passos */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Step
            index={1}
            title="Configure sua empresa"
            body="Logo, CNPJ ou CPF, regime tributário, métodos de pagamento. Aparece nos PDFs."
            href="/settings"
            cta="Abrir configurações"
          />
          <Step
            index={2}
            title="Crie seu primeiro orçamento"
            body="Use a IA pra rascunhar uma proposta completa em segundos. Você só ajusta valores."
            href="/budgets/new"
            cta="Novo orçamento"
          />
          <Step
            index={3}
            title="Registre seus custos fixos"
            body="Aluguéis, SaaS, equipamento. Base pra calcular lucro real por mês."
            href="/fixed-costs"
            cta="Cadastrar custos"
          />
        </div>

        {/* Dica */}
        <div className="mt-8 flex items-start gap-3 rounded-xl border border-[#1f1f1f] bg-[#0d0d0d] p-4">
          <div className="w-8 h-8 rounded-lg bg-[#D4A853]/10 border border-[#D4A853]/30 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-[#D4A853]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="text-xs leading-relaxed text-[#a3a3a3]">
            <span className="text-white font-medium">Dica: </span>
            os KPIs do dashboard (margem, inadimplência, pipeline) precisam de
            pelo menos <span className="text-white">um freelance ou pagamento registrado</span> pra fazerem
            sentido. Assim que você criar, tudo aparece por aqui automaticamente.
          </div>
        </div>
      </div>
    </div>
  )
}

function Step({ index, title, body, href, cta }: { index: number; title: string; body: string; href: string; cta: string }) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-[#2a2a2a] bg-[#0d0d0d] hover:border-[#3a3a3a] p-5 transition-colors block"
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="w-6 h-6 rounded-full bg-[#D4A853]/15 border border-[#D4A853]/30 text-[#D4A853] text-[11px] font-bold flex items-center justify-center">
          {index}
        </span>
        <h3 className="text-sm font-semibold text-white group-hover:text-[#E8C47A] transition-colors">{title}</h3>
      </div>
      <p className="text-xs text-[#a3a3a3] leading-relaxed mb-3">{body}</p>
      <span className="text-[11px] font-medium text-[#D4A853] group-hover:text-[#E8C47A] transition-colors">{cta} →</span>
    </Link>
  )
}
