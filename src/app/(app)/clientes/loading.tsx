import PageSkeleton from '@/components/page-skeleton'

export default function Loading() {
  return (
    <PageSkeleton
      title="Clientes"
      description="Carregando sua base de clientes…"
      shapes={[
        { kind: 'row', count: 10, height: 'h-14' },
      ]}
    />
  )
}
