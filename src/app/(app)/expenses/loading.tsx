import PageSkeleton from '@/components/page-skeleton'

export default function Loading() {
  return (
    <PageSkeleton
      title="Despesas"
      description="Carregando despesas…"
      shapes={[
        { kind: 'kpi', count: 3 },
        { kind: 'row', count: 8, height: 'h-14' },
      ]}
    />
  )
}
