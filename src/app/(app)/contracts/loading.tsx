import PageSkeleton from '@/components/page-skeleton'

export default function Loading() {
  return (
    <PageSkeleton
      title="Contratos"
      description="Carregando modelos…"
      shapes={[
        { kind: 'card', height: 'h-16' },
        { kind: 'grid', cols: 3, count: 9, height: 'h-36' },
      ]}
    />
  )
}
