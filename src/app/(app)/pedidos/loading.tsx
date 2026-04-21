import PageSkeleton from '@/components/page-skeleton'

export default function Loading() {
  return (
    <PageSkeleton
      title="Pedidos"
      description="Carregando pedidos…"
      shapes={[
        { kind: 'kpi', count: 3 },
        { kind: 'row', count: 6, height: 'h-16' },
      ]}
    />
  )
}
