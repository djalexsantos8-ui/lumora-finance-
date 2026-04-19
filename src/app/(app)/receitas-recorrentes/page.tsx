import PagePlaceholder from '@/components/page-placeholder'

export const metadata = { title: 'Receita Recorrente — Lumora Finance' }

export default function ReceitasRecorrentesPage() {
  return (
    <PagePlaceholder
      icon={
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      }
      title="Receita Recorrente"
      description="Cadastre receitas fixas mensais — mensalidades, retainers e contratos recorrentes — e acompanhe o MRR do seu negócio direto no dashboard."
      badge="Em breve"
    />
  )
}
