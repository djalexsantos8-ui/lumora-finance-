import PagePlaceholder from '@/components/page-placeholder'

export const metadata = { title: 'Jobs — Lumora Finance' }

export default function JobsPage() {
  return (
    <PagePlaceholder
      icon={
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      }
      title="Jobs"
      description="Registre seus trabalhos, acompanhe pagamentos e monitore o status de cada projeto. Em construção."
      badge="Em construção"
      badgeColor="gold"
    />
  )
}
