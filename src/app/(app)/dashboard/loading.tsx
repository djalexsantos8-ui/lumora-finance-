import PageSkeleton from '@/components/page-skeleton'

// Streaming UI pro /dashboard — pente fino 2026-04-21.
// Evita branco enquanto os aggregators (jobs + expenses + recurring_revenue
// + budgets + orders, multi-query) rodam. KPIs em cima, duas linhas de cards
// narrativos embaixo.
export default function Loading() {
  return (
    <PageSkeleton
      title="Dashboard"
      description="Carregando visão executiva…"
      shapes={[
        { kind: 'kpi',  count: 4 },
        { kind: 'grid', cols: 2, count: 2, height: 'h-40' },
        { kind: 'grid', cols: 3, count: 3, height: 'h-32' },
      ]}
    />
  )
}
