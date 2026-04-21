import PageSkeleton from '@/components/page-skeleton'

export default function Loading() {
  return (
    <PageSkeleton
      title="Custos Fixos"
      description="Carregando custos fixos…"
      shapes={[
        { kind: 'kpi', count: 2 },
        { kind: 'row', count: 6, height: 'h-14' },
      ]}
    />
  )
}
