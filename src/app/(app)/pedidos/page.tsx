import PagePlaceholder from '@/components/page-placeholder'

export const metadata = { title: 'Pedidos — Lumora Finance' }

// Placeholder inicial — a Fase 4 substitui por página real com lista + batch.
// Mantido aqui só pra garantir que o link da sidebar não dê 404 enquanto
// a implementação real é finalizada na mesma task.
export default function PedidosPage() {
  return (
    <PagePlaceholder
      icon={
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
        </svg>
      }
      title="Pedidos"
      description="Gerencie pedidos de produtos e entregas — visual idêntico a Freelances, preparado para seleção em lote e pagamento em massa."
      badge="Em breve"
    />
  )
}
