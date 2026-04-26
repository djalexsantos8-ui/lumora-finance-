import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import FreelancerEditorClient from './client'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function FreelancerEditorPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const { data: f } = await supabase
    .from('freelancers_v2')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!f) notFound()

  // Normaliza numerics que podem vir como string do Postgres
  const normalized = {
    ...f,
    tarifa_diaria:    f.tarifa_diaria != null ? Number(f.tarifa_diaria) : null,
    tarifa_hora:      f.tarifa_hora   != null ? Number(f.tarifa_hora)   : null,
    experiencia_anos: f.experiencia_anos != null ? Number(f.experiencia_anos) : null,
    rating:           f.rating != null ? Number(f.rating) : null,
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Link href="/v2/freelancers" className="mb-6 inline-flex items-center gap-2 text-sm text-[#a3a3a3] hover:text-white">
        ← Voltar
      </Link>

      <FreelancerEditorClient freelancer={normalized} />
    </div>
  )
}
